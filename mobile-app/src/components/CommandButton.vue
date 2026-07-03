<template>
  <view
    class="cmd tappable"
    :class="[`cmd--${layout}`, `cmd--${variant}`, { 'cmd--disabled': disabled || loading }]"
    @click="onTap"
  >
    <template v-if="layout === 'hero'">
      <view class="cmd-hero-icon">
      <AppIcon :name="iconName" size="lg" color="#4c7dff" />
      </view>
      <view class="cmd-hero-text">
        <text class="cmd-title">{{ title }}</text>
        <text v-if="subtitle" class="cmd-sub">{{ subtitle }}</text>
      </view>
      <view v-if="loading" class="cmd-loading cmd-loading--muted" />
      <AppIcon v-else name="chevron" size="md" color="#8b97ab" />
    </template>

    <template v-else>
      <view class="cmd-row-icon" :class="`cmd-row-icon--${variant}`">
        <AppIcon :name="iconName" size="md" :color="iconColor" />
      </view>
      <view class="cmd-row-text">
        <text class="cmd-title">{{ title }}</text>
        <text v-if="subtitle" class="cmd-sub">{{ subtitle }}</text>
      </view>
      <view v-if="loading" class="cmd-loading cmd-loading--muted" />
      <AppIcon v-else name="chevron" size="sm" color="#8b97ab" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon, { type AppIconName } from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: AppIconName
    variant?: 'primary' | 'default' | 'danger'
    layout?: 'hero' | 'row'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    icon: 'command',
    variant: 'default',
    layout: 'row',
    disabled: false,
    loading: false,
  },
)
const emit = defineEmits<{ click: [] }>()

const iconName = computed(() => props.icon)

const iconColor = computed(() => {
  if (props.variant === 'danger') return '#d24f66'
  return '#4c7dff'
})

function onTap() {
  if (props.disabled || props.loading) return
  emit('click')
}
</script>

<style scoped>
.cmd {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.cmd--hero {
  padding: 18px 16px;
  border-radius: 14px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-line);
}
.cmd--hero .cmd-title {
  color: var(--accent-text);
  font-size: 16px;
  font-weight: 700;
}
.cmd--hero .cmd-sub {
  color: var(--text-2);
  font-size: 13px;
  margin-top: 3px;
}
.cmd-hero-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cmd-hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cmd--row {
  padding: 14px 4px;
  border-bottom: 1px solid var(--border-soft);
}
.cmd--row:last-child { border-bottom: none; }
.cmd-row-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cmd-row-icon--danger {
  background: var(--error-bg);
}
.cmd-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cmd--row .cmd-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-0);
}
.cmd--row .cmd-sub {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.cmd--danger.cmd--row .cmd-title {
  color: var(--error);
}

.cmd--disabled {
  opacity: 0.45;
  pointer-events: none;
}

.cmd-loading {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
.cmd-loading--muted {
  border-color: #dde4ef;
  border-top-color: var(--accent);
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
