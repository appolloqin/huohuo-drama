<template>
  <div class="page">
    <div class="page-head">
      <div class="head-left">
        <NuxtLink to="/" class="back-link">← {{ tm.ideate.backToList }}</NuxtLink>
        <h1 class="page-title">{{ tm.ideate.pageTitle }}</h1>
        <p class="page-desc">{{ tm.ideate.pageDesc }}</p>
      </div>
      <button
        type="button"
        class="btn hot-toggle-btn"
        @click="hotOpen = !hotOpen"
      >{{ hotOpen ? tm.ideate.hotCollapse : tm.ideate.hotExpand }}</button>
    </div>

    <div class="ideate-layout" :class="{ 'hot-collapsed': !hotOpen }">
      <aside v-show="hotOpen" class="ideate-hot card">
        <div class="hot-panel-head">
          <div>
            <h2 class="panel-title">
              {{ tm.ideate.hotTitle }}
              <span v-if="hotStale" class="hot-stale-badge">{{ tm.ideate.hotStale }}</span>
            </h2>
            <p class="panel-desc">{{ tm.ideate.hotDesc }}</p>
          </div>
          <button
            type="button"
            class="btn hot-refresh-btn"
            :disabled="hotRefreshBusy || hotLoading"
            @click="refreshHot"
          >{{ hotRefreshBusy ? tm.ideate.hotRefreshing : tm.ideate.hotRefresh }}</button>
        </div>

        <div class="hot-platform-tabs" role="tablist">
          <button
            v-for="p in hotPlatforms"
            :key="p"
            type="button"
            role="tab"
            :class="['hot-platform-tab', { active: hotPlatform === p }]"
            :aria-selected="hotPlatform === p"
            @click="selectHotPlatform(p)"
          >{{ tm.ideate.hotPlatforms[p] }}</button>
        </div>

        <div v-if="hotGenreChips.length" class="hot-genre-block">
          <span class="hot-genre-label">{{ tm.ideate.hotGenreChips }}</span>
          <div class="hot-genre-chips">
            <button
              v-for="tag in hotGenreChips"
              :key="tag"
              type="button"
              class="hot-genre-chip"
              @click="onHotGenreChip(tag)"
            >{{ tag }}</button>
          </div>
        </div>

        <p class="hot-disclaimer">{{ tm.ideate.hotDisclaimer }}</p>

        <div v-if="hotLoading" class="hot-placeholder-block">
          <div class="hot-skeleton" />
          <div class="hot-skeleton" />
          <div class="hot-skeleton short" />
        </div>
        <template v-else>
          <p v-if="hotError" class="hot-state hot-state-error">{{ hotError }}</p>
          <p v-else-if="!hotItems.length" class="hot-state">{{ tm.ideate.hotEmpty }}</p>
          <div v-if="hotItems.length" class="hot-list">
          <article
            v-for="item in hotItems"
            :key="`${item.platform}-${item.externalId}`"
            class="hot-card"
          >
            <div class="hot-card-top">
              <h3 class="hot-card-title">{{ item.title }}</h3>
              <span class="hot-card-heat">{{ tm.ideate.hotHeat }} {{ formatHeat(item.heat) }}</span>
            </div>
            <div v-if="item.tags?.length" class="hot-card-tags">
              <span v-for="tag in item.tags.slice(0, 6)" :key="tag" class="hot-tag">{{ tag }}</span>
            </div>
            <p v-if="item.blurbShort" class="hot-card-blurb">{{ item.blurbShort }}</p>
            <button
              type="button"
              class="btn btn-primary hot-apply-btn"
              :disabled="applyBusy || premiseBusy"
              @click="applyHotItem(item)"
            >{{ applyBusyKey === itemKey(item) ? tm.ideate.hotApplying : tm.ideate.hotApply }}</button>
          </article>
          </div>
        </template>
      </aside>

      <section class="ideate-form card">
        <label class="field">
          <span class="field-label">{{ tm.ideate.title }} <span class="required">*</span></span>
          <div class="row-inline">
            <input
              v-model="title"
              class="input"
              :placeholder="tm.ideate.titlePlaceholder"
              required
              @input="markDirty('title')"
            />
            <button
              type="button"
              class="btn btn-primary gen-btn"
              :disabled="titleBusy || premiseBusy || !canGenerate || !title.trim()"
              @click="synthesizeTitle"
            >{{ titleBusy ? tm.ideate.generatingTitle : tm.ideate.generateTitle }}</button>
          </div>
        </label>

        <label class="field">
          <span class="field-label">{{ tm.ideate.totalChapters }}</span>
          <input v-model.number="totalChapters" class="input input-narrow" type="number" min="1" max="500" />
        </label>

        <div class="field">
          <span class="field-label">{{ tm.ideate.genre }}</span>
          <p class="field-hint">{{ tm.ideate.genreHint }}</p>
          <div class="genre-chips">
            <div
              v-for="g in genrePresets"
              :key="g.skillKey"
              :class="genreChipClass(g.skillKey)"
              role="button"
              tabindex="0"
              @click="onGenreChipClick(g.skillKey)"
              @keydown.enter.prevent="onGenreChipClick(g.skillKey)"
            >
              <span class="chip-label">{{ g.value }}</span>
              <span v-if="g.skillKey === primarySkillKey" class="chip-badge">{{ tm.ideate.primaryBadge }}</span>
              <span v-else-if="secondarySkillKeys.includes(g.skillKey)" class="chip-badge secondary">{{ tm.ideate.secondaryBadge }}</span>
              <button
                v-if="secondarySkillKeys.includes(g.skillKey)"
                type="button"
                class="chip-set-primary"
                @click.stop="promoteToPrimary(g.skillKey)"
              >{{ tm.ideate.setPrimary }}</button>
            </div>
          </div>
        </div>

        <div class="field">
          <span class="field-label">{{ tm.ideate.worldview }} <span class="required">*</span></span>
          <p class="field-hint">{{ tm.ideate.pickOrCustom }}</p>
          <div class="catalog-grid">
            <button
              v-for="item in worldviewOptions"
              :key="item.id"
              type="button"
              :class="['catalog-card', { active: worldviewId === item.id && !worldviewCustom.trim() }]"
              @click="pickWorldview(item.id)"
            >
              <span class="catalog-card-label">{{ item.label }}</span>
              <span class="catalog-card-summary">{{ item.summary }}</span>
            </button>
            <button
              type="button"
              :class="['catalog-card', 'catalog-custom', { active: !!worldviewCustom.trim() }]"
              @click="focusCustom('worldview')"
            >
              <span class="catalog-card-label">{{ tm.ideate.custom }}</span>
            </button>
          </div>
          <textarea
            ref="worldviewCustomEl"
            v-model="worldviewCustom"
            class="input textarea"
            rows="2"
            :placeholder="tm.ideate.worldviewCustomPlaceholder"
            @input="markDirty('worldview')"
          />
        </div>

        <div v-if="showCultivation" class="field">
          <span class="field-label">{{ tm.ideate.cultivation }} <span class="required">*</span></span>
          <p class="field-hint">{{ tm.ideate.pickOrCustom }}</p>
          <div class="catalog-grid">
            <button
              v-for="item in cultivationOptions"
              :key="item.id"
              type="button"
              :class="['catalog-card', { active: cultivationId === item.id && !cultivationCustom.trim() }]"
              @click="pickCultivation(item.id)"
            >
              <span class="catalog-card-label">{{ item.label }}</span>
              <span class="catalog-card-summary">{{ item.summary }}</span>
            </button>
            <button
              type="button"
              :class="['catalog-card', 'catalog-custom', { active: !!cultivationCustom.trim() }]"
              @click="focusCustom('cultivation')"
            >
              <span class="catalog-card-label">{{ tm.ideate.custom }}</span>
            </button>
          </div>
          <textarea
            ref="cultivationCustomEl"
            v-model="cultivationCustom"
            class="input textarea"
            rows="2"
            :placeholder="tm.ideate.cultivationCustomPlaceholder"
            @input="markDirty('cultivation')"
          />
        </div>

        <div class="field">
          <span class="field-label">{{ tm.ideate.goldenFinger }} <span class="required">*</span></span>
          <p class="field-hint">{{ tm.ideate.pickOrCustom }}</p>
          <div class="catalog-grid">
            <button
              v-for="item in goldenFingerOptions"
              :key="item.id"
              type="button"
              :class="['catalog-card', { active: goldenFingerId === item.id && !goldenFingerCustom.trim() }]"
              @click="pickGoldenFinger(item.id)"
            >
              <span class="catalog-card-label">{{ item.label }}</span>
              <span class="catalog-card-summary">{{ item.summary }}</span>
            </button>
            <button
              type="button"
              :class="['catalog-card', 'catalog-custom', { active: !!goldenFingerCustom.trim() }]"
              @click="focusCustom('goldenFinger')"
            >
              <span class="catalog-card-label">{{ tm.ideate.custom }}</span>
            </button>
          </div>
          <textarea
            ref="goldenFingerCustomEl"
            v-model="goldenFingerCustom"
            class="input textarea"
            rows="2"
            :placeholder="tm.ideate.goldenFingerCustomPlaceholder"
            @input="markDirty('goldenFinger')"
          />
        </div>

        <label class="field">
          <span class="field-label">{{ tm.ideate.keywords }}</span>
          <div class="row-inline">
            <input
              v-model="keywords"
              class="input"
              :placeholder="tm.ideate.keywordsPlaceholder"
              @input="markDirty('keywords')"
              @keydown.enter.prevent="synthesizePremise"
            />
            <button
              type="button"
              class="btn btn-primary gen-btn"
              :disabled="premiseBusy || titleBusy || !keywords.trim() || !canGenerate"
              @click="synthesizePremise"
            >{{ premiseBusy ? tm.ideate.generatingPremise : tm.ideate.generatePremise }}</button>
          </div>
        </label>

        <label class="field">
          <span class="field-label">{{ tm.ideate.premise }}</span>
          <textarea
            v-model="premise"
            class="input textarea"
            rows="5"
            :placeholder="tm.ideate.premisePlaceholder"
            @input="markDirty('premise')"
          />
        </label>

        <div class="form-actions">
          <NuxtLink to="/" class="btn">{{ tm.ideate.backToList }}</NuxtLink>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="createBusy"
            @click="submitCreate"
          >{{ createBusy ? tm.ideate.creating : tm.ideate.create }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI, novelAPI } from '~/composables/use-api'
import { useCreditsGate } from '~/composables/use-credits-gate'
import { useI18n } from '~/composables/use-i18n'
import {
  getActiveNovelGenrePresets,
  isCultivationPowerGenre,
  listCultivations,
  listGoldenFingers,
  listWorldviews,
} from '~/common/novel/novelSettingCatalogs'

definePageMeta({ name: 'novel-ideate' })

const { messages: tm, init } = useI18n()
const { canGenerate, guardGenerate } = useCreditsGate()

const HOT_PLATFORMS = ['fanqie', 'qidian', 'jinjiang', 'qimao']
const HOT_CHIP_LIMIT = 12

const title = ref('')
const totalChapters = ref(10)
const primarySkillKey = ref('')
const secondarySkillKeys = ref([])
const worldviewId = ref('')
const worldviewCustom = ref('')
const cultivationId = ref('')
const cultivationCustom = ref('')
const goldenFingerId = ref('')
const goldenFingerCustom = ref('')
const keywords = ref('')
const premise = ref('')
const premiseBusy = ref(false)
const createBusy = ref(false)
const titleBusy = ref(false)
const hotOpen = ref(true)

const hotPlatforms = HOT_PLATFORMS
const hotPlatform = ref('fanqie')
const hotItems = ref([])
const hotStale = ref(false)
const hotLoading = ref(false)
const hotRefreshBusy = ref(false)
const hotError = ref('')
const applyBusy = ref(false)
const applyBusyKey = ref('')
const dirtyFields = ref(new Set())
let suppressDirty = false

const worldviewCustomEl = ref(null)
const cultivationCustomEl = ref(null)
const goldenFingerCustomEl = ref(null)

const genrePresets = getActiveNovelGenrePresets()

const primaryLabel = computed(() => {
  const key = primarySkillKey.value
  if (!key) return ''
  return genrePresets.find(g => g.skillKey === key)?.value || key
})

const showCultivation = computed(() => isCultivationPowerGenre(primaryLabel.value))

const worldviewOptions = computed(() => listWorldviews(primarySkillKey.value || undefined))
const cultivationOptions = computed(() => listCultivations(primarySkillKey.value || undefined))
const goldenFingerOptions = computed(() => listGoldenFingers(primarySkillKey.value || undefined))

const hotGenreChips = computed(() => {
  const freq = new Map()
  for (const item of hotItems.value) {
    for (const tag of item.tags || []) {
      const t = String(tag || '').trim()
      if (!t) continue
      freq.set(t, (freq.get(t) || 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, HOT_CHIP_LIMIT)
    .map(([tag]) => tag)
})

function markDirty(field) {
  if (suppressDirty) return
  const next = new Set(dirtyFields.value)
  next.add(field)
  dirtyFields.value = next
}

function isDirty(field) {
  return dirtyFields.value.has(field)
}

function runWithoutDirty(fn) {
  suppressDirty = true
  try {
    fn()
  } finally {
    suppressDirty = false
  }
}

function itemKey(item) {
  return `${item.platform}:${item.externalId}`
}

function formatHeat(heat) {
  const n = Number(heat) || 0
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}

function genreChipClass(skillKey) {
  if (skillKey === primarySkillKey.value) return ['genre-chip', 'is-primary']
  if (secondarySkillKeys.value.includes(skillKey)) return ['genre-chip', 'is-secondary']
  return ['genre-chip', 'is-idle']
}

function pruneIncompatibleSettings(nextPrimary) {
  let cleared = false
  if (worldviewId.value && !worldviewCustom.value.trim()) {
    if (!listWorldviews(nextPrimary).some(e => e.id === worldviewId.value)) {
      worldviewId.value = ''
      cleared = true
    }
  }
  if (cultivationId.value && !cultivationCustom.value.trim()) {
    if (!listCultivations(nextPrimary).some(e => e.id === cultivationId.value)) {
      cultivationId.value = ''
      cleared = true
    }
  }
  if (goldenFingerId.value && !goldenFingerCustom.value.trim()) {
    if (!listGoldenFingers(nextPrimary).some(e => e.id === goldenFingerId.value)) {
      goldenFingerId.value = ''
      cleared = true
    }
  }
  // Non-power primary: clear cultivation so hide logic stays consistent
  const nextLabel = genrePresets.find(g => g.skillKey === nextPrimary)?.value || ''
  if (!isCultivationPowerGenre(nextLabel)) {
    if (cultivationId.value || cultivationCustom.value.trim()) {
      cultivationId.value = ''
      cultivationCustom.value = ''
      cleared = true
    }
  }
  if (cleared && !suppressDirty) toast.info(tm.value.ideate.clearedIncompatible)
}

function applyPrimaryChange(nextPrimary) {
  const prev = primarySkillKey.value
  if (prev === nextPrimary) return
  primarySkillKey.value = nextPrimary
  pruneIncompatibleSettings(nextPrimary)
  const preset = genrePresets.find(g => g.skillKey === nextPrimary)
  if (preset && !keywords.value.trim()) keywords.value = preset.keywords || ''
  if (preset && !premise.value.trim()) premise.value = preset.premise || ''
}

function onGenreChipClick(skillKey) {
  if (skillKey === primarySkillKey.value) return
  if (secondarySkillKeys.value.includes(skillKey)) {
    markDirty('secondary')
    secondarySkillKeys.value = secondarySkillKeys.value.filter(k => k !== skillKey)
    return
  }
  if (!primarySkillKey.value) {
    markDirty('primary')
    applyPrimaryChange(skillKey)
    return
  }
  if (secondarySkillKeys.value.length >= 3) {
    toast.error(tm.value.ideate.secondaryFull)
    return
  }
  markDirty('secondary')
  secondarySkillKeys.value = [...secondarySkillKeys.value, skillKey]
}

function promoteToPrimary(skillKey) {
  markDirty('primary')
  markDirty('secondary')
  const oldPrimary = primarySkillKey.value
  const nextSecondary = secondarySkillKeys.value.filter(k => k !== skillKey)
  // 原主降为辅；若辅因此会超过 3，则丢掉原主（不进辅）
  if (oldPrimary && oldPrimary !== skillKey && nextSecondary.length < 3) {
    nextSecondary.unshift(oldPrimary)
  }
  secondarySkillKeys.value = nextSecondary
  applyPrimaryChange(skillKey)
}

function pickWorldview(id) {
  markDirty('worldview')
  worldviewId.value = id
  worldviewCustom.value = ''
}

function pickCultivation(id) {
  markDirty('cultivation')
  cultivationId.value = id
  cultivationCustom.value = ''
}

function pickGoldenFinger(id) {
  markDirty('goldenFinger')
  goldenFingerId.value = id
  goldenFingerCustom.value = ''
}

function focusCustom(kind) {
  nextTick(() => {
    if (kind === 'worldview') worldviewCustomEl.value?.focus?.()
    else if (kind === 'cultivation') cultivationCustomEl.value?.focus?.()
    else goldenFingerCustomEl.value?.focus?.()
  })
}

function appendKeywords(tags) {
  const existing = keywords.value
    .split(/[,，、\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
  const seen = new Set(existing)
  const add = []
  for (const tag of tags || []) {
    const t = String(tag || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    add.push(t)
  }
  if (!add.length) return
  keywords.value = [...existing, ...add].join('、')
}

function matchGenrePresetByTag(tag) {
  const t = String(tag || '').trim()
  if (!t) return null
  const hits = genrePresets.filter(g => {
    const label = String(g.value || '')
    return label.includes(t) || t.includes(label) || g.skillKey === t
  })
  return hits.length === 1 ? hits[0] : null
}

function onHotGenreChip(tag) {
  appendKeywords([tag])
  toast.info(tm.value.ideate.hotChipAdded)
  if (!primarySkillKey.value) {
    const preset = matchGenrePresetByTag(tag)
    if (preset) {
      runWithoutDirty(() => applyPrimaryChange(preset.skillKey))
    }
  }
}

async function loadHotRank() {
  hotLoading.value = true
  hotError.value = ''
  try {
    const res = await novelAPI.hotRank(hotPlatform.value)
    hotItems.value = Array.isArray(res?.items) ? res.items : []
    hotStale.value = !!res?.stale
    if (res?.error) {
      hotError.value = hotItems.value.length
        ? String(res.error)
        : tm.value.ideate.hotError
    }
  } catch (e) {
    hotItems.value = []
    hotStale.value = false
    hotError.value = e?.message || tm.value.ideate.hotError
  } finally {
    hotLoading.value = false
  }
}

function selectHotPlatform(platform) {
  if (hotPlatform.value === platform) return
  hotPlatform.value = platform
  loadHotRank()
}

async function refreshHot() {
  try {
    hotRefreshBusy.value = true
    await novelAPI.refreshHotRank(hotPlatform.value)
    await loadHotRank()
  } catch (e) {
    toast.error(e?.message || tm.value.ideate.hotError)
  } finally {
    hotRefreshBusy.value = false
  }
}

async function applyHotItem(item) {
  if (!item || applyBusy.value) return
  applyBusy.value = true
  applyBusyKey.value = itemKey(item)
  const mapped = item.mapped || {}

  try {
    runWithoutDirty(() => {
      if (!title.value.trim() && item.title) {
        title.value = item.title
      }

      if (mapped.genrePrimary && !isDirty('primary')) {
        applyPrimaryChange(mapped.genrePrimary)
      }

      if (!isDirty('secondary') && Array.isArray(mapped.genreSecondary) && mapped.genreSecondary.length) {
        const primary = primarySkillKey.value
        secondarySkillKeys.value = mapped.genreSecondary
          .filter(k => k && k !== primary)
          .slice(0, 3)
      }

      const primary = primarySkillKey.value || undefined

      if (mapped.worldviewId && !isDirty('worldview')) {
        if (listWorldviews(primary).some(e => e.id === mapped.worldviewId)) {
          worldviewId.value = mapped.worldviewId
          worldviewCustom.value = ''
        }
      }

      // Cultivation only when power-genre (hide logic intact)
      const label = genrePresets.find(g => g.skillKey === primary)?.value || primaryLabel.value
      if (isCultivationPowerGenre(label) && mapped.cultivationId && !isDirty('cultivation')) {
        if (listCultivations(primary).some(e => e.id === mapped.cultivationId)) {
          cultivationId.value = mapped.cultivationId
          cultivationCustom.value = ''
        }
      }

      if (mapped.goldenFingerId && !isDirty('goldenFinger')) {
        if (listGoldenFingers(primary).some(e => e.id === mapped.goldenFingerId)) {
          goldenFingerId.value = mapped.goldenFingerId
          goldenFingerCustom.value = ''
        }
      }

      if (!isDirty('keywords')) {
        appendKeywords(item.tags || [])
      }
    })

    toast.info(tm.value.ideate.hotApplyDone)

    // Generate premise unless user already edited it
    if (!isDirty('premise') && keywords.value.trim()) {
      if (!guardGenerate()) return
      try {
        premiseBusy.value = true
        const settings = settingPayload()
        const { premise: next } = await novelAPI.generatePremise({
          keywords: keywords.value.trim(),
          title: title.value.trim() || undefined,
          genre: primaryLabel.value || undefined,
          total_chapters: totalChapters.value || undefined,
          ...settings,
        })
        runWithoutDirty(() => {
          premise.value = next || ''
        })
      } catch (e) {
        toast.error(e?.message || tm.value.ideate.hotApplyPremiseFail)
      } finally {
        premiseBusy.value = false
      }
    }
  } finally {
    applyBusy.value = false
    applyBusyKey.value = ''
  }
}

function settingPayload() {
  const showCu = showCultivation.value
  return {
    novel_genre_skill_key: primarySkillKey.value || undefined,
    novel_genre_secondary_keys: [...secondarySkillKeys.value],
    worldview_id: worldviewId.value || undefined,
    worldview_custom: worldviewCustom.value.trim() || undefined,
    cultivation_id: showCu ? (cultivationId.value || undefined) : undefined,
    cultivation_custom: showCu ? (cultivationCustom.value.trim() || undefined) : undefined,
    golden_finger_id: goldenFingerId.value || undefined,
    golden_finger_custom: goldenFingerCustom.value.trim() || undefined,
  }
}

function validateForm() {
  if (!title.value.trim()) {
    toast.error(tm.value.ideate.needTitle)
    return false
  }
  if (!primarySkillKey.value) {
    toast.error(tm.value.ideate.needPrimary)
    return false
  }
  if (!worldviewCustom.value.trim() && !worldviewId.value) {
    toast.error(tm.value.ideate.needWorldview)
    return false
  }
  if (!goldenFingerCustom.value.trim() && !goldenFingerId.value) {
    toast.error(tm.value.ideate.needGoldenFinger)
    return false
  }
  if (showCultivation.value && !cultivationCustom.value.trim() && !cultivationId.value) {
    toast.error(tm.value.ideate.needCultivation)
    return false
  }
  return true
}

async function synthesizeTitle() {
  if (!guardGenerate()) return
  const seed = title.value.trim()
  if (!seed) {
    toast.error(tm.value.ideate.needTitleKeywords)
    return
  }
  try {
    titleBusy.value = true
    const { title: next } = await novelAPI.generateTitle({
      keywords: seed,
      genre: primaryLabel.value || undefined,
      total_chapters: totalChapters.value || undefined,
    })
    if (next?.trim()) {
      title.value = next.trim()
      markDirty('title')
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    titleBusy.value = false
  }
}

async function synthesizePremise() {
  if (!guardGenerate()) return
  const kw = keywords.value.trim()
  if (!kw) return
  try {
    premiseBusy.value = true
    const settings = settingPayload()
    const { premise: next } = await novelAPI.generatePremise({
      keywords: kw,
      title: title.value.trim() || undefined,
      genre: primaryLabel.value || undefined,
      total_chapters: totalChapters.value || undefined,
      ...settings,
    })
    premise.value = next || ''
    markDirty('premise')
  } catch (e) {
    toast.error(e.message)
  } finally {
    premiseBusy.value = false
  }
}

async function submitCreate() {
  if (!validateForm()) return
  try {
    createBusy.value = true
    const settings = settingPayload()
    const d = await dramaAPI.create({
      title: title.value.trim(),
      project_type: 'novel',
      total_chapters: totalChapters.value || 10,
      novel_genre: primaryLabel.value || undefined,
      premise: premise.value.trim() || undefined,
      ...settings,
    })
    navigateTo(`/drama/${d.id}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    createBusy.value = false
  }
}

onMounted(() => {
  init()
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
    hotOpen.value = false
  }
  loadHotRank()
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
  align-items: flex-end;
  margin-bottom: 20px;
  gap: 16px;
}
.head-left { display: flex; flex-direction: column; gap: 4px; }
.back-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-decoration: none;
  width: fit-content;
}
.back-link:hover { color: var(--accent-text); }
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
}
.page-desc { font-size: 13px; color: var(--text-3); }
.hot-toggle-btn { display: none; }

.ideate-layout {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.4fr);
  gap: 20px;
  align-items: start;
}
.ideate-hot,
.ideate-form {
  padding: 20px;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 6px;
}
.panel-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
  margin-bottom: 12px;
}
.hot-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.hot-refresh-btn {
  flex-shrink: 0;
  font-size: 12px;
  padding: 0 12px;
  min-height: 32px;
}
.hot-stale-badge {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  vertical-align: middle;
}
.hot-platform-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.hot-platform-tab {
  border: 1px dashed var(--border);
  background: var(--bg-0);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.hot-platform-tab.active {
  border-style: solid;
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
}
.hot-genre-block { margin-bottom: 10px; }
.hot-genre-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 6px;
}
.hot-genre-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.hot-genre-chip {
  border: 1px dashed var(--border);
  background: var(--bg-0);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.hot-genre-chip:hover {
  border-color: var(--accent);
  color: var(--accent-text);
}
.hot-disclaimer {
  font-size: 11px;
  color: var(--text-3);
  margin: 0 0 12px;
  line-height: 1.4;
}
.hot-placeholder-block { display: flex; flex-direction: column; gap: 8px; }
.hot-skeleton {
  height: 36px;
  border-radius: 8px;
  background: var(--bg-2);
  border: 1px dashed var(--border);
}
.hot-skeleton.short { width: 70%; }
.hot-state {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
  margin: 0;
  padding: 12px 0;
}
.hot-state-error { color: var(--danger, #e25555); }
.hot-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(70vh, 720px);
  overflow-y: auto;
  padding-right: 2px;
}
.hot-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-0);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hot-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.hot-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  margin: 0;
  line-height: 1.35;
}
.hot-card-heat {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}
.hot-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hot-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--bg-2);
  border-radius: 999px;
  padding: 2px 7px;
}
.hot-card-blurb {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hot-apply-btn {
  align-self: flex-start;
  font-size: 12px;
  padding: 0 12px;
  min-height: 30px;
}

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-2); }
.field-hint { font-size: 11px; color: var(--text-3); margin: 0; }
.required { color: var(--danger, #e25555); }
.row-inline { display: flex; gap: 8px; align-items: stretch; }
.row-inline .input { flex: 1; min-width: 0; }
.gen-btn { flex-shrink: 0; white-space: nowrap; font-size: 12px; padding: 0 14px; }
.input-narrow { max-width: 140px; }
.textarea {
  min-height: 64px;
  resize: vertical;
  line-height: 1.6;
  font-family: inherit;
}

.genre-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.genre-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg-0);
  color: var(--text-2);
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.genre-chip.is-idle {
  border: 1px dashed var(--border);
}
.genre-chip.is-secondary {
  border: 1px solid rgba(76, 125, 255, 0.28);
  background: var(--accent-bg);
  color: var(--accent-text);
}
.genre-chip.is-primary {
  border: 2px solid var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
}
.chip-badge {
  font-size: 10px;
  font-weight: 700;
  opacity: 0.85;
}
.chip-badge.secondary { opacity: 0.7; }
.chip-set-primary {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 10px;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}
.catalog-card {
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s;
}
.catalog-card:hover { border-color: var(--accent); }
.catalog-card.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.catalog-card-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-0);
}
.catalog-card-summary {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.4;
}
.catalog-custom {
  border-style: dashed;
  justify-content: center;
  min-height: 56px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

@media (max-width: 860px) {
  .page { padding: 20px 16px 32px; }
  .ideate-layout {
    grid-template-columns: 1fr;
  }
  .hot-toggle-btn { display: inline-flex; }
  .ideate-layout.hot-collapsed .ideate-hot { display: none; }
}
</style>
