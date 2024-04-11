import { PeerTubeHelpers } from '@peertube/peertube-types'
import Stripe from 'stripe'

/**
 * Create instance unique field names to make it possible to have the same Stripe account
 * conneted with multiple instances.
 */
export const getStripeCustomerMetadataFieldName = (peertubeHelpers: PeerTubeHelpers): string => {
  return `${peertubeHelpers.config.getWebserverUrl()}-userId`
}

export const getStripeSubscriptionPlans = async (stripeApiKey: string): Promise<Stripe.Plan[]> => {
  const stripe = new Stripe(stripeApiKey)

  const plans = await stripe.plans.list({
    expand: ['data.product']
  })

  return plans.data
}
