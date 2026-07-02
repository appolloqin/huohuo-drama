<template>
  <view class="credit-pill" :class="{ light }" @click="$emit('click')">
    <view class="credit-icon">◆</view>
    <view class="credit-text">
      <text class="credit-label">积分</text>
      <text class="credit-value">{{ credits }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
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
  background: linear-gradient(135deg, rgba(76, 125, 255, 0.12), rgba(76, 125, 255, 0.06));
  border: 1px solid rgba(76, 125, 255, 0.18);
}
.credit-pill.light {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.28);
}
.credit-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 10px;
  line-height: 24px;
  text-align: center;
}
.credit-pill.light .credit-icon {
  background: rgba(255, 255, 255, 0.92);
  color: var(--accent-text);
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
  color: rgba(255, 255, 255, 0.75);
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
