<template>
  <div class="page" v-if="activeChapter">
    <div class="page-head">
      <div class="head-left">
        <button class="back-btn" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ tm.novel.back }}
        </button>
        <div class="head-info">
          <p class="page-book">{{ dramaTitle }}</p>
          <input
            v-model="chapterTitle"
            class="page-title-input"
            type="text"
            :placeholder="tm.novel.chapterTitlePlaceholder"
            :disabled="savingTitle"
            maxlength="120"
            @blur="saveChapterTitle"
            @keydown.enter.prevent="$event.target.blur()"
          />
          <p class="page-sub">
            {{ tx(tm.novel.chapterNumberBadge, { n: chapterNum }) }}
            <span class="word-badge">{{ tx(tm.novel.wordCount, { n: formatNovelWords(charCount) }) }}</span>
          </p>
        </div>
      </div>
      <div class="head-actions">
        <button class="btn" :disabled="saving" @click="persistChapterBody">{{ saving ? tm.novel.saving : tm.novel.saveContent }}</button>
        <button class="btn" :disabled="!chapterBody.trim()" @click="copyContent">{{ tm.novel.copyContent }}</button>
        <button
          class="btn ai-detect-btn"
          :disabled="!chapterBody.trim() || aiProbeRunning"
          @click="openAiDetectModal"
        >
          {{ aiProbeRunning ? tm.novel.aiDetecting : tm.novel.aiDetect }}
          <span
            v-if="savedAiDetection && !savedAiDetection.is_stale"
            class="ai-detect-badge"
          >{{ savedAiDetection.probability }}%</span>
        </button>
        <button
          v-if="prevChapterNum"
          type="button"
          class="btn chapter-nav-btn"
          @click="goPrevChapter"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ tm.novel.prevChapter }}
        </button>
        <button
          v-if="nextChapterNum"
          type="button"
          class="btn btn-primary chapter-nav-btn"
          @click="goNextChapter"
        >
          {{ tm.novel.nextChapter }}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="workspace">
      <aside class="side card">
        <div class="side-block">
          <div class="side-block-head">
            <div class="field-label-row">
              <label class="field-label">{{ tm.novel.chapterOutline }}</label>
              <FieldHelp :text="tm.novel.chapterOutlineHelp" />
            </div>
            <span v-if="outlineSource === 'book'" class="outline-source">{{ tm.novel.chapterOutlineFromBook }}</span>
            <span v-else-if="outlineSource === 'episode'" class="outline-source custom">{{ tm.novel.chapterOutlineCustom }}</span>
          </div>
          <textarea
            v-model="chapterOutline"
            class="input side-textarea outline-readonly"
            rows="6"
            :placeholder="tm.novel.chapterOutlinePlaceholder"
          />
          <p v-if="!chapterOutline.trim() && !hasBookOutline" class="side-hint">{{ tm.novel.chapterOutlineEmpty }}</p>
          <button type="button" class="btn btn-sm" :disabled="savingOutline" @click="saveChapterOutline">
            {{ savingOutline ? tm.novel.saving : tm.novel.saveChapterOutline }}
          </button>
        </div>
        <div class="side-block">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.generatePrompt }}</label>
            <FieldHelp :text="tm.novel.writingBriefHelp" />
          </div>
          <div class="keywords-row">
            <input
              v-model="briefKeywords"
              class="input"
              :placeholder="tm.novel.writingBriefKeywordsPlaceholder"
              @keydown.enter.prevent="generateWritingBrief"
            />
            <button
              type="button"
              class="btn btn-sm btn-primary keywords-gen-btn"
              :disabled="generatingBrief || !briefKeywords.trim() || !canGenerate"
              @click="generateWritingBrief"
            >
              {{ generatingBrief ? tm.novel.generatingWritingBrief : tm.novel.generateWritingBrief }}
            </button>
          </div>
          <textarea v-model="generatePrompt" class="input side-textarea" rows="4" :placeholder="tm.novel.generatePromptPlaceholder" />
          <button type="button" class="btn btn-sm" :disabled="savingBrief" @click="saveWritingBrief">
            {{ savingBrief ? tm.novel.saving : tm.novel.saveWritingBrief }}
          </button>
        </div>
        <div class="side-block">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.targetChapterChars }}</label>
            <FieldHelp :text="tm.novel.targetChapterCharsHelp" />
          </div>
          <input v-model.number="targetChapterChars" class="input" type="number" min="500" max="20000" step="100" @change="saveLengthSettings" />
        </div>
        <div class="side-block">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.continueSegmentChars }}</label>
            <FieldHelp :text="tm.novel.continueSegmentCharsHelp" />
          </div>
          <input v-model.number="continueSegmentChars" class="input" type="number" min="200" max="8000" step="100" @change="saveLengthSettings" />
        </div>
        <div class="side-block">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.contextChars }}</label>
            <FieldHelp :text="tm.novel.contextCharsHelp" />
          </div>
          <input v-model.number="contextChars" class="input" type="number" min="512" max="12000" step="256" @change="saveLengthSettings" />
        </div>
        <div class="side-block mode-block">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.generationMode }}</label>
            <FieldHelp :text="tm.novel.generationModeHelp" />
          </div>
          <div class="mode-tabs">
            <button
              type="button"
              :class="['mode-tab', { active: generationMode === 'stream' }]"
              :disabled="continuing || generating"
              @click="setGenerationMode('stream')"
            >{{ tm.novel.generationModeStream }}</button>
            <button
              type="button"
              :class="['mode-tab', { active: generationMode === 'batch' }]"
              :disabled="continuing || generating"
              @click="setGenerationMode('batch')"
            >{{ tm.novel.generationModeBatch }}</button>
          </div>
        </div>
        <div class="side-actions">
          <p v-if="!canGenerate" class="side-hint credits-hint">{{ tm.credits.noCreditsCannotGenerate }}</p>
          <button class="btn btn-primary" :disabled="continuing || generating || !canGenerate" @click="enqueueContinueWrite(false)">
            {{ continuing ? tm.novel.continuing : tm.novel.continueWrite }}
          </button>
          <button class="btn" :disabled="continuing || generating || !canGenerate" @click="enqueueContinueWrite(true)">
            {{ tm.novel.rewriteContinue }}
          </button>
          <button class="btn btn-primary" :disabled="continuing || generating || !canGenerate" @click="enqueueFullGeneration">
            {{ generating ? tm.novel.generating : tm.novel.generateFull }}
          </button>
        </div>
        <div v-if="continuityCheck" class="side-block continuity-check-block" :class="{ 'is-failed': !continuityCheck.passed }">
          <div class="field-label-row">
            <label class="field-label">{{ tm.novel.continuityCheckTitle }}</label>
          </div>
          <p class="continuity-check-status">
            {{ continuityCheck.passed
              ? tx(tm.novel.continuityCheckPassed, { score: continuityCheck.score })
              : tx(tm.novel.continuityCheckFailed, { score: continuityCheck.score }) }}
          </p>
          <p v-if="continuityCheck.summary" class="continuity-check-summary">
            {{ tm.novel.continuityCheckSummary }}：{{ continuityCheck.summary }}
          </p>
          <ul v-if="continuityBlockingItems.length" class="continuity-issue-list">
            <li v-for="(item, idx) in continuityBlockingItems" :key="idx" class="continuity-issue-item">
              <div class="continuity-issue-head">
                <span class="continuity-issue-badge" :class="item.layer">
                  {{ item.layer === 'hard' ? tm.novel.continuityCheckLayerHard : tm.novel.continuityCheckLayerModel }}
                </span>
                <span class="continuity-issue-label">{{ item.label }}</span>
              </div>
              <code class="continuity-issue-rule">{{ tm.novel.continuityCheckRuleCode }}: {{ item.rule }}</code>
              <p class="continuity-issue-msg">{{ item.message }}</p>
            </li>
          </ul>
        </div>
      </aside>

      <main class="editor card">
        <div class="editor-head">
          <span class="field-label">{{ tm.novel.editorTitle }}</span>
        </div>
        <div class="editor-body">
          <textarea
            ref="editorRef"
            :value="chapterBody"
            class="editor-textarea"
            :placeholder="tm.novel.editorPlaceholder"
            @input="onEditorInput"
          />
          <div v-if="streamWaiting" class="stream-waiting">{{ tm.novel.streamWaiting }}</div>
          <div class="editor-foot">
            <span class="editor-word-count">{{ tx(tm.novel.chapterWordCount, { n: formatNovelWords(charCount) }) }}</span>
          </div>
        </div>
      </main>
    </div>

    <div v-if="aiDetectSheetOpen" class="overlay ai-detect-overlay" @click.self="aiDetectSheetOpen = false">
      <div class="modal card ai-detect-modal">
        <div class="modal-header">
          <div class="modal-header-row">
            <div class="modal-header-text">
              <h2 class="modal-title">{{ tm.novel.aiDetectTitle }}</h2>
            </div>
            <button type="button" class="modal-close-btn" :aria-label="tm.common.closeAria" @click="aiDetectSheetOpen = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="ai-detect-body-wrap">
          <div v-if="aiProbeRunning" class="ai-detect-loading-overlay">
            {{ tx(tm.novel.aiDetectAnalyzing, { n: formatNovelWords(charCount) }) }}
          </div>
          <div v-if="aiDetectionResult" class="ai-detect-body" :class="{ 'is-busy': aiProbeRunning }">
          <div v-if="aiDetectionResult.perplexity != null" class="ai-detect-metrics">
            <div class="ai-detect-metric">
              <span class="ai-detect-metric-label">{{ tm.novel.aiDetectPerplexity }}</span>
              <span class="ai-detect-metric-value">{{ aiDetectionResult.perplexity }}</span>
            </div>
            <div v-if="aiDetectionResult.analyzed_tokens" class="ai-detect-metric">
              <span class="ai-detect-metric-label">{{ tm.novel.aiDetectAnalyzedTokens }}</span>
              <span class="ai-detect-metric-value">{{ aiDetectionResult.analyzed_tokens }}</span>
            </div>
          </div>
          <div class="ai-detect-score" :class="aiVerdictClass">
            <p class="ai-detect-score-label">{{ tm.novel.aiDetectProbability }}</p>
            <p class="ai-detect-score-value">{{ aiDetectionResult.probability }}%</p>
            <p class="ai-detect-verdict">{{ aiVerdictLabel }}</p>
            <p class="ai-detect-confidence">{{ aiConfidenceLabel }}</p>
          </div>
          <p v-if="aiDetectionResult.is_stale" class="ai-detect-stale">{{ tm.novel.aiDetectStale }}</p>
          <p v-if="aiDetectionResult.detected_at" class="ai-detect-time">
            {{ tx(tm.novel.aiDetectLastAt, { time: formatDetectTime(aiDetectionResult.detected_at) }) }}
            <template v-if="aiDetectionResult.elapsed_ms != null">
              · {{ tx(tm.novel.aiDetectElapsed, { ms: aiDetectionResult.elapsed_ms }) }}
            </template>
          </p>
          <div v-if="aiDetectionResult.signals?.length" class="ai-detect-signals">
            <p class="ai-detect-signals-title">{{ tm.novel.aiDetectSignals }}</p>
            <ul class="ai-signal-list">
              <li v-for="signal in aiDetectionResult.signals" :key="signal.key" class="ai-signal-item">
                <span class="ai-signal-label">{{ aiSignalLabel(signal.key) }}</span>
                <span class="ai-signal-bar-wrap">
                  <span class="ai-signal-bar" :style="{ width: `${Math.round(signal.score * 100)}%` }" />
                </span>
                <span class="ai-signal-pct">{{ Math.round(signal.score * 100) }}%</span>
              </li>
            </ul>
          </div>
          <div v-if="aiDetectionResult.suggestions?.length" class="ai-detect-suggestions">
            <p class="ai-detect-suggestions-title">{{ tm.novel.aiDetectSuggestions }}</p>
            <ul class="ai-suggestion-list">
              <li v-for="(item, idx) in aiDetectionResult.suggestions" :key="idx" class="ai-suggestion-item">
                <div class="ai-suggestion-head">
                  <span v-if="item.char_start != null" class="ai-suggestion-where">
                    {{ aiSuggestionLocation(item) }}
                  </span>
                  <span class="ai-suggestion-signal">{{ aiSignalLabel(item.signal_key) }}</span>
                  <button
                    v-if="item.char_start != null"
                    type="button"
                    class="btn btn-sm ai-suggestion-jump"
                    @click="jumpToSuggestion(item)"
                  >
                    {{ tm.novel.aiDetectJumpTo }}
                  </button>
                </div>
                <p v-if="item.match_text" class="ai-suggestion-match">
                  {{ tm.novel.aiDetectSuggestionMatch }}：
                  <mark class="ai-suggestion-mark">{{ item.match_text }}</mark>
                </p>
                <p class="ai-suggestion-advice">{{ aiSuggestionAdvice(item) }}</p>
                <blockquote class="ai-suggestion-excerpt">{{ item.excerpt }}</blockquote>
              </li>
            </ul>
          </div>
          </div>
          <div v-else-if="!aiProbeRunning" class="ai-detect-loading">{{ tm.novel.aiDetectEmpty }}</div>
        </div>
        <div class="ai-detect-actions">
          <button type="button" class="btn" @click="aiDetectSheetOpen = false">{{ tm.common.close }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="aiProbeRunning || !chapterBody.trim()"
            @click="probeChapterAi"
          >
            {{ aiProbeRunning ? tm.novel.aiDetecting : tm.novel.aiDetectRerun }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import FieldHelp from '~/components/field-help.vue'
import { dramaAPI, episodeAPI, novelAPI } from '~/composables/use-api'
import { stripNovelChangeRecord } from '~/common/novel/novelChangeRecord'
import { useCreditsGate } from '~/composables/use-credits-gate'
import { chapterDisplayTitle as resolveChapterTitle } from '~/common/novel/novelChapter'
import { countNovelChars, formatNovelCharCount } from '~/common/novel/novelCharCount'
import { useI18n, tx } from '~/composables/use-i18n'

const { messages: tm, init, lang } = useI18n()
const { canGenerate, guardGenerate } = useCreditsGate()

// ── 路由与章节元数据 ─────────────────────────────────────────
const route = useRoute()
const dramaId = Number(route.params.id)
const chapterNum = computed(() => Number(route.params.chapterNumber))

// ── 章节正文与设定 ───────────────────────────────────────────
const dramaTitle = ref('')
const chapterList = ref([])
const chapterTitle = ref('')
const titleSaved = ref('')
const savingTitle = ref(false)
const activeChapter = ref(null)
const chapterBody = ref('')
const chapterOutline = ref('')
const outlineSource = ref('empty')
const hasBookOutline = ref(false)
const savingOutline = ref(false)
const savingBrief = ref(false)
const briefKeywords = ref('')
const generatingBrief = ref(false)
const generatePrompt = ref('')
const saving = ref(false)
const continuing = ref(false)
const generating = ref(false)
const targetChapterChars = ref(3000)
const continueSegmentChars = ref(800)
const contextChars = ref(4000)
const lastContinuePos = ref(-1)
const editorRef = ref(null)
const GENERATION_MODE_KEY = 'huohuo_novel_generation_mode'
const generationMode = ref('stream')
const streamWaiting = ref(false)
const aiProbeRunning = ref(false)
const aiDetectSheetOpen = ref(false)
const savedAiDetection = ref(null)
const aiDetectionResult = ref(null)
const continuityCheck = ref(null)
const charCount = computed(() => countNovelChars(chapterBody.value))

// ── AI 检测 / 连贯性展示 ─────────────────────────────────────
const continuityBlockingItems = computed(() => {
  const check = continuityCheck.value
  if (!check) return []
  if (check.blocking_items?.length) return check.blocking_items
  return []
})

const aiVerdictClass = computed(() => {
  const v = aiDetectionResult.value?.verdict
  if (v === 'likely_ai') return 'verdict-ai'
  if (v === 'likely_human') return 'verdict-human'
  return 'verdict-mixed'
})

const aiVerdictLabel = computed(() => {
  const v = aiDetectionResult.value?.verdict
  if (v === 'likely_ai') return tm.value.novel.aiDetectVerdictLikelyAi
  if (v === 'likely_human') return tm.value.novel.aiDetectVerdictLikelyHuman
  return tm.value.novel.aiDetectVerdictMixed
})

const aiConfidenceLabel = computed(() => {
  const c = aiDetectionResult.value?.confidence
  if (c === 'low') return tm.value.novel.aiDetectConfidenceLow
  if (c === 'high') return tm.value.novel.aiDetectConfidenceHigh
  return tm.value.novel.aiDetectConfidenceMedium
})

const prevChapterNum = computed(() => {
  const num = chapterNum.value
  const idx = chapterList.value.findIndex(e => (e.episode_number || e.episodeNumber) === num)
  if (idx <= 0) return null
  const prev = chapterList.value[idx - 1]
  return prev.episode_number || prev.episodeNumber
})

const nextChapterNum = computed(() => {
  const num = chapterNum.value
  const idx = chapterList.value.findIndex(e => (e.episode_number || e.episodeNumber) === num)
  if (idx < 0 || idx >= chapterList.value.length - 1) return null
  const next = chapterList.value[idx + 1]
  return next.episode_number || next.episodeNumber
})

function formatNovelWords(n) {
  return formatNovelCharCount(n, lang.value)
}

function onEditorInput(e) {
  chapterBody.value = e.target.value
  lastContinuePos.value = -1
  markAiDetectionStale()
}

function markAiDetectionStale() {
  if (savedAiDetection.value && !savedAiDetection.value.is_stale) {
    savedAiDetection.value = { ...savedAiDetection.value, is_stale: true }
  }
}

function setGenerationMode(mode) {
  generationMode.value = mode
  if (import.meta.client) localStorage.setItem(GENERATION_MODE_KEY, mode)
}

// ── 数据加载与持久化 ─────────────────────────────────────────
async function reloadChapterWorkbench() {
  const drama = await dramaAPI.get(dramaId, { include_episodes: false, include_assets: false })
  if ((drama.project_type || drama.projectType) !== 'novel') {
    await navigateTo(`/drama/${dramaId}`)
    return
  }
  dramaTitle.value = drama.title
  const bookOutline = drama.novel_outline || ''
  chapterList.value = await dramaAPI.listAllEpisodes(dramaId)
  const epLite = chapterList.value.find(e => (e.episode_number || e.episodeNumber) === chapterNum.value)
  if (!epLite) {
    toast.error('章节不存在')
    await navigateTo(`/drama/${dramaId}`)
    return
  }
  const ep = await episodeAPI.get(epLite.id)
  activeChapter.value = ep
  chapterBody.value = stripNovelChangeRecord(ep.content || '')
  chapterTitle.value = resolveChapterTitle(ep)
  titleSaved.value = chapterTitle.value
  try {
    const [meta, brief] = await Promise.all([
      novelAPI.getMeta(dramaId),
      novelAPI.getChapterBrief(ep.id),
    ])
    contextChars.value = meta.context_chars || 4000
    targetChapterChars.value = meta.target_chapter_chars || 3000
    continueSegmentChars.value = meta.continue_segment_chars || 800
    chapterTitle.value = brief.display_title || resolveChapterTitle(ep)
    titleSaved.value = chapterTitle.value
    chapterOutline.value = brief.chapter_outline
      || epLite.chapter_outline
      || ep.description
      || ''
    outlineSource.value = brief.source || (chapterOutline.value.trim() ? 'book' : 'empty')
    hasBookOutline.value = brief.has_book_outline || !!meta.outline?.trim() || !!bookOutline.trim()
    const savedBrief = (brief.writing_brief || ep.script_content || ep.scriptContent || '').trim()
    generatePrompt.value = savedBrief || chapterOutline.value.trim()
    savedAiDetection.value = brief.ai_detection || null
    continuityCheck.value = brief.continuity_check || null
  } catch {
    chapterOutline.value = epLite.chapter_outline || ep.description || ''
    outlineSource.value = chapterOutline.value.trim() ? 'episode' : 'empty'
    hasBookOutline.value = !!bookOutline.trim()
    generatePrompt.value = chapterOutline.value.trim()
  }
}

function aiSuggestionLocation(item) {
  return tx(tm.value.novel.aiDetectSuggestionWhere, {
    para: item.paragraph_index ?? 1,
    sent: item.sentence_index ?? 1,
    line: item.line_number ?? 1,
    char: formatNovelWords(item.char_offset ?? 1),
  })
}

function jumpToSuggestion(item) {
  if (item.char_start == null) return
  aiDetectSheetOpen.value = false
  nextTick(() => {
    const el = editorRef.value
    if (!el) return
    const start = item.char_start
    const end = item.char_end != null && item.char_end > start ? item.char_end : start
    el.focus()
    el.setSelectionRange(start, end)
    const lineHeight = 28
    const line = item.line_number ?? chapterBody.value.slice(0, start).split('\n').length
    el.scrollTop = Math.max(0, (line - 4) * lineHeight)
  })
}

function aiSuggestionAdvice(item) {
  const n = tm.value.novel
  const count = item.count ?? 0
  switch (item.kind) {
    case 'transition_phrase':
      return tx(n.aiDetectAdviceTransitionPhrase, { phrase: item.phrase || '', count })
    case 'logical_connector':
      return tx(n.aiDetectAdviceLogicalConnector, { phrase: item.phrase || '', count })
    case 'sentence_uniformity':
      return tx(n.aiDetectAdviceSentenceUniformity, { count })
    case 'paragraph_uniformity':
      return tx(n.aiDetectAdviceParagraphUniformity, { count })
    case 'phrase_repetition':
      return tx(n.aiDetectAdvicePhraseRepetition, { bigram: item.bigram || '', count })
    case 'colloquial':
      return n.aiDetectAdviceColloquial
    case 'punctuation':
      return n.aiDetectAdvicePunctuation
    case 'lexical':
      return n.aiDetectAdviceLexical
    case 'perplexity': {
      const parts = []
      const isHead = (item.char_start ?? 0) <= 4
      if (isHead && item.count) {
        parts.push(tx(n.aiDetectAdvicePerplexitySample, { n: formatNovelWords(item.count) }))
      }
      if (isHead) parts.push(n.aiDetectAdvicePerplexityHead)
      else parts.push(n.aiDetectAdvicePerplexityBody)
      return parts.join(' ')
    }
    default:
      return n.aiDetectAdviceLexical
  }
}

function aiSignalLabel(key) {
  const map = {
    sentence_uniformity: tm.value.novel.aiDetectSignalSentenceUniformity,
    paragraph_uniformity: tm.value.novel.aiDetectSignalParagraphUniformity,
    transition_patterns: tm.value.novel.aiDetectSignalTransitionPatterns,
    logical_connectors: tm.value.novel.aiDetectSignalLogicalConnectors,
    lexical_pattern: tm.value.novel.aiDetectSignalLexicalPattern,
    phrase_repetition: tm.value.novel.aiDetectSignalPhraseRepetition,
    punctuation_rhythm: tm.value.novel.aiDetectSignalPunctuationRhythm,
    colloquial_markers: tm.value.novel.aiDetectSignalColloquialMarkers,
    perplexity: tm.value.novel.aiDetectPerplexity,
    mean_logprob: tm.value.novel.aiDetectMeanLogprob,
  }
  return map[key] || key
}

function formatDetectTime(iso) {
  try {
    return new Date(iso).toLocaleString(lang.value === 'zh-CN' ? 'zh-CN' : 'en-US')
  } catch {
    return iso
  }
}

function openAiDetectModal() {
  if (!chapterBody.value.trim()) {
    toast.error(tm.value.novel.aiDetectEmpty)
    return
  }
  if (savedAiDetection.value) {
    aiDetectionResult.value = { ...savedAiDetection.value }
    aiDetectSheetOpen.value = true
    return
  }
  probeChapterAi()
}

async function probeChapterAi() {
  if (!guardGenerate()) return
  if (!activeChapter.value?.id) return
  if (!chapterBody.value.trim()) {
    toast.error(tm.value.novel.aiDetectEmpty)
    return
  }
  try {
    aiProbeRunning.value = true
    aiDetectSheetOpen.value = true
    const result = await novelAPI.detectChapterAi(activeChapter.value.id, { text: chapterBody.value })
    savedAiDetection.value = result
    aiDetectionResult.value = result
  } catch (e) {
    toast.error(e.message)
    if (!aiDetectionResult.value) aiDetectSheetOpen.value = false
  } finally {
    aiProbeRunning.value = false
  }
}

async function saveChapterTitle() {
  if (!activeChapter.value?.id) return
  const next = chapterTitle.value.trim() || `第${chapterNum.value}章`
  if (next === titleSaved.value) return
  try {
    savingTitle.value = true
    await episodeAPI.update(activeChapter.value.id, { title: next })
    activeChapter.value.title = next
    chapterTitle.value = resolveChapterTitle({
      title: next,
      episode_number: chapterNum.value,
      episodeNumber: chapterNum.value,
    })
    titleSaved.value = chapterTitle.value
    toast.success(tm.value.novel.toastChapterTitleSaved)
  } catch (e) {
    toast.error(e.message)
    chapterTitle.value = titleSaved.value
  } finally {
    savingTitle.value = false
  }
}

async function saveChapterOutline() {
  if (!activeChapter.value?.id) return
  const outline = chapterOutline.value.trim()
  const writingBriefEmpty = !generatePrompt.value.trim()
  try {
    savingOutline.value = true
    await episodeAPI.update(activeChapter.value.id, { description: chapterOutline.value })
    outlineSource.value = outline ? 'episode' : outlineSource.value
    if (writingBriefEmpty && outline) {
      generatePrompt.value = outline
      await episodeAPI.update(activeChapter.value.id, { script_content: outline })
    }
    toast.success(tm.value.novel.toastChapterOutlineSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    savingOutline.value = false
  }
}

async function saveWritingBrief() {
  if (!activeChapter.value?.id) return
  try {
    savingBrief.value = true
    await episodeAPI.update(activeChapter.value.id, { script_content: generatePrompt.value })
    toast.success(tm.value.novel.toastWritingBriefSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    savingBrief.value = false
  }
}

async function generateWritingBrief() {
  if (!guardGenerate()) return
  if (!activeChapter.value?.id) return
  const keywords = briefKeywords.value.trim()
  if (!keywords) return
  try {
    generatingBrief.value = true
    const { writing_brief: brief } = await novelAPI.generateWritingBrief(activeChapter.value.id, { keywords })
    if (brief) generatePrompt.value = brief
  } catch (e) {
    toast.error(e.message)
  } finally {
    generatingBrief.value = false
  }
}

async function persistChapterBody() {
  if (!activeChapter.value?.id) return
  try {
    saving.value = true
    await episodeAPI.update(activeChapter.value.id, { content: chapterBody.value })
    toast.success(tm.value.novel.toastSaved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function copyContent() {
  const content = chapterBody.value
  if (!content.trim()) {
    toast.error(tm.value.novel.copyEmpty)
    return
  }
  try {
    await navigator.clipboard.writeText(content)
    toast.success(tm.value.novel.toastCopied)
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = content
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      toast.success(tm.value.novel.toastCopied)
    } catch (e) {
      toast.error(e.message || tm.value.novel.copyFailed)
    }
  }
}

async function saveLengthSettings() {
  const ctx = Math.min(12000, Math.max(512, Number(contextChars.value) || 4000))
  const target = Math.min(20000, Math.max(500, Number(targetChapterChars.value) || 3000))
  const segment = Math.min(8000, Math.max(200, Number(continueSegmentChars.value) || 800))
  contextChars.value = ctx
  targetChapterChars.value = target
  continueSegmentChars.value = segment
  try {
    await novelAPI.saveMeta(dramaId, {
      context_chars: ctx,
      target_chapter_chars: target,
      continue_segment_chars: segment,
    })
  } catch { /* ignore */ }
}

async function enqueueContinueWrite(rewrite) {
  if (!guardGenerate()) return
  if (!activeChapter.value?.id) return
  if (rewrite && lastContinuePos.value >= 0) {
    chapterBody.value = chapterBody.value.slice(0, lastContinuePos.value)
  } else if (lastContinuePos.value < 0) {
    lastContinuePos.value = chapterBody.value.length
  }
  const baseText = chapterBody.value
  let segment = ''
  try {
    continuing.value = true
    if (generationMode.value === 'stream') {
      streamWaiting.value = true
      await novelAPI.continueChapterStream(
        activeChapter.value.id,
        { text: baseText, length: continueSegmentChars.value },
        (chunk) => {
          streamWaiting.value = false
          segment += chunk
          chapterBody.value = baseText + segment
          scrollEditorToBottom()
        },
        () => { streamWaiting.value = true },
        (finalSegment) => {
          segment = finalSegment
          chapterBody.value = baseText + finalSegment
        },
      )
    } else {
      const res = await novelAPI.continueChapter(activeChapter.value.id, { text: baseText, length: continueSegmentChars.value })
      segment = res.segment || ''
      if (segment) chapterBody.value = baseText + segment
    }
    if (segment) await episodeAPI.update(activeChapter.value.id, { content: chapterBody.value })
  } catch (e) {
    toast.error(e.message)
  } finally {
    continuing.value = false
    streamWaiting.value = false
  }
}

async function enqueueFullGeneration() {
  if (!guardGenerate()) return
  if (!activeChapter.value?.id) return
  const prompt = generatePrompt.value.trim() || chapterOutline.value.trim()
  if (!prompt) {
    toast.error(tm.value.novel.chapterOutlineEmpty)
    return
  }
  const existingText = chapterBody.value
  let content = ''
  try {
    generating.value = true
    if (generationMode.value === 'stream') {
      streamWaiting.value = true
      let cleared = false
      await novelAPI.generateChapterStream(
        activeChapter.value.id,
        {
          prompt,
          text: existingText,
          target_length: targetChapterChars.value,
        },
        (chunk) => {
          streamWaiting.value = false
          if (!cleared) {
            cleared = true
            chapterBody.value = ''
          }
          content += chunk
          chapterBody.value = content
          scrollEditorToBottom()
        },
        () => { streamWaiting.value = true },
        (finalContent) => {
          content = finalContent
          chapterBody.value = finalContent
        },
      )
    } else {
      const res = await novelAPI.generateChapter(activeChapter.value.id, {
        prompt,
        text: existingText,
        target_length: targetChapterChars.value,
      })
      content = res.content || ''
      if (content) chapterBody.value = content
      if (res.continuity_check) {
        continuityCheck.value = res.continuity_check
        if (!res.continuity_check.passed) {
          toast.warning(tx(tm.value.novel.continuityCheckToastFailed, { score: res.continuity_check.score }))
        }
      }
    }
    if (content) {
      lastContinuePos.value = -1
      await episodeAPI.update(activeChapter.value.id, { content: chapterBody.value })
      toast.success(tm.value.novel.toastSaved)
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    generating.value = false
    streamWaiting.value = false
  }
}

function scrollEditorToBottom() {
  nextTick(() => {
    const el = editorRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function goPrevChapter() {
  if (!prevChapterNum.value) return
  await navigateTo(`/drama/${dramaId}/chapter/${prevChapterNum.value}`)
}

async function goNextChapter() {
  if (!nextChapterNum.value) return
  await navigateTo(`/drama/${dramaId}/chapter/${nextChapterNum.value}`)
}

watch(() => route.params.chapterNumber, async () => {
  try {
    await reloadChapterWorkbench()
  } catch (e) {
    toast.error(e.message)
  }
})

onMounted(async () => {
  init()
  if (import.meta.client) {
    const saved = localStorage.getItem(GENERATION_MODE_KEY)
    if (saved === 'stream' || saved === 'batch') generationMode.value = saved
  }
  try {
    await reloadChapterWorkbench()
  } catch (e) {
    toast.error(e.message)
  }
})
</script>

<style scoped>
.page {
  padding: 24px 32px 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fadeUp 0.35s var(--ease-out) both;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.head-left { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.head-info { min-width: 0; }
.page-book {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--text-3);
  font-weight: 500;
}
.page-title-input {
  display: block;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  margin: 0;
  width: 100%;
  max-width: 520px;
  border: none;
  border-bottom: 1px dashed transparent;
  background: transparent;
  color: var(--text-0);
  padding: 0 0 3px;
  transition: border-color 0.15s;
}
.page-title-input::placeholder {
  color: var(--text-3);
  font-weight: 600;
}
.page-title-input:hover:not(:disabled) {
  border-bottom-color: var(--border);
}
.page-title-input:focus {
  outline: none;
  border-bottom-color: var(--accent-text);
}
.page-title-input:disabled {
  opacity: 0.7;
}
.page-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.word-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--bg-2);
  color: var(--text-3);
  font-family: var(--font-mono);
}
.head-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; flex-wrap: wrap; }
.ai-detect-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-detect-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  background: rgba(76,125,255,0.12);
  color: var(--accent-text);
  font-family: var(--font-mono);
}
.ai-detect-overlay {
  padding: 20px 16px;
  overflow-y: auto;
  align-items: flex-start;
  justify-content: center;
}
.ai-detect-overlay .ai-detect-modal {
  margin: auto;
}
.ai-detect-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: min(92vh, 920px);
  padding: 28px;
  box-shadow: var(--shadow-elevated);
  animation: fadeUp 0.25s var(--ease-out);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-detect-modal .modal-header {
  flex-shrink: 0;
  margin-bottom: 12px;
}
.ai-detect-modal .modal-header-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.ai-detect-modal .modal-header-text { flex: 1; min-width: 0; }
.ai-detect-modal .modal-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.ai-detect-modal .modal-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.55;
}
.ai-detect-body-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-right: 4px;
}
.ai-detect-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-text);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(2px);
  border-radius: var(--radius);
}
html[data-theme="dark"] .ai-detect-loading-overlay {
  background: rgba(20, 24, 32, 0.78);
}
.ai-detect-body.is-busy {
  opacity: 0.35;
  pointer-events: none;
}
.ai-detect-metrics {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.ai-detect-metric {
  flex: 1;
  min-width: 120px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-0);
}
.ai-detect-metric-label {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.ai-detect-metric-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}
.ai-detect-loading {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.ai-detect-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.ai-detect-body { display: flex; flex-direction: column; gap: 16px; }
.ai-detect-score {
  text-align: center;
  padding: 20px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-1, var(--bg-2));
}
.ai-detect-score.verdict-ai {
  border-color: rgba(220, 90, 90, 0.35);
  background: rgba(220, 90, 90, 0.06);
}
.ai-detect-score.verdict-mixed {
  border-color: rgba(200, 150, 50, 0.35);
  background: rgba(200, 150, 50, 0.06);
}
.ai-detect-score.verdict-human {
  border-color: rgba(60, 160, 100, 0.35);
  background: rgba(60, 160, 100, 0.06);
}
.ai-detect-score-label {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  font-weight: 600;
}
.ai-detect-score-value {
  margin: 6px 0 4px;
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-0);
}
.ai-detect-verdict {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}
.ai-detect-confidence {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.ai-detect-stale {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #c97a2e;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: rgba(201, 122, 46, 0.08);
  border: 1px solid rgba(201, 122, 46, 0.2);
}
.ai-detect-time {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.ai-detect-signals-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}
.ai-signal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-signal-item {
  display: grid;
  grid-template-columns: 1fr 120px 36px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.ai-signal-label {
  color: var(--text-2);
  line-height: 1.35;
}
.ai-signal-bar-wrap {
  height: 6px;
  border-radius: 99px;
  background: var(--bg-2);
  overflow: hidden;
}
.ai-signal-bar {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, rgba(76,125,255,0.55), rgba(220, 90, 90, 0.75));
}
.ai-signal-pct {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}
.ai-detect-suggestions-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}
.ai-suggestion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-suggestion-item {
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-0);
}
.ai-suggestion-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ai-suggestion-where {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-text);
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--accent-bg);
}
.ai-suggestion-signal {
  font-size: 11px;
  color: var(--text-3);
}
.ai-suggestion-jump {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}
.ai-suggestion-match {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-2);
}
.ai-suggestion-mark {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(220, 90, 90, 0.12);
  color: var(--text-1);
  font-weight: 600;
}
.ai-suggestion-advice {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
}
.ai-suggestion-excerpt {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid rgba(76,125,255,0.35);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
  background: var(--bg-1);
  border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
}
.chapter-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.back-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-0); color: var(--text-2);
  cursor: pointer;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
}
.side {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.side-block { display: flex; flex-direction: column; gap: 6px; overflow: visible; }
.field-label-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.side-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.outline-source {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(76,125,255,0.1);
  color: var(--accent-text);
}
.outline-source.custom {
  background: rgba(120, 90, 200, 0.12);
  color: #6b4fc7;
}
.side-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-3);
}
.credits-hint {
  color: var(--warn, #c97a2e);
}
.btn-sm {
  align-self: flex-start;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}
.keywords-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.keywords-row .input {
  flex: 1;
  min-width: 0;
}
.keywords-gen-btn {
  flex-shrink: 0;
  white-space: nowrap;
}
.side-textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.55;
  font-family: inherit;
}
.mode-block { margin-top: 4px; }
.mode-tabs {
  display: flex;
  gap: 6px;
}
.mode-tab {
  flex: 1;
  height: 32px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.mode-tab.active {
  background: var(--accent-bg);
  border-color: rgba(76,125,255,0.25);
  color: var(--accent-text);
}
.mode-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.side-actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
.editor {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-0);
  overflow: hidden;
}
.editor-textarea {
  flex: 1;
  min-height: 420px;
  width: 100%;
  border: none;
  border-radius: 0;
  padding: 16px 18px 12px;
  background: transparent;
  color: var(--text-0);
  font-size: 15px;
  line-height: 1.85;
  resize: none;
  font-family: var(--font-body, inherit);
}
.editor-textarea:focus {
  outline: none;
}
.stream-waiting {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--accent-text);
  background: var(--accent-bg);
  border-top: 1px solid var(--border);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
.editor-foot {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  background: var(--bg-1, var(--bg-2));
  flex-shrink: 0;
}
.editor-word-count {
  font-size: 12px;
  color: var(--text-3);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }

.continuity-check-block {
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  padding: 10px 12px;
  background: var(--bg-1, var(--bg-2));
}
.continuity-check-block.is-failed {
  border-color: color-mix(in srgb, var(--danger, #e55) 45%, var(--border));
  background: color-mix(in srgb, var(--danger, #e55) 6%, var(--bg-1, var(--bg-2)));
}
.continuity-check-status {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
}
.continuity-check-summary {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}
.continuity-issue-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.continuity-issue-item {
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.continuity-issue-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.continuity-issue-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
.continuity-issue-badge.hard {
  color: var(--danger, #c44);
  background: color-mix(in srgb, var(--danger, #e55) 12%, transparent);
}
.continuity-issue-badge.model {
  color: var(--accent-text, #6af);
  background: color-mix(in srgb, var(--accent-text, #6af) 12%, transparent);
}
.continuity-issue-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-0);
}
.continuity-issue-rule {
  display: block;
  font-size: 10px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.continuity-issue-msg {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-1);
}

@media (max-width: 900px) {
  .workspace { grid-template-columns: 1fr; }
  .side-actions { flex-direction: row; flex-wrap: wrap; }
}
</style>
