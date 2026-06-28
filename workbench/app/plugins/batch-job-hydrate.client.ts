export default defineNuxtPlugin({
  dependsOn: ['auth-hydrate'],
  setup() {
    const token = useState<string | null>('huohuo_token')
    if (!token.value) return
    const batch = useBatchJob()
    void batch.hydrateFromServer()
  },
})
