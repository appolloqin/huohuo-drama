<template>
  <view class="page-detail" v-if="job">
    <view class="detail-hero">
      <text class="kicker">{{ job.project_type === 'novel' ? '数字作家' : '数字导演' }}</text>
      <text class="title">《{{ job.drama_title || '未命名' }}》</text>
      <text class="status-badge" :class="job.status">{{ statusLabel }}</text>
    </view>

    <view class="card panel">
      <text class="card-label">总进度</text>
      <view class="progress-head">
        <text class="card-value">{{ progressText }}</text>
        <text v-if="pct > 0" class="progress-pct">{{ pct }}%</text>
      </view>
      <view v-if="pct > 0" class="progress-rail">
        <view class="progress-bar" :style="{ width: pct + '%' }" />
      </view>
    </view>

    <view v-if="job.progress" class="card panel">
      <text class="card-label">当前阶段</text>
      <text class="card-value">
        第 {{ job.progress.episode_number || '—' }} {{ unit }}
        · {{ phaseLabel(job.progress.phase || '') }}
      </text>
      <text v-if="job.progress.check_score" class="card-sub">
        审校得分 {{ job.progress.check_score }}
        <text v-if="job.progress.rewrite_attempt"> · 第 {{ job.progress.rewrite_attempt }} 轮修正</text>
      </text>
      <text v-if="job.progress.check_summary" class="card-summary">{{ job.progress.check_summary }}</text>
    </view>

    <view v-if="job.error_message" class="card panel error-card">
      <text class="card-label">错误</text>
      <text class="card-summary">{{ job.error_message }}</text>
    </view>

    <view class="actions">
      <view
        v-if="isActive"
        class="action-block action-block-danger"
        @click="cancel"
      >停止任务</view>
      <view class="action-block action-block-primary" @click="openWeb">
        在电脑端查看 / 编辑
      </view>
    </view>
  </view>
  <view v-else class="loading">加载中…</view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { batchJobsApi } from '../../api'
import type { BatchJobSnapshot } from '../../api'
import { dramaWebUrl, openWebConsole } from '../../utils/web-link'
import { useAuth } from '../../composables/useAuth'

const { requireAuth, handleAuthError } = useAuth()
const job = ref<BatchJobSnapshot | null>(null)
let jobId = ''
let pollTimer: ReturnType<typeof setInterval> | null = null

const isActive = computed(() => job.value?.status === 'pending' || job.value?.status === 'running')
const unit = computed(() => (job.value?.project_type === 'novel' ? '章' : '集'))

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '排队中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
    cancelled: '已取消',
  }
  return map[job.value?.status || ''] || job.value?.status || ''
})

const progressText = computed(() => {
  const p = job.value?.progress
  if (!p?.total) return statusLabel.value
  return `${p.index || 0} / ${p.total} ${unit.value}`
})

const pct = computed(() => {
  const p = job.value?.progress
  if (!p?.total) return 0
  return Math.min(100, Math.round(((p.index || 0) / p.total) * 100))
})

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

async function load() {
  if (!jobId) return
  try {
    job.value = await batchJobsApi.get(jobId)
  } catch (e) {
    handleAuthError(e)
  }
}

function startPoll() {
  stopPoll()
  if (isActive.value) pollTimer = setInterval(load, 3000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function cancel() {
  if (!job.value) return
  uni.showModal({
    title: '停止任务',
    content: '确认停止当前批量任务？',
    success: async (r) => {
      if (!r.confirm || !job.value) return
      try {
        job.value = await batchJobsApi.cancel(job.value.id)
        uni.showToast({ title: '已请求停止', icon: 'success' })
      } catch (e: any) {
        uni.showToast({ title: e?.message || '失败', icon: 'none' })
      }
    },
  })
}

function openWeb() {
  if (!job.value) return
  const ep = job.value.progress?.episode_number
  if (job.value.project_type === 'novel' && ep) {
    openWebConsole(`${dramaWebUrl(job.value.drama_id)}/chapter/${ep}`)
  } else {
    openWebConsole(dramaWebUrl(job.value.drama_id))
  }
}

onLoad((query) => {
  jobId = String(query?.id || '')
})

onShow(() => {
  if (!requireAuth()) return
  load().then(startPoll)
})

onHide(stopPoll)
onUnload(stopPoll)
</script>

<style scoped>
.page-detail {
  min-height: 100vh;
  padding: 16px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: var(--body-bg);
  box-sizing: border-box;
  overflow-x: hidden;
}
.detail-hero {
  margin-bottom: 16px;
  padding: 4px 2px 8px;
}
.kicker {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 6px;
  letter-spacing: 0.04em;
}
.title {
  display: block;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 10px;
  line-height: 1.3;
}
.card {
  padding: 16px;
  margin-bottom: 12px;
}
.card-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.card-value {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
}
.progress-pct {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-text);
}
.card-sub {
  display: block;
  font-size: 12px;
  color: var(--text-2);
  margin-top: 8px;
}
.card-summary {
  display: block;
  font-size: 12px;
  color: var(--text-2);
  margin-top: 8px;
  line-height: 1.55;
}
.error-card {
  border-color: rgba(210, 79, 102, 0.28);
  background: var(--error-bg);
}
.progress-rail {
  margin-top: 12px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  width: 100%;
}
.action-block {
  width: 100%;
  box-sizing: border-box;
  height: 46px;
  line-height: 46px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius);
  color: var(--text-2);
  background: var(--bg-0);
  border: 1px solid var(--border);
}
.action-block-primary {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.28);
}
.action-block-danger {
  color: var(--error);
  background: var(--error-bg);
  border-color: rgba(210, 79, 102, 0.28);
}
.loading {
  padding: 48px;
  text-align: center;
  color: var(--text-3);
}
</style>
