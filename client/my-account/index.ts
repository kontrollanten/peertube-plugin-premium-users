import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { RegisterClientRouteOptions } from '@peertube/peertube-types'
import { SETTING_ENABLE_PLUGIN } from '../../shared/constants'
import { buildOnMount } from './route'

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
    onMount: buildOnMount(peertubeHelpers)
  })
}

export {
  register
}
