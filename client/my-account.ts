import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions } from '@peertube/peertube-types/shared/models'
import { Api } from './api'
import { SubscriptionInvoice } from '../server/types'
import { Price } from '../shared/types'
import { SETTING_ENABLE_PLUGIN, SETTING_STRIPE_CUSTOMER_PORTAL_URL } from '../shared/constants'
import { UiBuilder } from './ui-builder'

const formatDate = (date: string | number): string => {
  const d = new Date(date)

  return d.toLocaleDateString('sv-SE')
}

async function register ({
  registerClientRoute,
  peertubeHelpers
}: RegisterClientOptions & {
  registerClientRoute: (options: RegisterClientRouteOptions & {
    menuItem?: {
      label: string
    }
    title: string
    parentRoute: string
  }) => any
}): Promise<void> {
  const { translate } = peertubeHelpers
  const restApi = new Api(peertubeHelpers.getAuthHeader)
  const settings = await peertubeHelpers.getSettings()

  registerClientRoute({
    route: '/premium',
    parentRoute: '/my-account',
    menuItem: settings[SETTING_ENABLE_PLUGIN]
      ? {
          label: await translate('Premium account')
        }
      : undefined,
    title: await translate('Premium account'),
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    onMount: async ({ rootEl }): Promise<void> => {
      rootEl.className = 'plugin-premium-users my-account'

      const searchParams = new URLSearchParams(window.location.search)

      if (searchParams.get('checkout_status') === 'success') {
        peertubeHelpers.showModal({
          title: await translate('Payment succeeded'),
          cancel: {
            value: await translate('Close')
          },
          content: await translate(
            'Your payment succeeded and will short be registered, it may take awhile depending on your payment method.'
          ),
          close: true
        })
      }

      const subscription = await restApi.getSubscription()
      const isPremiumUser = subscription.status === 'active'

      const uiBuilder = new UiBuilder(rootEl)

      if (isPremiumUser) {
        const paymentStatus = []
        let subscriptionDesc
        let cancelButtonText

        if (subscription.cancelAtPeriodEnd) {
          subscriptionDesc = await translate(
            'Subscription will not be renewed and will end at '
          ) +
            formatDate(subscription.cancelAt as string) + '.'
          cancelButtonText = await translate('Resume subscription')
        } else {
          subscriptionDesc = await translate('Subscription will be renewed at ') +
            formatDate((subscription.currentPeriodEnd as string)) +
            '.'
          cancelButtonText = await translate('Cancel subscription')
        }

        const cancelButton = uiBuilder.a(cancelButtonText, {
          class: 'grey-button peertube-button-link'
        })

        cancelButton.addEventListener('click', (): void => {
          cancelButton.setAttribute('disabled', 'disabled')
          /**
           * TODO: Add loader
           */

          restApi.updateSubscription({
            cancelAtPeriodEnd: !subscription.cancelAtPeriodEnd
          })
            .then(() => {
              /**
               * TODO: Repaint instead of page reload
               */
              window.location.reload()
            })
            .catch(async (err: any) => {
              peertubeHelpers.showModal({
                title: await translate('Something went wrong'),
                content: await translate(
                  'Couldn\'t cancel subcsription due to technical issues. Please try again later.'
                ),
                close: true
              })
              console.error('Couldn\'t cancel subscription', { err })
            })
        })

        const settings = await peertubeHelpers.getSettings()
        const manageButton = uiBuilder.a(await translate('Manage subscription'), {
          class: 'grey-button peertube-button-link',
          href: settings[SETTING_STRIPE_CUSTOMER_PORTAL_URL] as string,
          target: '_blank'
        })

        paymentStatus.push(
          uiBuilder.p(
            await translate('You\'re a premium user.') + ' ' + subscriptionDesc
          ),
          manageButton,
          cancelButton
        )

        rootEl.appendChild(
          uiBuilder.renderRow(
            [uiBuilder.h2(await translate('Status'))],
            paymentStatus
          )
        )
      } else {
        const prices = await restApi.getPrices()
        let hasDiscount = false

        const getDiscountedPrice = (price: Price): number | null => {
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

        const formatAmount = (amount: number, currency: string): string => new Intl.NumberFormat(navigator.language, {
          style: 'currency',
          currency,
          minimumFractionDigits: 0
        }).format(
          amount
        )
        let discountInfo

        const buttons = await Promise.all(prices.map(async (price, index) => {
          const discountedPrice = getDiscountedPrice(price)
          let label

          if (discountedPrice) {
            hasDiscount = true
            label = `
            <span class="text-decoration-line-through">
              ${formatAmount(price.unit_amount as number / 100, price.currency)}
            </span> 
            ${formatAmount(discountedPrice, price.currency)}`
          } else {
            label = formatAmount(price.unit_amount as number / 100, price.currency)
          }

          if (price.recurring?.interval) {
            label += ' / ' + await translate(price.recurring.interval)
          }

          const button = uiBuilder.a(label, {
            class: 'orange-button peertube-button-link ' + (index === 0 ? '' : 'ms-4')
          })

          button.addEventListener('click', () => {
            button.setAttribute('disabled', 'disabled')

            restApi.createCheckout(price.id, price.coupon?.id)
              .then(({ checkoutUrl }: { checkoutUrl: string }) => {
                window.location.href = checkoutUrl
              })
              .catch(async err => {
                peertubeHelpers.showModal({
                  title: await translate('Something went wrong'),
                  content: await translate(
                    'Couldn\'t create subcsription due to technical issues. Please try again later.'
                  ),
                  close: true
                })

                console.error('Couldn\'t create checkout', { err })
              })
              .finally(() => {
                button.removeAttribute('disabled')
              })
          })

          return button
        }))

        if (hasDiscount) {
          const price = prices[0]
          const couponName = price.coupon?.name as string
          const discount = price.coupon?.percent_off
            ? `${price.coupon.percent_off} %`
            : formatAmount(price.coupon?.amount_off ?? 0, price.currency)
          const discountDuration = (price.coupon?.duration === 'once'
            ? await translate('the first payment')
            : price.coupon?.duration === 'forever'
              ? await translate('forever')
              : await translate('the first _MONTHS_COUNT_ months'))
            .replace('_MONTHS_COUNT_', String(price.coupon?.duration_in_months))

          discountInfo = uiBuilder.div([
            uiBuilder.p(
              (await translate(
                'Right now we\'ve _COUPON_NAME_ which will give you _DISCOUNT_ off _DISCOUNT_DURATION_.'
              ))
                .replace('_COUPON_NAME_', couponName)
                .replace('_DISCOUNT_', discount)
                .replace('_DISCOUNT_DURATION_', discountDuration)
            )
          ],
          'fw-bold')
        }

        rootEl.appendChild(
          uiBuilder.renderRow(
            [uiBuilder.h2(await translate('Become premium'))],
            [
              uiBuilder.p(
                await translate(
                  'As a premium user you\'ll get access to premium videos and helps us to continue or work.'
                )
              ),
              discountInfo ?? uiBuilder.div([]),
              ...buttons
            ]
          )
        )
      }

      const renderInvoiceList = async (payments: SubscriptionInvoice[]): Promise<HTMLElement[]> =>
        Promise.all(payments.map(async (payment) =>
          uiBuilder.div([
            uiBuilder.renderRow(
              [uiBuilder.p(formatDate(payment.created), 'mb-2 fw-bold')]
            ),
            uiBuilder.renderRow(
              [uiBuilder.p(await translate('Sum'))],
              [uiBuilder.p(`${(payment.amountTotal ?? 0) / 100} ${payment.currency.toUpperCase()}`)]
            ),
            uiBuilder.renderRow(
              [uiBuilder.p(await translate('Status'))],
              [uiBuilder.p(await translate(payment.status ?? 'Canceled'))]
            )
          ])
        ))

      if (isPremiumUser) {
        rootEl.appendChild(uiBuilder.renderRow(
          [uiBuilder.h2(await translate('Payment history'))],
          await renderInvoiceList(subscription.invoices ?? [])
        ))
      }
    }
  })
}

export {
  register
}
