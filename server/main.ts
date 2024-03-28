import {
  VideoPrivacy,
  type MVideo,
  type MVideoFormattableDetails,
  type RegisterServerOptions,
  PeerTubeHelpers,
  MVideoFullLight
} from '@peertube/peertube-types'
import type { ConstantManager } from
  '@peertube/peertube-types/shared/models/plugins/server/plugin-constant-manager.model'

import express from 'express'
import { StripeWebhook } from './routes/stripe-webhook'
import { SETTING_REPLACEMENT_VIDEO, SETTING_STRIPE_API_KEY } from './constants'
import { CustomVideoPrivacy } from './types'
import { GetUserInfo } from './routes/get-user-info'
import { Storage } from './storage'

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
    }
  }
}): Promise<void> {
  const { logger } = peertubeHelpers

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

  const storage = new Storage(storageManager)
  let replacementVideoWithFiles: MVideoFullLight

  const loadReplacementVideo = async (): Promise<void> => {
    const replacementVideoUrl = await settingsManager.getSetting(SETTING_REPLACEMENT_VIDEO) as string
    const replacementVideo = await peertubeHelpers.videos.loadByUrl(replacementVideoUrl)
    replacementVideoWithFiles = await peertubeHelpers.videos.loadFull(replacementVideo.id)
  }

  settingsManager.onSettingsChange(loadReplacementVideo)
  await loadReplacementVideo()

  registerHook({
    target: 'filter:api.video.get.result',
    handler: async (
      video: MVideoFormattableDetails & { getMasterPlaylistUrl: () => string },
      { userId }: { videoId: number | string, userId: number }
    ): Promise<MVideo> => {
      logger.debug('Checking status')
      const userInfo = await storage.getUserInfo(userId)

      if (userInfo.paymentStatus === 'paid') {
        logger.debug('Premium user, returning the original video')
        return video
      }

      logger.debug('Non premium user, returning the replacement video: ' + SETTING_REPLACEMENT_VIDEO)

      /**
       * Läs in detta i onSettingsChange
       */
      /**
       * Läs in detta i onSettingsChange
       */

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
  const getUserInfo = new GetUserInfo(peertubeHelpers, storageManager)

  router.post(
    '/stripe-webhook',
    express.raw({ type: 'application/json' }),
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    stripeWebhook.routeHandler
  )

  router.get(
    '/user-info',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    getUserInfo.routeHandler
  )
}

const unregister = (): void => {

}

module.exports = {
  register,
  unregister
}
