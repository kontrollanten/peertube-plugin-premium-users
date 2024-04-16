import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions } from '@peertube/peertube-types/shared/models'
import { VIDEO_FIELD_IS_PREMIUM_CONTENT } from '../shared/constants'

async function register ({
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
}

export {
  register
}
