<template>
  <view class="tab-bar">
    <view
      v-for="item in tabs"
      :key="item.id"
      class="tab-item"
      :class="{ active: active === item.id }"
      @click="go(item)"
    >
      <text class="tab-icon">{{ item.icon }}</text>
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
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  height: calc(52px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 20px rgba(50, 74, 114, 0.06);
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
}
.tab-item.active {
  color: var(--accent);
}
.tab-icon {
  font-size: 18px;
  line-height: 1;
}
.tab-label {
  font-size: 11px;
  font-weight: 500;
}
.tab-item.active .tab-label {
  font-weight: 600;
}
.tab-badge {
  position: absolute;
  top: 6px;
  right: calc(50% - 22px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--error);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
</style>
