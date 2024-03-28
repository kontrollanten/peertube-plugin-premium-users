import { PluginStorageManager } from '@peertube/peertube-types'
import { PluginUserInfo } from './types'

export class Storage {
  storageManager: PluginStorageManager

  constructor (
    storageManager: PluginStorageManager
  ) {
    this.storageManager = storageManager
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
}
