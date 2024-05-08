/* eslint-disable @typescript-eslint/no-namespace */
import type { PeerTubeHelpers, PluginSettingsManager } from '@peertube/peertube-types'

import express from 'express'
import Stripe from 'stripe'
import winston from 'winston'
import {
  SETTING_STRIPE_API_KEY,
  SETTING_STRIPE_PRODUCT_ID,
  SETTING_STRIPE_WEBHOOK_SECRET
} from '../../shared/constants'
import { Storage } from '../storage'
import { getStripeCustomerMetadataFieldName } from '../utils'

declare global {
  namespace Express {
    export interface Request {
      rawBody: Buffer
    }
  }
}

export class StripeWebhook {
  logger: winston.Logger
  peertubeHelpers: PeerTubeHelpers
  settingsManager: PluginSettingsManager
  storage: Storage
  stripe: Stripe | null = null

  constructor (
    peertubeHelpers: PeerTubeHelpers,
    storage: Storage,
    settingsManager: PluginSettingsManager
  ) {
    this.logger = peertubeHelpers.logger
    this.peertubeHelpers = peertubeHelpers
    this.settingsManager = settingsManager

    this.storage = storage
  }

  routeHandler = async (req: express.Request, res: express.Response): Promise<void> => {
    const stripe = await this.getStripe()
    const webhookSecret = await this.settingsManager.getSetting(SETTING_STRIPE_WEBHOOK_SECRET) as string

    if (!webhookSecret) {
      this.logger.error('Can\'t parse Stripe webhook since there\'s no webhook secret configured.')
      res.status(500).json({})
      return
    }

    const sig = req.headers['stripe-signature']

    let event

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig as string, webhookSecret)
    } catch (err: any) {
      this.logger.error(`❌ Error message: ${(err as Error).message}`)
      res.status(400).send(`Webhook Error: ${(err as Error).message}`)
      return
    }

    this.logger.debug('✅ Success:', event.id)

    const session = event.data.object

    this.logger.debug(`Received event ${event.type}`, event)
    this.logger.debug('Raw session: ', session)

    /**
     * TODO: Store the event in Redis to handle it later
     * https://docs.stripe.com/webhooks#acknowledge-events-immediately
     */

    // eslint-disable-next-line max-len
    // https://docs.stripe.com/billing/subscriptions/build-subscriptions?platform=web&ui=stripe-hosted#provision-and-monitor

    if (!['checkout.session.completed', 'invoice.paid'].includes(event.type)) {
      res.status(200).end()

      return
    }

    if (!(session as Stripe.Checkout.Session | Stripe.Invoice).subscription) {
      res.status(200).end()

      return
    }

    const productId = await this.settingsManager.getSetting(SETTING_STRIPE_PRODUCT_ID) as string
    const subscription = await stripe.subscriptions
      .retrieve((session as Stripe.Checkout.Session | Stripe.Invoice).subscription as string)
    const hasProductInSubcscription = subscription.items.data.some(i =>
      i.price.product === productId
    )

    if (!hasProductInSubcscription) {
      this.logger.debug('Subscription doesn\'t include product with id ' + productId)
      res.status(200).end()

      return
    }

    if (event.type === 'checkout.session.completed' && (session as Stripe.Checkout.Session).mode === 'subscription') {
      await this.updateUserFromCheckout(session as Stripe.Checkout.Session, subscription)
    }

    if (event.type === 'invoice.paid') {
      await this.updateUserFromInvoice(session as Stripe.Invoice, subscription)
    }

    if (event.type === 'invoice.payment_failed') {
      await this.updateUserFromFailedPayment(session as Stripe.Invoice)
    }

    res.status(200).end()
  }

  private async getStripe (): Promise<Stripe> {
    if (this.stripe) {
      return this.stripe
    }

    const stripeApiKey = await this.settingsManager.getSetting(SETTING_STRIPE_API_KEY) as string
    this.stripe = new Stripe(stripeApiKey)

    return this.stripe
  }

  private readonly getUserIdFromSession =
    async (session: Stripe.Checkout.Session | Stripe.Invoice): Promise<number> => {
      const stripe = await this.getStripe()
      const customer = await stripe.customers.retrieve(session.customer as string)

      if (customer.deleted) {
        throw Error(`Customer ${session.customer as string} is deleted`)
      }

      const metadataFieldName = getStripeCustomerMetadataFieldName(this.peertubeHelpers)
      const userId = customer.metadata[metadataFieldName]

      if (userId === null) {
        throw Error(`customer.metadata.${metadataFieldName} is null.`)
      }

      const parsedId = +userId

      if (isNaN(parsedId)) {
        throw Error(`customer.metadata.${metadataFieldName} is not a number: ' + userI`)
      }

      return parsedId
    }

  private readonly updateUserFromFailedPayment = async (session: Stripe.Invoice): Promise<void> => {
    const userId = await this.getUserIdFromSession(session)
    const userInfo = await this.storage.getUserInfo(userId) ?? {}

    userInfo.hasPaymentFailed = true

    await this.storage.storeUserInfo(userId, userInfo)
  }

  private readonly updateUserFromInvoice =
    async (session: Stripe.Invoice, subscription: Stripe.Subscription): Promise<void> => {
      const userId = await this.getUserIdFromSession(session)
      const userInfo = await this.storage.getUserInfo(userId) ?? {}

      userInfo.paidUntil = new Date(subscription.current_period_end * 1000).toISOString()
      userInfo.hasPaymentFailed = false

      await this.storage.storeUserInfo(userId, userInfo)
    }

  private readonly updateUserFromCheckout =
    async (session: Stripe.Checkout.Session, subscription: Stripe.Subscription): Promise<void> => {
      const userId = await this.getUserIdFromSession(session)
      const userInfo = await this.storage.getUserInfo(userId) ?? {}

      userInfo.paidUntil = new Date(subscription.current_period_end * 1000).toISOString()
      userInfo.customerId = session.customer as string
      userInfo.subscriptionId = session.subscription as string
      userInfo.hasPaymentFailed = false

      await this.storage.storeUserInfo(userId, userInfo)
    }
}
