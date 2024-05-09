import {
  type PeerTubeHelpers,
  type PluginSettingsManager,
} from '@peertube/peertube-types'
import express from 'express'
import { SETTING_STRIPE_API_KEY, SETTING_STRIPE_COUPON_ID, SETTING_STRIPE_PRODUCT_ID } from '../../shared/constants'
import Stripe from 'stripe'
import { Price } from '../../shared/types'

export class PriceRoute {
  peertubeHelpers: PeerTubeHelpers
  settingsManager: PluginSettingsManager
  stripe: Stripe | null = null

  constructor (
    peertubeHelpers: PeerTubeHelpers,
    settingsManager: PluginSettingsManager
  ) {
    this.peertubeHelpers = peertubeHelpers
    this.settingsManager = settingsManager
  }

  private async getStripe (): Promise<Stripe> {
    if (this.stripe) {
      return this.stripe
    }

    const stripeApiKey = await this.settingsManager.getSetting(SETTING_STRIPE_API_KEY) as string
    this.stripe = new Stripe(stripeApiKey)

    return this.stripe
  }

  get = async (req: express.Request, res: express.Response): Promise<void> => {
    const stripe = await this.getStripe()
    const productId = await this.settingsManager.getSetting(SETTING_STRIPE_PRODUCT_ID) as string
    const couponId = await this.settingsManager.getSetting(SETTING_STRIPE_COUPON_ID) as string

    try {
      const result = await stripe.prices.list({
        active: true,
        product: productId,
        type: 'recurring',
        limit: 12
      })
      let coupon: Stripe.Coupon | undefined

      if (couponId) {
        coupon = await stripe.coupons.retrieve(couponId)
      }

      const prices: Price[] = result.data.filter(price => !price.deleted).map(p => ({ ...p, coupon }))

      res.json(prices)
    } catch (err: any) {
      this.peertubeHelpers.logger.error('Couldn\'t retrieve products', { err })

      res.status(err.statusCode || 500).json({
        message: err.raw?.message
      })
    }
  }
}
