import type { PeerTubeHelpers, PluginStorageManager } from '@peertube/peertube-types'
import express from 'express'
import { Storage } from '../storage'

export class GetUserInfo {
  peertubeHelpers: PeerTubeHelpers
  storage: Storage

  constructor (
    peertubeHelpers: PeerTubeHelpers,
    storageManager: PluginStorageManager
  ) {
    this.peertubeHelpers = peertubeHelpers

    this.storage = new Storage(storageManager)
  }

  routeHandler = async (req: express.Request, res: express.Response): Promise<void> => {
    const user = await this.peertubeHelpers.user.getAuthUser(res)
    const userInfo = await this.storage.getUserInfo(user.id)

    res.json(userInfo)
  }
}
