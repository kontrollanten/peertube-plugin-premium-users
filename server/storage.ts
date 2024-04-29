import sequelize from 'sequelize'
import { PluginUserInfo } from './types'

export class Storage {
  sequelLight: Pick<sequelize.Sequelize, 'query'>

  tables = {
    premiumUsers: '"premiumUsers_premiumUsers"',
    premiumVideos: '"premiumUsers_premiumVideos"'
  }

  constructor (
    sequelLight: Pick<sequelize.Sequelize, 'query'>
  ) {
    this.sequelLight = sequelLight
  }

  init = async (): Promise<void> => {
    await this.sequelLight.query(`CREATE TABLE IF NOT EXISTS ${this.tables.premiumUsers} (
      "userId" integer NOT NUll,
      "paidUntil" varchar(256),
      "hasPaymentFailed" boolean NOT NULL DEFAULT false,
      "subscriptionId" varchar(256),
      "customerId" varchar(256),
      PRIMARY KEY ("userId")
    )`)
    await this.sequelLight.query(`CREATE TABLE IF NOT EXISTS ${this.tables.premiumVideos} (
      "videoUuid" varchar(256) NOT NUll,
      PRIMARY KEY ("videoUuid")
    )`)
  }

  addPremiumVideo = async (uuid: string): Promise<void> => {
    await this.sequelLight.query(`INSERT INTO ${this.tables.premiumVideos} ("videoUuid") VALUES(?)`, {
      replacements: [uuid]
    })
  }

  removePremiumVideo = async (uuid: string): Promise<void> => {
    await this.sequelLight.query(`DELETE FROM ${this.tables.premiumVideos} WHERE "videoUuid" = ?`, {
      replacements: [uuid]
    })
  }

  isPremiumVideo = async (uuid: string): Promise<boolean> => {
    const [result] = await this.sequelLight.query(
      `SELECT "videoUuid" FROM ${this.tables.premiumVideos} WHERE "videoUuid" = ?`,
      {
        replacements: [uuid],
        type: sequelize.QueryTypes.SELECT
      }
    )

    return Boolean(result)
  }

  getUserInfo = async (userId: number): Promise<PluginUserInfo | undefined> => {
    if (!userId) return

    const [userInfo] = await this.sequelLight.query(`SELECT * FROM ${this.tables.premiumUsers} WHERE "userId" = ?`, {
      type: sequelize.QueryTypes.SELECT,
      replacements: [userId]
    })

    return userInfo as PluginUserInfo
  }

  storeUserInfo = async (userId: number, userInfo: PluginUserInfo): Promise<void> => {
    await this.sequelLight.query(`
      INSERT INTO ${this.tables.premiumUsers} (
        "userId",
        "paidUntil",
        "hasPaymentFailed",
        "subscriptionId",
        "customerId"
      ) VALUES (:userId, :paidUntil, :hasPaymentFailed, :subscriptionId, :customerId)
      ON CONFLICT("userId")
      DO UPDATE SET
        "paidUntil" = :paidUntil,
        "hasPaymentFailed" = :hasPaymentFailed,
        "subscriptionId" = :subscriptionId,
        "customerId" = :customerId
    `, {
      replacements: {
        userId,
        paidUntil: userInfo.paidUntil,
        hasPaymentFailed: userInfo.hasPaymentFailed ?? false,
        subscriptionId: userInfo.subscriptionId,
        customerId: userInfo.customerId
      }
    })
  }
}
