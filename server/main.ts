import {
  VideoPrivacy,
  type MVideo,
  type MVideoFormattableDetails,
  type RegisterServerOptions,
  PeerTubeHelpers,
  MVideoFullLight,
  MVideoWithAllFiles,
  SettingEntries
} from '@peertube/peertube-types'
import type { ConstantManager } from
  '@peertube/peertube-types/shared/models/plugins/server/plugin-constant-manager.model'

import Stripe from 'stripe'
import express from 'express'
import shortUUID from 'short-uuid'
import { StripeWebhook } from './routes/stripe-webhook'
import {
  SETTING_REPLACEMENT_VIDEO,
  SETTING_STRIPE_API_KEY,
  SETTING_STRIPE_SUBSCRIPTION_PLAN_ID,
  VIDEO_FIELD_IS_PREMIUM_CONTENT
} from '../shared/constants'
import { CustomVideoPrivacy } from './types'
import { Storage } from './storage'
import { SubscriptionRoute } from './routes/subscription';
import { getStripeSubscriptionPlans } from './utils';
import { CheckoutRoute } from './routes/checkout';

const uuidTranslator = shortUUID()

async function register ({
  getRouter,
  peertubeHelpers,
  registerHook,
  registerSetting,
  settingsManager,
  storageManager,
  videoPrivacyManager
}: RegisterServerOptions & {
  videoPrivacyManager: ConstantManager<CustomVideoPrivacy>
  peertubeHelpers: PeerTubeHelpers & {
    videos: {
      loadFull: (id: number | string) => Promise<MVideoFullLight & { hasPrivateStaticPath: () => boolean }>
      loadWithFiles: (id: number | string) => Promise<MVideoWithAllFiles>
    }
  }
}): Promise<void> {
  const { logger } = peertubeHelpers
  const stripePlans = await getStripeSubscriptionPlans(
    await settingsManager.getSetting(SETTING_STRIPE_API_KEY) as string
  )

  registerSetting({
    name: SETTING_STRIPE_API_KEY,
    label: 'Stripe API key',
    type: 'input',
    private: true
  })

  registerSetting({
    name: SETTING_REPLACEMENT_VIDEO,
    label: 'Replacement video URL',
    type: 'input',
    private: true,
    descriptionHTML: `
      URL to video that will be shown to non-premium users when trying to watch a premium video.
      Has to be an URL on this instance.
      `
  })

  registerSetting({
    name: SETTING_STRIPE_SUBSCRIPTION_PLAN_ID,
    label: 'Stripe plan used for subscription',
    type: 'select',
    options: stripePlans.map((plan) => ({
      value: plan.id,
      label: (plan.product as Stripe.Product)?.name ?? plan.id
    })),
    private: true
  })

  const storage = new Storage(storageManager)
  let replacementVideoWithFiles: MVideoWithAllFiles

  const loadReplacementVideo = async (settings: SettingEntries): Promise<void> => {
    let replacementVideoUrl = settings[SETTING_REPLACEMENT_VIDEO] as string

    if (!replacementVideoUrl) {
      logger.debug('No replacement video URL has been configured.')
      return
    }

    if (replacementVideoUrl.indexOf('/w/') > 0) {
      replacementVideoUrl = replacementVideoUrl.replace('/w/', '/videos/watch/')
    }

    try {
      const eventualLongUuid = replacementVideoUrl.split('/').pop() ?? ''
      replacementVideoUrl = replacementVideoUrl.replace(eventualLongUuid, uuidTranslator.toUUID(eventualLongUuid))
    } catch (err) {}

    const replacementVideo = await peertubeHelpers.videos.loadByUrl(replacementVideoUrl)

    if (!replacementVideo) {
      logger.error('Replacement video URL not found in database.', { replacementVideoUrl })
      return
    }

    replacementVideoWithFiles = await peertubeHelpers.videos.loadWithFiles(replacementVideo.id)
  }

  settingsManager.onSettingsChange(loadReplacementVideo)
  await loadReplacementVideo(await settingsManager.getSettings([SETTING_REPLACEMENT_VIDEO]))

  registerHook({
    target: 'action:api.video.updated',
    handler: async ({ video, body }: { video: MVideoFullLight, body: any }) => {
      logger.debug('action update', body)
      if (body.pluginData[VIDEO_FIELD_IS_PREMIUM_CONTENT] === 'true') {
        logger.debug(`${video.uuid} is premium video`)
        await storage.addPremiumVideo(video.uuid)
      } else {
        await storage.removePremiumVideo(video.uuid)
      }
    }
  })

  registerHook({
    target: 'filter:api.video.get.result',
    handler: async (
      video: MVideoFormattableDetails & { getMasterPlaylistUrl: () => string },
      { userId }: { videoId: number | string, userId: number }
    ): Promise<MVideo> => {
      if (!replacementVideoWithFiles) {
        logger.debug('No replacement video found.')
        return video
      }

      const isPremiumVideo = await storage.isPremiumVideo(video.uuid)

      if (!isPremiumVideo) {
        logger.debug('Not a premium video, returning original video.')
        return video
      }

      logger.debug('Its a premium video, checking if user is a premium user.')
      const userInfo = await storage.getUserInfo(userId)

      if (userInfo.paymentStatus === 'paid') {
        logger.debug('Premium user, returning the original video')
        return video
      }

      logger.debug('Non premium user, returning the replacement video: ' + SETTING_REPLACEMENT_VIDEO)

      video.VideoStreamingPlaylists = video.VideoStreamingPlaylists.map((p) => {
        p.getMasterPlaylistUrl = () =>
          replacementVideoWithFiles.getHLSPlaylist().getMasterPlaylistUrl(replacementVideoWithFiles)

        p.getSha256SegmentsUrl = () =>
          replacementVideoWithFiles.getHLSPlaylist().getSha256SegmentsUrl(replacementVideoWithFiles)

        return p
      })

      logger.debug('Non premium user, returning the following video: ', { playlist: video.getHLSPlaylist() })

      return video
    }
  })

  videoPrivacyManager.deleteConstant(VideoPrivacy.INTERNAL)
  videoPrivacyManager.addConstant(VideoPrivacy.INTERNAL, 'Plus-innehåll')

  const router = getRouter()
  const stripeWebhook = new StripeWebhook(peertubeHelpers, storageManager, settingsManager)
  const subscripton = new SubscriptionRoute(peertubeHelpers, settingsManager, storageManager)
  const checkout = new CheckoutRoute(peertubeHelpers, settingsManager, storageManager)

  router.post(
    '/stripe-webhook',
    express.raw({ type: 'application/json' }),
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    stripeWebhook.routeHandler
  )

  router.get(
    '/subscription',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    subscripton.get
  )

  router.patch(
    '/subscription',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    subscripton.patch
  )

  router.post(
    '/checkout',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    checkout.post
  )
}

const unregister = (): void => {

}

module.exports = {
  register,
  unregister
}
