import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions, RegisterClientVideoFieldOptions } from '@peertube/peertube-types/shared/models'
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
  const types: Array<RegisterClientVideoFieldOptions['type']> =
    ['update', 'upload', 'import-url', 'import-torrent', 'go-live']

  for (const type of types) {
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
      default: false
    }, {
      type,
      tab: 'main'
    })
  }
}

export {
  register
}
