<template>
  <view class="page-shell">
    <view class="top-bar">
      <text class="top-title">任务</text>
      <text class="top-sub">批量撰写 / 制作进度</text>
    </view>

    <scroll-view scroll-y class="scroll-body">
      <view v-if="loading" class="empty">加载中…</view>
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
        <view v-if="!active.length && !recent.length" class="empty-card">
          <text class="empty-title">暂无任务</text>
          <text class="empty-sub">在「指令」页下达批量撰写或制作指令</text>
          <view class="empty-action" @click="goCommand">去发指令</view>
        </view>
      </template>
    </scroll-view>

    <AppTabBar ref="tabRef" active="tasks" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
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
.page-shell {
  min-height: 100vh;
  padding-bottom: calc(60px + env(safe-area-inset-bottom));
  background: var(--body-bg);
  box-sizing: border-box;
  overflow-x: hidden;
}
.top-bar {
  padding: 16px;
  box-sizing: border-box;
}
.top-title {
  display: block;
  font-size: 22px;
  font-weight: 700;
}
.top-sub {
  font-size: 12px;
  color: var(--text-3);
}
.scroll-body {
  height: calc(100vh - 90px);
  width: 100%;
  box-sizing: border-box;
  padding: 0 16px;
}
.section {
  margin-bottom: 16px;
  width: 100%;
  box-sizing: border-box;
}
.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 8px;
}
.empty {
  text-align: center;
  padding: 40px;
  color: var(--text-3);
}
.empty-card {
  margin-top: 24px;
  width: 100%;
  box-sizing: border-box;
  padding: 32px 20px;
  text-align: center;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
}
.empty-action {
  display: inline-block;
  min-width: 120px;
  height: 40px;
  line-height: 40px;
  padding: 0 20px;
  border-radius: var(--radius);
  background: var(--accent-gradient);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.empty-title {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.empty-sub {
  display: block;
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 16px;
}
</style>
