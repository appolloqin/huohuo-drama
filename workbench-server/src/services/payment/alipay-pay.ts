import crypto from 'node:crypto'

export type AlipaySettings = {
  app_id?: string
  private_key?: string
  alipay_public_key?: string
  env?: 'sandbox' | 'live'
  sign_type?: 'RSA2'
  credit_per_cny?: number
  custom_max_cny?: number
  bonus_tiers?: Array<{ threshold_cny: number; bonus_percent: number }>
}

function normalizePrivateKey(key: string) {
  const trimmed = key.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN')) return trimmed
  return `-----BEGIN RSA PRIVATE KEY-----\n${trimmed}\n-----END RSA PRIVATE KEY-----`
}

function normalizePublicKey(key: string) {
  const trimmed = key.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN')) return trimmed
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`
}

export function isAlipayReady(s: AlipaySettings) {
  return Boolean(s.app_id?.trim() && s.private_key?.trim() && s.alipay_public_key?.trim())
}

function alipayGateway(env?: string) {
  return String(env || 'sandbox') === 'live'
    ? 'https://openapi.alipay.com/gateway.do'
    : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
}

function sortedQuery(params: Record<string, string>) {
  return Object.keys(params)
    .filter(k => params[k] !== '' && params[k] != null)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
}

function signAlipayRSA2(privateKey: string, content: string) {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(content, 'utf8')
  signer.end()
  return signer.sign(normalizePrivateKey(privateKey), 'base64')
}

export function verifyAlipayRSA2(publicKey: string, content: string, signature: string) {
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(content, 'utf8')
  verifier.end()
  return verifier.verify(normalizePublicKey(publicKey), signature, 'base64')
}

export function buildAlipayPagePayUrl(args: {
  settings: AlipaySettings
  outTradeNo: string
  subject: string
  amountCny: string
  returnUrl: string
  notifyUrl: string
}) {
  const s = args.settings
  const bizContent = JSON.stringify({
    out_trade_no: args.outTradeNo,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: args.amountCny,
    subject: args.subject,
  })
  const params: Record<string, string> = {
    app_id: s.app_id!,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    notify_url: args.notifyUrl,
    return_url: args.returnUrl,
    biz_content: bizContent,
  }
  const signContent = sortedQuery(params)
  params.sign = signAlipayRSA2(s.private_key!, signContent)
  const qs = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  return `${alipayGateway(s.env)}?${qs}`
}

export async function alipayTradeQuery(args: {
  settings: AlipaySettings
  outTradeNo: string
}) {
  const s = args.settings
  const bizContent = JSON.stringify({ out_trade_no: args.outTradeNo })
  const params: Record<string, string> = {
    app_id: s.app_id!,
    method: 'alipay.trade.query',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    biz_content: bizContent,
  }
  const signContent = sortedQuery(params)
  params.sign = signAlipayRSA2(s.private_key!, signContent)
  const body = sortedQuery(params)
  const resp = await fetch(alipayGateway(s.env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  })
  const json = await resp.json().catch(() => ({} as Record<string, any>))
  const key = Object.keys(json).find(k => k.startsWith('alipay_trade_query_response'))
  const data = key ? json[key] : null
  if (!data) throw new Error('支付宝查询响应无效')
  return data as { trade_status?: string; code?: string; msg?: string; sub_msg?: string }
}

export function testAlipaySettings(s: AlipaySettings) {
  if (!isAlipayReady(s)) throw new Error('缺少 AppID / 应用私钥 / 支付宝公钥')
  const sig = signAlipayRSA2(s.private_key!, 'huohuo-alipay-test')
  if (!sig) throw new Error('应用私钥签名失败，请检查 PEM 格式')
  return { reachable: true, message: '支付宝密钥格式校验通过' }
}
