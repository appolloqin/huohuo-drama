<template>
  <div class="auth-shell">
    <div class="auth-bg" aria-hidden="true" />
    <div class="auth-inner">
      <NuxtLink to="/login" class="auth-brand">
        <div class="auth-brand-mark">
          <img v-if="showLogo" :src="brandLogo" alt="" class="auth-brand-img" @error="showLogo = false" />
          <span v-else class="auth-brand-fallback">{{ (tm.brand.name || '').charAt(0) }}</span>
        </div>
        <div>
          <div class="auth-brand-title">{{ tm.authLayout.brandName }}</div>
          <div class="auth-brand-sub">{{ tm.authLayout.brandSub }}</div>
        </div>
      </NuxtLink>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import brandLogo from '~/assets/huohuo-logo.png'
import { useI18n } from '~/composables/use-i18n'

const { messages: tm, init } = useI18n()
onMounted(() => init())

const showLogo = ref(true)
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-8) var(--sp-4);
  position: relative;
  overflow: auto;
}
.auth-bg {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(122, 167, 255, 0.2), transparent 42%),
    radial-gradient(circle at 80% 10%, rgba(76, 125, 255, 0.12), transparent 38%),
    linear-gradient(180deg, #f8fbff 0%, #eef3f9 100%);
  z-index: 0;
}
.auth-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
}
.auth-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  margin-bottom: var(--sp-6);
  justify-content: center;
}
.auth-brand-mark {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.auth-brand-img {
  width: 100%;
  height: 100%;
  max-width: 50px;
  max-height: 50px;
  object-fit: contain;
  object-position: center;
}
.auth-brand-fallback {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  color: var(--accent-text);
}
.auth-brand-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}
.auth-brand-sub {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.04em;
  margin-top: 2px;
}
</style>
