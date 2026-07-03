<template>
  <view class="tab-bar">
    <view
      v-for="item in tabs"
      :key="item.id"
      class="tab-item tappable"
      :class="{ active: active === item.id }"
      @click="go(item)"
    >
      <view class="tab-icon-wrap" :class="{ active: active === item.id }">
        <AppIcon
          :name="item.icon"
          size="md"
          :color="active === item.id ? '#4c7dff' : '#8b97ab'"
        />
      </view>
      <text class="tab-label">{{ item.label }}</text>
      <view v-if="item.id === 'tasks' && taskBadge > 0" class="tab-badge">
        {{ taskBadge > 9 ? '9+' : taskBadge }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { batchJobsApi } from '../api'
import AppIcon, { type AppIconName } from './AppIcon.vue'

defineProps<{
  active: 'projects' | 'command' | 'tasks' | 'me'
}>()

const taskBadge = ref(0)

const tabs: { id: 'projects' | 'command' | 'tasks' | 'me'; label: string; icon: AppIconName; path: string }[] = [
  { id: 'projects', label: '项目', icon: 'projects', path: '/pages/projects/index' },
  { id: 'command', label: '指令', icon: 'command', path: '/pages/command/index' },
  { id: 'tasks', label: '任务', icon: 'tasks', path: '/pages/tasks/index' },
  { id: 'me', label: '我的', icon: 'me', path: '/pages/me/index' },
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
  left: 16px;
  right: 16px;
  bottom: calc(10px + env(safe-area-inset-bottom));
  z-index: 100;
  display: flex;
  height: 60px;
  padding: 6px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border-soft);
  box-shadow: 0 4px 20px rgba(23, 28, 38, 0.08);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  position: relative;
  color: var(--text-3);
  border-radius: 12px;
}
.tab-item.active { color: var(--accent-text); }
.tab-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-icon-wrap.active {
  background: var(--accent-bg);
}
.tab-label {
  font-size: 10px;
  font-weight: 500;
}
.tab-item.active .tab-label {
  font-weight: 700;
  color: var(--accent-text);
}
.tab-badge {
  position: absolute;
  top: 4px;
  right: calc(50% - 26px);
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
