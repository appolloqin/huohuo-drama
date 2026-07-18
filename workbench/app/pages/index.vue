<template>
  <div class="page">
    <!-- Page Header -->
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">{{ tm.index.title }}</h1>
        <p class="page-desc">{{ tx(tm.index.projectCount, { n: homePagination.total || visibleHomeRows.length }) }}</p>
        <div class="kind-filter-tabs">
          <button
            v-for="tab in kindFilterTabs"
            :key="tab.id"
            type="button"
            :class="['kind-filter-tab', { active: homeKindFilter === tab.id }]"
            @click="setHomeKindFilter(tab.id)"
          >{{ tab.label }}</button>
        </div>
      </div>
      <button class="btn btn-primary" @click="showCreateModal">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ tm.index.newProject }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="homeCatalogBusy" class="loading-state">
      <div class="skeleton-grid">
        <div v-for="i in 3" :key="i" class="skeleton-tile card"></div>
      </div>
    </div>

    <!-- Grid -->
    <div v-else class="grid">
      <div
        v-for="(d, i) in visibleHomeRows"
        :key="d.id"
        class="card catalog-tile"
        :style="{ animationDelay: `${i * 0.06}s` }"
        @click="navigateTo(`/drama/${d.id}`)"
      >
        <!-- Card film strip decoration -->
        <div class="tile-sprocket-rail">
          <span v-for="j in 5" :key="j" class="sprocket-notch"></span>
        </div>

        <div class="card-body">
          <div class="card-header">
            <div class="unit-count-badge">
              <span :class="['kind-chip', isNovelRow(d) ? 'kind-chip-novel' : 'kind-chip-drama']">
                {{ isNovelRow(d) ? tm.index.projectTypeNovel : tm.index.projectTypeDrama }}
              </span>
              <span v-if="isTemplateRow(d)" class="template-published-chip">{{ tm.templates.publishedBadge }}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              {{ Number(d.total_episodes || 0) }} {{ isNovelRow(d) ? tm.index.chaptersUnit : tm.index.episodesUnit }}
            </div>
            <button
              class="btn btn-ghost btn-icon tile-template-btn"
              :class="{ 'is-published': isTemplateRow(d) }"
              @click.stop="openTemplateModal(d)"
              :title="isTemplateRow(d) ? tm.templates.publishedBadge : tm.templates.publishTitle"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </button>
            <button class="btn btn-ghost btn-icon tile-remove-btn" @click.stop="requestRemoveProjectRow(d)" :title="tm.index.deleteTitle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>

          <h3 class="catalog-headline">{{ d.title }}</h3>

          <div class="catalog-stats">
            <template v-if="isNovelRow(d)">
              <span v-if="d.genre" class="genre-chip novel-genre-chip">{{ d.genre }}</span>
              <span class="stat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                {{ tx(tm.index.novelTotalWords, { n: formatWordBadge(novelChapterCount(d)) }) }}
              </span>
              <span class="stat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {{ tx(tm.index.novelChaptersWritten, { written: novelWrittenCount(d), total: Number(d.total_episodes || 0) }) }}
              </span>
            </template>
            <template v-else>
              <span v-if="d.style" class="genre-chip">{{ captionForStyle(d.style) }}</span>
              <span class="stat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {{ Number(d.character_count || 0) }}
              </span>
              <span class="stat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                {{ Number(d.scene_count || 0) }}
              </span>
            </template>
          </div>

          <p
            class="catalog-teaser"
            :class="{ 'is-empty': !pickRowSynopsis(d) }"
            :title="pickRowSynopsis(d) || undefined"
          >{{ clipRowSynopsis(d) || tm.index.synopsisEmpty }}</p>
        </div>

        <div class="catalog-foot">
          <div class="progress-strip">
            <div class="progress-rail">
              <div class="progress-bar" :style="{ width: estimateProgressPct(d) + '%' }"></div>
            </div>
          </div>
          <span class="catalog-updated">{{ formatUpdatedLabel(d.updated_at || d.updatedAt) }}</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!visibleHomeRows.length" class="card catalog-empty-tile" @click="showCreateModal">
        <div class="empty-glyph">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p class="empty-heading">{{ tm.index.emptyTitle }}</p>
        <p class="empty-caption">{{ tm.index.emptyDesc }}</p>
      </div>
    </div>

    <div v-if="!homeCatalogBusy && homePagination.total_pages > 1" class="home-pagination">
      <button type="button" class="btn btn-sm" :disabled="homePage <= 1 || homeCatalogBusy" @click="setHomePage(homePage - 1)">
        {{ tm.index.pagePrev }}
      </button>
      <span class="home-page-meta">{{ tx(tm.index.pageIdx, { a: homePage, b: homePagination.total_pages }) }}</span>
      <button type="button" class="btn btn-sm" :disabled="homePage >= homePagination.total_pages || homeCatalogBusy" @click="setHomePage(homePage + 1)">
        {{ tm.index.pageNext }}
      </button>
    </div>

    <!-- Create Dialog -->
    <div v-if="newProjectModalOpen" class="overlay" @click.self="newProjectModalOpen = false">
      <div class="modal card">
        <div class="modal-header">
          <div class="modal-header-row">
            <div class="modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <div class="modal-header-text">
              <div class="create-kind-filter-tabs">
                <button
                  type="button"
                  :class="['create-kind-filter-tab', { active: draftKind === 'drama' }]"
                  @click="draftKind = 'drama'"
                >{{ tm.index.projectTypeDrama }}</button>
                <button
                  type="button"
                  :class="['create-kind-filter-tab', { active: draftKind === 'novel' }]"
                  @click="draftKind = 'novel'"
                >{{ tm.index.projectTypeNovel }}</button>
              </div>
              <h2 class="modal-title">{{ draftKind === 'novel' ? tm.index.createNovelTitle : tm.index.createTitle }}</h2>
              <p class="modal-desc">{{ draftKind === 'novel' ? tm.index.createNovelDesc : tm.index.createDesc }}</p>
            </div>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="newProjectModalOpen = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <form @submit.prevent="submitCreateForm" class="modal-form">
          <label class="field">
            <span class="field-label">{{ tm.index.projectName }} <span class="required">{{ tm.index.required }}</span></span>
            <input
              v-model="createFormDraft.title"
              class="input"
              :placeholder="draftKind === 'novel' ? tm.index.novelTitlePlaceholder : tm.index.projectTitlePlaceholder"
              required
              autofocus
            />
          </label>
          <template v-if="draftKind === 'drama'">
            <div class="field-row">
              <label class="field">
                <span class="field-label">{{ tm.index.planEpisodes }}</span>
                <input v-model.number="createFormDraft.total_episodes" class="input" type="number" min="1" max="100" />
              </label>
              <label class="field">
                <span class="field-label">{{ tm.index.screenOrientation }}</span>
                <div class="orientation-tabs">
                  <button
                    type="button"
                    :class="['orientation-tab', { active: createFormDraft.screen_orientation === 'portrait' }]"
                    @click="createFormDraft.screen_orientation = 'portrait'"
                  >{{ tm.index.screenPortrait }}</button>
                  <button
                    type="button"
                    :class="['orientation-tab', { active: createFormDraft.screen_orientation === 'landscape' }]"
                    @click="createFormDraft.screen_orientation = 'landscape'"
                  >{{ tm.index.screenLandscape }}</button>
                </div>
                <span class="field-hint">{{ tm.index.screenOrientationHint }}</span>
              </label>
            </div>
            <label class="field">
              <span class="field-label">{{ tm.index.visualStyle }}</span>
              <div class="style-picker-grid">
                <button
                  v-for="item in dramaStyleRows"
                  :key="item.value"
                  type="button"
                  :class="['style-picker-card', { active: createFormDraft.style === item.value }]"
                  @click="createFormDraft.style = item.value"
                >
                  <img
                    v-if="dramaStylePreviewUrl(item.preview)"
                    :src="dramaStylePreviewUrl(item.preview)"
                    :alt="dramaStyleCardLabel(item, lang)"
                    class="style-picker-thumb"
                    loading="lazy"
                  />
                  <div v-else class="style-picker-thumb style-picker-thumb-fallback"></div>
                  <span class="style-picker-label">{{ dramaStyleCardLabel(item, lang) }}</span>
                </button>
              </div>
            </label>
            <label class="field">
              <span class="field-label">{{ tm.index.projectSynopsis }}</span>
              <textarea
                v-model="createFormDraft.description"
                class="input textarea"
                rows="3"
                :placeholder="tm.index.projectSynopsisPlaceholder"
              />
            </label>
          </template>
          <template v-else>
            <div class="field-row">
              <label class="field">
                <span class="field-label">{{ tm.index.planChapters }}</span>
                <input v-model.number="createFormDraft.total_chapters" class="input" type="number" min="1" max="500" />
              </label>
              <label class="field">
                <span class="field-label">{{ tm.index.novelGenre }}</span>
                <BaseSelect
                  v-model="createFormDraft.novel_genre"
                  :options="novelGenreOptions"
                  :placeholder="tm.index.novelGenrePlaceholder"
                  searchable
                  creatable
                  @update:model-value="onNovelGenreChange"
                />
              </label>
            </div>
            <label class="field">
              <span class="field-label">{{ tm.index.premiseKeywords }}</span>
              <div class="premise-keywords-row">
                <input
                  v-model="premiseKeywordLine"
                  class="input"
                  :placeholder="tm.index.premiseKeywordsPlaceholder"
                  @keydown.enter.prevent="synthesizePremiseLine"
                />
                <button
                  type="button"
                  class="btn btn-primary premise-gen-btn"
                  :disabled="premiseGenBusy || !premiseKeywordLine.trim() || !canGenerate"
                  @click="synthesizePremiseLine"
                >
                  {{ premiseGenBusy ? tm.index.generatingPremise : tm.index.generatePremise }}
                </button>
              </div>
            </label>
            <label class="field">
              <span class="field-label">{{ tm.index.premise }}</span>
              <textarea v-model="createFormDraft.premise" class="input textarea" rows="4" :placeholder="tm.index.premisePlaceholder" />
            </label>
          </template>
          <div class="modal-actions">
            <button type="button" class="btn" @click="newProjectModalOpen = false">{{ tm.index.cancel }}</button>
            <button type="submit" class="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ tm.index.createProject }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="templateModalOpen" class="overlay" @click.self="templateModalOpen = false">
      <div class="modal card publish-modal">
        <div class="modal-header">
          <div class="modal-header-text">
            <h2 class="modal-title">{{ tm.templates.publishTitle }}</h2>
            <p class="modal-desc">{{ tm.templates.publishDesc }}</p>
          </div>
          <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="templateModalOpen = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <label class="field">
          <span class="field-label">{{ templateModalProject?.title }}</span>
          <textarea
            v-model="templateModalBlurb"
            class="input textarea"
            rows="4"
            :placeholder="tm.templates.publishSummaryPlaceholder"
          />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="templateModalOpen = false">{{ tm.index.cancel }}</button>
          <button
            v-if="isTemplateRow(templateModalProject)"
            type="button"
            class="btn"
            :disabled="templateModalBusy"
            @click="revokeTemplatePublish"
          >{{ templateModalBusy ? tm.templates.using : tm.templates.unpublishSubmit }}</button>
          <button type="button" class="btn btn-primary" :disabled="templateModalBusy" @click="confirmTemplatePublish">
            {{ templateModalBusy ? tm.templates.using : tm.templates.publishSubmit }}
          </button>
        </div>
      </div>
    </div>

    <AppConfirmDialog
      v-model="deleteConfirmOpen"
      :title="tm.common.confirmDeleteTitle"
      :message="deleteTarget ? tx(tm.index.confirmDelete, { title: deleteTarget.title }) : ''"
      :busy="deleteBusy"
      @confirm="confirmRemoveProjectRow"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup>
definePageMeta({ name: 'index', keepalive: true })

import { toast } from 'vue-sonner'
import { dramaAPI, novelAPI, templatesAPI } from '~/composables/use-api'
import BaseSelect from '~/components/base-select.vue'
import { useCreditsGate } from '~/composables/use-credits-gate'
import { useI18n, tx } from '~/composables/use-i18n'
import {
  DRAMA_STYLE_CATALOG,
  dramaStyleCardLabel,
  dramaStyleLabelFromCatalog,
  dramaStylePreviewUrl,
  mergeDramaStyleCatalog,
} from '~/common/drama/dramaStyle'
import { formatNovelCharCount } from '~/common/novel/novelCharCount'
import { computeNovelProjectStats } from '~/common/novel/novelProjectStats'
import { truncateText } from '~/common/text/truncateText'
import { applyNovelGenrePreset, novelGenreSelectOptions } from '~/common/novel/novelGenrePresets'

const { messages: tm, init, lang } = useI18n()
const { canGenerate, guardGenerate } = useCreditsGate()

// ── 列表状态 ────────────────────────────────────────────────
const HOME_PAGE_SIZE = 24
const homeProjectRows = useState('home_project_rows', () => [])
const homeCatalogBusy = ref(false)
const homeKindFilter = ref('all')
const homePage = ref(1)
const homePagination = useState('home_pagination', () => ({
  page: 1,
  page_size: HOME_PAGE_SIZE,
  total: 0,
  total_pages: 1,
}))
const { homeProjectsReady } = useSessionCache()

// ── 新建项目弹窗 ──────────────────────────────────────────────
const newProjectModalOpen = ref(false)
const draftKind = ref('drama')
const createFormDraft = ref({
  title: '',
  total_episodes: 1,
  total_chapters: 10,
  style: 'realistic',
  screen_orientation: 'portrait',
  novel_genre: '',
  premise: '',
  description: '',
})
const premiseKeywordLine = ref('')
const premiseGenBusy = ref(false)
const dramaStyleRows = ref(DRAMA_STYLE_CATALOG)

// ── 删除项目确认 ──────────────────────────────────────────────
const deleteConfirmOpen = ref(false)
const deleteTarget = ref(null)
const deleteBusy = ref(false)

// ── 模板发布（火火扩展）──────────────────────────────────────
const templateModalOpen = ref(false)
const templateModalProject = ref(null)
const templateModalBlurb = ref('')
const templateModalBusy = ref(false)

function isTemplateRow(d) {
  return !!(d?.is_template || d?.isTemplate)
}

function openTemplateModal(d) {
  templateModalProject.value = d
  templateModalBlurb.value = (d.template_summary || d.templateSummary || pickRowSynopsis(d) || '').trim()
  templateModalOpen.value = true
}

async function confirmTemplatePublish() {
  if (!templateModalProject.value?.id) return
  templateModalBusy.value = true
  try {
    await templatesAPI.publish(templateModalProject.value.id, { template_summary: templateModalBlurb.value })
    templateModalProject.value.is_template = true
    templateModalProject.value.template_summary = templateModalBlurb.value
    toast.success(tm.value.templates.toastPublished)
    templateModalOpen.value = false
  } catch (e) {
    toast.error(e.message)
  } finally {
    templateModalBusy.value = false
  }
}

async function revokeTemplatePublish() {
  if (!templateModalProject.value?.id) return
  templateModalBusy.value = true
  try {
    await templatesAPI.unpublish(templateModalProject.value.id)
    templateModalProject.value.is_template = false
    toast.success(tm.value.templates.toastUnpublished)
    templateModalOpen.value = false
  } catch (e) {
    toast.error(e.message)
  } finally {
    templateModalBusy.value = false
  }
}

const kindFilterTabs = computed(() => [
  { id: 'all', label: tm.value.index.tabAll },
  { id: 'drama', label: tm.value.index.tabDrama },
  { id: 'novel', label: tm.value.index.tabNovel },
])

const visibleHomeRows = computed(() => homeProjectRows.value)
const novelGenreOptions = novelGenreSelectOptions()

function resolveRowKind(d) {
  return d.project_type || d.projectType || 'drama'
}

function isNovelRow(d) {
  return resolveRowKind(d) === 'novel'
}

function novelChapterCount(d) {
  // The /dramas list endpoint now pre-aggregates `total_chars` server-side
  // (SUM(CHAR_LENGTH(content)) on the episodes table). It matches the old
  // computeNovelProjectStats().totalChars (Unicode code-point count) exactly,
  // so we just read the field instead of re-pulling the episode array.
  return Number(d.total_chars || 0)
}

function novelWrittenCount(d) {
  return Number(d.written_count || 0)
}

function formatWordBadge(n) {
  return formatNovelCharCount(n, lang.value)
}

function pickRowSynopsis(d) {
  let text = (d.description || '').trim()
  if (!text && isNovelRow(d)) {
    const raw = d.metadata
    if (typeof raw === 'string' && raw) {
      try {
        const meta = JSON.parse(raw)
        text = (meta.premise || '').trim()
      } catch { /* ignore */ }
    }
  }
  return text
}

function clipRowSynopsis(d) {
  return truncateText(pickRowSynopsis(d), 72)
}

function showCreateModal() {
  void fetchDramaStyles()
  draftKind.value = homeKindFilter.value === 'novel' ? 'novel' : 'drama'
  premiseKeywordLine.value = ''
  newProjectModalOpen.value = true
}

function onNovelGenreChange(value) {
  const genre = String(value ?? createFormDraft.value.novel_genre ?? '').trim()
  const applied = applyNovelGenrePreset(genre)
  if (applied) {
    premiseKeywordLine.value = applied.keywords
    createFormDraft.value.premise = applied.premise
  } else {
    premiseKeywordLine.value = ''
    createFormDraft.value.premise = ''
  }
}

async function synthesizePremiseLine() {
  if (!guardGenerate()) return
  const keywords = premiseKeywordLine.value.trim()
  if (!keywords) return
  try {
    premiseGenBusy.value = true
    const { premise } = await novelAPI.generatePremise({
      keywords,
      title: createFormDraft.value.title?.trim() || undefined,
      genre: createFormDraft.value.novel_genre?.trim() || undefined,
      total_chapters: createFormDraft.value.total_chapters || undefined,
    })
    createFormDraft.value.premise = premise || ''
  } catch (e) {
    toast.error(e.message)
  } finally {
    premiseGenBusy.value = false
  }
}

function captionForStyle(value) {
  return dramaStyleLabelFromCatalog(dramaStyleRows.value, value)
}

async function fetchHomeProjects(opts) {
  const silent = !!opts?.silent && homeProjectRows.value.length > 0
  if (!silent) homeCatalogBusy.value = true
  try {
    const params = { page: homePage.value, page_size: HOME_PAGE_SIZE }
    if (homeKindFilter.value !== 'all') params.project_type = homeKindFilter.value
    const res = await dramaAPI.list(params)
    homeProjectRows.value = res.items || []
    homePagination.value = res.pagination || homePagination.value
    homeProjectsReady.value = true
    if (homePage.value > homePagination.value.total_pages) {
      homePage.value = Math.max(1, homePagination.value.total_pages)
      if (homePage.value !== res.pagination?.page) {
        await fetchHomeProjects({ silent: true })
      }
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    if (!silent) homeCatalogBusy.value = false
  }
}

function setHomePage(page) {
  const next = Math.max(1, Math.min(page, homePagination.value.total_pages || 1))
  if (next === homePage.value) return
  homePage.value = next
  fetchHomeProjects()
}

function setHomeKindFilter(kind) {
  if (kind === homeKindFilter.value) return
  homeKindFilter.value = kind
  homePage.value = 1
  fetchHomeProjects()
}

async function fetchDramaStyles() {
  try {
    const rows = await dramaAPI.styles()
    dramaStyleRows.value = mergeDramaStyleCatalog(rows)
  } catch {
    dramaStyleRows.value = DRAMA_STYLE_CATALOG
  }
}

async function submitCreateForm() {
  if (!createFormDraft.value.title?.trim()) return
  try {
    const payload = draftKind.value === 'novel'
      ? {
          title: createFormDraft.value.title,
          project_type: 'novel',
          total_chapters: createFormDraft.value.total_chapters || 10,
          novel_genre: createFormDraft.value.novel_genre || undefined,
          premise: createFormDraft.value.premise || undefined,
        }
      : {
          title: createFormDraft.value.title,
          project_type: 'drama',
          total_episodes: createFormDraft.value.total_episodes || 1,
          screen_orientation: createFormDraft.value.screen_orientation || 'portrait',
          style: createFormDraft.value.style || undefined,
          description: createFormDraft.value.description?.trim() || undefined,
        }
    const d = await dramaAPI.create(payload)
    newProjectModalOpen.value = false
    createFormDraft.value = {
      title: '',
      total_episodes: 1,
      total_chapters: 10,
      style: 'realistic',
      screen_orientation: 'portrait',
      novel_genre: '',
      premise: '',
      description: '',
    }
    premiseKeywordLine.value = ''
    navigateTo(`/drama/${d.id}`)
  } catch (e) {
    toast.error(e.message)
  }
}

function requestRemoveProjectRow(d) {
  deleteTarget.value = d
  deleteConfirmOpen.value = true
}

async function confirmRemoveProjectRow() {
  const d = deleteTarget.value
  if (!d?.id) return
  deleteBusy.value = true
  try {
    await dramaAPI.del(d.id)
    toast.success(tm.value.index.deleted)
    deleteConfirmOpen.value = false
    deleteTarget.value = null
    fetchHomeProjects()
  } catch (e) {
    toast.error(e.message)
  } finally {
    deleteBusy.value = false
  }
}

function formatUpdatedLabel(s) {
  if (!s) return ''
  const d = new Date(s)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const ix = tm.value.index
  if (diff < 60000) return ix.relJust
  if (diff < 3600000) return tx(ix.relMinutes, { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return tx(ix.relHours, { n: Math.floor(diff / 3600000) })
  if (diff < 604800000) return tx(ix.relDays, { n: Math.floor(diff / 86400000) })
  const loc = lang.value === 'zh-CN' ? 'zh-CN' : lang.value === 'vi' ? 'vi-VN' : 'en-US'
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' })
}

function estimateProgressPct(d) {
  // /dramas now returns aggregate counters (total_episodes / written_count);
  // we no longer get the raw episode array on the list endpoint. Novels get
  // a real written-vs-total ratio. Dramas fall back to the project status:
  // generated projects map to 100, in-progress to ~50, drafts to 0. The
  // detail page computes the real scripted-vs-total ratio on demand.
  const total = Number(d.total_episodes || 0)
  if (isNovelRow(d)) {
    if (!total) return 0
    return Math.round((Number(d.written_count || 0) / total) * 100)
  }
  const status = String(d.status || '').toLowerCase()
  if (status === 'completed' || status === 'done') return 100
  if (status === 'generating' || status === 'in_progress' || status === 'in-progress') return 50
  return 0
}

onMounted(() => {
  init()
  if (homeProjectsReady.value && homeProjectRows.value.length) {
    void fetchHomeProjects({ silent: true })
  } else {
    void fetchHomeProjects()
  }
})

onActivated(() => {
  if (homeProjectsReady.value && homeProjectRows.value.length) {
    void fetchHomeProjects({ silent: true })
  }
})
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

/* Page Head */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 28px;
}
.head-left { display: flex; flex-direction: column; gap: 4px; }
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
}
.page-desc { font-size: 13px; color: var(--text-3); font-weight: 400; }
.kind-filter-tabs {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.kind-filter-tab {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.kind-filter-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76,125,255,0.25);
  color: var(--accent-text);
}
.kind-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 99px;
  letter-spacing: 0.02em;
}
.kind-chip-drama {
  background: var(--accent-bg);
  color: var(--accent-text);
}
.kind-chip-novel {
  background: rgba(120, 90, 200, 0.12);
  color: #6b4fc7;
}
.template-published-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(120, 90, 200, 0.1);
  color: #5b45b8;
  border: 1px solid rgba(120, 90, 200, 0.22);
}
.create-kind-filter-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.create-kind-filter-tab {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-1);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.create-kind-filter-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76,125,255,0.25);
  color: var(--accent-text);
}
.textarea {
  min-height: 88px;
  resize: vertical;
  line-height: 1.6;
  font-family: inherit;
}
.premise-keywords-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.premise-keywords-row .input {
  flex: 1;
  min-width: 0;
}
.premise-gen-btn {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0 14px;
  font-size: 12px;
}

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

/* Project Card */
.catalog-tile {
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeUp 0.4s var(--ease-out) both;
  transition: transform 0.22s var(--ease-out), box-shadow 0.22s var(--ease-out), border-color 0.2s;
}
.catalog-tile:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
}

/* Film strip decoration */
.tile-sprocket-rail {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 6px 16px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
}
.sprocket-notch {
  width: 10px; height: 8px;
  background: var(--bg-3);
  border-radius: 2px;
  transition: background 0.2s;
}
.catalog-tile:hover .sprocket-notch:nth-child(2) { background: var(--accent); }
.catalog-tile:hover .sprocket-notch:nth-child(4) { background: var(--accent); opacity: 0.5; }

.card-body { padding: 18px 18px 14px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.unit-count-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.unit-count-badge svg { color: var(--accent); }

.tile-remove-btn,
.tile-template-btn { opacity: 0; transition: opacity 0.15s; }
.catalog-tile:hover .tile-remove-btn,
.catalog-tile:hover .tile-template-btn { opacity: 1; }
.tile-template-btn.is-published { color: #5b45b8; opacity: 1; }

.catalog-headline {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-0);
}

.catalog-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.genre-chip {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: 99px;
  border: 1px solid rgba(184,120,20,0.12);
}
.stat-pill {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--text-3);
}
.novel-genre-chip {
  background: rgba(120, 90, 200, 0.12);
  color: #6b4fc7;
  border-color: rgba(120, 90, 200, 0.2);
}
.catalog-teaser {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(1.55em * 2);
}
.catalog-teaser.is-empty {
  color: var(--text-3);
  font-style: italic;
}
.catalog-foot {
  padding: 10px 18px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.progress-strip { flex: 1; }
.progress-rail {
  height: 3px; background: var(--bg-3);
  border-radius: 99px; overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 99px;
  transition: width 0.6s var(--ease-out);
}
.catalog-updated { font-size: 11px; color: var(--text-3); white-space: nowrap; }

/* Loading Skeleton */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.skeleton-tile {
  height: 180px;
  background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border: none;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Empty Card */
.catalog-empty-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 56px 32px;
  cursor: pointer;
  border-style: dashed; border-width: 1.5px;
  text-align: center;
  transition: all 0.2s var(--ease-out);
}
.catalog-empty-tile:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  transform: translateY(-2px);
}
.empty-glyph {
  width: 56px; height: 56px; border-radius: var(--radius-lg);
  background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3);
  margin-bottom: 4px;
  transition: all 0.2s;
}
.catalog-empty-tile:hover .empty-glyph { background: var(--accent-bg); color: var(--accent); }
.empty-heading { font-size: 14px; font-weight: 600; color: var(--text-1); }
.empty-caption { font-size: 12px; color: var(--text-3); max-width: 220px; line-height: 1.6; }

/* Modal */
.modal { padding: 32px; width: min(560px, 100%); box-shadow: var(--shadow-elevated); animation: scaleIn 0.2s var(--ease-out); }
.field-hint {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.45;
}
.orientation-tabs {
  display: flex;
  gap: 8px;
}
.orientation-tab {
  flex: 1;
  height: 36px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-1);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.orientation-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76,125,255,0.25);
  color: var(--accent-text);
}
.style-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px;
}
.style-picker-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-1);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}
.style-picker-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.style-picker-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(76,125,255,0.18);
  background: var(--accent-bg);
}
.style-picker-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: calc(var(--radius) - 2px);
  background: var(--bg-2);
}
.style-picker-thumb-fallback {
  background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
}
.style-picker-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.modal-header { margin-bottom: 24px; }
.modal-header-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.modal-header-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal-icon {
  width: 44px; height: 44px; border-radius: var(--radius);
  background: var(--accent-bg); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.modal-desc { font-size: 13px; color: var(--text-3); line-height: 1.5; }
.modal-form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field-row .field { min-width: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }

.home-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
  padding-bottom: 8px;
}
.home-page-meta {
  font-size: 13px;
  color: var(--text-3);
}
</style>
