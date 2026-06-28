import crypto from 'node:crypto'

export type WechatPaySettings = {
  app_id?: string
  mch_id?: string
  api_v3_key?: string
  serial_no?: string
  private_key?: string
  env?: 'sandbox' | 'live'
  credit_per_cny?: number
  custom_max_cny?: number
  bonus_tiers?: Array<{ threshold_cny: number; bonus_percent: number }>
}

const SANDBOX_BASE = 'https://api.mch.weixin.qq.com'
const LIVE_BASE = 'https://api.mch.weixin.qq.com'

function normalizePem(key: string) {
  const trimmed = key.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN')) return trimmed
  return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----`
}

export function isWechatPayReady(s: WechatPaySettings) {
  return Boolean(
    s.app_id?.trim()
    && s.mch_id?.trim()
    && s.api_v3_key?.trim()
    && s.serial_no?.trim()
    && s.private_key?.trim(),
  )
}

function wechatBaseUrl(env?: string) {
  return String(env || 'live') === 'sandbox' ? SANDBOX_BASE : LIVE_BASE
}

function signWechatV3(privateKeyPem: string, message: string) {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(message)
  signer.end()
  return signer.sign(normalizePem(privateKeyPem), 'base64')
}

function buildAuthorization(args: {
  mchId: string
  serialNo: string
  privateKey: string
  method: string
  urlPath: string
  body: string
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `${args.method}\n${args.urlPath}\n${timestamp}\n${nonce}\n${args.body}\n`
  const signature = signWechatV3(args.privateKey, message)
  return {
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${args.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${args.serialNo}",signature="${signature}"`,
    timestamp,
    nonce,
  }
}

export async function wechatNativePay(args: {
  settings: WechatPaySettings
  outTradeNo: string
  description: string
  amountCnyFen: number
  notifyUrl: string
}) {
  const s = args.settings
  const urlPath = '/v3/pay/transactions/native'
  const bodyObj = {
    appid: s.app_id,
    mchid: s.mch_id,
    description: args.description,
    out_trade_no: args.outTradeNo,
    notify_url: args.notifyUrl,
    amount: {
      total: args.amountCnyFen,
      currency: 'CNY',
    },
  }
  const body = JSON.stringify(bodyObj)
  const { authorization } = buildAuthorization({
    mchId: s.mch_id!,
    serialNo: s.serial_no!,
    privateKey: s.private_key!,
    method: 'POST',
    urlPath,
    body,
  })

  const resp = await fetch(`${wechatBaseUrl(s.env)}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authorization,
    },
    body,
  })
  const json = await resp.json().catch(() => ({} as { code_url?: string; message?: string }))
  if (!resp.ok || !json.code_url) {
    throw new Error(json.message || `微信下单失败(${resp.status})`)
  }
  return { codeUrl: json.code_url, raw: json }
}

/** 解密微信支付 V3 回调 resource */
export function decryptWechatResource(apiV3Key: string, resource: {
  associated_data?: string
  nonce?: string
  ciphertext?: string
}) {
  const key = Buffer.from(apiV3Key, 'utf8')
  const nonce = Buffer.from(String(resource.nonce || ''), 'utf8')
  const ciphertext = Buffer.from(String(resource.ciphertext || ''), 'base64')
  const authTag = ciphertext.subarray(ciphertext.length - 16)
  const data = ciphertext.subarray(0, ciphertext.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))
  const plain = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as Record<string, unknown>
}

export async function wechatQueryByOutTradeNo(args: {
  settings: WechatPaySettings
  outTradeNo: string
}) {
  const s = args.settings
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(args.outTradeNo)}?mchid=${encodeURIComponent(s.mch_id!)}`
  const { authorization } = buildAuthorization({
    mchId: s.mch_id!,
    serialNo: s.serial_no!,
    privateKey: s.private_key!,
    method: 'GET',
    urlPath,
    body: '',
  })
  const resp = await fetch(`${wechatBaseUrl(s.env)}${urlPath}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
    },
  })
  const json = await resp.json().catch(() => ({} as { trade_state?: string; message?: string }))
  if (!resp.ok) throw new Error(json.message || `微信查单失败(${resp.status})`)
  return json as { trade_state?: string }
}

export function testWechatPaySettings(s: WechatPaySettings) {
  if (!isWechatPayReady(s)) throw new Error('缺少 AppID / 商户号 / APIv3密钥 / 证书序列号 / 商户私钥')
  const message = 'huohuo-wechat-pay-test'
  const sig = signWechatV3(s.private_key!, message)
  if (!sig) throw new Error('商户私钥签名失败，请检查 PEM 格式')
  return { reachable: true, message: '微信支付密钥格式校验通过' }
}
