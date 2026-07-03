<template>
  <image
    class="app-icon"
    :class="[`app-icon--${size}`]"
    :src="src"
    mode="aspectFit"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type AppIconName =
  | 'projects'
  | 'command'
  | 'tasks'
  | 'me'
  | 'play'
  | 'edit'
  | 'clock'
  | 'stop'
  | 'plus'
  | 'chevron'
  | 'web'
  | 'credit'
  | 'folder'
  | 'logout'
  | 'refresh'
  | 'link'

const props = withDefaults(
  defineProps<{ name: AppIconName; size?: 'sm' | 'md' | 'lg'; color?: string }>(),
  { size: 'md', color: '#4c7dff' },
)

const ICON_PATHS: Record<AppIconName, string> = {
  projects: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  command: 'M5 5h14v3H8v4h11v3H5V5z',
  tasks: 'M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0',
  play: 'M8 6.5v11l9-5.5-9-5.5z',
  edit: 'M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5zM15.5 7.5l2 2',
  clock: 'M12 7v5l3 2M12 22a10 10 0 100-20 10 10 0 000 20z',
  stop: 'M8 8h8v8H8V8z',
  plus: 'M12 6v12M6 12h12',
  chevron: 'M9 6l6 6-6 6',
  web: 'M4 6h16v10H4V6zm0 12h16',
  credit: 'M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z',
  folder: 'M4 7h6l2 2h8v9H4V7z',
  logout: 'M10 6H6v12h4M14 12H8M18 8l4 4-4 4',
  refresh: 'M20 12a8 8 0 10-2.3 5.7M20 6v6h-6',
  link: 'M10 14a4 4 0 010-5.7l1.3-1.3a4 4 0 015.7 5.7l-1.3 1.3M14 10a4 4 0 010 5.7l-1.3 1.3a4 4 0 01-5.7-5.7l1.3-1.3',
}

const src = computed(() => {
  const path = ICON_PATHS[props.name]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${props.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})
</script>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
.app-icon--sm { width: 16px; height: 16px; }
.app-icon--md { width: 20px; height: 20px; }
.app-icon--lg { width: 24px; height: 24px; }
</style>
