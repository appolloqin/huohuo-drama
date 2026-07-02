<template>
  <view class="tab-bar">
    <view
      v-for="item in tabs"
      :key="item.id"
      class="tab-item"
      :class="{ active: active === item.id }"
      @click="go(item)"
    >
      <view class="tab-icon-wrap" :class="{ active: active === item.id }">
        <text class="tab-icon">{{ item.icon }}</text>
      </view>
      <text class="tab-label">{{ item.label }}</text>
      <view v-if="item.id === 'tasks' && taskBadge > 0" class="tab-badge">{{ taskBadge > 9 ? '9+' : taskBadge }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { batchJobsApi } from '../api'

defineProps<{
  active: 'projects' | 'command' | 'tasks' | 'me'
}>()

const taskBadge = ref(0)

const tabs = [
  { id: 'projects' as const, label: '项目', icon: '▦', path: '/pages/projects/index' },
  { id: 'command' as const, label: '指令', icon: '⌘', path: '/pages/command/index' },
  { id: 'tasks' as const, label: '任务', icon: '◷', path: '/pages/tasks/index' },
  { id: 'me' as const, label: '我的', icon: '○', path: '/pages/me/index' },
]

async function refreshBadge() {
  try {
    const res = await batchJobsApi.active()
    taskBadge.value = res.active.length
  } catch {
    taskBadge.value = 0
  }
}

function go(item: (typeof tabs)[number]) {
  uni.reLaunch({ url: item.path })
}

onMounted(refreshBadge)

defineExpose({ refreshBadge })
</script>

<style scoped>
.tab-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(8px + env(safe-area-inset-bottom));
  z-index: 100;
  display: flex;
  height: 58px;
  padding: 6px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--border-soft);
  box-shadow: 0 8px 32px rgba(50, 74, 114, 0.12);
  backdrop-filter: blur(12px);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  color: var(--text-3);
  border-radius: 12px;
}
.tab-item.active {
  color: var(--accent);
}
.tab-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-icon-wrap.active {
  background: var(--accent-bg);
}
.tab-icon {
  font-size: 16px;
  line-height: 1;
}
.tab-label {
  font-size: 10px;
  font-weight: 500;
}
.tab-item.active .tab-label {
  font-weight: 700;
}
.tab-badge {
  position: absolute;
  top: 2px;
  right: calc(50% - 24px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--error);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  border: 2px solid #fff;
}
</style>
