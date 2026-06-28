import { authAPI } from '~/composables/use-api'
import { useAuth } from '~/composables/useAuth'
import { useNavModules } from '~/composables/use-nav-modules'

/** 无需导航权限校验的公开路由 */
const AUTH_EXEMPT_PATHS = ['/login', '/register']

export default defineNuxtRouteMiddleware(async (to) => {
  if (AUTH_EXEMPT_PATHS.includes(to.path)) return

  const token = useState<string | null>('huohuo_token')
  if (!token.value) return

  const { setNavModules, moduleForPath, defaultPath, canAccess } = useNavModules()
  const { applyUserProfile } = useAuth()
  const user = useState<{ nav_modules?: string[] } | null>('huohuo_user')

  if (!user.value?.nav_modules?.length) {
    try {
      const me = await authAPI.me()
      applyUserProfile(me)
      setNavModules(me.nav_modules)
    } catch {
      return
    }
  } else {
    setNavModules(user.value.nav_modules)
  }

  const routeModuleId = moduleForPath(to.path)
  if (!routeModuleId) return
  if (!canAccess(routeModuleId)) {
    const redirectPath = defaultPath()
    if (redirectPath !== to.path) return navigateTo(redirectPath)
  }
})
