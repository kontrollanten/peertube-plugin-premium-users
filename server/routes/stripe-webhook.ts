/* eslint-disable @typescript-eslint/no-namespace */
import type { PeerTubeHelpers, PluginSettingsManager, PluginStorageManager } from '@peertube/peertube-types'

import express from 'express'
import Stripe from 'stripe'
import winston from 'winston'
import { SETTING_STRIPE_API_KEY, SETTING_STRIPE_WEBHOOK_SECRET } from '../../shared/constants'
import { Storage } from '../storage'

declare global {
  namespace Express {
    export interface Request {
      rawBody: Buffer
    }
  }
}

export class StripeWebhook {
  logger: winston.Logger
  settingsManager: PluginSettingsManager
  storage: Storage
  stripe: Stripe | null = null

  constructor (
    peertubeHelpers: PeerTubeHelpers,
    storageManager: PluginStorageManager,
    settingsManager: PluginSettingsManager
  ) {
    this.logger = peertubeHelpers.logger
    this.settingsManager = settingsManager

    this.storage = new Storage(storageManager)
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
     * TODO: Spara ner responsen i Redis och hantera dem i löpande jobb?
     */

    /**
     * TODO: Ändra till customer.subscription.created ?
     */

    if (event.type === 'checkout.session.completed') {
      await this.updateUserPaymentStatus(session as Stripe.Checkout.Session)
    }

    if (['checkout.session.async_payment_succeeded', 'checkout.session.completed'].includes(event.type)) {
      if ((session as Stripe.Checkout.Session).payment_status === 'paid') {
        // await this.storePayment(session as Stripe.Checkout.Session)
      }
    }

    // TODO: Manage unsubcription?

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

  private readonly getUserIdFromSession = async (session: Stripe.Checkout.Session): Promise<number> => {
    const stripe = await this.getStripe()
    const customer = await stripe.customers.retrieve(session.customer as string)

    if (customer.deleted) {
      throw Error(`Customer ${session.customer as string} is deleted`)
    }

    const userId = customer.metadata.peertubeId

    if (userId === null) {
      throw Error('customer.metadata.peertubeId is null.')
    }

    const parsedId = +userId

    if (isNaN(parsedId)) {
      throw Error('customer.metadata.peertubeId is not a number: ' + userId)
    }

    return parsedId
  }

  private readonly updateUserPaymentStatus = async (session: Stripe.Checkout.Session): Promise<void> => {
    const userId = await this.getUserIdFromSession(session)
    const userInfo = await this.storage.getUserInfo(userId)

    userInfo.paymentStatus = session.payment_status
    userInfo.customerId = session.customer as string

    await this.storage.storeUserInfo(userId, userInfo)
  }
}
