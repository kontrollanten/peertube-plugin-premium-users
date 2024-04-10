import Stripe from 'stripe'

export const getStripeSubscriptionPlans = async (stripeApiKey: string): Promise<Stripe.Plan[]> => {
  const stripe = new Stripe(stripeApiKey)

  const plans = await stripe.plans.list({
    expand: ['data.product']
  })

  return plans.data
}
