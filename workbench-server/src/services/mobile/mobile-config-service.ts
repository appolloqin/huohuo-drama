/**
 * 移动端运行时配置（公开，不含密钥）
 */
import { isWechatPayReady, type WechatPaySettings } from '../payment/wechat-pay.js'
import * as paymentProviderConfigsRepo from '../../db/repos/payment-provider-configs/index.js'

export async function loadWechatPaySettings(): Promise<WechatPaySettings> {
  const row = await paymentProviderConfigsRepo.findPaymentProviderConfigByProvider('wechat')
  let cfg: WechatPaySettings = {}
  if (row?.settings) {
    try {
      const parsed = JSON.parse(row.settings)
      if (parsed && typeof parsed === 'object') cfg = parsed as WechatPaySettings
    } catch { /* ignore */ }
  }
  return {
    ...cfg,
    app_id: String(cfg.app_id || process.env.WECHAT_PAY_APP_ID || ''),
    mch_id: String(cfg.mch_id || process.env.WECHAT_PAY_MCH_ID || ''),
    api_v3_key: String(cfg.api_v3_key || process.env.WECHAT_PAY_API_V3_KEY || ''),
    serial_no: String(cfg.serial_no || process.env.WECHAT_PAY_SERIAL_NO || ''),
    private_key: String(cfg.private_key || process.env.WECHAT_PAY_PRIVATE_KEY || ''),
  }
}

function webConsoleUrl() {
  return String(process.env.MOBILE_WEB_CONSOLE_URL || process.env.SITE_URL || 'http://localhost:28555').replace(/\/$/, '')
}

function miniProgramAppId() {
  return String(
    process.env.WECHAT_MINI_APP_ID
    || process.env.WECHAT_MP_APP_ID
    || process.env.WECHAT_PAY_APP_ID
    || '',
  ).trim()
}

function miniProgramSecret() {
  return String(
    process.env.WECHAT_MINI_APP_SECRET
    || process.env.WECHAT_MP_APP_SECRET
    || '',
  ).trim()
}

async function wechatPayReady() {
  return isWechatPayReady(await loadWechatPaySettings())
}

export async function getMobilePublicConfig() {
  const appId = miniProgramAppId()
  const secret = miniProgramSecret()
  return {
    web_console_url: webConsoleUrl(),
    features: {
      wechat_login: Boolean(appId && secret),
      wechat_jsapi_pay: await wechatPayReady(),
      password_login: true,
      natural_language_commands: true,
    },
    wechat_mini_app_id: appId || null,
  }
}

export function getMobileHealth() {
  return {
    status: 'ok',
    channel: 'mobile',
    db_driver: process.env.DB_DRIVER || 'sqlite',
    timestamp: new Date().toISOString(),
  }
}

export function resolveWechatMiniCredentials() {
  const appId = miniProgramAppId()
  const secret = miniProgramSecret()
  if (!appId || !secret) {
    throw new Error('未配置微信小程序 AppID / AppSecret（WECHAT_MINI_APP_ID、WECHAT_MINI_APP_SECRET）')
  }
  return { appId, secret }
}

export function getPublicApiOrigin(): string {
  const u = String(process.env.PUBLIC_API_ORIGIN || process.env.API_PUBLIC_ORIGIN || '').replace(/\/$/, '')
  if (u) return u
  const port = process.env.PORT || '18555'
  return `http://127.0.0.1:${port}`
}
