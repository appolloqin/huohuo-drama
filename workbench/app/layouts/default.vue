<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="brand" @click="navigateTo('/')">
          <div class="brand-mark">
            <img v-if="showBrandImage" :src="brandLogo" :alt="tm.brand.logoAlt" class="brand-logo" @error="showBrandImage = false" />
            <span v-else class="brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
          </div>
          <div class="brand-text">
            <span class="brand-name">{{ tm.brand.name }}</span>
            <span class="brand-sub">{{ tm.brand.sub }}</span>
          </div>
        </button>
      </div>

      <nav class="header-nav">
        <NuxtLink
          v-for="item in sidebarNavEntries"
          :key="item.id"
          :to="item.path"
          class="nav-link"
          :class="{ active: item.active }"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="header-right">
        <div class="lang-wrap">
          <span class="lang-label">{{ tm.language }}</span>
          <select class="lang-select" :value="lang" @change="handleLangSelect">
            <option v-for="opt in SUPPORTED_LANGS" :key="opt.code" :value="opt.code">{{ tm.langOptionLabels[opt.code] }}</option>
          </select>
        </div>
        <div v-if="user" class="user-bar">
          <button type="button" class="credit-pill" @click="revealCreditsDialog">
            {{ tm.user.credits }} {{ user.credits ?? 0 }}
          </button>
          <span class="user-name" :title="user.role === 'admin' ? tm.user.roleAdmin : tm.user.roleUser">{{ user.username }}</span>
          <span v-if="user.role === 'admin'" class="user-role">{{ tm.user.roleAdmin }}</span>
          <button type="button" class="btn btn-ghost btn-sm" @click="handleLogoutClick">{{ tm.user.logout }}</button>
        </div>
        <button
          type="button"
          class="film-strip theme-toggle"
          :title="tm.theme.cycleTitle"
          :aria-label="tm.theme.cycleAria"
          @click="rotateThemePreset"
        >
          <span class="film-frame" :class="{ on: themeIndex === 0 }" aria-hidden="true" />
          <span class="film-frame" :class="{ on: themeIndex === 1 }" aria-hidden="true" />
          <span class="film-frame" :class="{ on: themeIndex === 2 }" aria-hidden="true" />
          <span class="film-frame" :class="{ on: themeIndex === 3 }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <main class="content">
      <slot />
    </main>

    <BatchJobPanel />

    <div v-if="creditsSheetOpen" class="overlay" @click.self="creditsSheetOpen = false">
      <div class="credit-modal card">
        <div class="credit-head">
          <div>
            <h3>{{ tm.credits.dialogTitle }}</h3>
            <p>{{ tx(tm.credits.balanceLine, { n: user?.credits ?? 0 }) }}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" @click="creditsSheetOpen = false">{{ tm.credits.close }}</button>
        </div>
        <div class="credit-list">
          <div v-if="user?.role === 'admin'" class="admin-credit card">
            <div class="admin-credit-title">{{ tm.credits.adminTitle }}</div>
            <div class="admin-credit-row">
              <select v-model.number="adminTargetUserId" class="input admin-credit-select">
                <option :value="0">{{ tm.credits.selectAccount }}</option>
                <option v-for="u in adminUserPickerRows" :key="u.id" :value="u.id">
                  {{ u.username }}（{{ u.credits }}）
                </option>
              </select>
              <input v-model.number="adminCreditDelta" class="input admin-credit-input" type="number" step="1" :placeholder="tm.credits.deltaPlaceholder" />
              <input v-model="adminCreditNote" class="input admin-credit-reason" :placeholder="tm.credits.reasonPlaceholder" />
              <button type="button" class="btn btn-primary btn-sm" @click="applyAdminCreditDelta">{{ tm.credits.submit }}</button>
            </div>
          </div>
          <div class="topup card">
            <div class="topup-head">
              <strong>{{ tm.credits.topupTitle }}</strong>
              <span v-if="!activeRechargeProviders.length" class="dim">{{ tm.credits.comingSoon }}</span>
            </div>
            <div class="topup-list">
              <button
                v-if="enabledProviderCodes.includes('pingpong')"
                v-for="plan in rechargePlanRows"
                :key="`${plan.id}-pingpong`"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="Boolean(checkoutBusyKey)"
                @click="beginPaymentFlow(plan.id, 'pingpong')"
              >
                {{ checkoutBusyKey === `pingpong-${plan.id}` ? tm.credits.redirecting : tx(tm.credits.planButtonPingpong, { name: plan.name, credits: plan.credits, creditsWord: tm.credits.creditsWord, money: formatMoney(plan.amount, plan.currency) }) }}
              </button>
              <button
                v-if="enabledProviderCodes.includes('paypal')"
                v-for="plan in rechargePlanRows"
                :key="`${plan.id}-paypal`"
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="Boolean(checkoutBusyKey)"
                @click="beginPaymentFlow(plan.id, 'paypal')"
              >
                {{ checkoutBusyKey === `paypal-${plan.id}` ? tm.credits.redirecting : tx(tm.credits.planButtonPaypal, { name: plan.name, credits: plan.credits, creditsWord: tm.credits.creditsWord, money: formatMoney(plan.amount, plan.currency) }) }}
              </button>
              <button
                v-if="enabledProviderCodes.includes('wechat')"
                v-for="plan in rechargePlanRows"
                :key="`${plan.id}-wechat`"
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="Boolean(checkoutBusyKey)"
                @click="beginPaymentFlow(plan.id, 'wechat')"
              >
                {{ checkoutBusyKey === `wechat-${plan.id}` ? tm.credits.redirecting : tx(tm.credits.planButtonWechat, { name: plan.name, credits: planCreditsForProvider(plan, 'wechat'), creditsWord: tm.credits.creditsWord, money: planMoneyForProvider(plan, 'wechat') }) }}
              </button>
              <button
                v-if="enabledProviderCodes.includes('alipay')"
                v-for="plan in rechargePlanRows"
                :key="`${plan.id}-alipay`"
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="Boolean(checkoutBusyKey)"
                @click="beginPaymentFlow(plan.id, 'alipay')"
              >
                {{ checkoutBusyKey === `alipay-${plan.id}` ? tm.credits.redirecting : tx(tm.credits.planButtonAlipay, { name: plan.name, credits: planCreditsForProvider(plan, 'alipay'), creditsWord: tm.credits.creditsWord, money: planMoneyForProvider(plan, 'alipay') }) }}
              </button>
              <div v-if="hasUsdPaymentProviders" class="topup-custom">
                <input v-model.number="topupUsdAmount" class="input topup-custom-input" type="number" min="1" step="0.01" :max="activeCustomMaxUsd" :placeholder="customUsdPlaceholder" />
                <button
                  v-if="enabledProviderCodes.includes('pingpong')"
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="Boolean(checkoutBusyKey)"
                  @click="beginCustomTopupCheckout('pingpong')"
                >
                  {{ customCredits('pingpong') > 0 ? `${tx(tm.credits.pingpongCustomWithCredits, { n: customCredits('pingpong') })}` : tm.credits.pingpongCustomLabel }}
                </button>
                <button
                  v-if="enabledProviderCodes.includes('paypal')"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="Boolean(checkoutBusyKey)"
                  @click="beginCustomTopupCheckout('paypal')"
                >
                  {{ customCredits('paypal') > 0 ? `${tx(tm.credits.paypalCustomWithCredits, { n: customCredits('paypal') })}` : tm.credits.paypalCustomLabel }}
                </button>
                <span class="dim topup-hint">{{ tm.credits.topupHint }}</span>
              </div>
              <div v-if="hasCnyPaymentProviders" class="topup-custom">
                <input v-model.number="topupCnyAmount" class="input topup-custom-input" type="number" min="0.01" step="0.01" :max="activeCustomMaxCny" :placeholder="customCnyPlaceholder" />
                <button
                  v-if="enabledProviderCodes.includes('wechat')"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="Boolean(checkoutBusyKey)"
                  @click="beginCustomTopupCheckout('wechat')"
                >
                  {{ customCreditsCny('wechat') > 0 ? tx(tm.credits.wechatCustomWithCredits, { n: customCreditsCny('wechat') }) : tm.credits.wechatCustomLabel }}
                </button>
                <button
                  v-if="enabledProviderCodes.includes('alipay')"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="Boolean(checkoutBusyKey)"
                  @click="beginCustomTopupCheckout('alipay')"
                >
                  {{ customCreditsCny('alipay') > 0 ? tx(tm.credits.alipayCustomWithCredits, { n: customCreditsCny('alipay') }) : tm.credits.alipayCustomLabel }}
                </button>
              </div>
              <span v-if="!enabledProviderCodes.length" class="dim">{{ tm.credits.noPaymentMethods }}</span>
            </div>
          </div>
          <div v-for="log in creditLedgerRows" :key="log.id" class="credit-item">
            <div class="credit-main">
              <strong>{{ log.reason }}</strong>
              <span class="dim">{{ formatLedgerEntryLine(log) }}</span>
            </div>
            <div class="credit-side">
              <span class="credit-delta">{{ log.delta }}</span>
              <span class="dim">{{ tm.credits.balanceAfter }} {{ log.balance_after }}</span>
            </div>
          </div>
          <p v-if="!creditLedgerRows.length" class="dim">{{ tm.credits.noCreditLogs }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import brandLogo from '~/assets/huohuo-logo.png'
import { toast } from 'vue-sonner'
import { authAPI, paymentAPI } from '~/composables/use-api'
import { useAuth } from '~/composables/useAuth'
import { useNavModules } from '~/composables/use-nav-modules'
import { SUPPORTED_LANGS } from '~/i18n/constants'
import { useI18n, tx } from '~/composables/use-i18n'

// ── 顶栏：主题 / 语言 / 导航 ───────────────────────────────
const THEMES = ['light', 'paper', 'eye', 'dark']

const { messages: tm, lang, setLang, init, isLang } = useI18n()

const route = useRoute()
const showBrandImage = ref(true)
const themeIndex = ref(0)
const { user, token, clearSession, logout, applyUserProfile } = useAuth()
const { modules, setNavModules, NAV_MODULE_DEFS } = useNavModules()

const navIconProjects = {
  template: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
}
const navIconTemplates = {
  template: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
}
const navIconAiDetect = {
  template: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><path d="M9 14h6"/><path d="M10 18h4"/></svg>`,
}
const navIconSettings = {
  template: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
}

const NAV_ICON_MAP = {
  projects: navIconProjects,
  templates: navIconTemplates,
  ai_detect: navIconAiDetect,
  settings: navIconSettings,
}

function labelForNavModule(id) {
  if (id === 'projects') return tm.value.nav.projects
  if (id === 'templates') return tm.value.nav.templates
  if (id === 'ai_detect') return tm.value.nav.aiDetect
  return tm.value.nav.settings
}

function routeMatchesNavDef(def) {
  return def.match(route.path)
}

const sidebarNavEntries = computed(() =>
  NAV_MODULE_DEFS
    .filter(def => modules.value.includes(def.id))
    .map(def => ({
      id: def.id,
      path: def.path,
      label: labelForNavModule(def.id),
      icon: NAV_ICON_MAP[def.id],
      active: routeMatchesNavDef(def),
    })),
)

// ── 积分充值弹窗 ─────────────────────────────────────────────
const creditsSheetOpen = ref(false)
const creditLedgerRows = ref([])
const adminUserPickerRows = ref([])
const adminTargetUserId = ref(0)
const adminCreditDelta = ref(0)
const adminCreditNote = ref('')
const rechargePlanRows = ref([])
const checkoutBusyKey = ref('')
const activeRechargeProviders = ref([])
const topupUsdAmount = ref()
const topupCnyAmount = ref()
const enabledProviderCodes = computed(() => activeRechargeProviders.value.map(p => p.code))
const hasUsdPaymentProviders = computed(() =>
  enabledProviderCodes.value.some(c => c === 'paypal' || c === 'pingpong'),
)
const hasCnyPaymentProviders = computed(() =>
  enabledProviderCodes.value.some(c => c === 'wechat' || c === 'alipay'),
)
const activeCustomMaxUsd = computed(() => {
  const vals = activeRechargeProviders.value.map((p) => Number(p.custom_max_usd || 0)).filter((v) => Number.isFinite(v) && v > 0)
  return vals.length ? Math.max(...vals) : 1000
})

const customUsdPlaceholder = computed(() =>
  tx(tm.value.credits.customPlaceholder, { n: activeCustomMaxUsd.value }),
)
const activeCustomMaxCny = computed(() => {
  const rates = activeRechargeProviders.value
    .filter(p => p.code === 'wechat' || p.code === 'alipay')
    .map(p => Number(p.custom_max_cny || 0))
    .filter(n => Number.isFinite(n) && n > 0)
  return rates.length ? Math.min(...rates) : 5000
})
const customCnyPlaceholder = computed(() =>
  tx(tm.value.credits.customCnyPlaceholder, { n: activeCustomMaxCny.value }),
)

function handleLangSelect(ev) {
  const v = ev?.target?.value
  if (isLang(v)) setLang(v)
}

watch(
  [() => tm.value.seo.title, lang],
  () => {
    useHead({ title: tm.value.seo.title })
  },
  { immediate: true },
)

function alignThemeFromDom() {
  if (!import.meta.client) return
  const t = document.documentElement.dataset.theme || 'light'
  const i = THEMES.indexOf(t)
  themeIndex.value = i >= 0 ? i : 0
}

function rotateThemePreset() {
  const next = (themeIndex.value + 1) % THEMES.length
  const name = THEMES[next]
  themeIndex.value = next
  document.documentElement.dataset.theme = name
  localStorage.setItem('huohuo_theme', name)
}

onMounted(async () => {
  init()
  alignThemeFromDom()
  if (!token.value) return
  try {
    const me = await authAPI.me()
    applyUserProfile(me)
    setNavModules(me.nav_modules)
    if (import.meta.client) {
      await tryCapturePaypalFromQuery()
      await tryPingpongConfirmFromQuery()
      await tryWechatConfirmFromQuery()
      await tryAlipayConfirmFromQuery()
    }
  } catch {
    clearSession()
    await navigateTo('/login')
  }
})

async function handleLogoutClick() {
  await logout()
}

function formatLedgerEntryLine(log) {
  const m = tm.value.credits
  const model = log.model ? `${m.metaModel} ${log.model}` : ''
  const provider = log.provider ? `${m.metaProvider} ${log.provider}` : ''
  const tokens = log.token_count
    ? (log.tokens_estimated
      ? tx(m.metaTokensEstimated, { n: log.token_count })
      : tx(m.metaTokens, { n: log.token_count }))
    : ''
  const at = log.created_at ? new Date(log.created_at).toLocaleString() : ''
  return [tokens, model, provider, at].filter(Boolean).join(' · ')
}

async function revealCreditsDialog() {
  if (!user.value) return
  const me = await authAPI.me()
  applyUserProfile(me)
  creditLedgerRows.value = await authAPI.creditLogs(100)
  const plansResp = await paymentAPI.plans().catch(() => ({ plans: [] }))
  rechargePlanRows.value = plansResp.plans || []
  const methodsResp = await paymentAPI.methods().catch(() => ({ providers: [] }))
  activeRechargeProviders.value = methodsResp.providers || []
  if (user.value.role === 'admin') {
    adminUserPickerRows.value = await authAPI.adminUsers()
  }
  creditsSheetOpen.value = true
}

async function applyAdminCreditDelta() {
  if (!adminTargetUserId.value) {
    toast.warning(tm.value.credits.selectAccount)
    return
  }
  if (!adminCreditDelta.value) {
    toast.warning(tm.value.credits.deltaPlaceholder)
    return
  }
  try {
    await authAPI.adminAdjustCredits(adminTargetUserId.value, adminCreditDelta.value, adminCreditNote.value || '')
    adminCreditDelta.value = 0
    adminCreditNote.value = ''
    adminUserPickerRows.value = await authAPI.adminUsers()
    user.value = await authAPI.me()
    creditLedgerRows.value = await authAPI.creditLogs(100)
    toast.success('积分已调整')
  } catch (e) {
    toast.error(e?.message || '积分调整失败')
  }
}

function formatMoney(amount, currency = 'usd') {
  const value = Number(amount || 0) / 100
  return `${value.toFixed(2)} ${String(currency || 'usd').toUpperCase()}`
}

async function beginPaymentFlow(planId, provider = 'paypal') {
  const key = `${provider}-${planId}`
  checkoutBusyKey.value = key
  try {
    const payload = await paymentAPI.createCheckout({ plan_id: planId, provider })
    if (payload.checkout_url && import.meta.client) {
      // Use same-tab redirect to avoid popup blockers.
      window.location.href = payload.checkout_url
      return
    }
    toast.error(tm.value.credits.noCheckoutUrl)
  } catch (e) {
    toast.error(e?.message || tm.value.credits.createOrderFail)
  } finally {
    checkoutBusyKey.value = ''
  }
}

async function tryCapturePaypalFromQuery() {
  const token = String(route.query.token || '')
  const payProvider = String(route.query.pay_provider || '')
  if (!token || payProvider !== 'paypal') return
  try {
    await paymentAPI.capturePaypal(token)
    user.value = await authAPI.me()
    toast.success(tm.value.credits.paypalSuccess)
    await navigateTo({ path: route.path, query: { ...route.query, token: undefined, pay_provider: undefined, pay: 'success' } }, { replace: true })
  } catch (e) {
    toast.error(e?.message || tm.value.credits.paypalConfirmFail)
  }
}

/** PingPong payResultUrl 回跳：调官方 query 同步确认入账 */
async function tryPingpongConfirmFromQuery() {
  const pay = String(route.query.pay || '')
  const orderNo = String(route.query.order_no || '')
  if (pay !== 'pingpong_return' || !orderNo) return
  try {
    await paymentAPI.pingpongConfirm(orderNo)
    user.value = await authAPI.me()
    toast.success(tm.value.credits.pingpongSuccess)
    await navigateTo({ path: route.path, query: { ...route.query, pay: undefined, order_no: undefined } }, { replace: true })
  } catch (e) {
    toast.error(e?.message || tm.value.credits.pingpongConfirmFail)
  }
}

function isCnyProvider(provider) {
  return provider === 'wechat' || provider === 'alipay'
}

function providerCreditRate(provider) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  if (isCnyProvider(provider)) {
    const rate = Number(item?.credit_per_cny || 0)
    return Number.isFinite(rate) && rate > 0 ? rate : 1
  }
  const rate = Number(item?.credit_per_usd || 0)
  return Number.isFinite(rate) && rate > 0 ? rate : 10
}

function providerUsdToCnyRate(provider) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  const rate = Number(item?.usd_to_cny_rate || 7.2)
  return Number.isFinite(rate) && rate > 0 ? rate : 7.2
}

function planMoneyForProvider(plan, provider) {
  if (isCnyProvider(provider)) {
    const cny = (Number(plan.amount || 0) / 100) * providerUsdToCnyRate(provider)
    return formatMoney(Math.round(cny * 100), 'cny')
  }
  return formatMoney(plan.amount, plan.currency)
}

function planCreditsForProvider(plan, provider) {
  if (!isCnyProvider(provider)) return plan.credits
  const cny = (Number(plan.amount || 0) / 100) * providerUsdToCnyRate(provider)
  const base = Math.max(1, Math.floor(cny * providerCreditRate(provider)))
  const bonus = providerBonusPercentCny(provider, cny)
  return Math.max(1, Math.floor(base * (1 + bonus / 100)))
}

function providerMaxUsd(provider) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  const maxUsd = Number(item?.custom_max_usd || 0)
  return Number.isFinite(maxUsd) && maxUsd > 0 ? maxUsd : 1000
}

function providerMaxCny(provider) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  const maxCny = Number(item?.custom_max_cny || 0)
  return Number.isFinite(maxCny) && maxCny > 0 ? maxCny : 5000
}

function providerBonusPercent(provider, usd) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  const tiers = Array.isArray(item?.bonus_tiers) ? item.bonus_tiers : []
  let bonus = 0
  for (const tier of tiers) {
    const threshold = Number(tier?.threshold_usd || 0)
    const percent = Number(tier?.bonus_percent || 0)
    if (usd >= threshold && percent > bonus) bonus = percent
  }
  return bonus
}

function providerBonusPercentCny(provider, cny) {
  const item = activeRechargeProviders.value.find(p => p.code === provider)
  const tiers = Array.isArray(item?.bonus_tiers) ? item.bonus_tiers : []
  let bonus = 0
  for (const tier of tiers) {
    const threshold = Number(tier?.threshold_cny || 0)
    const percent = Number(tier?.bonus_percent || 0)
    if (cny >= threshold && percent > bonus) bonus = percent
  }
  return bonus
}

function customCredits(provider) {
  const usd = Number(topupUsdAmount.value || 0)
  if (!usd || usd <= 0) return 0
  const base = Math.max(1, Math.floor(usd * providerCreditRate(provider)))
  const bonus = providerBonusPercent(provider, usd)
  return Math.max(1, Math.floor(base * (1 + bonus / 100)))
}

function customCreditsCny(provider) {
  const cny = Number(topupCnyAmount.value || 0)
  if (!cny || cny <= 0) return 0
  const base = Math.max(1, Math.floor(cny * providerCreditRate(provider)))
  const bonus = providerBonusPercentCny(provider, cny)
  return Math.max(1, Math.floor(base * (1 + bonus / 100)))
}

async function beginCustomTopupCheckout(provider) {
  const key = `${provider}-custom`
  checkoutBusyKey.value = key
  try {
    let payload
    if (isCnyProvider(provider)) {
      const cny = Number(topupCnyAmount.value || 0)
      if (!cny || cny < 0.01) {
        toast.warning(tm.value.credits.minCustomCny)
        return
      }
      const maxCny = providerMaxCny(provider)
      if (cny > maxCny) {
        toast.warning(tx(tm.value.credits.maxCustomCny, { n: maxCny }))
        return
      }
      payload = await paymentAPI.createCheckout({ provider, custom_amount_cny: cny })
    } else {
      const usd = Number(topupUsdAmount.value || 0)
      if (!usd || usd < 1) {
        toast.warning(tm.value.credits.minCustomUsd)
        return
      }
      const maxUsd = providerMaxUsd(provider)
      if (usd > maxUsd) {
        toast.warning(tx(tm.value.credits.maxCustomUsd, { n: maxUsd }))
        return
      }
      payload = await paymentAPI.createCheckout({ provider, custom_amount_usd: usd })
    }
    if (payload.checkout_url && import.meta.client) {
      window.location.href = payload.checkout_url
      return
    }
    toast.error(tm.value.credits.noCheckoutUrl)
  } catch (e) {
    toast.error(e?.message || tm.value.credits.createOrderFail)
  } finally {
    checkoutBusyKey.value = ''
  }
}

async function tryWechatConfirmFromQuery() {
  const pay = String(route.query.pay || '')
  const orderNo = String(route.query.order_no || '')
  if (pay !== 'wechat_return' || !orderNo) return
  try {
    await paymentAPI.wechatConfirm(orderNo)
    user.value = await authAPI.me()
    toast.success(tm.value.credits.wechatSuccess)
    await navigateTo({ path: route.path, query: { ...route.query, pay: undefined, order_no: undefined } }, { replace: true })
  } catch (e) {
    toast.error(e?.message || tm.value.credits.wechatConfirmFail)
  }
}

async function tryAlipayConfirmFromQuery() {
  const pay = String(route.query.pay || '')
  const orderNo = String(route.query.order_no || '')
  if (pay !== 'alipay_return' || !orderNo) return
  try {
    await paymentAPI.alipayConfirm(orderNo)
    user.value = await authAPI.me()
    toast.success(tm.value.credits.alipaySuccess)
    await navigateTo({ path: route.path, query: { ...route.query, pay: undefined, order_no: undefined } }, { replace: true })
  } catch (e) {
    toast.error(e?.message || tm.value.credits.alipayConfirmFail)
  }
}
</script>

<style scoped>
.shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-base);
}

/* === Header === */
.header {
  display: flex; align-items: center;
  height: 56px; flex-shrink: 0;
  padding: 0 24px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  gap: 32px;
}

.header-left { display: flex; align-items: center; }

.brand {
  display: flex; align-items: center; gap: 10px;
  background: none; border: none; cursor: pointer; padding: 0;
  text-decoration: none; border-radius: var(--radius);
  transition: opacity 0.15s;
}
.brand:hover { opacity: 0.75; }
.brand-mark {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-2);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}
.brand-logo {
  width: 100%;
  height: 100%;
  max-width: 42px;
  max-height: 42px;
  object-fit: contain;
  object-position: center;
  display: block;
}
.brand-fallback {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-text);
  line-height: 1;
}
.brand-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
.brand-name {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 700;
  color: var(--text-0);
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 10px; font-weight: 400;
  color: var(--text-3); margin-top: 1px;
  letter-spacing: 0.04em;
}

/* Nav */
.header-nav { display: flex; gap: 4px; flex: 1; }
.nav-link {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 14px; border-radius: var(--radius);
  font-size: 13px; font-weight: 500;
  color: var(--text-2); text-decoration: none;
  transition: all 0.18s var(--ease-out);
  border: 1px solid transparent;
}
.nav-link:hover {
  background: var(--bg-hover); color: var(--text-0);
  border-color: var(--border);
}
.nav-link.active {
  background: var(--accent-bg);
  color: var(--accent-text);
  border-color: rgba(76,125,255,0.18);
  font-weight: 600;
}

.header-right { display: flex; align-items: center; gap: 14px; margin-left: auto; }

.lang-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.lang-label { white-space: nowrap; }
.lang-select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text-1);
  max-width: 120px;
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-role {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background: var(--accent-bg);
  color: var(--accent-text);
  letter-spacing: 0.02em;
}
.credit-pill {
  border: 1px solid var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 24, 38, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
}
.credit-modal {
  width: min(760px, calc(100vw - 40px));
  max-height: calc(100vh - 80px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.credit-head {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.credit-head h3 { margin: 0; font-size: 16px; }
.credit-head p { margin: 4px 0 0; font-size: 12px; color: var(--text-2); }
.credit-list { padding: 10px 16px 16px; overflow: auto; }
.admin-credit {
  padding: 10px;
  margin-bottom: 12px;
  border: 1px dashed var(--border);
}
.admin-credit-title { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--text-1); }
.admin-credit-row { display: flex; gap: 8px; flex-wrap: wrap; }
.admin-credit-select { width: 180px; }
.admin-credit-input { width: 150px; }
.admin-credit-reason { min-width: 220px; flex: 1; }
.topup {
  padding: 10px;
  margin-bottom: 12px;
  border: 1px dashed var(--border);
}
.topup-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.topup-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.topup-custom {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}
.topup-custom-input {
  width: 180px;
}
.topup-hint {
  width: 100%;
  font-size: 12px;
}
.credit-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border);
}
.credit-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.credit-side { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.credit-delta { color: #c43f3f; font-weight: 700; }

/* 胶片条 = 三档风格切换 */
.film-strip.theme-toggle {
  display: flex; align-items: center; gap: 3px;
  padding: 6px 10px;
  background: var(--theme-toggle-track-bg, var(--bg-2));
  border: 1px solid var(--theme-toggle-track-border, var(--border));
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.film-strip.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
.film-strip.theme-toggle:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
.film-frame {
  width: 8px;
  height: 10px;
  box-sizing: border-box;
  border-radius: 2px;
  transition: background 0.22s var(--ease-out), border-color 0.22s, opacity 0.22s, transform 0.22s var(--ease-out);
}
.film-frame:not(.on) {
  background: var(--theme-toggle-slot-bg);
  border: 1px solid var(--theme-toggle-slot-border);
  opacity: 1;
}
.film-frame.on {
  background: var(--accent);
  border: 1px solid transparent;
  opacity: 1;
  transform: scaleY(1.08);
  box-shadow: 0 0 0 1px var(--accent-glow);
}

/* Content */
.content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
