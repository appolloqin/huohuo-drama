<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { useAuth } from './composables/useAuth'
import { getStoredToken } from './api'

const { bootstrap } = useAuth()

onLaunch(async () => {
  if (getStoredToken()) {
    const ok = await bootstrap()
    if (ok) {
      uni.reLaunch({ url: '/pages/projects/index' })
      return
    }
  }
  uni.reLaunch({ url: '/pages/login/login' })
})
</script>

<style>
@import './uni.scss';
</style>
