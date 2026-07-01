<template>
  <view class="page-shell">
    <view class="top-bar">
      <view>
        <text class="top-title">项目</text>
        <text class="top-sub">选择项目并下达指令</text>
      </view>
      <CreditPill :credits="user?.credits ?? 0" />
    </view>

    <view class="filter-tabs">
      <text
        v-for="tab in filterTabs"
        :key="tab.id"
        class="filter-tab"
        :class="{ active: filter === tab.id }"
        @click="setFilter(tab.id)"
      >{{ tab.label }}</text>
      <text class="filter-add" @click="showCreate = true">＋</text>
    </view>

    <scroll-view scroll-y class="scroll-body" @scrolltolower="fetchList">
      <view v-if="loading && !items.length" class="empty">加载中…</view>
      <view v-else-if="!items.length" class="empty-card" @click="showCreate = true">
        <text class="empty-title">创建第一个项目</text>
        <text class="empty-sub">创建后可在此下发写作 / 制作指令</text>
      </view>
      <ProjectCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        @open="openProject(item)"
        @command="goCommand(item)"
        @web="openWeb(item.id)"
      />
    </scroll-view>

    <view v-if="showCreate" class="mask" @click.self="showCreate = false">
      <view class="sheet">
        <text class="sheet-title">新建项目</text>
        <view class="field">
          <text class="field-label">类型</text>
          <view class="seg">
            <text class="seg-item" :class="{ on: createType === 'novel' }" @click="createType = 'novel'">小说</text>
            <text class="seg-item" :class="{ on: createType === 'drama' }" @click="createType = 'drama'">短剧</text>
          </view>
        </view>
        <view class="field">
          <text class="field-label">名称</text>
          <input v-model="createTitle" class="input" placeholder="项目名称" />
        </view>
        <view class="field">
          <text class="field-label">{{ createType === 'novel' ? '题材' : '风格' }}</text>
          <input v-model="createGenre" class="input" :placeholder="createType === 'novel' ? '如：玄幻' : '如：都市'" />
        </view>
        <view class="field">
          <text class="field-label">{{ createType === 'novel' ? '计划章数' : '集数' }}</text>
          <input v-model="createEpisodes" class="input" type="number" placeholder="如：100" />
        </view>
        <text class="sheet-hint">详细设定请在电脑端完善</text>
        <view class="sheet-actions">
          <button class="btn btn-ghost" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" :disabled="creating" @click="submitCreate">
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </view>
      </view>
    </view>

    <AppTabBar active="projects" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppTabBar from '../../components/AppTabBar.vue'
import CreditPill from '../../components/CreditPill.vue'
import ProjectCard from '../../components/ProjectCard.vue'
import { useAuth } from '../../composables/useAuth'
import { useProjects, useProjectSelection } from '../../composables/useProjects'
import { dramasApi } from '../../api'
import type { ProjectListItem, ProjectType } from '../../api'
import { dramaWebUrl, openWebConsole } from '../../utils/web-link'

const { user, requireAuth, handleAuthError, bootstrap } = useAuth()
const { items, loading, filter, fetchList } = useProjects()
const { selectProject } = useProjectSelection()

const filterTabs = [
  { id: 'all' as const, label: '全部' },
  { id: 'novel' as const, label: '小说' },
  { id: 'drama' as const, label: '短剧' },
]

const showCreate = ref(false)
const creating = ref(false)
const createType = ref<ProjectType>('novel')
const createTitle = ref('')
const createGenre = ref('')
const createEpisodes = ref('100')

function setFilter(id: 'all' | ProjectType) {
  filter.value = id
  fetchList().catch(handleAuthError)
}

function openProject(item: ProjectListItem) {
  selectProject(item)
  uni.navigateTo({ url: '/pages/command/index' })
}

function goCommand(item: ProjectListItem) {
  selectProject(item)
  uni.reLaunch({ url: '/pages/command/index' })
}

function openWeb(id: number) {
  openWebConsole(dramaWebUrl(id))
}

async function submitCreate() {
  if (!createTitle.value.trim()) {
    uni.showToast({ title: '请填写项目名称', icon: 'none' })
    return
  }
  creating.value = true
  try {
    const ep = Number(createEpisodes.value) || 10
    await dramasApi.create({
      title: createTitle.value.trim(),
      project_type: createType.value,
      genre: createType.value === 'novel' ? createGenre.value : undefined,
      style: createType.value === 'drama' ? createGenre.value : undefined,
      total_episodes: ep,
    })
    showCreate.value = false
    createTitle.value = ''
    await fetchList()
    uni.showToast({ title: '已创建', icon: 'success' })
  } catch (e: any) {
    uni.showToast({ title: e?.message || '创建失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

onShow(async () => {
  const ok = await bootstrap()
  if (!ok && !requireAuth()) return
  await fetchList().catch(handleAuthError)
})
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
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 16px 8px;
  box-sizing: border-box;
}
.top-title {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-0);
}
.top-sub {
  font-size: 12px;
  color: var(--text-3);
}
.filter-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 16px 12px;
}
.filter-tab {
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 99px;
  color: var(--text-2);
  background: var(--bg-0);
  border: 1px solid var(--border);
}
.filter-tab.active {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.25);
}
.filter-add {
  margin-left: auto;
  width: 32px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  border-radius: 8px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 18px;
}
.scroll-body {
  height: calc(100vh - 140px);
  width: 100%;
  box-sizing: border-box;
  padding: 0 16px;
}
.empty-card {
  width: 100%;
  box-sizing: border-box;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 20px;
  text-align: center;
  background: var(--bg-0);
}
.empty {
  text-align: center;
  padding: 40px;
  color: var(--text-3);
}
.empty-title {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.empty-sub {
  font-size: 12px;
  color: var(--text-3);
}
.mask {
  position: fixed;
  inset: 0;
  background: rgba(24, 33, 50, 0.45);
  z-index: 200;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: var(--bg-0);
  border-radius: 16px 16px 0 0;
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
}
.sheet-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 16px;
}
.seg {
  display: flex;
  gap: 8px;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 13px;
}
.seg-item.on {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
.sheet-hint {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  margin: 8px 0 16px;
}
.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
