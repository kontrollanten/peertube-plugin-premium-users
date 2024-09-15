import 'mocha'
import { equal } from 'assert'
import { isPremiumUser, ONE_DAY } from './utils'

describe('utils', () => {
  describe('isPremiumUser', () => {
    it('return true if isPaidUntil is in one week', () => {
      const now = new Date().getTime()
      const userInfo = {
        paidUntil: new Date(now + ONE_DAY * 7).toISOString()
      }
      equal(isPremiumUser(userInfo), true);
    })

    it('return true if isPaidUntil is tomorrow', () => {
      const now = new Date().getTime()
      const userInfo = {
        paidUntil: new Date(now + ONE_DAY).toISOString()
      }
      equal(isPremiumUser(userInfo), true);
    })

    it('return true if isPaidUntil is in one hour', () => {
      const now = new Date().getTime()
      const userInfo = {
        paidUntil: new Date(now + 3600 * 1000).toISOString()
      }
      equal(isPremiumUser(userInfo), true);
    })

    it('return true if isPaidUntil is now', () => {
      const now = new Date().getTime()
      const userInfo = {
        paidUntil: new Date(now).toISOString()
      }
      equal(isPremiumUser(userInfo), true);
    })

    it('return true if isPaidUntil is yesterday', () => {
      const now = new Date().getTime()
      const userInfo = {
        paidUntil: new Date(now - ONE_DAY + 1000 * 60).toISOString()
      }
      equal(isPremiumUser(userInfo), true);
    })
  })
})
