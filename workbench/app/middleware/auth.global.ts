export default defineNuxtRouteMiddleware((to) => {
  const publicPaths = ['/login', '/register']
  if (publicPaths.includes(to.path)) return

  const token = useState<string | null>('huohuo_token')
  if (import.meta.client && !token.value) {
    const t = localStorage.getItem('huohuo_token')
    if (t) token.value = t
  }

  if (!token.value) {
    return navigateTo('/login')
  }
})
