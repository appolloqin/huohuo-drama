<template>
  <view class="page-shell">
    <PageHeader
      title="指令"
      :subtitle="selectedProjectTitle ? `《${selectedProjectTitle}》` : '请先选择项目'"
      kicker="Command"
    >
      <template v-if="selectedProjectId" #right>
        <text class="link-chip" @click="pickProject">切换</text>
      </template>
    </PageHeader>

    <view v-if="!selectedProjectId" class="scroll-body command-scroll">
      <view class="empty-state">
        <view class="empty-state-icon">⌘</view>
        <text class="empty-state-title">请先选择项目</text>
        <text class="empty-state-sub">在「项目」页点选，或从最近项目选择</text>
        <view class="empty-cta" @click="goProjects">去选项目</view>
      </view>
    </view>

    <scroll-view v-else scroll-y class="scroll-body command-scroll">
      <view class="section">
        <text class="section-label">常用指令</text>
        <view class="panel cmd-panel">
          <CommandButton
            layout="hero"
            variant="primary"
            icon="▶"
            title="批量撰写剩余"
            :subtitle="projectType === 'novel' ? '撰写剩余章节' : '制作剩余集数'"
            :loading="busy === 'remaining'"
            @click="runRemaining"
          />
          <view class="cmd-list">
            <CommandButton
              layout="row"
              icon="✎"
              title="写指定章/集"
              subtitle="选择起止范围"
              @click="openScopeSheet"
            />
            <CommandButton
              layout="row"
              icon="◷"
              title="查看任务进度"
              subtitle="跳转任务页"
              @click="goTasks"
            />
            <CommandButton
              layout="row"
              variant="danger"
              icon="■"
              title="停止当前批量"
              subtitle="仅停止本项目任务"
              :disabled="!hasActiveJob"
              :loading="busy === 'cancel'"
              @click="cancelActive"
            />
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-label">跳转 Web</text>
        <view class="panel web-panel">
          <view class="web-row web-row-primary" @click="openWebEdit">
            <view class="web-row-main">
              <text class="web-row-title">在电脑端编辑</text>
              <text class="web-row-sub">分镜、合成等精细操作</text>
            </view>
            <text class="web-row-arrow">›</text>
          </view>
          <view class="web-row" @click="copyWebEdit">
            <view class="web-row-main">
              <text class="web-row-title muted">复制编辑链接</text>
            </view>
            <text class="web-row-arrow">›</text>
          </view>
        </view>
        <text class="section-hint">正文、分镜、合成等详细操作请在 Web 工作台完成</text>
      </view>
    </scroll-view>

    <view v-if="scopeSheet" class="mask" @click.self="scopeSheet = false">
      <view class="sheet">
        <view class="sheet-handle" />
        <text class="sheet-title">写指定范围</text>
        <view class="field">
          <text class="field-label">从第</text>
          <input v-model="fromChapter" class="input" type="number" />
        </view>
        <view class="field">
          <text class="field-label">到第（留空表示至末尾）</text>
          <input v-model="toChapter" class="input" type="number" />
        </view>
        <view class="sheet-actions">
          <view class="btn btn-ghost" @click="scopeSheet = false">取消</view>
          <view class="btn btn-primary" @click="runScope">
            {{ busy === 'scope' ? '下达中…' : '确认下达' }}
          </view>
        </view>
      </view>
    </view>

    <AppTabBar active="command" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow as onPageShow } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
import CommandButton from '../../components/CommandButton.vue'
import PageHeader from '../../components/PageHeader.vue'
import { useAuth } from '../../composables/useAuth'
import { useProjectSelection } from '../../composables/useProjects'
import { batchJobsApi, dramasApi, mobileApi } from '../../api'
import type { BatchJobSnapshot, ProjectType } from '../../api'
import { copyWebLink, dramaWebUrl, openWebConsole } from '../../utils/web-link'

const { requireAuth, handleAuthError } = useAuth()
const { selectedProjectId, selectedProjectTitle, loadSelection } = useProjectSelection()

const projectType = ref<ProjectType>('novel')
const busy = ref<'remaining' | 'scope' | 'cancel' | ''>('')
const scopeSheet = ref(false)
const fromChapter = ref('1')
const toChapter = ref('')
const activeJobs = ref<BatchJobSnapshot[]>([])

const hasActiveJob = ref(false)

async function loadProjectMeta() {
  if (!selectedProjectId.value) return
  try {
    const d = await dramasApi.get(selectedProjectId.value)
    projectType.value = (d.project_type as ProjectType) || 'novel'
  } catch {
    projectType.value = 'novel'
  }
}

async function refreshActive() {
  if (!selectedProjectId.value) return
  try {
    const res = await batchJobsApi.active()
    activeJobs.value = res.active.filter(j => j.drama_id === selectedProjectId.value)
    hasActiveJob.value = activeJobs.value.length > 0
  } catch (e) {
    handleAuthError(e)
  }
}

async function dispatchBatch(scope?: { mode?: string; from_chapter?: number; to_chapter?: number }) {
  if (!selectedProjectId.value) return
  const res = await mobileApi.executeCommand({
    intent: scope?.mode === 'remaining' || !scope
      ? 'batch_write_remaining'
      : 'batch_write_range',
    drama_id: selectedProjectId.value,
    scope: scope as any,
  })
  if (res.already_running) {
    uni.showToast({ title: '该项目已有任务进行中', icon: 'none' })
  } else {
    uni.showToast({ title: '指令已下达', icon: 'success' })
  }
  uni.vibrateShort?.({})
  await refreshActive()
  setTimeout(() => uni.reLaunch({ url: '/pages/tasks/index' }), 400)
}

async function runRemaining() {
  busy.value = 'remaining'
  try {
    await dispatchBatch({ mode: 'remaining' })
  } catch (e: any) {
    uni.showToast({ title: e?.message || '失败', icon: 'none' })
  } finally {
    busy.value = ''
  }
}

async function runScope() {
  const from = Number(fromChapter.value)
  if (!Number.isFinite(from) || from < 1) {
    uni.showToast({ title: '请输入有效起始章号', icon: 'none' })
    return
  }
  const toRaw = toChapter.value.trim()
  const scope: Record<string, unknown> = { mode: 'range', from_chapter: from }
  if (toRaw) {
    const to = Number(toRaw)
    if (!Number.isFinite(to) || to < from) {
      uni.showToast({ title: '结束章号无效', icon: 'none' })
      return
    }
    scope.to_chapter = to
  }
  busy.value = 'scope'
  scopeSheet.value = false
  try {
    await dispatchBatch(scope)
  } catch (e: any) {
    uni.showToast({ title: e?.message || '失败', icon: 'none' })
  } finally {
    busy.value = ''
  }
}

async function cancelActive() {
  const job = activeJobs.value[0]
  if (!job) return
  uni.showModal({
    title: '停止批量任务',
    content: `确认停止《${selectedProjectTitle.value}》的当前任务？`,
    success: async (r) => {
      if (!r.confirm) return
      busy.value = 'cancel'
      try {
        await mobileApi.executeCommand({
          intent: 'batch_cancel',
          drama_id: selectedProjectId.value!,
          job_id: job.id,
        })
        uni.showToast({ title: '已请求停止', icon: 'success' })
        await refreshActive()
      } catch (e: any) {
        uni.showToast({ title: e?.message || '失败', icon: 'none' })
      } finally {
        busy.value = ''
      }
    },
  })
}

function openScopeSheet() {
  scopeSheet.value = true
}

function goProjects() {
  uni.reLaunch({ url: '/pages/projects/index' })
}

function pickProject() {
  goProjects()
}

function goTasks() {
  uni.reLaunch({ url: '/pages/tasks/index' })
}

function openWebEdit() {
  if (!selectedProjectId.value) return
  openWebConsole(dramaWebUrl(selectedProjectId.value))
}

function copyWebEdit() {
  if (!selectedProjectId.value) return
  copyWebLink(dramaWebUrl(selectedProjectId.value))
}

onPageShow(() => {
  if (!requireAuth()) return
  loadSelection()
  loadProjectMeta()
  refreshActive()
})
</script>

<style scoped>
.command-scroll {
  height: calc(100vh - 120px);
}
.section {
  margin-bottom: 20px;
}
.cmd-panel {
  padding: 12px;
}
.cmd-list {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border-soft);
}
.web-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.web-row:last-child {
  border-bottom: none;
}
.web-row-main {
  flex: 1;
  min-width: 0;
}
.web-row-primary .web-row-title {
  color: var(--accent-text);
  font-weight: 700;
}
.web-row-title {
  display: block;
  font-size: 14px;
  color: var(--text-0);
}
.web-row-title.muted {
  color: var(--text-2);
  font-weight: 400;
}
.web-row-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.web-row-arrow {
  font-size: 20px;
  color: var(--text-3);
  flex-shrink: 0;
}
</style>
