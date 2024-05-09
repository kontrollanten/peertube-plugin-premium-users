import { PeerTubeHelpers } from '@peertube/peertube-types'
import Stripe from 'stripe'
import { PluginUserInfo } from './types'

/**
 * Create instance unique field names to make it possible to have the same Stripe account
 * conneted with multiple instances.
 */
export const getStripeCustomerMetadataFieldName = (peertubeHelpers: PeerTubeHelpers): string => {
  return `${peertubeHelpers.config.getWebserverUrl()}-userId`
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
  const ONE_DAY = 60 * 60 * 24 * 1000

  if (!userInfo?.paidUntil) {
    return false
  }

  return (+new Date(userInfo.paidUntil) - +new Date()) > ONE_DAY
}
