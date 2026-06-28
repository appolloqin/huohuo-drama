/**
 * PingPong Checkout API V4（官方文档：公共参数、签名、prePay / query）
 * 参考：PingPongCheckout llms-full — API Usage Rules、Signature（PHP 示例）、Native SDK prePay curl
 * https://acquirer-api-docs-v4-en.pingpongx.com/en/llms-full.txt
 */
import crypto from 'node:crypto'
import querystring from 'node:querystring'

export type PingpongRegion = 'fra' | 'sg' | 'us'

export type PingpongPrepayBiz = {
  merchantTransactionId: string
  amount: string
  currency: string
  notificationUrl: string
  payResultUrl: string
  goods: Array<{ name: string; sku: string; unitPrice: string; number: string }>
  customer: { firstName: string; lastName: string; email: string; phone: string }
  billingAddress: { street: string; city: string; state: string; country: string; postcode: string }
}

const SANDBOX_BASE = 'https://sandbox-acquirer-payment.pingpongx.com'

const PROD_BASE: Record<PingpongRegion, string> = {
  fra: 'https://acquirer-payment.pingpongx.com',
  sg: 'https://acquirer-payment-checkout-sg.pingpongx.com',
  us: 'https://acquirer-payment-checkout-us.pingpongx.com',
}

export function pingpongPaymentBaseUrl(env: 'sandbox' | 'live', region: PingpongRegion): string {
  if (env === 'sandbox') return SANDBOX_BASE
  return PROD_BASE[region] || PROD_BASE.fra
}

/** 与官方 PHP 示例一致：ksort → http_build_query → urldecode，再在首部拼接 salt */
export function pingpongBuildSignPlain(salt: string, params: Record<string, string>): string {
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (k === 'sign') continue
    filtered[k] = v
  }
  const keys = Object.keys(filtered).sort()
  const sorted: Record<string, string> = {}
  for (const k of keys) sorted[k] = filtered[k]
  const encoded = querystring.stringify(sorted)
  const decoded = decodeURIComponent(encoded.replace(/\+/g, ' '))
  return salt + decoded
}

export function pingpongSign(signType: 'SHA256' | 'MD5', salt: string, params: Record<string, string>): string {
  const plain = pingpongBuildSignPlain(salt, params)
  if (signType === 'MD5') {
    return crypto.createHash('md5').update(plain, 'utf8').digest('hex').toUpperCase()
  }
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex').toUpperCase()
}

export function pingpongWrapRequest(
  salt: string,
  signType: 'SHA256' | 'MD5',
  accId: string,
  clientId: string,
  bizObject: Record<string, unknown>,
): Record<string, string> {
  const bizContent = JSON.stringify(bizObject)
  const unsigned: Record<string, string> = {
    accId,
    clientId,
    signType,
    version: '1.0',
    bizContent,
  }
  const sign = pingpongSign(signType, salt, unsigned)
  return { ...unsigned, sign }
}

function parseBizContent(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return typeof p === 'object' && p ? (p as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** 校验响应/通知顶层 sign（参与字段：accId, clientId, signType, version, bizContent） */
export function pingpongVerifyPayload(salt: string, payload: Record<string, unknown>): boolean {
  const sign = String(payload.sign || '')
  const signType = (String(payload.signType || 'SHA256').toUpperCase() === 'MD5' ? 'MD5' : 'SHA256') as 'MD5' | 'SHA256'
  const accId = String(payload.accId || '')
  const clientId = String(payload.clientId || '')
  const version = String(payload.version || '1.0')
  let bizStr = ''
  if (typeof payload.bizContent === 'string') bizStr = payload.bizContent
  else bizStr = JSON.stringify(payload.bizContent ?? {})
  const unsigned: Record<string, string> = { accId, clientId, signType, version, bizContent: bizStr }
  const expect = pingpongSign(signType, salt, unsigned)
  return expect.toUpperCase() === sign.toUpperCase()
}

export async function pingpongPostJson(
  baseUrl: string,
  path: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await resp.json().catch(() => ({})) as Record<string, unknown>
  return { ok: resp.ok, status: resp.status, json }
}

export type PingpongPrepayResult = {
  code: string
  description: string
  paymentUrl: string
  transactionId: string
  raw: Record<string, unknown>
}

export async function pingpongPrePay(
  baseUrl: string,
  salt: string,
  signType: 'SHA256' | 'MD5',
  accId: string,
  clientId: string,
  biz: PingpongPrepayBiz,
): Promise<PingpongPrepayResult> {
  const req = pingpongWrapRequest(salt, signType, accId, clientId, biz as unknown as Record<string, unknown>)
  const { json } = await pingpongPostJson(baseUrl, '/v4/payment/prePay', req)
  const code = String(json.code || '')
  const description = String(json.description || '')
  const inner = parseBizContent(json.bizContent)
  const paymentUrl = String(inner.paymentUrl || '')
  const transactionId = String(inner.transactionId || '')
  if (code !== '000000' || !paymentUrl) {
    throw new Error(description || `PingPong prePay 失败(${code})`)
  }
  return { code, description, paymentUrl, transactionId, raw: json }
}

export type PingpongQueryResult = {
  code: string
  description: string
  status?: string
  merchantTransactionId?: string
  inner: Record<string, unknown>
  raw: Record<string, unknown>
}

/** 单笔查询：优先使用 transactionId（与官方「按交易号查询」一致）；若无则传 merchantTransactionId */
export async function pingpongPaymentQuery(
  baseUrl: string,
  salt: string,
  signType: 'SHA256' | 'MD5',
  accId: string,
  clientId: string,
  opts: { transactionId?: string; merchantTransactionId?: string },
): Promise<PingpongQueryResult> {
  const biz: Record<string, string> = {}
  if (opts.transactionId && opts.transactionId.trim()) {
    biz.transactionId = opts.transactionId.trim()
  } else if (opts.merchantTransactionId) {
    biz.merchantTransactionId = opts.merchantTransactionId
  }
  const req = pingpongWrapRequest(salt, signType, accId, clientId, biz)
  const { json } = await pingpongPostJson(baseUrl, '/v4/payment/query', req)
  if (!pingpongVerifyPayload(salt, json)) {
    throw new Error('PingPong 查询响应签名校验失败')
  }
  const inner = parseBizContent(json.bizContent)
  return {
    code: String(json.code || ''),
    description: String(json.description || ''),
    status: inner.status != null ? String(inner.status) : undefined,
    merchantTransactionId: inner.merchantTransactionId != null ? String(inner.merchantTransactionId) : undefined,
    inner,
    raw: json,
  }
}
