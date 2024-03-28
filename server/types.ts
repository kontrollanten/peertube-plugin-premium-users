import Stripe from 'stripe'

export declare const enum CustomVideoPrivacy {
  PUBLIC = 1,
  UNLISTED = 2,
  PRIVATE = 3,
  INTERNAL = 4,
  PLUS_VIDEO = 67
};

export interface PluginUserInfoPayment {
  amountTotal: number | null
  created: string
  currency: string
  customerId: string
  mode: Stripe.Checkout.Session.Mode
  paymentMethodTypes: string[]
  paymentStatus: Stripe.Checkout.Session.PaymentStatus
  sessionId: string
  status: Stripe.Checkout.Session.Status
}

export interface PluginUserInfo {
  paidUntil?: string
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus // Remove this and use latest from payments instead?
  payments?: PluginUserInfoPayment[]
};
