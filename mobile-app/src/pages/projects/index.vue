<template>
  <view class="page-shell">
    <PageHeader title="项目" subtitle="选择项目并下达指令">
      <template #right>
        <CreditPill :credits="user?.credits ?? 0" />
      </template>
    </PageHeader>

    <view class="filter-bar">
      <text
        v-for="tab in filterTabs"
        :key="tab.id"
        class="filter-tab tappable"
        :class="{ active: filter === tab.id }"
        @click="setFilter(tab.id)"
      >{{ tab.label }}</text>
      <view class="filter-add tappable" @click="showCreate = true">
        <AppIcon name="plus" size="md" color="#4c7dff" />
      </view>
    </view>

    <scroll-view scroll-y class="scroll-body projects-scroll" @scrolltolower="fetchList">
      <view v-if="loading && !items.length" class="loading-hint">加载中…</view>
      <EmptyState
        v-else-if="!items.length"
        icon="folder"
        title="创建第一个项目"
        subtitle="创建后可在此下发写作 / 制作指令"
        action="新建项目"
        @click="showCreate = true"
      />
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
        <view class="sheet-handle" />
        <text class="sheet-title">新建项目</text>
        <view class="field">
          <text class="field-label">类型</text>
          <view class="seg">
            <text class="seg-item tappable" :class="{ on: createType === 'novel' }" @click="createType = 'novel'">小说</text>
            <text class="seg-item tappable" :class="{ on: createType === 'drama' }" @click="createType = 'drama'">短剧</text>
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
          <input v-model="createEpisodes" class="input" type="number" inputmode="numeric" placeholder="如：100" />
        </view>
        <text class="sheet-hint">详细设定请在电脑端完善</text>
        <view class="sheet-actions">
          <view class="btn btn-ghost" @click="showCreate = false">取消</view>
          <view class="btn btn-primary" @click="submitCreate">{{ creating ? '创建中…' : '创建' }}</view>
        </view>
      </view>
    </view>

    <AppTabBar active="projects" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import CreditPill from '../../components/CreditPill.vue'
import EmptyState from '../../components/EmptyState.vue'
import PageHeader from '../../components/PageHeader.vue'
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
  if (creating.value) return
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
.projects-scroll {
  height: calc(100vh - 164px);
}
.loading-hint {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-3);
  font-size: 14px;
}
</style>
