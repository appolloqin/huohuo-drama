<template>
  <view class="empty-state" @click="$emit('click')">
    <view class="empty-state-icon-wrap">
      <AppIcon :name="icon" size="lg" color="#4c7dff" />
    </view>
    <text class="empty-state-title">{{ title }}</text>
    <text v-if="subtitle" class="empty-state-sub">{{ subtitle }}</text>
    <view v-if="action" class="empty-cta">{{ action }}</view>
  </view>
</template>

<script setup lang="ts">
import AppIcon, { type AppIconName } from './AppIcon.vue'

defineProps<{
  icon: AppIconName
  title: string
  subtitle?: string
  action?: string
}>()
defineEmits<{ click: [] }>()
</script>

<style scoped>
.empty-state-icon-wrap {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 18px;
  background: var(--accent-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
