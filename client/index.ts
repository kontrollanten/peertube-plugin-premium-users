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

      let userMe
      try {
        userMe = await restApi.getMe()
      } catch (err) {
        console.error('Failed to fetch /api/v1/users/me', { err })

        // TODO: Visa ett felmeddelande i och med att vi inte har användar-id.

        return
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
            .catch((err: any) => {
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
        paymentStatus.push(
          uiBuilder.p(await translate('You\'re not a premium user')),
          uiBuilder.a(await translate('Subscribe to be a premium user'), {
            class: 'orange-button peertube-button-link',
            // eslint-disable-next-line max-len
            href: `https://buy.stripe.com/test_8wM8z9dFcbz2gLu4gg?client_reference_id=${userMe.id}&prefilled_email=${userMe.email}&locale=sv-SE`
          })
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
