import packageJson from '../package.json'
import { PluginUserInfo } from '../server/types';

export class Api {
  getAuthHeader: () => { Authorization: string } | undefined

  constructor (getAuthHeader: () => { Authorization: string } | undefined) {
    this.getAuthHeader = getAuthHeader
  }

  private async get (path: string): Promise<any> {
    return fetch(path, {
      method: 'GET',
      headers: this.getAuthHeader()
    }).then(async res => res.json())
  }

  async getMe (): Promise<any> {
    return this.get('/api/v1/users/me')
  }

  async getUserInfo (): Promise<PluginUserInfo> {
    return this.get(`/plugins/${packageJson.name.replace('peertube-plugin-', '')}/router/user-info`)
  }
}
