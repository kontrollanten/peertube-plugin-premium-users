import express from 'express'
import Stripe from 'stripe'
import { Storage } from '../storage'
import { SETTING_STRIPE_API_KEY, SETTING_STRIPE_SUBSCRIPTION_PLAN_ID } from '../../shared/constants'
import {
  type PeerTubeHelpers,
  type PluginSettingsManager,
  type PluginStorageManager
} from '@peertube/peertube-types'

export class CheckoutRoute {
  peertubeHelpers: PeerTubeHelpers
  settingsManager: PluginSettingsManager
  storage: Storage
  stripe: Stripe | null = null

  constructor (
    peertubeHelpers: PeerTubeHelpers,
    settingsManager: PluginSettingsManager,
    storageManager: PluginStorageManager
  ) {
    this.peertubeHelpers = peertubeHelpers
    this.settingsManager = settingsManager

    this.storage = new Storage(storageManager)
  }

  private async getStripe (): Promise<Stripe> {
    if (this.stripe) {
      return this.stripe
    }

    const stripeApiKey = await this.settingsManager.getSetting(SETTING_STRIPE_API_KEY) as string
    this.stripe = new Stripe(stripeApiKey)

    return this.stripe
  }

  post = async (req: express.Request, res: express.Response): Promise<void> => {
    const baseUrl = this.peertubeHelpers.config.getWebserverUrl()
    const stripe = await this.getStripe()
    const user = await this.peertubeHelpers.user.getAuthUser(res)

    const customerRes = await stripe.customers.search({
      query: `email:"${user.email}"`
    })
    let customer = customerRes.data.pop()

    /**
     * TODO: Set metadata.peertubeId if undefined?
     */

    if (!customer) {
      this.peertubeHelpers.logger.debug('No customer found, will create one with email ' + user.email)
      customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: {
          peertubeId: user.id
        }
      })
    }

    this.peertubeHelpers.logger.debug('Will create a checkout with customer', { customer })

    const session = await stripe.checkout.sessions.create({
      billing_address_collection: 'auto',
      customer: customer.id,
      line_items: [
        {
          price: await this.settingsManager.getSetting(SETTING_STRIPE_SUBSCRIPTION_PLAN_ID) as string,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/my-account/p/premium?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/my-account/p/premium?checkout_status=canceled`
    })

    res.json({
      checkoutUrl: session.url
    })
  }
}
