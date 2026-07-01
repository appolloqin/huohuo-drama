<template>
  <view
    class="cmd"
    :class="[`cmd--${layout}`, `cmd--${variant}`, { 'cmd--disabled': disabled || loading }]"
    @click="onTap"
  >
    <!-- 主操作：横向大卡 -->
    <template v-if="layout === 'hero'">
      <view class="cmd-hero-icon">{{ icon }}</view>
      <view class="cmd-hero-text">
        <text class="cmd-title">{{ title }}</text>
        <text v-if="subtitle" class="cmd-sub">{{ subtitle }}</text>
      </view>
      <text v-if="loading" class="cmd-spinner">…</text>
      <text v-else class="cmd-hero-arrow">›</text>
    </template>

    <!-- 次操作：列表行 -->
    <template v-else>
      <view class="cmd-row-icon" :class="`cmd-row-icon--${variant}`">{{ icon }}</view>
      <view class="cmd-row-text">
        <text class="cmd-title">{{ title }}</text>
        <text v-if="subtitle" class="cmd-sub">{{ subtitle }}</text>
      </view>
      <text v-if="loading" class="cmd-spinner">…</text>
      <text v-else class="cmd-row-arrow">›</text>
    </template>
  </view>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    variant?: 'primary' | 'default' | 'danger'
    layout?: 'hero' | 'row'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    icon: '⌘',
    variant: 'default',
    layout: 'row',
    disabled: false,
    loading: false,
  },
)
const emit = defineEmits<{ click: [] }>()

function onTap() {
  if (props.disabled || props.loading) return
  emit('click')
}
</script>

<style scoped>
.cmd {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  line-height: 1.35;
  box-sizing: border-box;
  overflow: hidden;
}

/* ── Hero 主指令 ── */
.cmd--hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--accent-gradient);
  box-shadow: 0 4px 14px rgba(76, 125, 255, 0.2);
}
.cmd--hero .cmd-title {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}
.cmd--hero .cmd-sub {
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  margin-top: 4px;
}
.cmd-hero-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.cmd-hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cmd-hero-arrow {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
}

/* ── Row 列表行 ── */
.cmd--row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 2px;
  border-bottom: 1px solid var(--border);
}
.cmd--row:last-child {
  border-bottom: none;
}
.cmd-row-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-bg);
  color: var(--accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.cmd-row-icon--danger {
  background: var(--error-bg);
  color: var(--error);
}
.cmd-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cmd--row .cmd-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-0);
}
.cmd--row .cmd-sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
.cmd-row-arrow {
  font-size: 18px;
  color: var(--text-3);
  flex-shrink: 0;
}

.cmd--danger.cmd--row .cmd-title {
  color: var(--error);
}

.cmd--disabled {
  opacity: 0.45;
  pointer-events: none;
}

.cmd-spinner {
  font-size: 14px;
  color: var(--text-3);
  flex-shrink: 0;
}
</style>
