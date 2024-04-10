import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions } from '@peertube/peertube-types/shared/models'
import { Api } from './api'
import { SubscriptionInvoice } from '../server/types'
import { VIDEO_FIELD_IS_PREMIUM_CONTENT } from '../shared/constants'
import { UiBuilder } from './ui-builder'

const formatDate = (date: string | number): string => {
  const d = new Date(date)

  return d.toLocaleDateString('sv-SE')
}

async function register ({
  registerClientRoute,
  registerVideoField,
  peertubeHelpers
}: RegisterClientOptions & {
  registerClientRoute: (options: RegisterClientRouteOptions & {
    menuItem: {
      label: string
    }
    title: string
    parentRoute: string
  }) => any
}): Promise<void> {
  const { translate } = peertubeHelpers
  const restApi = new Api(peertubeHelpers.getAuthHeader)

  registerVideoField({
    name: VIDEO_FIELD_IS_PREMIUM_CONTENT,
    label: await translate('Premium content'),
    type: 'select',
    options: [
      {
        value: 'false',
        label: await translate('Non-premium content')
      },
      {
        value: 'true',
        label: await translate('Premium content')
      }
    ],
    default: false,
    error: async (options) => {
      console.log({ options })

      return { error: false }
    }
  }, {
    type: 'update',
    tab: 'main'
  })

  registerClientRoute({
    route: '/premium',
    parentRoute: '/my-account',
    menuItem: {
      label: await translate('Plus-konto')
    },
    title: await translate('Plus-konto'),
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    onMount: async ({ rootEl }): Promise<void> => {
      rootEl.className = 'plugin-premium-users'

      const searchParams = new URLSearchParams(window.location.search)

      if (searchParams.get('checkout_status') === 'success') {
        peertubeHelpers.showModal({
          title: await translate('Payment succeeded'),
          content: await translate(
            `Your payment succeeded and will short be registered, 
            it may take awhile depending on your payment method.`
          ),
          close: true
        })
      }

      const subscription = await restApi.getSubscription()
      const isPlusUser = subscription.status === 'active'

      const uiBuilder = new UiBuilder(rootEl)

      const paymentStatus = []

      if (isPlusUser) {
        let subscriptionDesc
        let buttonText

        if (subscription.cancelAtPeriodEnd) {
          subscriptionDesc = await translate(
            'Subscription will not be renewed and will end at '
          ) +
            formatDate(subscription.cancelAt as string) + '.'
          buttonText = await translate('Resume subscription')
        } else {
          subscriptionDesc = 'Subscription will be renewed at ' +
            formatDate((subscription.currentPeriodEnd as string)) +
            '.'
          buttonText = await translate('Cancel subscription')
        }

        const button = uiBuilder.a(buttonText, {
          class: 'grey-button peertube-button-link'
        })

        button.addEventListener('click', (): void => {
          button.setAttribute('disabled', 'disabled')
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

        paymentStatus.push(
          uiBuilder.p(
            await translate('You\'re a premium user.') + ' ' + subscriptionDesc
          ),
          button
        )
      } else {
        const button = uiBuilder.a(await translate('Subscribe to be a premium user'), {
          class: 'orange-button peertube-button-link'
        })

        button.addEventListener('click', () => {
          button.setAttribute('disabled', 'disabled')

          restApi.createCheckout()
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
        })

        paymentStatus.push(
          uiBuilder.p(await translate('You\'re not a premium user')),
          button
        )
      }

      rootEl.appendChild(
        uiBuilder.renderRow(
          [uiBuilder.h2(await translate('Status'))],
          paymentStatus
        )
      )

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
              [uiBuilder.p(`${payment.status ?? await translate('Canceled')}`)]
            )
          ])
        ))

      rootEl.appendChild(uiBuilder.renderRow(
        [uiBuilder.h2(await translate('Betalningshistorik'))],
        await renderInvoiceList(subscription.invoices ?? [])
      ))
    }
  })
}

export {
  register
}
