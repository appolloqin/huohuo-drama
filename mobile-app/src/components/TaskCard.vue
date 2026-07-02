<template>
  <view class="task-card" :class="{ active: isActive }" @click="$emit('open')">
    <view class="task-head">
      <view class="task-head-left">
        <view v-if="isActive" class="status-dot pulse" />
        <view v-else class="status-dot" :class="job.status" />
        <text class="task-kicker">{{ kicker }}</text>
      </view>
      <text class="status-badge" :class="job.status">{{ statusLabel }}</text>
    </view>
    <text class="task-title">{{ job.drama_title || '未命名项目' }}</text>
    <text class="task-sub">{{ progressLabel }}</text>
    <view v-if="showProgress" class="progress-wrap">
      <view class="progress-meta">
        <text class="progress-pct">{{ pct }}%</text>
        <text class="progress-count">{{ job.progress?.index || 0 }}/{{ job.progress?.total || 0 }}</text>
      </view>
      <view class="progress-rail">
        <view class="progress-bar" :style="{ width: pct + '%' }" />
      </view>
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

const statusLabel = computed(() => statusText(props.job.status))

const progressLabel = computed(() => {
  const p = props.job.progress
  if (!p) return statusText(props.job.status)
  const idx = p.index || 0
  const total = p.total || 0
  const ep = p.episode_number || 0
  const phase = p.phase || ''
  if (total) return `第 ${ep} ${unit.value} · ${phaseLabel(phase)}`
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
  border: 1px solid var(--border-soft);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.task-card.active {
  border-color: rgba(76, 125, 255, 0.28);
  box-shadow: 0 10px 28px rgba(76, 125, 255, 0.1);
}
.task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.task-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
}
.status-dot.completed { background: var(--success); }
.status-dot.failed { background: var(--error); }
.status-dot.pulse {
  background: var(--info);
  box-shadow: 0 0 0 0 rgba(58, 115, 204, 0.45);
  animation: pulse 1.8s ease-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(58, 115, 204, 0.45); }
  70% { box-shadow: 0 0 0 8px rgba(58, 115, 204, 0); }
  100% { box-shadow: 0 0 0 0 rgba(58, 115, 204, 0); }
}
.task-kicker {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.02em;
}
.task-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 4px;
  line-height: 1.35;
  word-break: break-all;
}
.task-sub {
  display: block;
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 12px;
  line-height: 1.45;
}
.progress-wrap {
  margin-bottom: 12px;
}
.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.progress-pct {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
}
.progress-count {
  font-size: 11px;
  color: var(--text-3);
}
.task-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
