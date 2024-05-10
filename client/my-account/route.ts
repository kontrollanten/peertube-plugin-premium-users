import { RegisterClientHelpers } from '@peertube/peertube-types/client'
import { Api } from '../api'
import { renderPremiumPage } from './premium-user'
import { renderNonPremiumPage } from './non-premium-user'

export const buildOnMount = (peertubeHelpers: RegisterClientHelpers) =>
  async ({ rootEl }: { rootEl: HTMLElement }): Promise<void> => {
    const { translate } = peertubeHelpers
    const restApi = new Api(peertubeHelpers.getAuthHeader)
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

    if (isPremiumUser) {
      await renderPremiumPage({ peertubeHelpers, rootEl, subscription })
    } else {
      await renderNonPremiumPage({ peertubeHelpers, rootEl })
    }
  }
