import { ref } from 'vue'
import { authApi, setStoredToken, getStoredToken, ApiError } from '../api'
import type { AuthUserPayload } from '../api'

const user = ref<AuthUserPayload | null>(null)
const bootstrapped = ref(false)

export function useAuth() {
  async function bootstrap() {
    if (!getStoredToken()) {
      bootstrapped.value = true
      return false
    }
    try {
      user.value = await authApi.me()
      bootstrapped.value = true
      return true
    } catch {
      setStoredToken(null)
      user.value = null
      bootstrapped.value = true
      return false
    }
  }

  async function login(username: string, password: string) {
    const res = await authApi.login(username.trim(), password)
    setStoredToken(res.token)
    user.value = res.user
    return res.user
  }

  async function register(username: string, password: string) {
    const res = await authApi.register(username.trim(), password)
    setStoredToken(res.token)
    user.value = res.user
    return res.user
  }

  function logout() {
    setStoredToken(null)
    user.value = null
    uni.reLaunch({ url: '/pages/login/login' })
  }

  function requireAuth() {
    if (!getStoredToken()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return false
    }
    return true
  }

  function handleAuthError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      logout()
    }
  }

  return {
    user,
    bootstrapped,
    bootstrap,
    login,
    register,
    logout,
    requireAuth,
    handleAuthError,
  }
}
