/* eslint-disable @typescript-eslint/no-namespace */
import type { PeerTubeHelpers, PluginSettingsManager, PluginStorageManager } from '@peertube/peertube-types'

import express from 'express'
import Stripe from 'stripe'
import winston from 'winston'
import { SETTING_STRIPE_API_KEY } from '../../shared/constants'
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
    const stripeApiKey = await this.settingsManager.getSetting(SETTING_STRIPE_API_KEY) as string
    const stripe = new Stripe(stripeApiKey)
    const webhookSecret = 'whsec_e8f0f7b32199bcd5970ab8c1d4abe981908cc3403f54134c6c65714343147dae'

    const sig = req.headers['stripe-signature']

    let event

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig as string, webhookSecret)
    } catch (err: any) {
      // On error, log and return the error message
      this.logger.error(`❌ Error message: ${(err as Error).message}`)
      res.status(400).send(`Webhook Error: ${(err as Error).message}`)
      return
    }

    // Successfully constructed event
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

    // Hantera unsubcription?

    res.status(200).end()
  }

  private readonly getUserIdFromSession = (session: Stripe.Checkout.Session): number => {
    const userId = session.client_reference_id

    if (userId === null) {
      throw Error('session.client_reference_id is null.')
    }

    const parsedId = +userId

    if (isNaN(parsedId)) {
      throw Error('session.client_reference_id is not a number: ' + userId)
    }

    return parsedId
  }

  private readonly updateUserPaymentStatus = async (session: Stripe.Checkout.Session): Promise<void> => {
    const userId = this.getUserIdFromSession(session)
    const userInfo = await this.storage.getUserInfo(userId)
    const payments = (userInfo?.payments ?? [])
    const registeredPayment = payments.find((p) => p.sessionId === session.id)

    if (registeredPayment) {
      this.logger.debug('Payment already done for session ' + session.id)
      return
    }

    userInfo.paymentStatus = session.payment_status
    // userInfo.subscriptionId = session.subscription as string
    userInfo.customerId = session.customer as string

    await this.storage.storeUserInfo(userId, userInfo)
  }
/*
  private readonly storePayment = async (session: Stripe.Checkout.Session): Promise<void> => {
    const payment: PluginUserInfoPayment = {
      sessionId: session.id,
      amountTotal: session.amount_total,
      created: new Date(session.created * 1000).toISOString(),
      currency: session.currency ?? '',
      customerId: (session.customer as string),
      mode: session.mode,
      paymentStatus: session.payment_status,
      paymentMethodTypes: session.payment_method_types,
      status: session.status ?? 'complete' // När är detta null?
    }
    const userId = this.getUserIdFromSession(session)
    const userInfo = await this.storage.getUserInfo(userId)
    const payments = (userInfo?.payments ?? [])
    const sessionId = session.id
    const registeredPayment = payments.find((p) => p.sessionId === session.id)

    if (registeredPayment) {
      this.logger.debug('Payment already registered for session ' + sessionId)
      return
    }

    this.logger.debug(`Registering payment for user ${userId}`, payment)

    const paidUntil = new Date(session.created * 1000)
    if (paidUntil.getMonth() === 11) {
      paidUntil.setMonth(0)
      paidUntil.setFullYear(paidUntil.getFullYear() + 1)
    } else {
      paidUntil.setMonth(paidUntil.getMonth() + 1)
    }

    await this.storage.storeUserInfo(userId, {
      ...userInfo,
      // paidUntil: paidUntil.toISOString(),
      // payments: [...payments, payment]
    })

    this.logger.info('Succesfully registered payment for user ' + userId.toString())
  }
  */
}
