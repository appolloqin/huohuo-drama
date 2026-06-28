<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ tm.aiDetectHub.title }}</h1>
        <p class="page-desc">{{ tm.aiDetectHub.desc }}</p>
      </div>
    </div>

    <div v-if="!canGenerate" class="credits-bar">{{ tm.credits.noCreditsCannotGenerate }}</div>

    <div class="hub-stack">
      <section class="card hub-input" :class="{ 'has-result': scanResult || scanRunning }">
        <div class="mode-tabs">
          <button
            v-for="tab in modeTabs"
            :key="tab.id"
            type="button"
            :class="['mode-tab', { active: detectMode === tab.id }]"
            @click="detectMode = tab.id"
          >{{ tab.label }}</button>
        </div>

        <div v-if="detectMode === 'text'" class="input-block">
          <label class="field-label">{{ tm.aiDetectHub.textLabel }}</label>
          <textarea
            v-model="pasteText"
            class="input hub-textarea"
            :placeholder="tm.aiDetectHub.textPlaceholder"
          />
        </div>

        <div v-else class="input-block">
          <label class="field-label">{{ tm.aiDetectHub.fileLabel }}</label>
          <p class="field-hint">{{ fileHint }}</p>
          <div
            class="file-drop"
            role="button"
            tabindex="0"
            @click="fileInputRef?.click()"
            @keydown.enter.prevent="fileInputRef?.click()"
          >
            <input
              ref="fileInputRef"
              type="file"
              class="file-native"
              :accept="fileAccept"
              @change="onFilePick"
            />
            <p class="file-drop-title">{{ tm.aiDetectHub.pickFile }}</p>
            <p v-if="uploadFile" class="file-drop-name">{{ uploadFile.name }}</p>
            <p v-else class="file-drop-hint">{{ tm.aiDetectHub.dropZoneHint }}</p>
          </div>
        </div>

        <div class="hub-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="scanRunning || !canSubmit"
            @click="startAiScan"
          >
            {{ scanRunning ? tm.novel.aiDetecting : tm.novel.aiDetect }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="rewriteRunning || scanRunning || !canHumanize"
            @click="startHumanizeRewrite"
          >
            {{ rewriteRunning ? tm.aiDetectHub.rewriteRunning : tm.aiDetectHub.humanize }}
          </button>
        </div>
        <p class="hub-action-hint">{{ tm.aiDetectHub.humanizeHint }}</p>
      </section>

      <section v-if="humanizedText" ref="humanizeRef" class="card hub-humanize">
        <div class="hub-humanize-head">
          <h2 class="hub-humanize-title">{{ tm.aiDetectHub.humanizeResultTitle }}</h2>
          <span class="dim">{{ tx(tm.aiDetectHub.humanizeCharCount, { n: formatNovelWords(humanizedCharCount) }) }}</span>
        </div>
        <p v-if="humanizePipeline" class="hub-pipeline">{{ tx(tm.aiDetectHub.humanizePipeline, { p: humanizePipeline }) }}</p>
        <p v-if="humanizeCompare" class="hub-compare" :class="{ 'hub-compare-flat': humanizeCompareFlat }">
          {{ humanizeCompare }}
        </p>
        <p class="hub-perplexity-note">{{ tm.aiDetectHub.humanizePerplexityNote }}</p>
        <textarea class="input hub-humanize-text" :value="humanizedText" readonly rows="14" />
        <div class="hub-actions">
          <button type="button" class="btn btn-sm" @click="copyHumanized">{{ tm.aiDetectHub.humanizeCopy }}</button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="scanRunning || !humanizedText"
            @click="rescanAfterRewrite"
          >
            {{ scanRunning ? tm.aiDetectHub.analyzing : tm.aiDetectHub.humanizeDetectResult }}
          </button>
          <button v-if="detectMode === 'text'" type="button" class="btn btn-sm btn-primary" @click="applyHumanized">
            {{ tm.aiDetectHub.humanizeApply }}
          </button>
        </div>
      </section>

      <section ref="scanPanelRef" class="card hub-result" v-if="scanResult || scanRunning">
        <div v-if="scanRunning" class="hub-loading">{{ tm.aiDetectHub.analyzing }}</div>
        <div v-else-if="scanResult" class="ai-detect-body">
          <p v-if="scanResult.pipeline" class="hub-pipeline">{{ scanResult.pipeline }}</p>
          <p v-if="scanResult.analysis_note" class="hub-note">{{ scanResult.analysis_note }}</p>
          <p v-if="scanResult.source_name" class="hub-source">
            {{ tm.aiDetectHub.sourceFile }}：{{ scanResult.source_name }}
          </p>
          <div v-if="scanResult.perplexity != null" class="ai-detect-metrics">
            <div class="ai-detect-metric">
              <span class="ai-detect-metric-label">{{ tm.novel.aiDetectPerplexity }}</span>
              <span class="ai-detect-metric-value">{{ scanResult.perplexity }}</span>
            </div>
            <div v-if="scanResult.analyzed_tokens" class="ai-detect-metric">
              <span class="ai-detect-metric-label">{{ tm.novel.aiDetectAnalyzedTokens }}</span>
              <span class="ai-detect-metric-value">{{ scanResult.analyzed_tokens }}</span>
            </div>
          </div>
          <div class="ai-detect-score" :class="verdictClass">
            <p class="ai-detect-score-label">{{ tm.novel.aiDetectProbability }}</p>
            <p class="ai-detect-score-value">{{ scanResult.probability }}%</p>
            <p class="ai-detect-verdict">{{ verdictLabel }}</p>
            <p class="ai-detect-confidence">{{ confidenceLabel }}</p>
          </div>
          <p v-if="scanResult.detected_at" class="ai-detect-time">
            {{ tx(tm.novel.aiDetectLastAt, { time: formatDetectTime(scanResult.detected_at) }) }}
            <template v-if="scanResult.elapsed_ms != null">
              · {{ tx(tm.novel.aiDetectElapsed, { ms: scanResult.elapsed_ms }) }}
            </template>
          </p>
          <div v-if="scanResult.signals?.length" class="ai-detect-signals">
            <p class="ai-detect-signals-title">{{ tm.novel.aiDetectSignals }}</p>
            <ul class="ai-signal-list">
              <li v-for="signal in scanResult.signals" :key="signal.key" class="ai-signal-item">
                <span class="ai-signal-label">{{ aiSignalLabel(signal.key) }}</span>
                <span class="ai-signal-bar-wrap">
                  <span class="ai-signal-bar" :style="{ width: `${Math.round(signal.score * 100)}%` }" />
                </span>
                <span class="ai-signal-pct">{{ Math.round(signal.score * 100) }}%</span>
              </li>
            </ul>
          </div>
          <div v-if="scanResult.suggestions?.length" class="ai-detect-suggestions">
            <p class="ai-detect-suggestions-title">{{ tm.novel.aiDetectSuggestions }}</p>
            <ul class="ai-suggestion-list">
              <li v-for="(item, idx) in scanResult.suggestions" :key="idx" class="ai-suggestion-item">
                <div class="ai-suggestion-head">
                  <span v-if="item.char_start != null" class="ai-suggestion-where">
                    {{ aiSuggestionLocation(item) }}
                  </span>
                  <span class="ai-suggestion-signal">{{ aiSignalLabel(item.signal_key) }}</span>
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
          <details v-if="scanResult.transcript && detectMode !== 'text'" class="transcript-box">
            <summary>{{ tm.aiDetectHub.transcriptTitle }}</summary>
            <pre class="transcript-pre">{{ scanResult.transcript }}</pre>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ name: 'ai-detect', keepalive: true })
// ── AI 检测 Hub：文本 / 文件 / 音视频 + 去 AI 味改写 ──

import { toast } from 'vue-sonner'
import { aiDetectAPI, type AiDetectHubResult } from '~/composables/use-api'
import { useCreditsGate } from '~/composables/use-credits-gate'
import { formatNovelCharCount } from '~/common/novel/novelCharCount'
import { useI18n, tx } from '~/composables/use-i18n'

const { messages: tm, init, lang } = useI18n()
const { canGenerate, guardGenerate } = useCreditsGate()

const detectMode = ref<'text' | 'file' | 'audio' | 'video'>('text')
const pasteText = ref('')
const uploadFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const scanRunning = ref(false)
const rewriteRunning = ref(false)
const humanizedText = ref('')
const humanizedCharCount = ref(0)
const humanizePipeline = ref('')
const scanBeforeRewrite = ref<AiDetectHubResult | null>(null)
const scanResult = ref<AiDetectHubResult | null>(null)
const scanPanelRef = ref<HTMLElement | null>(null)
const humanizeRef = ref<HTMLElement | null>(null)

function scrollToScanPanel() {
  nextTick(() => {
    scanPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

const modeTabs = computed(() => [
  { id: 'text' as const, label: tm.value.aiDetectHub.tabText },
  { id: 'file' as const, label: tm.value.aiDetectHub.tabFile },
  { id: 'audio' as const, label: tm.value.aiDetectHub.tabAudio },
  { id: 'video' as const, label: tm.value.aiDetectHub.tabVideo },
])

const fileAccept = computed(() => {
  if (detectMode.value === 'file') return '.txt,.md,.text,.srt,.vtt,.csv,.log,.json,.pdf,.doc,.docx'
  if (detectMode.value === 'audio') return 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac'
  return 'video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v'
})

const fileHint = computed(() => {
  if (detectMode.value === 'file') return tm.value.aiDetectHub.fileHint
  if (detectMode.value === 'audio') return tm.value.aiDetectHub.audioHint
  return tm.value.aiDetectHub.videoHint
})

const canSubmit = computed(() => {
  if (detectMode.value === 'text') return pasteText.value.trim().length > 0
  return !!uploadFile.value
})

const humanizeSourceText = computed(() => {
  if (detectMode.value === 'text') return pasteText.value.trim()
  if (scanResult.value?.transcript?.trim()) return scanResult.value.transcript.trim()
  return pasteText.value.trim()
})

const canHumanize = computed(() => humanizeSourceText.value.length > 0 && canGenerate.value)

const humanizeCompareFlat = computed(() => {
  const before = scanBeforeRewrite.value
  const after = scanResult.value
  if (!before || !after || !humanizedText.value) return false
  return Math.abs((after.probability ?? 0) - (before.probability ?? 0)) < 5
})

const humanizeCompare = computed(() => {
  const before = scanBeforeRewrite.value
  const after = scanResult.value
  if (!before || !after || !humanizedText.value) return ''
  if (humanizeCompareFlat.value) {
    return tm.value.aiDetectHub.humanizeCompareNoChange
  }
  return tx(tm.value.aiDetectHub.humanizeCompare, {
    before: before.probability ?? '—',
    after: after.probability ?? '—',
    pplBefore: before.perplexity ?? '—',
    pplAfter: after.perplexity ?? '—',
  })
})

const verdictClass = computed(() => {
  const v = scanResult.value?.verdict
  if (v === 'likely_ai') return 'verdict-ai'
  if (v === 'likely_human') return 'verdict-human'
  return 'verdict-mixed'
})

const verdictLabel = computed(() => {
  const v = scanResult.value?.verdict
  if (v === 'likely_ai') return tm.value.novel.aiDetectVerdictLikelyAi
  if (v === 'likely_human') return tm.value.novel.aiDetectVerdictLikelyHuman
  return tm.value.novel.aiDetectVerdictMixed
})

const confidenceLabel = computed(() => {
  const c = scanResult.value?.confidence
  if (c === 'low') return tm.value.novel.aiDetectConfidenceLow
  if (c === 'high') return tm.value.novel.aiDetectConfidenceHigh
  return tm.value.novel.aiDetectConfidenceMedium
})

function formatNovelWords(n: number) {
  return formatNovelCharCount(n, lang.value)
}

function formatDetectTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(lang.value === 'zh-CN' ? 'zh-CN' : 'en-US')
  } catch {
    return iso
  }
}

function onFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  uploadFile.value = input.files?.[0] || null
}

function aiSuggestionLocation(item: NonNullable<AiDetectHubResult['suggestions']>[number]) {
  return tx(tm.value.novel.aiDetectSuggestionWhere, {
    para: item.paragraph_index ?? 1,
    sent: item.sentence_index ?? 1,
    line: item.line_number ?? 1,
    char: formatNovelWords(item.char_offset ?? 1),
  })
}

function aiSuggestionAdvice(item: NonNullable<AiDetectHubResult['suggestions']>[number]) {
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
      if (isHead && item.count) parts.push(tx(n.aiDetectAdvicePerplexitySample, { n: formatNovelWords(item.count) }))
      if (isHead) parts.push(n.aiDetectAdvicePerplexityHead)
      else parts.push(n.aiDetectAdvicePerplexityBody)
      return parts.join(' ')
    }
    default:
      return n.aiDetectAdviceLexical
  }
}

function aiSignalLabel(key: string) {
  const map: Record<string, string> = {
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

function buildDetectionPayload() {
  if (!scanResult.value) return null
  const r = scanResult.value
  return {
    probability: r.probability,
    verdict: r.verdict,
    signals: r.signals,
    suggestions: r.suggestions?.map(s => ({
      signal_key: s.signal_key,
      excerpt: s.excerpt,
      advice: aiSuggestionAdvice(s),
      match_text: s.match_text,
    })),
  }
}

async function rescanAfterRewrite() {
  if (!guardGenerate()) return
  const text = humanizedText.value.trim()
  if (!text) return
  scanRunning.value = true
  try {
    scanResult.value = await aiDetectAPI.detectText(text)
    scrollToScanPanel()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    scanRunning.value = false
  }
}

async function startHumanizeRewrite() {
  if (!guardGenerate()) return
  const text = humanizeSourceText.value
  if (!text) {
    toast.error(tm.value.aiDetectHub.humanizeNoSource)
    return
  }
  rewriteRunning.value = true
  humanizedText.value = ''
  humanizePipeline.value = ''
  scanBeforeRewrite.value = scanResult.value ? { ...scanResult.value } : null
  try {
    const res = await aiDetectAPI.humanize({
      text,
      detection: buildDetectionPayload(),
    })
    humanizedText.value = res.content || ''
    humanizedCharCount.value = res.char_count || 0
    humanizePipeline.value = res.pipeline || ''
    toast.success(tm.value.aiDetectHub.humanizeDone)
    nextTick(() => humanizeRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    await rescanAfterRewrite()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    rewriteRunning.value = false
  }
}

async function copyHumanized() {
  if (!humanizedText.value || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(humanizedText.value)
    toast.success(tm.value.aiDetectHub.humanizeCopied)
  } catch {
    toast.error(tm.value.aiDetectHub.humanizeCopy)
  }
}

function applyHumanized() {
  if (!humanizedText.value) return
  pasteText.value = humanizedText.value
  toast.success(tm.value.aiDetectHub.humanizeApplied)
}

async function startAiScan() {
  if (!guardGenerate()) return
  scanRunning.value = true
  scanResult.value = null
  scanBeforeRewrite.value = null
  humanizedText.value = ''
  humanizePipeline.value = ''
  scrollToScanPanel()
  try {
    if (detectMode.value === 'text') {
      scanResult.value = await aiDetectAPI.detectText(pasteText.value)
    } else if (detectMode.value === 'file' && uploadFile.value) {
      scanResult.value = await aiDetectAPI.detectFile(uploadFile.value)
    } else if (detectMode.value === 'audio' && uploadFile.value) {
      scanResult.value = await aiDetectAPI.detectAudio(uploadFile.value)
    } else if (detectMode.value === 'video' && uploadFile.value) {
      scanResult.value = await aiDetectAPI.detectVideo(uploadFile.value)
    }
    scrollToScanPanel()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    scanRunning.value = false
  }
}

watch(detectMode, () => {
  uploadFile.value = null
  humanizedText.value = ''
  humanizePipeline.value = ''
  scanBeforeRewrite.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
})

onMounted(() => init())
</script>

<style scoped>
.page {
  padding: 24px 32px 40px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
  animation: fadeUp 0.35s var(--ease-out) both;
}
.page-head { margin-bottom: 20px; }
.page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
}
.page-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.55;
  max-width: 900px;
}
.credits-bar {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: rgba(201, 122, 46, 0.1);
  color: var(--warn, #c97a2e);
  font-size: 13px;
}
.hub-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hub-input, .hub-result {
  padding: 24px;
  width: 100%;
}
.hub-input {
  min-height: min(68vh, 640px);
  display: flex;
  flex-direction: column;
}
.hub-input.has-result {
  min-height: auto;
}
.hub-input.has-result .hub-textarea,
.hub-input.has-result .file-drop {
  min-height: 220px;
  flex: none;
}
.mode-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.mode-tab {
  height: 34px;
  padding: 0 14px;
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
.input-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.field-label { font-size: 13px; font-weight: 700; color: var(--text-1); }
.field-hint { margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.5; }
.hub-textarea {
  flex: 1;
  min-height: min(52vh, 480px);
  width: 100%;
  resize: vertical;
  line-height: 1.75;
  font-size: 15px;
  padding: 16px 18px;
  font-family: inherit;
}
.file-native { display: none; }
.file-drop {
  flex: 1;
  min-height: min(52vh, 480px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 24px;
  border: 1px dashed var(--border-strong, var(--border));
  border-radius: var(--radius-lg);
  background: var(--bg-0);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
}
.file-drop:hover {
  border-color: rgba(76, 125, 255, 0.45);
  background: var(--accent-bg);
}
.file-drop-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-text);
}
.file-drop-name {
  margin: 0;
  font-size: 14px;
  color: var(--text-1);
  word-break: break-all;
}
.file-drop-hint {
  margin: 0;
  max-width: 520px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.55;
}
.hub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.hub-action-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}
.hub-actions .btn-primary {
  min-width: 140px;
  height: 40px;
  font-size: 14px;
}
.hub-humanize {
  padding: 18px 20px;
}
.hub-humanize-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.hub-humanize-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.hub-humanize-text {
  width: 100%;
  min-height: 280px;
  line-height: 1.75;
  font-size: 15px;
  resize: vertical;
}
.hub-loading {
  padding: 40px 16px;
  text-align: center;
  color: var(--accent-text);
  font-size: 13px;
}
.hub-pipeline {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--accent-bg);
  font-size: 12px;
  line-height: 1.5;
  color: var(--accent-text);
}
.hub-compare {
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--success-bg, rgba(34, 197, 94, 0.12));
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-1);
}
.hub-compare-flat {
  background: var(--warn-bg, rgba(245, 158, 11, 0.12));
}
.hub-perplexity-note {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}
.hub-note, .hub-source {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}
.transcript-box {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--bg-0);
}
.transcript-box summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.transcript-pre {
  margin: 10px 0 0;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
.ai-detect-body { display: flex; flex-direction: column; gap: 14px; }
.ai-detect-metrics { display: flex; gap: 12px; flex-wrap: wrap; }
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
}
.ai-detect-score {
  text-align: center;
  padding: 18px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-1, var(--bg-2));
}
.ai-detect-score.verdict-ai {
  background: rgba(220, 90, 90, 0.08);
  border-color: rgba(220, 90, 90, 0.2);
}
.ai-detect-score.verdict-mixed {
  background: rgba(201, 122, 46, 0.08);
  border-color: rgba(201, 122, 46, 0.2);
}
.ai-detect-score.verdict-human {
  background: rgba(56, 142, 60, 0.08);
  border-color: rgba(56, 142, 60, 0.2);
}
.ai-detect-score-label { margin: 0; font-size: 12px; color: var(--text-3); }
.ai-detect-score-value {
  margin: 6px 0 0;
  font-size: 36px;
  font-weight: 800;
  font-family: var(--font-mono);
}
.ai-detect-verdict { margin: 4px 0 0; font-size: 14px; font-weight: 700; }
.ai-detect-confidence { margin: 2px 0 0; font-size: 12px; color: var(--text-3); }
.ai-detect-time { margin: 0; font-size: 11px; color: var(--text-3); }
.ai-detect-signals-title, .ai-detect-suggestions-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.ai-signal-list, .ai-suggestion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-signal-item {
  display: grid;
  grid-template-columns: 1fr 100px 32px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.ai-signal-label { color: var(--text-2); }
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
.ai-suggestion-item {
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-0);
}
.ai-suggestion-head {
  display: flex;
  flex-wrap: wrap;
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
.ai-suggestion-signal { font-size: 11px; color: var(--text-3); }
.ai-suggestion-match { margin: 0 0 6px; font-size: 12px; color: var(--text-2); }
.ai-suggestion-mark {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(220, 90, 90, 0.12);
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
}
.hub-result {
  scroll-margin-top: 16px;
}
</style>
