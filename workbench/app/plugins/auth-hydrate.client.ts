export default defineNuxtPlugin({
  name: 'auth-hydrate',
  enforce: 'pre',
  setup() {
    const token = useState<string | null>('huohuo_token')
    if (!token.value) {
      const t = localStorage.getItem('huohuo_token')
      if (t) token.value = t
    }
  },
})
