import { api } from './client'
import type {
  AuthUserPayload,
  BatchJobSnapshot,
  BatchScope,
  ProjectListResponse,
} from './types'

export type MobilePublicConfig = {
  web_console_url: string
  features: {
    wechat_login: boolean
    wechat_jsapi_pay: boolean
    password_login: boolean
    natural_language_commands: boolean
  }
  wechat_mini_app_id: string | null
}

export type MobileHealth = {
  status: string
  channel: string
  db_driver: string
  timestamp: string
}

export type MobileCnyPlan = {
  id: string
  name: string
  amount: number
  currency: 'cny'
  credits: number
}

export type WechatJsapiPayment = {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export type MobileCommandIntent =
  | 'batch_write_remaining'
  | 'batch_write_range'
  | 'batch_cancel'
  | 'batch_status'

export const mobileApi = {
  health: () => api.get<MobileHealth>('/mobile/health'),
  config: () => api.get<MobilePublicConfig>('/mobile/config'),
  wechatLogin: (code: string) =>
    api.post<{ token: string; user: AuthUserPayload; wechat_mp_openid: string; is_new_user: boolean }>(
      '/mobile/auth/wechat-login',
      { code },
    ),
  wechatBind: (code: string) =>
    api.post<{ ok: boolean; wechat_mp_openid: string }>('/mobile/auth/wechat-bind', { code }),
  homeSummary: () =>
    api.get<{
      user: AuthUserPayload
      projects: ProjectListResponse
      batch: { active: BatchJobSnapshot[]; recent: BatchJobSnapshot[] }
    }>('/mobile/home-summary'),
  paymentPlans: () => api.get<{ plans: MobileCnyPlan[] }>('/mobile/payments/plans'),
  wechatJsapiCheckout: (body: { plan_id?: string; custom_amount_cny?: number; payer_openid?: string }) =>
    api.post<{
      order_no: string
      provider: string
      pay_type: string
      plan: MobileCnyPlan
      payment: WechatJsapiPayment
    }>('/mobile/payments/wechat-jsapi', body),
  previewCommand: (body: {
    intent?: MobileCommandIntent | string
    drama_id?: number
    scope?: BatchScope
    text?: string
    job_id?: string
  }) =>
    api.post<{
      intent?: string
      drama_id?: number
      scope?: BatchScope
      requires_confirmation: boolean
    }>('/mobile/commands/preview', body as Record<string, unknown>),
  executeCommand: (body: {
    intent?: MobileCommandIntent | string
    drama_id?: number
    scope?: BatchScope
    text?: string
    job_id?: string
  }) =>
    api.post<{
      intent: string
      job?: BatchJobSnapshot
      already_running?: boolean
      parsed_from_text?: boolean
      active?: BatchJobSnapshot[]
    }>('/mobile/commands', body as Record<string, unknown>),
}
