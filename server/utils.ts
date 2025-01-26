import { PeerTubeHelpers, PluginSettingsManager } from '@peertube/peertube-types'
import Stripe from 'stripe'
import { PluginUserInfo } from './types'
import { SETTING_STRIPE_PRODUCT_ID } from '../shared/constants'

export const ONE_DAY = 60 * 60 * 24 * 1000

/**
 * Create instance unique field names to make it possible to have the same Stripe account
 * conneted with multiple instances.
 */
export const getStripeCustomerMetadataFieldNames = (peertubeHelpers: PeerTubeHelpers):
  { userId: string, deletedAt: string } => {
  const prefix = peertubeHelpers.config.getWebserverUrl()

  return {
    deletedAt: `${prefix}-deletedAt`,
    userId: `${prefix}-userId`
  }
}

export const getStripeProducts = async (stripeApiKey: string): Promise<Stripe.Product[]> => {
  const stripe = new Stripe(stripeApiKey)

  const products = await stripe.products.list()

  return products.data
}

export const getStripeCoupons = async (stripeApiKey: string): Promise<Stripe.Coupon[]> => {
  const stripe = new Stripe(stripeApiKey)

  const coupons = await stripe.coupons.list()

  return coupons.data
}

export const isPremiumUser = (userInfo: PluginUserInfo | undefined): boolean => {
  if (!userInfo?.paidUntil) {
    return false
  }

  return (+new Date(userInfo.paidUntil) - +new Date()) > -ONE_DAY
}

export const getCustomerSubscriptions = async (
  customer: Stripe.Customer,
  settingsManager: PluginSettingsManager,
  peertubeHelpers: PeerTubeHelpers
) => {
  const subscriptionProductId = await settingsManager.getSetting(SETTING_STRIPE_PRODUCT_ID)

  // Sort to have newest subscription first
  const subscriptions = customer.subscriptions?.data
    .filter((sub) => sub.items.data.length === 1 && sub.items.data[0].plan.product === subscriptionProductId)
    .sort((a, b) => b.created > a.created ? 1 : -1) ?? []

  if (subscriptions.length && subscriptions.length > 1) {
    peertubeHelpers.logger.info(
      `Customer ${String(customer.id)} has multiple subscriptions:
        ${String(subscriptions.length)}`
    )
  }

  const activeSubscriptions = subscriptions.filter((s) => ['trialing', 'active'].includes(s.status)) ?? []

  if (activeSubscriptions.length > 1) {
    peertubeHelpers.logger.warn(
      `Customer ${String(customer.id)} has multiple active subscriptions:
        ${String(activeSubscriptions.length)}`
    )
  }

  return {
    activeSubscriptions,
    inactiveSubscriptions: subscriptions
  }
}