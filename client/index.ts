import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions } from '@peertube/peertube-types/shared/models'
import { Api } from './api'
import { PluginUserInfoPayment } from '../server/types'

class UiBuilder {
  rootEl: HTMLElement

  constructor (rootEl: HTMLElement) {
    this.rootEl = rootEl
  }

  div (children: HTMLElement[], className?: string): HTMLElement {
    const elem = document.createElement('div')

    if (className) {
      elem.className = className
    }

    children.forEach(c => elem.appendChild(c))

    return elem
  }

  a (innerText: string, href: string): HTMLElement {
    const elem = document.createElement('a')
    elem.innerText = innerText
    elem.href = href

    return elem
  }

  h2 (innerText: string): HTMLElement {
    const elem = document.createElement('h2')
    elem.innerText = innerText

    return elem
  }

  p (innerText: string, className?: string): HTMLElement {
    const elem = document.createElement('p')
    elem.innerText = innerText

    if (className) {
      elem.className = className
    }

    return elem
  }
}

const formatDate = (date: string | number): string => {
  const d = new Date(date)

  return d.toLocaleDateString('sv-SE')
}

function register ({
  registerClientRoute,
  peertubeHelpers
}: RegisterClientOptions & {
  registerClientRoute: (options: RegisterClientRouteOptions & {
    menuItem: {
      label: string
    }
    title: string
    parentRoute: string
  }) => any
}): void {
  const restApi = new Api(peertubeHelpers.getAuthHeader)

  registerClientRoute({
    route: '/plus-konto',
    parentRoute: '/my-account',
    menuItem: {
      label: 'Plus-konto'
    },
    title: 'Plus-konto',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    onMount: async ({ rootEl }): Promise<void> => {
      rootEl.className = 'plugin-premium-users'

      let userMe
      try {
        userMe = await restApi.getMe()
      } catch (err) {
        console.error('Failed to fetch /api/v1/users/me', { err })

        // Visa ett felmeddelande i och med att vi inte har användar-id.
      }

      const userInfo = await restApi.getUserInfo()
      const isPlusUser = userInfo.paymentStatus === 'paid'

      const uiBuilder = new UiBuilder(rootEl)

      const paymentStatus = []

      if (isPlusUser) {
        paymentStatus.push(
          uiBuilder.p('Du är plus-medlem. Medlemskapet förnyas ' + formatDate((userInfo.paidUntil as string)) + '.')
        )
      } else {
        paymentStatus.push(uiBuilder.p('Du är för närvarande inte plus-medlem.'))

        paymentStatus.push(
          // eslint-disable-next-line max-len
          uiBuilder.a('Bli plus-medlem', `https://buy.stripe.com/test_8wM8z9dFcbz2gLu4gg?client_reference_id=${userMe.id}&prefilled_email=${userMe.email}&locale=sv-SE`)
        )
      }

      rootEl.appendChild(uiBuilder.div(
        [
          uiBuilder.div(
            [uiBuilder.h2('Status')],
            'col-12 col-lg-4 col-xl-3'
          ),
          uiBuilder.div(
            paymentStatus,
            'col-12 col-lg-8 col-xl-9'
          )
        ],
        'row'
      ))

      const renderPaymentList = (payments: PluginUserInfoPayment[]): HTMLElement =>
        uiBuilder.div(
          payments.map((payment) =>
            uiBuilder.div([
              uiBuilder.div(
                [uiBuilder.p(formatDate(+payment.created * 1000), 'mb-2 fw-bold')],
                'col-12'
              ),
              uiBuilder.div(
                [uiBuilder.p('Summa')],
                'col-12 col-lg-4 col-xl-3'
              ),
              uiBuilder.div(
                [uiBuilder.p(`${(payment.amountTotal ?? 0) / 100} ${payment.currency.toUpperCase()}`)],
                'col-12 col-lg-8 col-xl-9'
              ),
              uiBuilder.div(
                [uiBuilder.p('Status')],
                'col-12 col-lg-4 col-xl-3'
              ),
              uiBuilder.div(
                [uiBuilder.p(`${payment.status}`)],
                'col-12 col-lg-8 col-xl-9'
              )
            ], 'row')
          )
        )

      rootEl.appendChild(uiBuilder.div(
        [
          uiBuilder.div(
            [uiBuilder.h2('Betalningshistorik')],
            'col-12 col-lg-4 col-xl-3'
          ),
          uiBuilder.div(
            [renderPaymentList(userInfo.payments ?? [])],
            'col-12 col-lg-8 col-xl-9'
          )
        ],
        'row'
      ))
    }
  })
}

export {
  register
}
