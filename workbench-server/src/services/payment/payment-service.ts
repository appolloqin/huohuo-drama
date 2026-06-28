import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import * as paymentOrdersRepo from '../../db/repos/payment-orders/index.js'
import * as paymentProviderConfigsRepo from '../../db/repos/payment-provider-configs/index.js'
import type { PaymentOrderRow } from '../../db/repos/types.js'
import { success, badRequest, now } from '../../common/http/response.js'
import { addCredits } from '../credits/credits.js'
import { requireAuth } from '../../middleware/auth.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import {
  pingpongPaymentBaseUrl,
  pingpongPrePay,
  pingpongPaymentQuery,
  pingpongVerifyPayload,
  type PingpongPrepayBiz,
  type PingpongRegion,
} from './pingpong-checkout.js'
import {
  decryptWechatResource,
  isWechatPayReady,
  testWechatPaySettings,
  wechatNativePay,
  wechatQueryByOutTradeNo,
  type WechatPaySettings,
} from './wechat-pay.js'
import {
  alipayTradeQuery,
  buildAlipayPagePayUrl,
  isAlipayReady,
  testAlipaySettings,
  verifyAlipayRSA2,
  type AlipaySettings,
} from './alipay-pay.js'

type Plan = {
  id: string
  name: string
  amount: number
  currency: string
  credits: number
}

/** PayPal：developer.paypal.com 应用（OAuth2 Client Credentials + Orders v2） */
type PaypalRestSettings = {
  client_id?: string
  client_secret?: string
  env?: 'sandbox' | 'live'
  credit_per_usd?: number
  custom_max_usd?: number
  bonus_tiers?: Array<{ threshold_usd: number; bonus_percent: number }>
}

/** PingPong Checkout V4：accId / clientId / salt，站点 fra|sg|us（与 API 域名一致） */
type PingpongSettings = {
  acc_id?: string
  client_id?: string
  salt?: string
  region?: PingpongRegion
  env?: 'sandbox' | 'live'
  sign_type?: 'SHA256' | 'MD5'
  credit_per_usd?: number
  custom_max_usd?: number
  bonus_tiers?: Array<{ threshold_usd: number; bonus_percent: number }>
}

type CheckoutProviderCode = 'paypal' | 'pingpong' | 'wechat' | 'alipay'

const CNY_PROVIDERS = new Set<CheckoutProviderCode>(['wechat', 'alipay'])

const paymentApp = new Hono()
paymentApp.use('/checkout-session', requireAuth)
paymentApp.use('/paypal/capture-order', requireAuth)
paymentApp.use('/pingpong/confirm', requireAuth)
paymentApp.use('/wechat/confirm', requireAuth)
paymentApp.use('/alipay/confirm', requireAuth)
paymentApp.use('/admin/*', requireAuth)

type ProviderMeta = {
  code: CheckoutProviderCode
  name: string
  methods: string[]
  note: string
}

const ALL_PROVIDERS: ProviderMeta[] = [
  {
    code: 'pingpong',
    name: 'PingPong',
    methods: ['pingpong_checkout'],
    note: 'PingPong Checkout API V4：POST /v4/payment/prePay 跳转 paymentUrl；回调 notificationUrl；对账见 /v4/payment/query（官方文档 acquirer-api-docs-v4-en.pingpongx.com）',
  },
  {
    code: 'paypal',
    name: 'PayPal',
    methods: ['paypal'],
    note: 'PayPal Orders API v2（developer.paypal.com/docs/api/orders/v2/）',
  },
  {
    code: 'wechat',
    name: '微信支付',
    methods: ['wechat_native'],
    note: '微信支付 API v3 Native 下单（code_url 扫码）；异步通知 POST /payments/wechat/notify，需配置 PUBLIC_API_ORIGIN',
  },
  {
    code: 'alipay',
    name: '支付宝',
    methods: ['alipay_page'],
    note: '支付宝电脑网站支付 alipay.trade.page.pay；异步通知 POST /payments/alipay/notify',
  },
]

const DEFAULT_PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', amount: 499, currency: 'usd', credits: 60 },
  { id: 'pro', name: 'Pro', amount: 1499, currency: 'usd', credits: 220 },
  { id: 'max', name: 'Max', amount: 4999, currency: 'usd', credits: 900 },
]

function getPlans(): Plan[] {
  const raw = process.env.PAYMENT_PLANS
  if (!raw) return DEFAULT_PLANS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_PLANS
    const plans = parsed
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: String(p.id || ''),
        name: String(p.name || p.id || ''),
        amount: Math.max(1, Math.floor(Number(p.amount || 0))),
        currency: String(p.currency || 'usd').toLowerCase(),
        credits: Math.max(1, Math.floor(Number(p.credits || 0))),
      }))
      .filter((p) => p.id && p.name && p.amount > 0 && p.credits > 0)
    return plans.length ? plans : DEFAULT_PLANS
  } catch {
    return DEFAULT_PLANS
  }
}

function isCheckoutProvider(code: string): code is CheckoutProviderCode {
  return code === 'paypal' || code === 'pingpong' || code === 'wechat' || code === 'alipay'
}

async function getWechatSettings(): Promise<WechatPaySettings> {
  const cfg = await getProviderSettings<WechatPaySettings>('wechat')
  return {
    ...cfg,
    app_id: String(cfg.app_id || process.env.WECHAT_PAY_APP_ID || ''),
    mch_id: String(cfg.mch_id || process.env.WECHAT_PAY_MCH_ID || ''),
    api_v3_key: String(cfg.api_v3_key || process.env.WECHAT_PAY_API_V3_KEY || ''),
    serial_no: String(cfg.serial_no || process.env.WECHAT_PAY_SERIAL_NO || ''),
    private_key: String(cfg.private_key || process.env.WECHAT_PAY_PRIVATE_KEY || ''),
    env: (cfg.env || (process.env.WECHAT_PAY_ENV === 'live' ? 'live' : 'sandbox')) as 'sandbox' | 'live',
  }
}

async function getAlipaySettings(): Promise<AlipaySettings> {
  const cfg = await getProviderSettings<AlipaySettings>('alipay')
  return {
    ...cfg,
    app_id: String(cfg.app_id || process.env.ALIPAY_APP_ID || ''),
    private_key: String(cfg.private_key || process.env.ALIPAY_PRIVATE_KEY || ''),
    alipay_public_key: String(cfg.alipay_public_key || process.env.ALIPAY_PUBLIC_KEY || ''),
    env: (cfg.env || (process.env.ALIPAY_ENV === 'live' ? 'live' : 'sandbox')) as 'sandbox' | 'live',
    sign_type: 'RSA2',
  }
}

async function getPaypalRestSettings(): Promise<PaypalRestSettings> {
  const cfg = await getProviderSettings<PaypalRestSettings>('paypal')
  return {
    ...cfg,
    client_id: String(cfg.client_id || process.env.PAYPAL_CLIENT_ID || ''),
    client_secret: String(cfg.client_secret || process.env.PAYPAL_CLIENT_SECRET || ''),
    env: (cfg.env || (process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox')) as 'sandbox' | 'live',
  }
}

async function getPingpongSettings(): Promise<PingpongSettings> {
  const cfg = await getProviderSettings<PingpongSettings>('pingpong')
  const region = (['fra', 'sg', 'us'].includes(String(cfg.region)) ? cfg.region : 'fra') as PingpongRegion
  const signType = String(cfg.sign_type || 'SHA256').toUpperCase() === 'MD5' ? 'MD5' : 'SHA256'
  return {
    ...cfg,
    acc_id: String(cfg.acc_id || process.env.PINGPONG_ACC_ID || ''),
    client_id: String(cfg.client_id || process.env.PINGPONG_CLIENT_ID || ''),
    salt: String(cfg.salt || process.env.PINGPONG_SALT || ''),
    region,
    env: (cfg.env || (process.env.PINGPONG_ENV === 'live' ? 'live' : 'sandbox')) as 'sandbox' | 'live',
    sign_type: signType,
  }
}

async function isPaypalReady() {
  const s = await getPaypalRestSettings()
  return Boolean(s.client_id && s.client_secret)
}

async function isPingpongReady() {
  const s = await getPingpongSettings()
  return Boolean(s.acc_id && s.client_id && s.salt)
}

async function providerReady(provider: string) {
  if (provider === 'paypal') return isPaypalReady()
  if (provider === 'pingpong') return isPingpongReady()
  if (provider === 'wechat') return isWechatPayReady(await getWechatSettings())
  if (provider === 'alipay') return isAlipayReady(await getAlipaySettings())
  return false
}

async function enabledProviderCodes() {
  const rows = await paymentProviderConfigsRepo.listPaymentProviderConfigs()
  return rows.filter((row) => Number(row.enabled || 0) === 1).map((row) => String(row.provider))
}

async function getCreditPerUsd(provider: CheckoutProviderCode) {
  const settings = provider === 'paypal' ? await getPaypalRestSettings() : await getPingpongSettings()
  const rate = Number(settings.credit_per_usd)
  if (Number.isFinite(rate) && rate > 0) return rate
  return 10
}

async function getCreditPerCny(provider: CheckoutProviderCode) {
  const settings = provider === 'wechat' ? await getWechatSettings() : await getAlipaySettings()
  const rate = Number(settings.credit_per_cny)
  if (Number.isFinite(rate) && rate > 0) return rate
  return 1
}

async function getCustomMaxUsd(provider: CheckoutProviderCode) {
  const settings = provider === 'paypal' ? await getPaypalRestSettings() : await getPingpongSettings()
  const maxUsd = Number(settings.custom_max_usd)
  if (Number.isFinite(maxUsd) && maxUsd >= 1) return maxUsd
  return 1000
}

async function getCustomMaxCny(provider: CheckoutProviderCode) {
  const settings = provider === 'wechat' ? await getWechatSettings() : await getAlipaySettings()
  const maxCny = Number(settings.custom_max_cny)
  if (Number.isFinite(maxCny) && maxCny >= 1) return maxCny
  return 5000
}

async function getUsdToCnyRate(provider: CheckoutProviderCode) {
  const settings = provider === 'wechat' ? await getWechatSettings() : await getAlipaySettings()
  const rate = Number((settings as Record<string, unknown>).usd_to_cny_rate)
  if (Number.isFinite(rate) && rate > 0) return rate
  return 7.2
}

function normalizeBonusTiersCny(input: unknown): Array<{ threshold_cny: number; bonus_percent: number }> {
  const arr = Array.isArray(input) ? input : []
  return arr
    .map((row) => ({
      threshold_cny: Math.max(1, Math.floor(Number((row as any)?.threshold_cny || 0))),
      bonus_percent: Math.max(0, Math.floor(Number((row as any)?.bonus_percent || 0))),
    }))
    .filter((row) => row.threshold_cny > 0 && row.bonus_percent > 0)
    .sort((a, b) => a.threshold_cny - b.threshold_cny)
}

async function getBonusPercentCny(provider: CheckoutProviderCode, amountCny: number) {
  const settings = provider === 'wechat' ? await getWechatSettings() : await getAlipaySettings()
  const tiers = normalizeBonusTiersCny(settings.bonus_tiers)
  let bonus = 0
  for (const tier of tiers) {
    if (amountCny >= tier.threshold_cny) bonus = tier.bonus_percent
  }
  return bonus
}

function normalizeBonusTiers(input: unknown): Array<{ threshold_usd: number; bonus_percent: number }> {
  const arr = Array.isArray(input) ? input : []
  return arr
    .map((row) => ({
      threshold_usd: Math.max(1, Math.floor(Number((row as any)?.threshold_usd || 0))),
      bonus_percent: Math.max(0, Math.floor(Number((row as any)?.bonus_percent || 0))),
    }))
    .filter((row) => row.threshold_usd > 0 && row.bonus_percent > 0)
    .sort((a, b) => a.threshold_usd - b.threshold_usd)
}

async function getBonusPercent(provider: CheckoutProviderCode, amountUsd: number) {
  const settings = provider === 'paypal' ? await getPaypalRestSettings() : await getPingpongSettings()
  const tiers = normalizeBonusTiers(settings.bonus_tiers)
  let bonus = 0
  for (const tier of tiers) {
    if (amountUsd >= tier.threshold_usd) bonus = tier.bonus_percent
  }
  return bonus
}

async function getProviderRow(provider: string) {
  return paymentProviderConfigsRepo.findPaymentProviderConfigByProvider(provider)
}

async function getProviderSettings<T extends Record<string, unknown>>(provider: string): Promise<T> {
  const row = await getProviderRow(provider)
  if (!row?.settings) return {} as T
  try {
    const parsed = JSON.parse(row.settings)
    return (parsed && typeof parsed === 'object' ? parsed : {}) as T
  } catch {
    return {} as T
  }
}

function createOrderNo() {
  return `PO${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`
}

async function getPaypalBaseUrl() {
  const s = await getPaypalRestSettings()
  const env = String(s.env || 'sandbox').toLowerCase()
  return env === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

async function getPaypalAccessToken() {
  const s = await getPaypalRestSettings()
  const clientId = String(s.client_id || '')
  const clientSecret = String(s.client_secret || '')
  if (!clientId || !clientSecret) throw new Error('未配置 PayPal Client ID / Client Secret')
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const resp = await fetch(`${await getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const json = await resp.json().catch(() => ({} as { access_token?: string; error_description?: string }))
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || `PayPal token 获取失败(${resp.status})`)
  }
  return json.access_token
}

/** 公网 HTTPS 基址，用于 PingPong notificationUrl（不可带 query） */
function getPublicApiOrigin(): string {
  const u = String(process.env.PUBLIC_API_ORIGIN || process.env.API_PUBLIC_ORIGIN || '').replace(/\/$/, '')
  if (u) return u
  const port = Number(process.env.PORT || 18555)
  return `http://127.0.0.1:${port}`
}

async function fulfillPaidOrder(order: PaymentOrderRow, providerLabel: string) {
  const fresh = await paymentOrdersRepo.findPaymentOrderById(order.id)
  if (!fresh || fresh.status !== 'pending') return

  const ts = now()
  const upd = await paymentOrdersRepo.markPaymentOrderPaidIfPending(order.id, {
    status: 'paid',
    paidAt: ts,
    updatedAt: ts,
  })
  if (!upd?.changes) return

  await addCredits({
    userId: Number(fresh.userId),
    amount: Number(fresh.credits || 0),
    reason: `充值到账(${fresh.orderNo})`,
    serviceType: 'payment',
    provider: providerLabel,
    model: null,
    resourceType: 'payment_order',
    resourceId: Number(fresh.id),
  })
}

paymentApp.get('/methods', async (c) => {
  const enabled = new Set(await enabledProviderCodes())
  const providers = (await Promise.all(ALL_PROVIDERS.map(async (p) => {
    if (!enabled.has(p.code) || !await providerReady(p.code)) return null
    if (CNY_PROVIDERS.has(p.code)) {
      const settings = p.code === 'wechat' ? await getWechatSettings() : await getAlipaySettings()
      return {
        ...p,
        credit_per_cny: await getCreditPerCny(p.code),
        custom_max_cny: await getCustomMaxCny(p.code),
        usd_to_cny_rate: await getUsdToCnyRate(p.code),
        bonus_tiers: normalizeBonusTiersCny(settings.bonus_tiers),
      }
    }
    const usdSettings = p.code === 'paypal' ? await getPaypalRestSettings() : await getPingpongSettings()
    return {
      ...p,
      credit_per_usd: await getCreditPerUsd(p.code),
      custom_max_usd: await getCustomMaxUsd(p.code),
      bonus_tiers: normalizeBonusTiers(usdSettings.bonus_tiers),
    }
  }))).filter((p): p is NonNullable<typeof p> => p != null)
  return success(c, { providers })
})

paymentApp.get('/admin/providers', async (c) => {
  const authUser = getAuthUser(c)
  if (authUser.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const rows = await paymentProviderConfigsRepo.listPaymentProviderConfigs()
  const map = new Map(rows.map((r) => [String(r.provider), r]))
  const providers = await Promise.all(ALL_PROVIDERS.map(async (p) => {
    const row = map.get(p.code)
    const rawSettings = row?.settings ? (() => {
      try { return JSON.parse(row.settings) } catch { return {} }
    })() : {}
    return {
      ...p,
      enabled: Number(row?.enabled || 0) === 1,
      ready: await providerReady(p.code),
      settings: CNY_PROVIDERS.has(p.code)
        ? {
            credit_per_cny: Number(rawSettings?.credit_per_cny || 1),
            custom_max_cny: Number(rawSettings?.custom_max_cny || 5000),
            usd_to_cny_rate: Number(rawSettings?.usd_to_cny_rate || 7.2),
            bonus_tiers: normalizeBonusTiersCny(rawSettings?.bonus_tiers),
            ...rawSettings,
          }
        : {
            credit_per_usd: Number(rawSettings?.credit_per_usd || 10),
            custom_max_usd: Number(rawSettings?.custom_max_usd || 1000),
            bonus_tiers: normalizeBonusTiers(rawSettings?.bonus_tiers),
            ...rawSettings,
          },
    }
  }))
  return success(c, { providers })
})

paymentApp.put('/admin/providers', async (c) => {
  const authUser = getAuthUser(c)
  if (authUser.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const providers = Array.isArray(body.providers) ? body.providers : []
  const ts = now()
  for (const item of providers) {
    const code = String(item?.code || '')
    if (!ALL_PROVIDERS.some((p) => p.code === code)) continue
    const raw = item?.settings && typeof item.settings === 'object' ? item.settings : {}
    const settings: Record<string, unknown> = CNY_PROVIDERS.has(code as CheckoutProviderCode)
      ? {
          credit_per_cny: Math.max(1, Math.floor(Number((raw as Record<string, unknown>).credit_per_cny || 1))),
          custom_max_cny: Math.max(1, Math.floor(Number((raw as Record<string, unknown>).custom_max_cny || 5000))),
          usd_to_cny_rate: Math.max(0.01, Number((raw as Record<string, unknown>).usd_to_cny_rate || 7.2)),
          bonus_tiers: normalizeBonusTiersCny((raw as Record<string, unknown>).bonus_tiers),
        }
      : {
          credit_per_usd: Math.max(1, Math.floor(Number((raw as Record<string, unknown>).credit_per_usd || 10))),
          custom_max_usd: Math.max(1, Math.floor(Number((raw as Record<string, unknown>).custom_max_usd || 1000))),
          bonus_tiers: normalizeBonusTiers((raw as Record<string, unknown>).bonus_tiers),
        }
    if (code === 'paypal') {
      settings.client_id = String((raw as Record<string, unknown>).client_id || '')
      settings.client_secret = String((raw as Record<string, unknown>).client_secret || '')
      settings.env = String((raw as Record<string, unknown>).env || 'sandbox') === 'live' ? 'live' : 'sandbox'
    }
    if (code === 'pingpong') {
      settings.acc_id = String((raw as Record<string, unknown>).acc_id || '')
      settings.client_id = String((raw as Record<string, unknown>).client_id || '')
      settings.salt = String((raw as Record<string, unknown>).salt || '')
      const reg = String((raw as Record<string, unknown>).region || 'fra').toLowerCase()
      settings.region = ['fra', 'sg', 'us'].includes(reg) ? reg : 'fra'
      settings.env = String((raw as Record<string, unknown>).env || 'sandbox') === 'live' ? 'live' : 'sandbox'
      const st = String((raw as Record<string, unknown>).sign_type || 'SHA256').toUpperCase()
      settings.sign_type = st === 'MD5' ? 'MD5' : 'SHA256'
    }
    if (code === 'wechat') {
      settings.app_id = String((raw as Record<string, unknown>).app_id || '')
      settings.mch_id = String((raw as Record<string, unknown>).mch_id || '')
      settings.api_v3_key = String((raw as Record<string, unknown>).api_v3_key || '')
      settings.serial_no = String((raw as Record<string, unknown>).serial_no || '')
      settings.private_key = String((raw as Record<string, unknown>).private_key || '')
      settings.env = String((raw as Record<string, unknown>).env || 'sandbox') === 'live' ? 'live' : 'sandbox'
      settings.credit_per_cny = Math.max(1, Math.floor(Number((raw as Record<string, unknown>).credit_per_cny || 1)))
      settings.custom_max_cny = Math.max(1, Math.floor(Number((raw as Record<string, unknown>).custom_max_cny || 5000)))
      settings.usd_to_cny_rate = Math.max(0.01, Number((raw as Record<string, unknown>).usd_to_cny_rate || 7.2))
      settings.bonus_tiers = normalizeBonusTiersCny((raw as Record<string, unknown>).bonus_tiers)
    }
    if (code === 'alipay') {
      settings.app_id = String((raw as Record<string, unknown>).app_id || '')
      settings.private_key = String((raw as Record<string, unknown>).private_key || '')
      settings.alipay_public_key = String((raw as Record<string, unknown>).alipay_public_key || '')
      settings.env = String((raw as Record<string, unknown>).env || 'sandbox') === 'live' ? 'live' : 'sandbox'
      settings.sign_type = 'RSA2'
      settings.credit_per_cny = Math.max(1, Math.floor(Number((raw as Record<string, unknown>).credit_per_cny || 1)))
      settings.custom_max_cny = Math.max(1, Math.floor(Number((raw as Record<string, unknown>).custom_max_cny || 5000)))
      settings.usd_to_cny_rate = Math.max(0.01, Number((raw as Record<string, unknown>).usd_to_cny_rate || 7.2))
      settings.bonus_tiers = normalizeBonusTiersCny((raw as Record<string, unknown>).bonus_tiers)
    }
    await paymentProviderConfigsRepo.updatePaymentProviderConfig(code, {
      enabled: item?.enabled ? 1 : 0,
      settings: JSON.stringify(settings),
      updatedAt: ts,
    })
  }
  return success(c, { ok: true })
})

paymentApp.post('/admin/providers/test', async (c) => {
  const authUser = getAuthUser(c)
  if (authUser.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const code = String(body?.code || '')
  const inputSettings = body?.settings && typeof body.settings === 'object' ? body.settings : {}
  if (!ALL_PROVIDERS.some((p) => p.code === code)) return badRequest(c, '不支持的支付方式')

  if (code === 'paypal') {
    const saved = await getPaypalRestSettings()
    const merged = { ...saved, ...inputSettings } as PaypalRestSettings
    const clientId = String(merged.client_id || process.env.PAYPAL_CLIENT_ID || '')
    const clientSecret = String(merged.client_secret || process.env.PAYPAL_CLIENT_SECRET || '')
    const env = String(merged.env || process.env.PAYPAL_ENV || 'sandbox').toLowerCase()
    if (!clientId || !clientSecret) return badRequest(c, '缺少 PayPal Client ID / Client Secret')
    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
      const resp = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      })
      const json = await resp.json().catch(() => ({} as { access_token?: string; error_description?: string; scope?: string }))
      if (!resp.ok || !json.access_token) {
        return badRequest(c, json.error_description || `PayPal 测试失败(${resp.status})`)
      }
      return success(c, { reachable: true, message: 'PayPal OAuth 可用', scope: json.scope || '' })
    } catch (err: any) {
      return badRequest(c, `PayPal 测试失败: ${err?.message || 'unknown'}`)
    }
  }

  if (code === 'pingpong') {
    const saved = await getPingpongSettings()
    const merged = { ...saved, ...inputSettings } as PingpongSettings
    const accId = String(merged.acc_id || process.env.PINGPONG_ACC_ID || '')
    const clientId = String(merged.client_id || process.env.PINGPONG_CLIENT_ID || '')
    const salt = String(merged.salt || process.env.PINGPONG_SALT || '')
    const region = (['fra', 'sg', 'us'].includes(String(merged.region)) ? merged.region : 'fra') as PingpongRegion
    const env = (String(merged.env || 'sandbox') === 'live' ? 'live' : 'sandbox') as 'sandbox' | 'live'
    const signType = String(merged.sign_type || 'SHA256').toUpperCase() === 'MD5' ? 'MD5' : 'SHA256'
    if (!accId || !clientId || !salt) return badRequest(c, '缺少 accId / clientId / salt')
    try {
      const base = pingpongPaymentBaseUrl(env, region)
      const q = await pingpongPaymentQuery(base, salt, signType, accId, clientId, {
        merchantTransactionId: `__huohuo_pingpong_test_${Date.now()}__`,
      })
      return success(c, {
        reachable: true,
        message: `PingPong 接口已连通（query 返回 code=${q.code}）。若订单不存在属正常。`,
        query_code: q.code,
        query_description: q.description,
      })
    } catch (err: any) {
      return badRequest(c, `PingPong 测试失败: ${err?.message || 'unknown'}`)
    }
  }

  if (code === 'wechat') {
    const merged = { ...(await getWechatSettings()), ...inputSettings } as WechatPaySettings
    try {
      const result = testWechatPaySettings(merged)
      return success(c, result)
    } catch (err: any) {
      return badRequest(c, err?.message || '微信支付测试失败')
    }
  }

  if (code === 'alipay') {
    const merged = { ...(await getAlipaySettings()), ...inputSettings } as AlipaySettings
    try {
      const result = testAlipaySettings(merged)
      return success(c, result)
    } catch (err: any) {
      return badRequest(c, err?.message || '支付宝测试失败')
    }
  }

  return badRequest(c, '不支持的支付方式')
})

paymentApp.get('/plans', (c) => success(c, { plans: getPlans() }))

paymentApp.post('/checkout-session', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({}))
  const planId = String(body.plan_id || '')
  const providerRaw = String(body.provider || 'paypal')
  const customAmountUsd = Number(body.custom_amount_usd || 0)
  const customAmountCny = Number(body.custom_amount_cny || 0)
  if (!isCheckoutProvider(providerRaw)) return badRequest(c, '不支持的支付方式')
  const provider = providerRaw
  const enabled = new Set(await enabledProviderCodes())
  if (!enabled.has(provider)) return badRequest(c, '该支付方式未开启')
  if (!await providerReady(provider)) return badRequest(c, '该支付方式尚未完成服务端配置')

  let plan: Plan
  let amountCnyFen = 0
  if (CNY_PROVIDERS.has(provider)) {
    if (Number.isFinite(customAmountCny) && customAmountCny > 0) {
      if (customAmountCny < 0.01) return badRequest(c, '自定义金额最少 0.01 CNY')
      const maxCny = await getCustomMaxCny(provider)
      if (customAmountCny > maxCny) return badRequest(c, `自定义金额不能超过 ${maxCny} CNY`)
      amountCnyFen = Math.max(1, Math.round(customAmountCny * 100))
      const baseCredits = Math.max(1, Math.floor(customAmountCny * await getCreditPerCny(provider)))
      const bonusPercent = await getBonusPercentCny(provider, customAmountCny)
      const credits = Math.max(1, Math.floor(baseCredits * (1 + bonusPercent / 100)))
      plan = { id: 'custom', name: 'Custom', amount: amountCnyFen, currency: 'cny', credits }
    } else {
      if (!planId) return badRequest(c, 'plan_id 必填')
      const plans = getPlans()
      const picked = plans.find((p) => p.id === planId)
      if (!picked) return badRequest(c, '套餐不存在')
      const rate = await getUsdToCnyRate(provider)
      const cny = (picked.amount / 100) * rate
      amountCnyFen = Math.max(1, Math.round(cny * 100))
      const baseCredits = Math.max(1, Math.floor(cny * await getCreditPerCny(provider)))
      const bonusPercent = await getBonusPercentCny(provider, cny)
      plan = {
        ...picked,
        amount: amountCnyFen,
        currency: 'cny',
        credits: Math.max(1, Math.floor(baseCredits * (1 + bonusPercent / 100))),
      }
    }
  } else if (Number.isFinite(customAmountUsd) && customAmountUsd > 0) {
    const amount = Math.round(customAmountUsd * 100)
    if (amount < 100) return badRequest(c, '自定义金额最少 1 USD')
    const maxUsd = await getCustomMaxUsd(provider)
    if (customAmountUsd > maxUsd) return badRequest(c, `自定义金额不能超过 ${maxUsd} USD`)
    const baseCredits = Math.max(1, Math.floor(customAmountUsd * await getCreditPerUsd(provider)))
    const bonusPercent = await getBonusPercent(provider, customAmountUsd)
    const credits = Math.max(1, Math.floor(baseCredits * (1 + bonusPercent / 100)))
    plan = {
      id: 'custom',
      name: 'Custom',
      amount,
      currency: 'usd',
      credits,
    }
  } else {
    if (!planId) return badRequest(c, 'plan_id 必填')
    const plans = getPlans()
    const picked = plans.find((p) => p.id === planId)
    if (!picked) return badRequest(c, '套餐不存在')
    plan = picked
  }

  const siteUrl = String(process.env.SITE_URL || 'http://localhost:28555').replace(/\/$/, '')
  const orderNo = createOrderNo()
  const ts = now()

  if (provider === 'wechat') {
    const ws = await getWechatSettings()
    const notifyBase = getPublicApiOrigin()
    const notifyUrl = `${notifyBase}/api/v1/payments/wechat/notify`
    let prepay
    try {
      prepay = await wechatNativePay({
        settings: ws,
        outTradeNo: orderNo,
        description: `${plan.name} 积分充值`,
        amountCnyFen: plan.amount,
        notifyUrl,
      })
    } catch (e: any) {
      return badRequest(c, e?.message || '微信下单失败')
    }
    await paymentOrdersRepo.insertPaymentOrder({
      userId: Number(user.id),
      provider: 'wechat',
      orderNo,
      status: 'pending',
      currency: 'cny',
      amount: plan.amount,
      credits: plan.credits,
      paypalOrderId: null,
      rawPayload: JSON.stringify(prepay.raw),
      createdAt: ts,
      updatedAt: ts,
    })
    return success(c, {
      order_no: orderNo,
      checkout_url: prepay.codeUrl,
      provider: 'wechat',
      pay_type: 'native',
    })
  }

  if (provider === 'alipay') {
    const as = await getAlipaySettings()
    const notifyBase = getPublicApiOrigin()
    const notifyUrl = `${notifyBase}/api/v1/payments/alipay/notify`
    const returnUrl = `${siteUrl}/?pay=alipay_return&order_no=${encodeURIComponent(orderNo)}`
    const amountCny = (plan.amount / 100).toFixed(2)
    const checkoutUrl = buildAlipayPagePayUrl({
      settings: as,
      outTradeNo: orderNo,
      subject: `${plan.name} 积分充值`,
      amountCny,
      returnUrl,
      notifyUrl,
    })
    await paymentOrdersRepo.insertPaymentOrder({
      userId: Number(user.id),
      provider: 'alipay',
      orderNo,
      status: 'pending',
      currency: 'cny',
      amount: plan.amount,
      credits: plan.credits,
      paypalOrderId: null,
      rawPayload: JSON.stringify({ amountCny }),
      createdAt: ts,
      updatedAt: ts,
    })
    return success(c, {
      order_no: orderNo,
      checkout_url: checkoutUrl,
      provider: 'alipay',
    })
  }

  if (provider === 'pingpong') {
    const ps = await getPingpongSettings()
    const base = pingpongPaymentBaseUrl(ps.env || 'sandbox', ps.region || 'fra')
    const amt = (plan.amount / 100).toFixed(2)
    const notifyBase = getPublicApiOrigin()
    const notificationUrl = `${notifyBase}/api/v1/payments/pingpong/notify`
    const payResultUrl = `${siteUrl}/?pay=pingpong_return&order_no=${encodeURIComponent(orderNo)}`
    const biz: PingpongPrepayBiz = {
      merchantTransactionId: orderNo,
      amount: amt,
      currency: plan.currency.toUpperCase(),
      notificationUrl,
      payResultUrl,
      goods: [{
        name: `${plan.name} Credits`,
        sku: plan.id,
        unitPrice: amt,
        number: '1',
      }],
      customer: {
        firstName: 'Huohuo',
        lastName: `User${user.id}`,
        email: `user${user.id}@huohuo.local`,
        phone: '0000000000',
      },
      billingAddress: {
        street: '1 Market St',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postcode: '94105',
      },
    }
    let prepay
    try {
      prepay = await pingpongPrePay(
        base,
        ps.salt!,
        ps.sign_type || 'SHA256',
        ps.acc_id!,
        ps.client_id!,
        biz,
      )
    } catch (e: any) {
      return badRequest(c, e?.message || 'PingPong 创建支付失败')
    }

    await paymentOrdersRepo.insertPaymentOrder({
      userId: Number(user.id),
      provider: 'pingpong',
      orderNo,
      status: 'pending',
      currency: plan.currency,
      amount: plan.amount,
      credits: plan.credits,
      paypalOrderId: prepay.transactionId || null,
      rawPayload: JSON.stringify(prepay.raw),
      createdAt: ts,
      updatedAt: ts,
    })

    return success(c, {
      order_no: orderNo,
      checkout_url: prepay.paymentUrl,
      provider: 'pingpong',
    })
  }

  const successUrl = String(body.success_url || `${siteUrl}/?pay=success`)
  const cancelUrl = String(body.cancel_url || `${siteUrl}/?pay=cancel`)
  const accessToken = await getPaypalAccessToken()
  const paypalRequestId = randomUUID()
  const createResp = await fetch(`${await getPaypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': paypalRequestId,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderNo,
        custom_id: `${user.id}:${plan.id}:${plan.credits}`,
        amount: {
          currency_code: plan.currency.toUpperCase(),
          value: (plan.amount / 100).toFixed(2),
        },
        description: `${plan.name} Credits`,
      }],
      application_context: {
        return_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}pay_provider=paypal`,
        cancel_url: cancelUrl,
        brand_name: 'Huohuo Drama',
        user_action: 'PAY_NOW',
      },
    }),
  })
  const paypalOrder = await createResp.json().catch(() => ({} as any))
  if (!createResp.ok || !paypalOrder?.id) {
    return badRequest(c, paypalOrder?.message || `PayPal 创建订单失败(${createResp.status})`)
  }
  const approveLink = (Array.isArray(paypalOrder.links) ? paypalOrder.links : []).find((i: any) => i?.rel === 'approve')?.href
  if (!approveLink) return badRequest(c, 'PayPal 未返回授权地址')

  await paymentOrdersRepo.insertPaymentOrder({
    userId: Number(user.id),
    provider: 'paypal',
    orderNo,
    status: 'pending',
    currency: plan.currency,
    amount: plan.amount,
    credits: plan.credits,
    paypalOrderId: paypalOrder.id,
    rawPayload: JSON.stringify(paypalOrder),
    createdAt: ts,
    updatedAt: ts,
  })

  return success(c, {
    order_no: orderNo,
    checkout_url: approveLink,
    provider: 'paypal',
  })
})

/** PayPal 支付返回后，客户端带 token 调用 capture（Orders API capture） */
paymentApp.post('/paypal/capture-order', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const paypalOrderId = String(body.paypal_order_id || '')
  if (!paypalOrderId) return badRequest(c, 'paypal_order_id 必填')

  const user = getAuthUser(c)
  const order = await paymentOrdersRepo.findPaymentOrderByProviderPaypalOrderIdAndUserId(
    'paypal',
    paypalOrderId,
    Number(user.id),
  )
  if (!order) return badRequest(c, '订单不存在')
  if (order.status === 'paid') return success(c, { ok: true, order_no: order.orderNo, already_paid: true })

  const accessToken = await getPaypalAccessToken()
  const captureResp = await fetch(`${await getPaypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': randomUUID(),
      Prefer: 'return=representation',
    },
  })
  const capture = await captureResp.json().catch(() => ({} as any))
  if (!captureResp.ok || capture?.status !== 'COMPLETED') {
    return badRequest(c, capture?.message || `PayPal 扣款确认失败(${captureResp.status})`)
  }

  const ts = now()
  await paymentOrdersRepo.updatePaymentOrder(order.id, {
    status: 'paid',
    paidAt: ts,
    rawPayload: JSON.stringify(capture),
    updatedAt: ts,
  })

  await addCredits({
    userId: Number(order.userId),
    amount: Number(order.credits || 0),
    reason: `充值到账(${order.orderNo})`,
    serviceType: 'payment',
    provider: 'paypal',
    model: null,
    resourceType: 'payment_order',
    resourceId: Number(order.id),
  })

  return success(c, { ok: true, order_no: order.orderNo })
})

/** PingPong 同步确认：登录用户根据 order_no 调官方 query，成功则入账（与异步通知二选一或双保险） */
paymentApp.post('/pingpong/confirm', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({}))
  const orderNo = String(body.order_no || '')
  if (!orderNo) return badRequest(c, 'order_no 必填')

  const order = await paymentOrdersRepo.findPaymentOrderByProviderOrderNoAndUserId(
    'pingpong',
    orderNo,
    Number(user.id),
  )
  if (!order) return badRequest(c, '订单不存在')
  if (order.status === 'paid') return success(c, { ok: true, order_no: order.orderNo, already_paid: true })

  const ps = await getPingpongSettings()
  const base = pingpongPaymentBaseUrl(ps.env || 'sandbox', ps.region || 'fra')
  let q
  try {
    q = await pingpongPaymentQuery(base, ps.salt!, ps.sign_type || 'SHA256', ps.acc_id!, ps.client_id!, {
      transactionId: String(order.paypalOrderId || '').trim() || undefined,
      merchantTransactionId: orderNo,
    })
  } catch (e: any) {
    return badRequest(c, e?.message || 'PingPong 查询失败')
  }

  const st = String(q.status || q.inner.status || '').toUpperCase()
  if (st !== 'SUCCESS') {
    return badRequest(c, `订单未支付完成（status=${st || 'UNKNOWN'}）`)
  }

  await fulfillPaidOrder(order, 'pingpong')
  return success(c, { ok: true, order_no: order.orderNo })
})

/** PingPong 异步通知：无 JWT；须公网 HTTPS（文档要求）。验签成功后入账。 */
paymentApp.post('/pingpong/notify', async (c) => {
  let payload: Record<string, unknown>
  try {
    payload = await c.req.json()
  } catch {
    return c.text('FAIL', 400)
  }

  const ps = await getPingpongSettings()
  if (!ps.salt) return c.text('FAIL', 500)

  if (!pingpongVerifyPayload(ps.salt, payload)) {
    return c.text('FAIL', 400)
  }

  let inner: Record<string, unknown> = {}
  try {
    inner = typeof payload.bizContent === 'string'
      ? JSON.parse(payload.bizContent) as Record<string, unknown>
      : (payload.bizContent as Record<string, unknown>) || {}
  } catch {
    return c.text('FAIL', 400)
  }

  const merchantTransactionId = String(inner.merchantTransactionId || '')
  const status = String(inner.status || '').toUpperCase()
  if (!merchantTransactionId || status !== 'SUCCESS') {
    return c.body(null, 204)
  }

  const order = await paymentOrdersRepo.findPaymentOrderByProviderAndOrderNo('pingpong', merchantTransactionId)
  if (!order || order.status === 'paid') {
    return c.body(null, 204)
  }

  await fulfillPaidOrder(order, 'pingpong')
  return c.body(null, 204)
})

/** 微信查单确认 */
paymentApp.post('/wechat/confirm', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({}))
  const orderNo = String(body.order_no || '')
  if (!orderNo) return badRequest(c, 'order_no 必填')

  const order = await paymentOrdersRepo.findPaymentOrderByProviderOrderNoAndUserId(
    'wechat',
    orderNo,
    Number(user.id),
  )
  if (!order) return badRequest(c, '订单不存在')
  if (order.status === 'paid') return success(c, { ok: true, order_no: order.orderNo, already_paid: true })

  const ws = await getWechatSettings()
  let q
  try {
    q = await wechatQueryByOutTradeNo({ settings: ws, outTradeNo: orderNo })
  } catch (e: any) {
    return badRequest(c, e?.message || '微信查单失败')
  }
  if (String(q.trade_state || '').toUpperCase() !== 'SUCCESS') {
    return badRequest(c, `订单未支付完成（trade_state=${q.trade_state || 'UNKNOWN'}）`)
  }
  await fulfillPaidOrder(order, 'wechat')
  return success(c, { ok: true, order_no: order.orderNo })
})

/** 微信异步通知 */
paymentApp.post('/wechat/notify', async (c) => {
  let payload: any
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ code: 'FAIL', message: 'invalid body' }, 400)
  }
  const ws = await getWechatSettings()
  if (!ws.api_v3_key) return c.json({ code: 'FAIL', message: 'not configured' }, 500)

  const resource = payload?.resource
  if (!resource) return c.json({ code: 'FAIL', message: 'no resource' }, 400)

  let inner: Record<string, unknown>
  try {
    inner = decryptWechatResource(ws.api_v3_key, resource)
  } catch {
    return c.json({ code: 'FAIL', message: 'decrypt fail' }, 400)
  }

  const orderNo = String(inner.out_trade_no || '')
  const tradeState = String(inner.trade_state || '').toUpperCase()
  if (!orderNo || tradeState !== 'SUCCESS') {
    return c.json({ code: 'SUCCESS', message: 'ignored' })
  }

  const order = await paymentOrdersRepo.findPaymentOrderByProviderAndOrderNo('wechat', orderNo)
  if (order && order.status !== 'paid') await fulfillPaidOrder(order, 'wechat')
  return c.json({ code: 'SUCCESS', message: '成功' })
})

/** 支付宝查单确认 */
paymentApp.post('/alipay/confirm', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({}))
  const orderNo = String(body.order_no || '')
  if (!orderNo) return badRequest(c, 'order_no 必填')

  const order = await paymentOrdersRepo.findPaymentOrderByProviderOrderNoAndUserId(
    'alipay',
    orderNo,
    Number(user.id),
  )
  if (!order) return badRequest(c, '订单不存在')
  if (order.status === 'paid') return success(c, { ok: true, order_no: order.orderNo, already_paid: true })

  const as = await getAlipaySettings()
  let q
  try {
    q = await alipayTradeQuery({ settings: as, outTradeNo: orderNo })
  } catch (e: any) {
    return badRequest(c, e?.message || '支付宝查单失败')
  }
  if (String(q.trade_status || '') !== 'TRADE_SUCCESS' && String(q.trade_status || '') !== 'TRADE_FINISHED') {
    return badRequest(c, `订单未支付完成（trade_status=${q.trade_status || 'UNKNOWN'}）`)
  }
  await fulfillPaidOrder(order, 'alipay')
  return success(c, { ok: true, order_no: order.orderNo })
})

/** 支付宝异步通知 */
paymentApp.post('/alipay/notify', async (c) => {
  const raw = await c.req.text()
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
  const sign = params.sign || ''
  const signType = params.sign_type || 'RSA2'
  if (!sign) return c.text('failure')

  const as = await getAlipaySettings()
  const verifyParams = { ...params }
  delete verifyParams.sign
  delete verifyParams.sign_type
  const content = Object.keys(verifyParams).filter(k => verifyParams[k] !== '' && verifyParams[k] != null)
    .sort()
    .map(k => `${k}=${verifyParams[k]}`)
    .join('&')

  if (!verifyAlipayRSA2(as.alipay_public_key!, content, sign)) {
    return c.text('failure')
  }

  const tradeStatus = String(params.trade_status || '')
  const orderNo = String(params.out_trade_no || '')
  if (!orderNo || (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED')) {
    return c.text('success')
  }

  const order = await paymentOrdersRepo.findPaymentOrderByProviderAndOrderNo('alipay', orderNo)
  if (order && order.status !== 'paid') await fulfillPaidOrder(order, 'alipay')
  return c.text('success')
})

export { paymentApp }
