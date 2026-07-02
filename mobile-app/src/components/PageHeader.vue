<template>
  <view class="page-header">
    <view class="page-header-glow" />
    <view class="page-header-row">
      <view class="page-header-main">
        <text v-if="kicker" class="page-header-kicker">{{ kicker }}</text>
        <text class="page-header-title">{{ title }}</text>
        <text v-if="subtitle" class="page-header-sub">{{ subtitle }}</text>
      </view>
      <view v-if="$slots.right" class="page-header-right">
        <slot name="right" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  kicker?: string
}>()
</script>

<style scoped>
.page-header {
  position: relative;
  padding: 12px 16px 14px;
  box-sizing: border-box;
  overflow: hidden;
}
.page-header-glow {
  position: absolute;
  top: -40px;
  right: -20px;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(76, 125, 255, 0.14) 0%, transparent 70%);
  pointer-events: none;
}
.page-header-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.page-header-main {
  flex: 1;
  min-width: 0;
}
.page-header-kicker {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 4px;
}
.page-header-title {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-0);
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.page-header-sub {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.4;
}
.page-header-right {
  flex-shrink: 0;
  padding-top: 4px;
}
</style>
