<template>
  <NuxtLayout>
    <NuxtPage :keepalive="{ include: ['index', 'settings', 'templates', 'ai-detect'] }" />
  </NuxtLayout>
  <Toaster
    position="top-right"
    :duration="3200"
    rich-colors
    :toast-options="{
      class: 'huohuo-toast',
    }"
  />
</template>

<script setup>
// ── 根布局：i18n 初始化、SEO、全局 Toast 与站点图标 ────────
import { Toaster } from 'vue-sonner'
import { useI18n } from '~/composables/use-i18n'
import faviconIco from '~/assets/favicon.ico'
import favicon16 from '~/assets/favicon-16x16.png'
import favicon32 from '~/assets/favicon-32x32.png'
import appleTouch from '~/assets/apple-touch-icon.png'

const { init } = useI18n()

useAppSeo()

onMounted(() => {
  init()
})

// 使用打包后的 /_nuxt/... 地址，避免 SPA 把 /favicon.png 当成路由导致 404
useHead({
  link: [
    { rel: 'icon', type: 'image/x-icon', href: faviconIco },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: favicon16 },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: favicon32 },
    { rel: 'apple-touch-icon', sizes: '180x180', href: appleTouch },
    // 自托管 Google Fonts（app/public/fonts/fonts.css → /fonts/）
    { rel: 'stylesheet', href: '/fonts/fonts.css' },
  ],
})
</script>

<style>
@import url('./assets/main.css');

/* Brand toast style (vue-sonner) */
[data-sonner-toaster] {
  --normal-bg: rgba(255, 255, 255, 0.92);
  --normal-text: #1b2940;
  --normal-border: rgba(27, 41, 64, 0.14);
  --success-bg: rgba(233, 249, 239, 0.96);
  --success-text: #17663a;
  --success-border: rgba(44, 146, 86, 0.28);
  --error-bg: rgba(255, 239, 238, 0.96);
  --error-text: #9d2f2f;
  --error-border: rgba(201, 88, 68, 0.32);
  --warning-bg: rgba(255, 247, 230, 0.96);
  --warning-text: #8a5a00;
  --warning-border: rgba(212, 151, 38, 0.32);
}

[data-sonner-toast].huohuo-toast {
  border-radius: 14px !important;
  border: 1px solid var(--normal-border) !important;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px rgba(27, 41, 64, 0.14) !important;
  padding: 12px 14px !important;
}

[data-sonner-toast].huohuo-toast [data-title] {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

[data-sonner-toast].huohuo-toast [data-description] {
  font-size: 12px;
  color: rgba(27, 41, 64, 0.72);
}
</style>
