import { PluginStorageManager } from '@peertube/peertube-types'
import { PluginUserInfo } from './types'

export class Storage {
  storageManager: PluginStorageManager

  constructor (
    storageManager: PluginStorageManager
  ) {
    this.storageManager = storageManager
  }

  addPremiumVideo = async (uuid: string): Promise<void> => {
    const premiumVideos = await this.getPremiumVideos()

    await this.storageManager.storeData(
      this.premiumVideoStorageKey,
      premiumVideos
        .filter((_uuid: string) => _uuid !== uuid)
        .concat(uuid)
    )
  }

  removePremiumVideo = async (uuid: string): Promise<void> => {
    const premiumVideos = await this.getPremiumVideos()

    await this.storageManager.storeData(
      this.premiumVideoStorageKey,
      premiumVideos
        .filter((_uuid: string) => _uuid !== uuid)
    )
  }

  isPremiumVideo = async (uuid: string): Promise<boolean> => {
    const premiumVideos = await this.getPremiumVideos()

    return Boolean(premiumVideos.filter((_uuid) => _uuid === uuid))
  }

  getUserInfo = async (userId: number): Promise<PluginUserInfo> => {
    const storageKey = this.getUserInfoStorageKey(userId)
    const userInfo = await this.storageManager.getData(storageKey) as unknown

    if (!userInfo) {
      return {}
    }

    return userInfo
  }

  storeUserInfo = async (userId: number, userInfo: PluginUserInfo): Promise<void> => {
    await this.storageManager.storeData(this.getUserInfoStorageKey(userId), userInfo)
  }

  private readonly getUserInfoStorageKey = (userId: number): string => `user-${userId}`
  private readonly premiumVideoStorageKey = 'premium-videos'

  private readonly getPremiumVideos = async (): Promise<string[]> => {
    const premiumVideos = (await this.storageManager.getData(this.premiumVideoStorageKey) ?? []) as unknown

    return premiumVideos as string[]
  }
}
