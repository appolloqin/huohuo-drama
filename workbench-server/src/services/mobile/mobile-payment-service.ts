/**
 * 微信小程序 JSAPI 支付 — 独立于 Web Native 扫码 checkout
 */
import { randomBytes } from 'node:crypto'
import * as paymentOrdersRepo from '../../db/repos/payment-orders/index.js'
import { now } from '../../common/http/response.js'
import {
  buildMiniProgramPayParams,
  isWechatPayReady,
  wechatJsapiPay,
  type WechatPaySettings,
} from '../payment/wechat-pay.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { getPublicApiOrigin, loadWechatPaySettings } from './mobile-config-service.js'

export class MobilePaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MobilePaymentError'
  }
}

type CnyPlan = {
  id: string
  name: string
  amount: number
  currency: 'cny'
  credits: number
}

const DEFAULT_CNY_PLANS: CnyPlan[] = [
  { id: 'cny_s', name: '体验包', amount: 990, currency: 'cny', credits: 100 },
  { id: 'cny_m', name: '标准包', amount: 2990, currency: 'cny', credits: 350 },
  { id: 'cny_l', name: '专业包', amount: 9990, currency: 'cny', credits: 1200 },
]

function listCnyPlans(): CnyPlan[] {
  const raw = process.env.PAYMENT_PLANS_CNY || process.env.MOBILE_PAYMENT_PLANS_CNY
  if (!raw) return DEFAULT_CNY_PLANS
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_CNY_PLANS
    const plans = parsed
      .filter(p => p && typeof p === 'object')
      .map(p => ({
        id: String(p.id || ''),
        name: String(p.name || p.id || ''),
        amount: Math.max(1, Math.floor(Number(p.amount || 0))),
        currency: 'cny' as const,
        credits: Math.max(1, Math.floor(Number(p.credits || 0))),
      }))
      .filter(p => p.id && p.amount > 0 && p.credits > 0)
    return plans.length ? plans : DEFAULT_CNY_PLANS
  } catch {
    return DEFAULT_CNY_PLANS
  }
}

async function getWechatSettings(): Promise<WechatPaySettings> {
  const settings = await loadWechatPaySettings()
  return {
    ...settings,
    env: (settings.env || (process.env.WECHAT_PAY_ENV === 'live' ? 'live' : 'sandbox')) as 'sandbox' | 'live',
  }
}

function createMobileOrderNo() {
  return `m${Date.now()}${randomBytes(3).toString('hex')}`
}

function resolvePlan(body: { plan_id?: string; custom_amount_cny?: number }): CnyPlan {
  const custom = Number(body.custom_amount_cny)
  if (Number.isFinite(custom) && custom > 0) {
    const amountCnyFen = Math.max(100, Math.round(custom * 100))
    const credits = Math.max(1, Math.floor(custom * 10))
    return {
      id: 'custom',
      name: '自定义充值',
      amount: amountCnyFen,
      currency: 'cny',
      credits,
    }
  }
  const planId = String(body.plan_id || '').trim()
  if (!planId) throw new MobilePaymentError('plan_id 或 custom_amount_cny 必填')
  const plan = listCnyPlans().find(p => p.id === planId)
  if (!plan) throw new MobilePaymentError('套餐不存在')
  return plan
}

export function listMobileCnyPlans() {
  return listCnyPlans()
}

export async function createWechatJsapiCheckout(args: {
  userId: number
  plan_id?: string
  custom_amount_cny?: number
  payer_openid?: string
}) {
  const ws = await getWechatSettings()
  if (!isWechatPayReady(ws)) throw new MobilePaymentError('微信支付未配置完成')

  let openid = String(args.payer_openid || '').trim()
  if (!openid) {
    const user = await usersRepo.findUserById(args.userId)
    openid = String(user?.wechatMpOpenid || '').trim()
  }
  if (!openid) throw new MobilePaymentError('缺少 payer_openid，请先微信登录或传入 openid')

  const plan = resolvePlan(args)
  const orderNo = createMobileOrderNo()
  const ts = now()
  const notifyUrl = `${getPublicApiOrigin()}/api/v1/payments/wechat/notify`

  const prepay = await wechatJsapiPay({
    settings: ws,
    outTradeNo: orderNo,
    description: `${plan.name} 积分充值`,
    amountCnyFen: plan.amount,
    notifyUrl,
    payerOpenid: openid,
  })

  await paymentOrdersRepo.insertPaymentOrder({
    userId: args.userId,
    provider: 'wechat',
    orderNo,
    status: 'pending',
    currency: 'cny',
    amount: plan.amount,
    credits: plan.credits,
    paypalOrderId: null,
    rawPayload: JSON.stringify({ ...prepay.raw, pay_type: 'jsapi' }),
    createdAt: ts,
    updatedAt: ts,
  })

  const payment = buildMiniProgramPayParams(ws, prepay.prepayId)

  return {
    order_no: orderNo,
    provider: 'wechat',
    pay_type: 'jsapi',
    plan: {
      id: plan.id,
      name: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      credits: plan.credits,
    },
    payment,
  }
}
