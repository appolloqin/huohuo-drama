<template>
  <view class="task-card" @click="$emit('open')">
    <view class="task-head">
      <view class="status-dot" :class="job.status" />
      <text class="task-kicker">{{ kicker }}</text>
    </view>
    <text class="task-title">{{ job.drama_title || '未命名项目' }}</text>
    <text class="task-sub">{{ progressLabel }}</text>
    <view v-if="showProgress" class="progress-rail">
      <view class="progress-bar" :style="{ width: pct + '%' }" />
    </view>
    <view v-if="showActions" class="task-actions" @click.stop>
      <view class="action-chip action-chip-primary" @click="$emit('open')">详情</view>
      <view
        v-if="isActive"
        class="action-chip action-chip-danger"
        @click="$emit('cancel')"
      >停止</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BatchJobSnapshot } from '../api'

const props = withDefaults(
  defineProps<{ job: BatchJobSnapshot; showActions?: boolean }>(),
  { showActions: true },
)
defineEmits<{ open: []; cancel: [] }>()

const isActive = computed(() => props.job.status === 'pending' || props.job.status === 'running')

const kicker = computed(() => {
  if (props.job.project_type === 'novel') return '数字作家'
  return '数字导演'
})

const progressLabel = computed(() => {
  const p = props.job.progress
  if (!p) return statusText(props.job.status)
  const idx = p.index || 0
  const total = p.total || 0
  const ep = p.episode_number || 0
  const phase = p.phase || ''
  if (total) return `第 ${ep} ${unit.value} · ${phaseLabel(phase)} (${idx}/${total})`
  return statusText(props.job.status)
})

const unit = computed(() => (props.job.project_type === 'novel' ? '章' : '集'))

const showProgress = computed(() => {
  const total = props.job.progress?.total || 0
  return total > 0 && isActive.value
})

const pct = computed(() => {
  const p = props.job.progress
  if (!p?.total) return 0
  return Math.min(100, Math.round(((p.index || 0) / p.total) * 100))
})

function statusText(s: string) {
  const map: Record<string, string> = {
    pending: '排队中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
    cancelled: '已取消',
  }
  return map[s] || s
}

function phaseLabel(phase: string) {
  const map: Record<string, string> = {
    brief: '写作说明',
    chapter: '撰写',
    check: '审校',
    rewrite: '修正',
    episode: '制作',
  }
  return map[phase] || phase || '处理中'
}
</script>

<style scoped>
.task-card {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.task-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
  flex-shrink: 0;
}
.status-dot.running,
.status-dot.pending {
  background: var(--info);
  box-shadow: 0 0 0 3px var(--info-bg);
}
.status-dot.completed { background: var(--success); }
.status-dot.failed { background: var(--error); }
.task-kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
}
.task-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-0);
  margin-bottom: 4px;
  word-break: break-all;
}
.task-sub {
  display: block;
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 10px;
  word-break: break-all;
}
.progress-rail {
  height: 3px;
  background: var(--bg-3);
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 10px;
}
.progress-bar {
  height: 100%;
  background: var(--accent-gradient);
}
.task-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
.action-chip {
  flex: 1;
  min-width: 0;
  height: 32px;
  line-height: 32px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius);
  color: var(--text-2);
  background: transparent;
  border: 1px solid var(--border);
  box-sizing: border-box;
}
.action-chip-primary {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.35);
}
.action-chip-danger {
  color: var(--error);
  background: var(--error-bg);
  border-color: rgba(210, 79, 102, 0.35);
}
</style>
