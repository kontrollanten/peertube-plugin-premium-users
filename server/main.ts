import {
  type MVideo,
  type MVideoFormattableDetails,
  type RegisterServerOptions,
  PeerTubeHelpers,
  MVideoFullLight,
  MVideoWithAllFiles,
  SettingEntries,
  MUser,
  type serverHookObject
} from '@peertube/peertube-types'

import Stripe from 'stripe'
import express from 'express'
import shortUUID from 'short-uuid'
import sequelize from 'sequelize'
import { StripeWebhook } from './routes/stripe-webhook'
import {
  SETTING_ENABLE_PLUGIN,
  SETTING_REPLACEMENT_VIDEO,
  SETTING_STRIPE_API_KEY,
  SETTING_STRIPE_CUSTOMER_PORTAL_URL,
  SETTING_STRIPE_SUBSCRIPTION_PLAN_ID,
  SETTING_STRIPE_WEBHOOK_SECRET,
  VIDEO_FIELD_IS_PREMIUM_CONTENT
} from '../shared/constants'
import { Storage } from './storage'
import { SubscriptionRoute } from './routes/subscription'
import { getStripeSubscriptionPlans, isPremiumUser } from './utils'
import { CheckoutRoute } from './routes/checkout'

interface RegisterServerHookOptions {
  target: (keyof typeof serverHookObject) | 'filter:api.user.me.get.result'
  handler: Function
}

const uuidTranslator = shortUUID()

async function register ({
  getRouter,
  peertubeHelpers,
  registerHook,
  registerSetting,
  settingsManager
}: RegisterServerOptions & {
  registerHook: (options: RegisterServerHookOptions) => void
  peertubeHelpers: PeerTubeHelpers & {
    videos: {
      loadByIdOrUUIDWithFiles: (id: number | string) => Promise<MVideoWithAllFiles>
    }
  }
}): Promise<void> {
  const { logger } = peertubeHelpers
  const storage = new Storage(peertubeHelpers.database as Pick<sequelize.Sequelize, 'query'>)

  await storage.init()

  let stripePlans: Stripe.Plan[] = []
  let replacementVideoWithFiles: MVideoWithAllFiles
  let isPluginEnabled: boolean = await settingsManager.getSetting(SETTING_ENABLE_PLUGIN) as boolean

  registerSetting({
    name: SETTING_STRIPE_API_KEY,
    label: 'Stripe API key',
    type: 'input',
    private: true
  })

  registerSetting({
    name: SETTING_STRIPE_WEBHOOK_SECRET,
    label: 'Stripe webhook secret',
    descriptionHTML:
      '<a href="https://docs.stripe.com/webhooks#endpoint-secrets" target="_blank">Webhook signing secret</a>',
    type: 'input',
    private: true
  })

  registerSetting({
    name: SETTING_STRIPE_CUSTOMER_PORTAL_URL,
    label: 'Stripe customer portal URL',
    descriptionHTML:
      // eslint-disable-next-line max-len
      '<a href="https://docs.stripe.com/customer-management/activate-no-code-customer-portal" target="_blank">How to activate customer portal</a>',
    type: 'input',
    private: false
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
    name: SETTING_ENABLE_PLUGIN,
    label: 'Enable plugin',
    type: 'input-checkbox',
    private: false,
    default: false,
    descriptionHTML: `
      Whether the plugin is enabled for users.
      `
  })

  const loadReplacementVideo = async (replacementVideoUrl: string): Promise<void> => {
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

    replacementVideoWithFiles = await peertubeHelpers.videos.loadByIdOrUUIDWithFiles(replacementVideo.id)
  }

  const registerStripePlanSetting = async (apiKey: string): Promise<void> => {
    try {
      stripePlans = await getStripeSubscriptionPlans(apiKey)
    } catch (err: any) {
      logger.info('Couldn\'t fetch Stripe plans', { err })
    }

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
  }

  const parseSettings = async (settings: SettingEntries): Promise<void> => {
    isPluginEnabled = settings[SETTING_ENABLE_PLUGIN] as boolean
    await loadReplacementVideo(settings[SETTING_REPLACEMENT_VIDEO] as string)
    await registerStripePlanSetting(settings[SETTING_STRIPE_API_KEY] as string)
  }

  settingsManager.onSettingsChange(parseSettings)
  await parseSettings(await settingsManager.getSettings([
    SETTING_REPLACEMENT_VIDEO,
    SETTING_STRIPE_API_KEY,
    SETTING_ENABLE_PLUGIN
  ]))

  registerHook({
    target: 'action:api.video.updated',
    handler: async ({ video, body }: { video: MVideoFullLight, body: any }) => {
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
      if (!isPluginEnabled) {
        logger.debug('Plugin is disabled, returning original video.')
        return video
      }

      if (!replacementVideoWithFiles) {
        logger.debug('No replacement video found, returning original video.')
        return video
      }

      const isPremiumVideo = await storage.isPremiumVideo(video.uuid)

      if (!isPremiumVideo) {
        logger.debug('Not a premium video, returning original video.')
        return video
      }

      logger.debug('Its a premium video, checking if user is a premium user.')
      const userInfo = await storage.getUserInfo(userId)

      if (isPremiumUser(userInfo)) {
        logger.debug('Premium user, returning the original video')
        return video
      }

      logger.debug('Non premium user, returning the replacement video: ' + replacementVideoWithFiles.uuid)

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

  registerHook({
    target: 'filter:api.user.me.get.result',
    handler: async (result: any, { user }: { user: MUser }) => {
      const userInfo = await storage.getUserInfo(user.id)
      result.isPremium = isPremiumUser(userInfo)

      return result
    }
  })

  const router = getRouter()
  const stripeWebhook = new StripeWebhook(peertubeHelpers, storage, settingsManager)
  const subscripton = new SubscriptionRoute(peertubeHelpers, settingsManager, storage)
  const checkout = new CheckoutRoute(peertubeHelpers, settingsManager, storage)

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
