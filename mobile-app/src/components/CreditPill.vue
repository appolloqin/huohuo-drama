<template>
  <view class="credit-pill" :class="{ light }" @click="$emit('click')">
    <view class="credit-icon">
      <AppIcon name="credit" size="sm" color="#4c7dff" />
    </view>
    <view class="credit-text">
      <text class="credit-label">积分</text>
      <text class="credit-value">{{ credits }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ credits: number; light?: boolean }>(), { light: false })
defineEmits<{ click: [] }>()
</script>

<style scoped>
.credit-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border-radius: 99px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-line);
}
.credit-pill.light {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.32);
}
.credit-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.credit-pill.light .credit-icon {
  background: rgba(255, 255, 255, 0.95);
}
.credit-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.credit-label {
  font-size: 10px;
  color: var(--text-3);
}
.credit-pill.light .credit-label {
  color: rgba(255, 255, 255, 0.78);
}
.credit-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-text);
}
.credit-pill.light .credit-value {
  color: #fff;
}
</style>
