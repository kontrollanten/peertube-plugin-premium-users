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
  SETTING_STRIPE_COUPON_ID,
  SETTING_STRIPE_CUSTOMER_PORTAL_URL,
  SETTING_STRIPE_PRODUCT_ID,
  SETTING_STRIPE_WEBHOOK_SECRET,
  SETTING_WHITELIST_USER_AGENT,
  VIDEO_FIELD_IS_PREMIUM_CONTENT
} from '../shared/constants'
import { Storage } from './storage'
import { SubscriptionRoute } from './routes/subscription'
import { getStripeCoupons, getStripeProducts, isPremiumUser } from './utils'
import { CheckoutRoute } from './routes/checkout'
import { PriceRoute } from './routes/price'

interface RegisterServerHookOptions {
  target: (keyof typeof serverHookObject) | 'filter:api.user.me.get.result'
  handler: Function
}

type AllowedResult = {
  allowed: boolean
  errorMessage?: string
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

  let isPluginEnabled: boolean = await settingsManager.getSetting(SETTING_ENABLE_PLUGIN) as boolean
  let whitelistRegex: string = (await settingsManager.getSetting(SETTING_WHITELIST_USER_AGENT) as string)?.trim()
  let replacementVideoUuid: string

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

  registerSetting({
    name: SETTING_WHITELIST_USER_AGENT,
    label: 'Whitelist specific user agents',
    type: 'input',
    private: true,
    default: '',
    descriptionHTML: `
      Regex to match User-Agent headers which should be whitelisted, i.e. be able to see premium content without login.
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

    replacementVideoUuid = replacementVideo.uuid
  }

  const registerStripeProductIdSetting = async (apiKey: string): Promise<void> => {
    let stripeProducts: Stripe.Product[] = []

    try {
      stripeProducts = await getStripeProducts(apiKey)
    } catch (err: any) {
      logger.info('Couldn\'t fetch Stripe products', { err })
    }

    registerSetting({
      name: SETTING_STRIPE_PRODUCT_ID,
      label: 'Stripe product used for premium subscription',
      type: 'select',
      options: stripeProducts.map((product) => ({
        value: product.id,
        label: product.name ?? product.id
      })),
      private: true
    })
  }

  const registerStripeCouponIdSetting = async (apiKey: string): Promise<void> => {
    let stripeCoupons: Stripe.Coupon[] = []

    try {
      stripeCoupons = await getStripeCoupons(apiKey)
    } catch (err: any) {
      logger.info('Couldn\'t fetch Stripe products', { err })
    }

    registerSetting({
      name: SETTING_STRIPE_COUPON_ID,
      label: 'Select a coupon if you\'d like to apply a coupon to the subcription.',
      type: 'select',
      default: '',
      options: [
        {
          label: 'None',
          value: ''
        },
        ...stripeCoupons.filter(c => c.valid).map((coupon) => ({
          value: coupon.id,
          label: coupon.name as string + ' (' +
            (coupon.amount_off
              ? (coupon.amount_off / 100).toString() + ' ' +
            (coupon.currency ?? '')
              : (coupon.percent_off?.toString() ?? '') + ' %') +
            ')'
        }))
      ],
      private: true
    })
  }

  const parseSettings = async (settings: SettingEntries): Promise<void> => {
    isPluginEnabled = settings[SETTING_ENABLE_PLUGIN] as boolean
    whitelistRegex = (settings[SETTING_WHITELIST_USER_AGENT] as string)?.trim()
    await Promise.all([
      loadReplacementVideo(settings[SETTING_REPLACEMENT_VIDEO] as string),
      registerStripeProductIdSetting(settings[SETTING_STRIPE_API_KEY] as string),
      registerStripeCouponIdSetting(settings[SETTING_STRIPE_API_KEY] as string)
    ])
  }

  settingsManager.onSettingsChange(parseSettings)
  await parseSettings(await settingsManager.getSettings([
    SETTING_REPLACEMENT_VIDEO,
    SETTING_STRIPE_API_KEY,
    SETTING_ENABLE_PLUGIN,
    SETTING_WHITELIST_USER_AGENT
  ]))

  registerHook({
    target: 'action:api.video.updated',
    handler: async ({ video, body }: { video: MVideoFullLight, body: any }) => {
      if (body.pluginData?.[VIDEO_FIELD_IS_PREMIUM_CONTENT] === 'true') {
        logger.debug(`${video.uuid} is premium video`)
        await storage.addPremiumVideo(video.uuid)
      } else {
        await storage.removePremiumVideo(video.uuid)
      }
    }
  })

  registerHook({
    target: 'filter:api.download.video.allowed.result',
    handler: async (
      result: AllowedResult,
      { video }:
      {
        video: MVideoFullLight
      }
    ): Promise<AllowedResult> => {
      if (!result.allowed) return result

      if (await checkIfUserIsAllowedVideoAccess(video.uuid)) {
        return result
      }

      return { allowed: false, errorMessage: `You're not a premium user.` }
    }
  })

  registerHook({
    target: 'filter:api.download.generated-video.allowed.result',
    handler: async (
      result: AllowedResult,
      { video }:
      {
        video: MVideoFullLight
      }
    ): Promise<AllowedResult> => {
      if (!result.allowed) return result

      if (await checkIfUserIsAllowedVideoAccess(video.uuid)) {
        return result
      }

      return { allowed: false, errorMessage: `You're not a premium user.` }
    }
  })

  const checkIfUserIsAllowedVideoAccess =
    async (videoUuid: string, userId?: number, userAgent?: string): Promise<boolean> => {
      if (!isPluginEnabled) {
        logger.debug('Plugin is disabled, returning original video.')
        return true
      }

      const isPremiumVideo = await storage.isPremiumVideo(videoUuid)

      if (!isPremiumVideo) {
        logger.debug('Not a premium video, returning original video.')
        return true
      }

      logger.debug('Its a premium video')

      // req is only available when https://github.com/Chocobozzz/PeerTube/pull/6449 is implemented
      if (whitelistRegex && userAgent?.match(whitelistRegex) !== null) {
        logger.debug('User agent header is whitelisted, returning original video.')
        return true
      }

      const userInfo = await storage.getUserInfo(userId)

      if (isPremiumUser(userInfo)) {
        logger.debug('Premium user, returning the original video.')
        return true
      }

      return false
    }

  registerHook({
    target: 'filter:api.video.get.result',
    handler: async (
      video: MVideoFormattableDetails & { getMasterPlaylistUrl: () => string, pluginData: any },
      { req, userId }: { req: express.Request, videoId: number | string, userId: number }
    ): Promise<MVideo> => {

      const isPremiumVideo = await storage.isPremiumVideo(video.uuid)

      if (isPremiumVideo) {
        video.pluginData = {
          ...(video.pluginData || {}),
          [VIDEO_FIELD_IS_PREMIUM_CONTENT]: 'true'
        }
        video.downloadEnabled = false
        video.VideoStreamingPlaylists = video.VideoStreamingPlaylists.map((p) => {
          p.VideoFiles = p.VideoFiles.map(f => {
            f.torrentFilename = ''
            f.torrentUrl = ''

            return f
          })

          return p
        })
      }

      if (await checkIfUserIsAllowedVideoAccess(video.uuid, userId, req?.header('user-agent'))) {
        return video
      }


      const replacementVideoWithFiles = await peertubeHelpers.videos.loadByIdOrUUIDWithFiles(replacementVideoUuid)

      if (!replacementVideoWithFiles?.getHLSPlaylist()) {
        logger.debug('No replacement video found, returning original video.')
        return video
      }

      logger.debug('Non premium user, returning the replacement video: ' + replacementVideoWithFiles.uuid)

      try {
        video.VideoStreamingPlaylists = video.VideoStreamingPlaylists.map((p) => {
          p.getMasterPlaylistUrl = () =>
            replacementVideoWithFiles.getHLSPlaylist().getMasterPlaylistUrl(replacementVideoWithFiles)

          p.getSha256SegmentsUrl = () =>
            replacementVideoWithFiles.getHLSPlaylist().getSha256SegmentsUrl(replacementVideoWithFiles)

          return p
        })
      } catch (err) {
        logger.error('Failed to replace premium video, will return original video.', { err })
      }

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
  const price = new PriceRoute(peertubeHelpers, settingsManager)

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

  router.get(
    '/price',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    price.get
  )
}

const unregister = (): void => {

}

module.exports = {
  register,
  unregister
}
