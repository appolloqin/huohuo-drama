const TOKEN_STORAGE_KEY = 'huohuo_token'

export type AuthUser = {
  id?: number
  username: string
  role: string
  credits: number
  credit_billing_enabled?: boolean
}

function resolveCreditBillingEnabled(u: AuthUser | null | undefined, fallback: boolean) {
  if (u && typeof u.credit_billing_enabled === 'boolean') return u.credit_billing_enabled
  return fallback
}

// ── 多用户会话：token 持久化与积分生成门禁 ───────────────────

export function useAuth() {
  const token = useState<string | null>('huohuo_token', () => null)
  const user = useState<AuthUser | null>('huohuo_user', () => null)
  const creditBillingEnabled = useState<boolean>('huohuo_credit_billing_enabled', () => true)

  watch(
    () => user.value?.credit_billing_enabled,
    (v) => {
      if (typeof v === 'boolean') creditBillingEnabled.value = v
    },
    { immediate: true },
  )

  const canGenerate = computed(() => {
    const u = user.value
    if (!u) return false
    if (u.role === 'admin') return true
    if (!resolveCreditBillingEnabled(u, creditBillingEnabled.value)) return true
    return (u.credits ?? 0) > 0
  })

  function applyAuthSession(t: string, u: AuthUser) {
    token.value = t
    user.value = u
    if (typeof u.credit_billing_enabled === 'boolean') {
      creditBillingEnabled.value = u.credit_billing_enabled
    }
    if (import.meta.client) localStorage.setItem(TOKEN_STORAGE_KEY, t)
  }

  function applyUserProfile(u: AuthUser) {
    user.value = { ...(user.value || {}), ...u } as AuthUser
    if (typeof u.credit_billing_enabled === 'boolean') {
      creditBillingEnabled.value = u.credit_billing_enabled
    }
  }

  function wipeAuthSession() {
    token.value = null
    user.value = null
    creditBillingEnabled.value = true
    useSessionCache().resetSessionCaches()
    if (import.meta.client) localStorage.removeItem(TOKEN_STORAGE_KEY)
  }

  async function logout() {
    wipeAuthSession()
    await navigateTo('/login')
  }

  return {
    token,
    user,
    creditBillingEnabled,
    canGenerate,
    setSession: applyAuthSession,
    applyUserProfile,
    clearSession: wipeAuthSession,
    logout,
  }
}
