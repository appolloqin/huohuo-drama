<template>
  <div class="error-shell">
    <div class="error-card card">
      <p v-if="is404" class="error-code">404</p>
      <p v-else-if="statusCode" class="error-code">{{ statusCode }}</p>
      <h1 class="error-title">{{ titleText }}</h1>
      <p class="error-desc">{{ descText }}</p>
      <p v-if="detailLine" class="error-detail mono">{{ detailLine }}</p>
      <div class="error-actions">
        <button type="button" class="btn btn-ghost" @click="goBack">{{ tm.errors.errorPageGoBack }}</button>
        <button type="button" class="btn btn-primary" @click="goHome">{{ tm.errors.errorPageBackHome }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'
import { useI18n, tx } from '~/composables/use-i18n'

const props = defineProps<{ error: NuxtError }>()

const { messages: tm, init, tx } = useI18n()
if (import.meta.client) init()

const statusCode = computed(() => Number(props.error?.statusCode) || 0)
const is404 = computed(() => statusCode.value === 404)

const titleText = computed(() =>
  is404.value ? tm.value.errors.errorPage404Title : tm.value.errors.errorPageGenericTitle,
)
const descText = computed(() =>
  is404.value ? tm.value.errors.errorPage404Desc : tm.value.errors.errorPageGenericDesc,
)
const detailLine = computed(() => {
  if (is404.value) return ''
  const c = statusCode.value
  const parts: string[] = []
  if (c) parts.push(tx(tm.value.errors.errorPageStatus, { code: c }))
  const msg = props.error?.message?.trim()
  if (msg && msg !== String(c)) parts.push(msg)
  return parts.join(' — ')
})

watch(
  () => [titleText.value, tm.value.seo.title] as const,
  () => {
    useHead({ title: titleText.value || tm.value.seo.title })
  },
  { immediate: true },
)

async function goBack() {
  await clearError()
  if (import.meta.client && typeof window !== 'undefined' && window.history.length > 1) {
    window.history.back()
  } else {
    await navigateTo('/')
  }
}

async function goHome() {
  await clearError({ redirect: '/' })
}
</script>

<style scoped>
@import url('./assets/main.css');
.error-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-8) var(--sp-4);
  background: var(--bg-base);
}
.error-card {
  width: 100%;
  max-width: 420px;
  padding: var(--sp-8);
}
.error-code {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
}
.error-title {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: var(--sp-3);
  line-height: 1.25;
}
.error-desc {
  color: var(--text-2);
  margin-bottom: var(--sp-4);
  line-height: 1.55;
  font-size: 0.9375rem;
}
.error-detail {
  font-size: 0.8125rem;
  color: var(--text-3);
  margin-bottom: var(--sp-5);
  word-break: break-word;
}
.mono {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
}
.error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  align-items: center;
}
</style>
