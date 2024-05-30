import { Price } from '../shared/types'

export const trackGAAction = (
  name: string,
  options?: Gtag.EventParams
): void => {
  if (!('gtag' in window)) {
    return
  }

  window.gtag('event', name, {
    event_category: 'premium-users',
    ...options
  })
}

export const formatAmount = (amount: number, currency: string): string => new Intl.NumberFormat(navigator.language, {
  style: 'currency',
  currency,
  minimumFractionDigits: 0
}).format(
  amount
)

export const getDiscountedPrice = (price: Price): number | null => {
  if (!price.coupon?.valid) return null
  if (!price.unit_amount) return null

  if (price.coupon.amount_off) {
    return (price.unit_amount - price.coupon.amount_off) / 100
  }

  if (price.coupon.percent_off) {
    return Math.round((price.unit_amount - (price.unit_amount * (price.coupon.percent_off / 100))) / 100)
  }

  return null
}
