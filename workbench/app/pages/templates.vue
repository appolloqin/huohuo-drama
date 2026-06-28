<template>
  <div class="page">
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">{{ tm.templates.title }}</h1>
        <p class="page-desc">{{ tm.templates.desc }}</p>
        <div class="type-tabs">
          <button
            v-for="tab in listTabs"
            :key="tab.id"
            type="button"
            :class="['type-tab', { active: listTab === tab.id }]"
            @click="listTab = tab.id"
          >{{ tab.label }}</button>
        </div>
      </div>
      <div class="head-actions">
        <div class="search-wrap">
          <input
            v-model="keyword"
            class="input search-input"
            :placeholder="tm.templates.searchPlaceholder"
            @keydown.enter.prevent="load"
          />
          <button type="button" class="btn" @click="load">{{ tm.templates.search }}</button>
        </div>
        <button type="button" class="btn btn-primary" @click="openAddDialog">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ tm.templates.addTemplate }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-grid">
      <div v-for="i in 3" :key="i" class="skeleton-card card" />
    </div>

    <div v-else class="grid">
      <div
        v-for="(t, i) in items"
        :key="t.id"
        class="card template-card"
        :style="{ animationDelay: `${i * 0.05}s` }"
      >
        <div class="card-body">
          <div class="card-header">
            <span :class="['type-pill', isNovel(t) ? 'type-pill-novel' : 'type-pill-drama']">
              {{ isNovel(t) ? tm.index.projectTypeNovel : tm.index.projectTypeDrama }}
            </span>
            <span class="author-chip">{{ tx(tm.templates.byAuthor, { name: t.author_name || '—' }) }}</span>
          </div>
          <h3 class="template-title">{{ t.title }}</h3>
          <p class="template-summary">{{ t.template_summary || tm.index.synopsisEmpty }}</p>
          <div class="template-meta">
            <span>{{ tx(tm.templates.episodeCount, { n: t.episode_count || 0 }) }}</span>
            <span v-if="!isNovel(t)">{{ tx(tm.templates.characterCount, { n: t.character_count || 0 }) }}</span>
            <span v-if="t.genre" class="genre-tag">{{ t.genre }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-sm" @click="openPreview(t)">{{ tm.templates.preview }}</button>
          <button type="button" class="btn btn-sm btn-primary" :disabled="usingId === t.id" @click="useTemplate(t)">
            {{ usingId === t.id ? tm.templates.using : tm.templates.use }}
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-sm btn-ghost btn-icon delete-template-btn"
            :title="tm.templates.deleteTitle"
            @click="requestDeleteTemplate(t)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="!items.length" class="card empty-card">
        <p class="empty-title">{{ tm.templates.emptyTitle }}</p>
        <p class="empty-desc">{{ tm.templates.emptyDesc }}</p>
        <button type="button" class="btn btn-primary btn-sm empty-add" @click="openAddDialog">{{ tm.templates.addTemplate }}</button>
      </div>
    </div>

    <!-- Add template -->
    <div v-if="addDialog" class="overlay" @click.self="addDialog = false">
      <div class="modal card add-modal">
        <div class="modal-header">
          <div class="modal-header-text">
            <h2 class="modal-title">{{ tm.templates.addTitle }}</h2>
            <p class="modal-desc">{{ tm.templates.addDesc }}</p>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="addDialog = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="add-tabs">
          <button
            v-for="tab in addTabs"
            :key="tab.id"
            type="button"
            :class="['add-tab', { active: addMode === tab.id }]"
            @click="addMode = tab.id"
          >{{ tab.label }}</button>
        </div>

        <label class="field">
          <span class="field-label">{{ tm.templates.publishSummary }}</span>
          <textarea v-model="addSummary" class="input textarea" rows="2" :placeholder="tm.templates.publishSummaryPlaceholder" />
        </label>

        <template v-if="addMode === 'project'">
          <label class="field">
            <span class="field-label">{{ tm.templates.selectProject }}</span>
            <BaseSelect
              v-model="addProjectId"
              :options="projectOptions"
              :placeholder="tm.templates.selectProjectPlaceholder"
              searchable
            />
            <p v-if="!projectOptions.length" class="field-hint">{{ tm.templates.noProjects }}</p>
          </label>
        </template>

        <template v-else-if="addMode === 'url'">
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ tm.index.projectTypeDrama }}/{{ tm.index.projectTypeNovel }}</span>
              <BaseSelect v-model="addProjectType" :options="projectTypeOptions" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.templates.manualTitle }}</span>
              <input v-model="addUrlTitle" class="input" :placeholder="tm.templates.manualTitlePlaceholder" />
            </label>
          </div>
          <label class="field">
            <span class="field-label">{{ tm.templates.urlLabel }}</span>
            <input v-model="addUrl" class="input" type="url" :placeholder="tm.templates.urlPlaceholder" />
            <p class="field-hint">{{ tm.templates.urlHint }}</p>
          </label>
        </template>

        <template v-else>
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ tm.templates.manualTitle }} *</span>
              <input v-model="addManualTitle" class="input" :placeholder="tm.templates.manualTitlePlaceholder" />
            </label>
            <label class="field">
              <span class="field-label">{{ tm.index.projectTypeDrama }}/{{ tm.index.projectTypeNovel }}</span>
              <BaseSelect v-model="addProjectType" :options="projectTypeOptions" />
            </label>
          </div>
          <label v-if="addProjectType === 'novel'" class="field">
            <span class="field-label">{{ tm.templates.manualGenre }}</span>
            <input v-model="addGenre" class="input" :placeholder="tm.index.novelGenrePlaceholder" />
          </label>
          <label class="field">
            <span class="field-label">{{ tm.templates.manualContent }} *</span>
            <textarea v-model="addManualContent" class="input textarea content-textarea" :placeholder="tm.templates.manualContentPlaceholder" />
            <p class="field-hint">{{ tm.templates.manualContentHint }}</p>
          </label>
        </template>

        <div class="modal-actions">
          <button type="button" class="btn" @click="addDialog = false">{{ tm.index.cancel }}</button>
          <button type="button" class="btn btn-primary" :disabled="creating" @click="submitAdd">
            {{ creating ? tm.templates.creating : tm.templates.createSubmit }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="preview" class="overlay" @click.self="preview = null">
      <div class="modal card preview-modal">
        <div class="modal-header">
          <div class="modal-header-text">
            <h2 class="modal-title">{{ preview.title }}</h2>
            <p class="modal-desc">{{ preview.template_summary || preview.description || '' }}</p>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="preview = null">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="preview-section">
          <div class="preview-label">{{ isNovel(preview) ? tm.templates.chapterOutline : tm.templates.episodeList }}</div>
          <ul class="preview-list">
            <li v-for="ep in preview.episodes || []" :key="ep.id">
              {{ ep.title }}
              <span v-if="ep.has_content" class="preview-dot ready" />
            </li>
          </ul>
        </div>
        <div v-if="preview.characters?.length" class="preview-section">
          <div class="preview-label">{{ tm.templates.characters }}</div>
          <ul class="preview-list compact">
            <li v-for="ch in preview.characters" :key="ch.id">{{ ch.name }}{{ ch.role ? ` · ${ch.role}` : '' }}</li>
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" @click="preview = null">{{ tm.index.cancel }}</button>
          <button type="button" class="btn btn-primary" :disabled="usingId === preview.id" @click="useTemplate(preview)">
            {{ usingId === preview.id ? tm.templates.using : tm.templates.use }}
          </button>
        </div>
      </div>
    </div>

    <AppConfirmDialog
      v-model="deleteConfirmOpen"
      :title="tm.templates.deleteTitle"
      :message="deleteTarget ? tx(tm.templates.confirmDelete, { title: deleteTarget.title }) : ''"
      :busy="deleteBusy"
      @confirm="confirmDeleteTemplate"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup>
definePageMeta({ name: 'templates', keepalive: true })
import { toast } from 'vue-sonner'
import BaseSelect from '~/components/base-select.vue'
import AppConfirmDialog from '~/components/app-confirm-dialog.vue'
import { dramaAPI, templatesAPI } from '~/composables/use-api'
import { useAuth } from '~/composables/useAuth'
import { useI18n, tx } from '~/composables/use-i18n'

const { messages: tm, init } = useI18n()
const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')

const loading = ref(false)
const items = ref([])
const listTab = ref('all')
const keyword = ref('')
const preview = ref(null)
const usingId = ref(null)

const addDialog = ref(false)
const addMode = ref('project')
const addSummary = ref('')
const addProjectId = ref(null)
const addUrl = ref('')
const addUrlTitle = ref('')
const addManualTitle = ref('')
const addManualContent = ref('')
const addGenre = ref('')
const addProjectType = ref('drama')
const myProjects = ref([])
const creating = ref(false)

const listTabs = computed(() => [
  { id: 'all', label: tm.value.index.tabAll },
  { id: 'drama', label: tm.value.index.tabDrama },
  { id: 'novel', label: tm.value.index.tabNovel },
])

const addTabs = computed(() => [
  { id: 'project', label: tm.value.templates.addTabProject },
  { id: 'url', label: tm.value.templates.addTabUrl },
  { id: 'manual', label: tm.value.templates.addTabManual },
])

const projectTypeOptions = computed(() => {
  const all = [
    { label: tm.value.index.projectTypeDrama, value: 'drama' },
    { label: tm.value.index.projectTypeNovel, value: 'novel' },
  ]
  if (listTab.value === 'novel') return all.filter(o => o.value === 'novel')
  if (listTab.value === 'drama') return all.filter(o => o.value === 'drama')
  return all
})

function projectTypeOf(p) {
  return p.project_type || p.projectType || 'drama'
}

const filteredMyProjects = computed(() => {
  if (listTab.value === 'all') return myProjects.value
  return myProjects.value.filter(p => projectTypeOf(p) === listTab.value)
})

const projectOptions = computed(() =>
  filteredMyProjects.value.map(p => ({
    label: `${p.title}（${projectTypeOf(p) === 'novel' ? tm.value.index.projectTypeNovel : tm.value.index.projectTypeDrama}）`,
    value: p.id,
  })),
)

function isNovel(t) {
  return (t.project_type || t.projectType) === 'novel'
}

async function loadMyProjects() {
  try {
    const params = { page_size: 200 }
    if (listTab.value !== 'all') params.project_type = listTab.value
    const res = await dramaAPI.list(params)
    myProjects.value = res.items || []
  } catch {
    myProjects.value = []
  }
}

function syncAddFormWithListTab() {
  if (listTab.value === 'novel') addProjectType.value = 'novel'
  else if (listTab.value === 'drama') addProjectType.value = 'drama'

  if (addProjectId.value && !filteredMyProjects.value.some(p => p.id === addProjectId.value)) {
    addProjectId.value = null
  }
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (listTab.value !== 'all') params.project_type = listTab.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const res = await templatesAPI.list(params)
    items.value = res.items || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

function openAddDialog() {
  addMode.value = 'project'
  addSummary.value = ''
  addProjectId.value = null
  addUrl.value = ''
  addUrlTitle.value = ''
  addManualTitle.value = ''
  addManualContent.value = ''
  addGenre.value = ''
  syncAddFormWithListTab()
  addDialog.value = true
  loadMyProjects()
}

async function submitAdd() {
  if (creating.value) return
  creating.value = true
  try {
    const summary = addSummary.value.trim()
    let created

    if (addMode.value === 'project') {
      if (!addProjectId.value) {
        toast.error(tm.value.templates.selectProjectPlaceholder)
        creating.value = false
        return
      }
      created = await templatesAPI.create({
        source: 'project',
        drama_id: addProjectId.value,
        template_summary: summary,
      })
    } else if (addMode.value === 'url') {
      if (!addUrl.value.trim()) {
        toast.error(tm.value.templates.urlPlaceholder)
        creating.value = false
        return
      }
      created = await templatesAPI.create({
        source: 'url',
        url: addUrl.value.trim(),
        project_type: addProjectType.value,
        title: addUrlTitle.value.trim() || undefined,
        template_summary: summary,
      })
    } else {
      if (!addManualTitle.value.trim()) {
        toast.error(tm.value.templates.manualTitlePlaceholder)
        creating.value = false
        return
      }
      if (!addManualContent.value.trim()) {
        toast.error(tm.value.templates.manualContentPlaceholder)
        creating.value = false
        return
      }
      created = await templatesAPI.create({
        source: 'manual',
        title: addManualTitle.value.trim(),
        project_type: addProjectType.value,
        template_summary: summary,
        genre: addGenre.value.trim() || undefined,
        content: addManualContent.value.trim(),
      })
    }

    toast.success(tm.value.templates.createSuccess)
    addDialog.value = false
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    creating.value = false
  }
}

async function openPreview(t) {
  try {
    preview.value = await templatesAPI.get(t.id)
  } catch (e) {
    toast.error(e.message)
  }
}

async function useTemplate(t) {
  if (usingId.value) return
  usingId.value = t.id
  try {
    const created = await templatesAPI.use(t.id)
    toast.success(tm.value.templates.useSuccess)
    preview.value = null
    await navigateTo(`/drama/${created.id}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    usingId.value = null
  }
}

const deleteConfirmOpen = ref(false)
const deleteTarget = ref(null)
const deleteBusy = ref(false)

function requestDeleteTemplate(t) {
  deleteTarget.value = t
  deleteConfirmOpen.value = true
}

async function confirmDeleteTemplate() {
  const t = deleteTarget.value
  if (!t?.id) return
  deleteBusy.value = true
  try {
    const res = await templatesAPI.remove(t.id)
    toast.success(res?.kind === 'hard' ? tm.value.templates.deleted : tm.value.templates.toastUnpublished)
    deleteConfirmOpen.value = false
    deleteTarget.value = null
    if (preview.value?.id === t.id) preview.value = null
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    deleteBusy.value = false
  }
}

watch(listTab, async () => {
  await load()
  if (addDialog.value) {
    await loadMyProjects()
    syncAddFormWithListTab()
  }
})

onMounted(async () => {
  init()
  await load()
})
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.head-left { display: flex; flex-direction: column; gap: 10px; }
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.page-desc { font-size: 14px; color: var(--text-2); margin: 0; }
.type-tabs { display: flex; gap: 6px; }
.type-tab {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.type-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.25);
  color: var(--accent-text);
}
.search-wrap { display: flex; gap: 8px; align-items: center; }
.search-input { width: min(220px, 100%); }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.loading-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.skeleton-card { height: 180px; opacity: 0.5; }
.template-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  animation: fadeUp 0.35s var(--ease-out) both;
}
.template-card .card-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.template-card .template-summary {
  flex: 1 1 auto;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.type-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}
.type-pill-drama { background: rgba(76, 125, 255, 0.12); color: var(--accent-text); }
.type-pill-novel { background: rgba(120, 90, 200, 0.12); color: #6b4fc7; }
.author-chip { font-size: 11px; color: var(--text-3); }
.template-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: var(--text-0);
}
.template-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.template-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-3);
}
.genre-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}
.delete-template-btn {
  margin-left: auto;
  color: var(--text-3);
}
.delete-template-btn:hover {
  color: var(--danger, #e5484d);
  background: color-mix(in srgb, var(--danger, #e5484d) 10%, transparent);
}
.empty-card {
  grid-column: 1 / -1;
  padding: 48px;
  text-align: center;
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.empty-title { font-weight: 600; margin: 0; }
.empty-desc { font-size: 13px; color: var(--text-3); margin: 0; }
.empty-add { margin-top: 8px; }
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 38, 0.18);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 100;
}
.modal {
  width: min(560px, 100%);
  max-height: min(90vh, 860px);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.add-modal { width: min(600px, 100%); }
.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.modal-title { font-size: 20px; font-weight: 700; margin: 0; }
.modal-desc { font-size: 13px; color: var(--text-2); margin: 6px 0 0; line-height: 1.6; }
.add-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.add-tab {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-1);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.add-tab.active {
  background: rgba(120, 90, 200, 0.12);
  border-color: rgba(120, 90, 200, 0.35);
  color: #5b45b8;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.field-hint { font-size: 12px; color: var(--text-3); margin: 0; line-height: 1.5; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.textarea { resize: vertical; min-height: 72px; font-family: inherit; line-height: 1.55; }
.content-textarea { min-height: 160px; }
.preview-section { display: flex; flex-direction: column; gap: 8px; }
.preview-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-1);
}
.preview-list li {
  padding: 8px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.preview-list.compact li { padding: 6px 12px; }
.preview-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.preview-dot.ready { background: var(--success); }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
@media (max-width: 720px) {
  .page { padding: 20px 16px 32px; }
  .grid { grid-template-columns: 1fr; }
  .field-row { grid-template-columns: 1fr; }
  .head-actions { width: 100%; }
  .search-wrap { flex: 1; }
}
</style>
