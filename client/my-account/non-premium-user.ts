import { RegisterClientHelpers } from '@peertube/peertube-types/client'
import { UiBuilder } from '../ui-builder'
import { Price } from '../../shared/types'
import { Api } from '../api'

const formatAmount = (amount: number, currency: string): string => new Intl.NumberFormat(navigator.language, {
  style: 'currency',
  currency,
  minimumFractionDigits: 0
}).format(
  amount
)

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

export const renderNonPremiumPage = async ({
  peertubeHelpers,
  rootEl
}: {
  peertubeHelpers: RegisterClientHelpers
  rootEl: HTMLElement
}): Promise<void> => {
  const restApi = new Api(peertubeHelpers.getAuthHeader)
  const { translate } = peertubeHelpers
  const uiBuilder = new UiBuilder(rootEl)
  const prices = await restApi.getPrices()

  const columns = await Promise.all(prices.map(async (price) => {
    const discountedPrice = getDiscountedPrice(price)
    let label

    if (discountedPrice) {
      label = `
    <span class="original-price">
      ${formatAmount(price.unit_amount as number / 100, price.currency)}</span> 
    ${formatAmount(discountedPrice, price.currency)}`
    } else {
      label = formatAmount(price.unit_amount as number / 100, price.currency)
    }

    if (price.recurring?.interval) {
      label += ' / ' + await translate(price.recurring.interval)
    }

    const button = uiBuilder.a(label, {
      class: 'orange-button peertube-button-link mb-4'
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

    let discountForHowLongDesc = ''
    let amountToSave = 0

    if (price.recurring?.interval === 'month') {
      discountForHowLongDesc = (await translate('the first MONTHS_COUNT months.'))
        .replace('MONTHS_COUNT', String(price.coupon?.duration_in_months))

      if (price.unit_amount && price.coupon?.amount_off && price.coupon?.duration_in_months) {
        amountToSave = (price.coupon.amount_off * price.coupon?.duration_in_months) / 100
      }

      if (price.unit_amount && price.coupon?.percent_off && price.coupon?.duration_in_months) {
        amountToSave = (
          (price.unit_amount * (price.coupon.percent_off / 100)) *
          price.coupon?.duration_in_months
        ) / 100
      }
    } else if (price.recurring?.interval === 'year') {
      discountForHowLongDesc += ' ' + (await translate('for a whole year.'))

      if (price.unit_amount && price.coupon?.amount_off) {
        amountToSave = (price.coupon.amount_off * 12) / 100
      }

      if (price.unit_amount && price.coupon?.percent_off) {
        amountToSave = (
          (price.unit_amount * (price.coupon.percent_off / 100))
        ) / 100
      }
    }
    const discount = price.coupon?.percent_off
      ? `${price.coupon.percent_off} %`
      : formatAmount(price.coupon?.amount_off ?? 0, price.currency)

    return uiBuilder.div([
      uiBuilder.p(
        await translate('Pay ' +
        (price.recurring?.interval === 'day' ? 'daily' : price.recurring?.interval as string + 'ly')
        ),
        'fw-bold'
      ),
      uiBuilder.ul([
        discount + ' ' + discountForHowLongDesc,
        (await translate('You\'ll save AMOUNT_TO_SAVE.'))
          .replace('AMOUNT_TO_SAVE', String(formatAmount(Math.round(amountToSave), price.currency)))
      ]),
      button
    ])
  }))

  rootEl.appendChild(
    uiBuilder.renderRow(
      [uiBuilder.h2(await translate('Become premium'))],
      [
        uiBuilder.p(
          await translate(
            'As a premium user you\'ll get access to premium videos and helps us to continue or work.'
          )
        )
      ]
    )
  )

  rootEl.appendChild(
    uiBuilder.renderRow(
      [],
      [uiBuilder.div(
        columns.map((c) => uiBuilder.div([c], 'col-12 col-sm-6')), 'row'
      )]
    )
  )
}