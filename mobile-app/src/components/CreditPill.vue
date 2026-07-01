<template>
  <view class="credit-pill" @click="$emit('click')">
    <text class="credit-label">积分</text>
    <text class="credit-value">{{ credits }}</text>
  </view>
</template>

<script setup lang="ts">
defineProps<{ credits: number }>()
defineEmits<{ click: [] }>()
</script>

<style scoped>
.credit-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 99px;
  background: var(--accent-bg);
  border: 1px solid rgba(76, 125, 255, 0.2);
}
.credit-label {
  font-size: 11px;
  color: var(--accent-text);
}
.credit-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-text);
}
</style>
