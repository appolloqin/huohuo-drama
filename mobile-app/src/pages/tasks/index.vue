<template>
  <view class="page-shell">
    <PageHeader title="任务" subtitle="批量撰写 / 制作进度" />

    <view v-if="active.length" class="active-banner">
      <view class="banner-dot" />
      <text class="banner-text">{{ active.length }} 个任务进行中</text>
    </view>

    <scroll-view scroll-y class="scroll-body tasks-scroll">
      <view v-if="loading" class="loading-hint">加载中…</view>
      <template v-else>
        <view v-if="active.length" class="section">
          <text class="section-label">进行中</text>
          <TaskCard
            v-for="job in active"
            :key="job.id"
            :job="job"
            @open="openDetail(job.id)"
            @cancel="cancelJob(job)"
          />
        </view>
        <view v-if="recent.length" class="section">
          <text class="section-label">最近</text>
          <TaskCard
            v-for="job in recent"
            :key="job.id"
            :job="job"
            :show-actions="false"
            @open="openDetail(job.id)"
          />
        </view>
        <EmptyState
          v-if="!active.length && !recent.length"
          icon="tasks"
          title="暂无任务"
          subtitle="在「指令」页下达批量撰写或制作指令"
          action="去发指令"
          @click="goCommand"
        />
      </template>
    </scroll-view>

    <AppTabBar ref="tabRef" active="tasks" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
import EmptyState from '../../components/EmptyState.vue'
import PageHeader from '../../components/PageHeader.vue'
import TaskCard from '../../components/TaskCard.vue'
import { useAuth } from '../../composables/useAuth'
import { batchJobsApi } from '../../api'
import type { BatchJobSnapshot } from '../../api'

const { requireAuth, handleAuthError } = useAuth()
const active = ref<BatchJobSnapshot[]>([])
const recent = ref<BatchJobSnapshot[]>([])
const loading = ref(false)
const tabRef = ref<InstanceType<typeof AppTabBar> | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  loading.value = !active.value.length && !recent.value.length
  try {
    const res = await batchJobsApi.active()
    active.value = res.active
    recent.value = res.recent
    tabRef.value?.refreshBadge?.()
  } catch (e) {
    handleAuthError(e)
  } finally {
    loading.value = false
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(refresh, 3000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/tasks/detail?id=${id}` })
}

function cancelJob(job: BatchJobSnapshot) {
  uni.showModal({
    title: '停止任务',
    content: `确认停止《${job.drama_title || '项目'}》的任务？`,
    success: async (r) => {
      if (!r.confirm) return
      try {
        await batchJobsApi.cancel(job.id)
        uni.showToast({ title: '已请求停止', icon: 'success' })
        await refresh()
      } catch (e: any) {
        uni.showToast({ title: e?.message || '失败', icon: 'none' })
      }
    },
  })
}

function goCommand() {
  uni.reLaunch({ url: '/pages/command/index' })
}

onShow(() => {
  if (!requireAuth()) return
  refresh()
  startPoll()
})

onHide(stopPoll)
onUnload(stopPoll)
</script>

<style scoped>
.tasks-scroll {
  height: calc(100vh - 126px);
}
.active-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 16px 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--info-bg);
  border: 1px solid #d4e4f8;
}
.banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--info);
  animation: pulse 1.8s ease-out infinite;
}
.banner-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--info);
}
.section { margin-bottom: 18px; }
.loading-hint {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-3);
  font-size: 14px;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(58, 115, 204, 0.45); }
  70% { box-shadow: 0 0 0 8px rgba(58, 115, 204, 0); }
  100% { box-shadow: 0 0 0 0 rgba(58, 115, 204, 0); }
}
</style>
