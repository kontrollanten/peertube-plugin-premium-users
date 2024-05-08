import {
  type PeerTubeHelpers,
  type PluginSettingsManager,
} from '@peertube/peertube-types'
import express from 'express'
import { SETTING_STRIPE_API_KEY, SETTING_STRIPE_PRODUCT_ID } from '../../shared/constants'
import Stripe from 'stripe'

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

    try {
      const result = await stripe.prices.list({
        active: true,
        product: productId,
        type: 'recurring',
        limit: 12
      })

      res.json(result.data.filter(price => !price.deleted))
    } catch (err: any) {
      this.peertubeHelpers.logger.error('Couldn\'t retrieve products', { err })

      res.status(err.statusCode).json({
        message: err.raw?.message
      })
    }
  }
}
