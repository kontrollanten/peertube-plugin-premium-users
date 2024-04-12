import Stripe from 'stripe'

export interface PluginUserInfo {
  paidUntil?: string
  hasPaymentFailed?: boolean
  subscriptionId?: string
  customerId?: string
};

export interface Subscription {
  cancelAt: string | null
  cancelAtPeriodEnd: boolean | null
  canceledAt: string | null
  currentPeriodEnd: string | null
  status: Stripe.Subscription.Status | null
  startDate: string | null
  invoices: SubscriptionInvoice[]
}

export interface SubscriptionInvoice {
  amountTotal: number | null
  created: string
  currency: string
  status: Stripe.Invoice.Status | null // Null means the invoice is canceled.
  periodEnd: string
  periodStart: string
}
