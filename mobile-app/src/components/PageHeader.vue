<template>
  <view class="page-header">
    <view class="page-header-row">
      <view class="page-header-main">
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
}>()
</script>

<style scoped>
.page-header {
  padding: 8px 16px 12px;
  box-sizing: border-box;
}
.page-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.page-header-main {
  flex: 1;
  min-width: 0;
}
.page-header-title {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-0);
  line-height: 1.15;
  letter-spacing: -0.03em;
}
.page-header-sub {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.45;
}
.page-header-right {
  flex-shrink: 0;
  padding-top: 6px;
}
</style>
