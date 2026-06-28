<template>
  <div v-if="step === 0" class="wizard-pane">
    <div class="wizard-bar">
      <div class="bar-start">
        <div class="wizard-step">
          <span class="wizard-num">01</span>
          <span class="wizard-name">原始内容</span>
        </div>
      </div>
      <div class="bar-end">
        <button class="btn btn-sm" :disabled="!episodeId" @click="rawGenOpen = true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          AI 生成初稿
        </button>
        <button class="btn btn-sm" :disabled="!episodeId" @click="openPickNovelModal">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          选择已有小说
        </button>
        <span v-if="sourceDraftGlyphCount" class="glyph-tally">{{ sourceDraftGlyphCount }} 字</span>
        <button class="btn btn-sm" @click="$emit('save-raw')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          保存
        </button>
      </div>
    </div>
    <div class="url-fetch-row">
      <input
        v-model="rawUrl"
        class="url-fetch-input"
        type="url"
        placeholder="粘贴网页链接，提取正文到原始内容…"
        :disabled="rawUrlFetching"
        @keydown.enter.prevent="$emit('import-url')"
      />
      <button class="btn btn-sm" :disabled="rawUrlFetching || !rawUrl.trim()" @click="$emit('import-url')">
        <Loader2 v-if="rawUrlFetching" :size="11" class="animate-spin" />
        <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        从链接提取
      </button>
    </div>
    <p class="url-fetch-hint">支持 http/https，将自动提取网页正文或下载纯文本（与模板库链接导入相同）</p>
    <textarea v-model="rawDraft" class="stretch-input" placeholder="粘贴小说原文、故事大纲或分镜描述..." />

    <Teleport to="body">
      <div v-if="rawGenOpen" class="overlay" @click.self="rawGenOpen = false">
        <form class="card raw-gen-modal" @submit.prevent="submitRawGen">
          <div class="raw-gen-modal-head">
            <div>
              <h2 class="raw-gen-modal-title">按描述生成剧本初稿</h2>
              <p class="raw-gen-modal-desc">
                填写剧情或创意说明（不是图片/视频提示词）。仅当项目中还有其它集且那些集里已有正文时，才会把上一集结尾、更早各集的短摘要拿来作接戏参考；整部只有一集、或前面集尚未写正文时，不会拿「前几集」硬凑，只按您的说明、项目简介以及（若已创建）角色表来生成。结果填入上方「原始内容」，生成后请点「保存」。
              </p>
            </div>
            <button type="button" class="modal-close-btn" aria-label="关闭" @click="rawGenOpen = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <label class="raw-gen-field">
            <span class="raw-gen-label">剧情 / 创意说明</span>
            <textarea
              v-model="rawGenPrompt"
              class="raw-gen-textarea"
              rows="6"
              maxlength="4000"
              placeholder="例如：都市悬疑，女主是实习律师，发现上司伪造证据；基调冷峻，单集结尾留钩子。"
              :disabled="rawGenBusy"
            />
          </label>
          <div class="raw-gen-modal-actions">
            <button type="button" class="btn" :disabled="rawGenBusy" @click="rawGenOpen = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="rawGenBusy || !rawGenPrompt.trim()">
              <Loader2 v-if="rawGenBusy" :size="12" class="animate-spin" />
              {{ rawGenBusy ? '正在写稿…' : '生成并填入正文' }}
            </button>
          </div>
        </form>
      </div>

      <div v-if="pickNovelOpen" class="overlay" @click.self="pickNovelOpen = false">
        <div class="card pick-novel-modal">
          <div class="raw-gen-modal-head">
            <div>
              <h2 class="raw-gen-modal-title">从小说项目导入</h2>
              <p class="raw-gen-modal-desc">将小说章节正文填入本集「原始内容」。管理员可选全站小说；其他用户可选自己的小说或模板库小说。</p>
            </div>
            <button type="button" class="modal-close-btn" aria-label="关闭" @click="pickNovelOpen = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="pick-novel-search-row">
            <input
              v-model="pickNovelKeyword"
              class="pick-novel-search"
              type="search"
              placeholder="搜索小说标题…"
              @keydown.enter.prevent="loadNovelImportSources"
            />
            <button type="button" class="btn btn-sm" :disabled="pickNovelLoading" @click="loadNovelImportSources">搜索</button>
          </div>

          <div class="pick-novel-body">
            <div class="pick-novel-list">
              <div v-if="pickNovelLoading" class="pick-novel-empty">加载中…</div>
              <div v-else-if="!pickNovelItems.length" class="pick-novel-empty">没有可导入的小说项目</div>
              <button
                v-for="item in pickNovelItems"
                v-else
                :key="item.id"
                type="button"
                :class="['pick-novel-item', { active: selectedNovelId === item.id }]"
                @click="selectNovelImportSource(item.id)"
              >
                <div class="pick-novel-item-title">{{ item.title }}</div>
                <div class="pick-novel-item-meta">
                  <span class="tag">{{ novelSourceLabel(item.source) }}</span>
                  <span>{{ item.chapter_count }} 章 · 已写 {{ item.filled_chapter_count }} 章</span>
                </div>
              </button>
            </div>

            <div v-if="selectedNovelId" class="pick-novel-detail">
              <div class="pick-novel-mode-row">
                <span class="raw-gen-label">导入范围</span>
                <label class="pick-novel-mode">
                  <input v-model="pickNovelImportMode" type="radio" value="chapter" />
                  指定章节
                </label>
                <label class="pick-novel-mode">
                  <input v-model="pickNovelImportMode" type="radio" value="full" />
                  全书合并
                </label>
              </div>

              <label v-if="pickNovelImportMode === 'chapter'" class="raw-gen-field">
                <span class="raw-gen-label">选择章节</span>
                <BaseSelect
                  v-model="selectedChapterNumber"
                  :options="pickNovelChapterOptions"
                  placeholder="选择章节"
                  searchable
                  style="width:100%"
                />
              </label>
            </div>
          </div>

          <div class="raw-gen-modal-actions">
            <button type="button" class="btn" :disabled="pickNovelImporting" @click="pickNovelOpen = false">取消</button>
            <button type="button" class="btn btn-primary" :disabled="pickNovelImporting || !selectedNovelId" @click="importNovelIntoRaw">
              <Loader2 v-if="pickNovelImporting" :size="12" class="animate-spin" />
              {{ pickNovelImporting ? '导入中…' : '导入正文' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>

  <div v-else-if="step === 1" class="wizard-pane">
    <div class="wizard-bar">
      <div class="bar-start">
        <div class="wizard-step">
          <span class="wizard-num">02</span>
          <span class="wizard-name">AI改写</span>
        </div>
      </div>
      <div class="bar-end">
        <span v-if="screenplayDraftGlyphCount" class="glyph-tally">{{ screenplayDraftGlyphCount }} 字</span>
        <button v-if="persistedSourceBody" class="btn btn-sm" @click="$emit('skip-rewrite')">跳过改写</button>
        <button v-if="persistedScreenplayBody" class="btn btn-sm" :disabled="agentBusy" @click="$emit('rewrite')">重新改写</button>
      </div>
    </div>
    <div v-if="!persistedScreenplayBody && !agentBusy" class="wizard-empty">
      <div class="vacant-art">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      </div>
      <div class="vacant-title">AI 改写为格式化剧本</div>
      <div class="vacant-desc">你可以先用AI把原始内容整理成格式化剧本，也可以跳过这一步，直接使用原始内容继续提取角色与场景。</div>
      <div class="wizard-empty-actions">
        <button class="btn btn-primary" @click="$emit('rewrite')">开始改写</button>
        <button class="btn" @click="$emit('skip-rewrite')">跳过改写</button>
      </div>
    </div>
    <div v-else-if="agentBusy && agentBusyType === 'drama_script_formatter'" class="wizard-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="wait-msg">正在改写剧本...</div>
    </div>
    <textarea v-else v-model="formattedScript" class="stretch-input" placeholder="格式化剧本内容..." />
  </div>

  <div v-else-if="step === 2" class="wizard-pane">
    <div class="wizard-bar">
      <div class="bar-start">
        <div class="wizard-step">
          <span class="wizard-num">03</span>
          <span class="wizard-name">提取角色与场景</span>
        </div>
      </div>
      <div class="bar-end">
        <span v-if="castList.length" class="glyph-tally">{{ castList.length }} 角色 · {{ locations.length }} 场景</span>
        <button v-if="castList.length" class="btn btn-sm" :disabled="agentBusy" @click="$emit('extract')">重新提取</button>
      </div>
    </div>
    <div v-if="!castList.length && !agentBusy" class="wizard-empty">
      <div class="vacant-art">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div class="vacant-title">从剧本提取角色与场景</div>
      <div class="vacant-desc">AI 自动分析剧本，提取角色信息和场景列表，与项目已有数据智能去重合并</div>
      <button class="btn btn-primary" @click="$emit('extract')">开始提取</button>
    </div>
    <div v-else-if="agentBusy && agentBusyType === 'drama_cast_scene_extract'" class="wizard-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="wait-msg">正在提取角色和场景...</div>
    </div>
    <div v-else class="parse-stage">
      <aside class="card parse-summary">
        <div class="parse-summary-kicker">Extraction Board</div>
        <div class="parse-summary-title">角色与场景结果</div>
        <div class="parse-summary-desc">从剧本里提取出的角色和场景已经入库。这里先确认命名、定位和描述是否可直接进入后续制作。</div>
        <div class="parse-summary-stats">
          <div class="parse-summary-stat"><span>角色</span><strong>{{ castList.length }}</strong></div>
          <div class="parse-summary-stat"><span>场景</span><strong>{{ locations.length }}</strong></div>
        </div>
        <div class="parse-summary-note">如果角色描述过于简短，后续分配音色和生成形象时建议先补充人物特征。</div>
      </aside>
      <div class="card parse-card">
        <div class="parse-card-head">
          <span>角色</span>
          <span class="tag tag-accent">{{ castList.length }}</span>
        </div>
        <div class="parse-list">
          <div v-for="c in castList" :key="c.id" class="parse-row">
            <div class="cast-avatar">{{ c.name?.[0] || '?' }}</div>
            <div class="parse-info">
              <div class="parse-name-row">
                <div class="parse-name">{{ c.name }}</div>
                <span class="tag">{{ c.role || '角色' }}</span>
              </div>
              <div class="parse-meta wrap">{{ c.description || c.appearance || c.personality || '暂无描述' }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="locations.length" class="card parse-card">
        <div class="parse-card-head">
          <span>场景</span>
          <span class="tag tag-accent">{{ locations.length }}</span>
        </div>
        <div class="parse-list">
          <div v-for="s in locations" :key="s.id" class="parse-row">
            <div class="set-marker">📍</div>
            <div class="parse-info">
              <div class="parse-name-row">
                <div class="parse-name">{{ s.location }}</div>
                <span v-if="s.time" class="tag">{{ s.time }}</span>
              </div>
              <div class="parse-meta wrap">{{ s.description || s.time || '等待补充场景描述' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="step === 3" class="wizard-pane">
    <div class="wizard-bar">
      <div class="bar-start">
        <div class="wizard-step">
          <span class="wizard-num">04</span>
          <span class="wizard-name">分配音色</span>
        </div>
      </div>
      <div class="bar-end">
        <span v-if="assignedVoiceCastCount" class="glyph-tally">{{ assignedVoiceCastCount }}/{{ castList.length }} 已分配</span>
        <span v-if="castPreviewReadyCount" class="glyph-tally">{{ castPreviewReadyCount }}/{{ assignedVoiceCastCount }} 试听文件</span>
        <button v-if="assignedVoiceCastCount" class="btn btn-sm" :disabled="agentBusy" @click="$emit('assign-voice')">重新分配</button>
        <button v-if="assignedVoiceCastCount" class="btn btn-sm" @click="$emit('batch-previews')">生成试听文件</button>
      </div>
    </div>
    <div v-if="!assignedVoiceCastCount && !agentBusy" class="wizard-empty">
      <div class="vacant-art">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
      </div>
      <div class="vacant-title">为角色分配合适的音色</div>
      <div class="vacant-desc">AI 根据角色特征自动分配最匹配的 TTS 音色</div>
      <button class="btn btn-primary" @click="$emit('assign-voice')">AI 自动分配</button>
    </div>
    <div v-else-if="agentBusy && agentBusyType === 'drama_voice_assign'" class="wizard-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="wait-msg">正在分配音色...</div>
    </div>
    <div v-else class="tts-stage">
      <aside class="card tts-stage-panel">
        <div class="tts-stage-kicker">Voice Casting</div>
        <div class="tts-stage-title">角色声音分配台</div>
        <div class="tts-stage-desc">先为每个角色选择合适音色，再生成试听。</div>
        <div class="tts-stage-stats">
          <div class="tts-stage-stat"><span class="tts-stage-stat-label">已分配</span><strong>{{ assignedVoiceCastCount }}/{{ castList.length }}</strong></div>
          <div class="tts-stage-stat"><span class="tts-stage-stat-label">试听文件</span><strong>{{ castPreviewReadyCount }}/{{ assignedVoiceCastCount }}</strong></div>
        </div>
        <div class="tts-catalog-meta">
          <span>音色库</span>
          <span>{{ voiceCatalogEntries.length }} 条</span>
        </div>
        <div class="tts-catalog">
          <div v-for="voice in voiceCatalogEntries" :key="voice.id" class="tts-catalog-item">
            <div class="tts-catalog-head">
              <span class="tts-catalog-name">{{ voice.label }}</span>
              <span class="tag">{{ voice.gender }}</span>
            </div>
            <div class="tts-catalog-traits">{{ voice.traits }}</div>
            <div class="tts-catalog-fit">{{ voice.suitable }}</div>
          </div>
        </div>
      </aside>
      <div class="tts-grid">
        <div v-for="c in castList" :key="c.id" class="card tts-card">
          <div class="tts-card-head">
            <div class="tts-char">
              <div class="cast-avatar lg">{{ c.name?.[0] || '?' }}</div>
              <div class="tts-name">
                <div class="tts-name-row">
                  <div class="parse-name">{{ c.name }}</div>
                  <span class="tag" :class="(c.voice_id || c.voiceId) ? 'tag-success' : ''">{{ (c.voice_id || c.voiceId) ? '已分配' : '待分配' }}</span>
                </div>
                <div class="parse-meta">{{ c.role || '角色' }}</div>
              </div>
            </div>
          </div>
          <div class="tts-card-copy">
            <div class="tts-card-text">{{ c.description || c.personality || c.appearance || '暂无角色描述' }}</div>
          </div>
          <div class="tts-select-block">
            <span class="tts-block-label">选择音色</span>
            <BaseSelect
              :model-value="c.voice_id || c.voiceId || ''"
              :options="voiceProfileSelectOptions"
              placeholder="选择音色"
              searchable
              style="width:100%"
              @update:model-value="$emit('map-voice', c.id, $event)"
            />
          </div>
          <div v-if="lookupVoiceCatalogRow?.(c.voice_id || c.voiceId)" class="tts-profile-card">
            <div class="tts-profile-head">
              <span class="tts-profile-name">{{ lookupVoiceCatalogRow(c.voice_id || c.voiceId)?.label }}</span>
              <span class="tag">{{ lookupVoiceCatalogRow(c.voice_id || c.voiceId)?.gender }}</span>
            </div>
            <div class="tts-profile-traits">{{ lookupVoiceCatalogRow(c.voice_id || c.voiceId)?.traits }}</div>
            <div class="tts-profile-fit">{{ lookupVoiceCatalogRow(c.voice_id || c.voiceId)?.suitable }}</div>
          </div>
          <div class="tts-actions-row">
            <button class="btn btn-sm" :disabled="!(c.voice_id || c.voiceId)" @click="$emit('preview-character', c.id)">
              {{ (c.voice_preview_url || c.voicePreviewUrl) ? '重新试听' : '生成试听' }}
            </button>
          </div>
          <div v-if="c.voice_preview_url || c.voicePreviewUrl" class="tts-player">
            <audio :src="'/' + (c.voice_preview_url || c.voicePreviewUrl)" controls preload="none" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '~/components/base-select.vue'
import { episodeAPI, novelAPI } from '~/composables/use-api'
import { toast } from 'vue-sonner'

const props = defineProps({
  step: { type: Number, required: true },
  episodeId: { type: Number, default: 0 },
  episodeNumber: { type: Number, default: 1 },
  sourceDraftGlyphCount: { type: Number, default: 0 },
  screenplayDraftGlyphCount: { type: Number, default: 0 },
  persistedSourceBody: { type: String, default: '' },
  persistedScreenplayBody: { type: String, default: '' },
  castList: { type: Array, default: () => [] },
  locations: { type: Array, default: () => [] },
  assignedVoiceCastCount: { type: Number, default: 0 },
  castPreviewReadyCount: { type: Number, default: 0 },
  voiceProfileSelectOptions: { type: Array, default: () => [] },
  voiceCatalogEntries: { type: Array, default: () => [] },
  lookupVoiceCatalogRow: { type: Function, default: null },
  agentBusy: { type: Boolean, default: false },
  agentBusyType: { type: String, default: '' },
  rawUrlFetching: { type: Boolean, default: false },
})

const rawDraft = defineModel('rawDraft', { type: String, default: '' })
const formattedScript = defineModel('formattedScript', { type: String, default: '' })
const rawUrl = defineModel('rawUrl', { type: String, default: '' })

const rawGenOpen = ref(false)
const rawGenPrompt = ref('')
const rawGenBusy = ref(false)

const pickNovelOpen = ref(false)
const pickNovelKeyword = ref('')
const pickNovelItems = ref([])
const pickNovelLoading = ref(false)
const selectedNovelId = ref(null)
const pickNovelChapters = ref([])
const pickNovelImportMode = ref('chapter')
const selectedChapterNumber = ref(null)
const pickNovelImporting = ref(false)

const pickNovelChapterOptions = computed(() =>
  pickNovelChapters.value.map(ch => ({
    value: ch.chapter_number,
    label: `第 ${ch.chapter_number} 章 · ${ch.title || '未命名'}${ch.has_content ? (ch.char_count ? ` · ${ch.char_count} 字` : '') : '（无正文）'}`,
  })),
)

function novelSourceLabel(source) {
  if (source === 'template') return '模板'
  if (source === 'platform') return '全站'
  return '我的'
}

function confirmReplaceRawDraft() {
  if (!rawDraft.value.trim()) return true
  return confirm('将替换当前编辑区中的原始内容，是否继续？')
}

async function submitRawGen() {
  const prompt = rawGenPrompt.value.trim()
  if (!prompt) return
  if (!props.episodeId) {
    toast.warning('分集尚未加载')
    return
  }
  if (!confirmReplaceRawDraft()) return
  rawGenBusy.value = true
  try {
    const res = await episodeAPI.generateContent(props.episodeId, { prompt })
    rawDraft.value = res.content || ''
    rawGenOpen.value = false
    rawGenPrompt.value = ''
    toast.success('初稿已填入「原始内容」，请保存')
  } catch (e) {
    toast.error(e?.message || '生成失败')
  } finally {
    rawGenBusy.value = false
  }
}

async function loadNovelImportSources() {
  pickNovelLoading.value = true
  try {
    const res = await novelAPI.listImportSources({
      keyword: pickNovelKeyword.value.trim() || undefined,
    })
    pickNovelItems.value = res.items || []
  } catch (e) {
    toast.error(e?.message || '加载小说列表失败')
    pickNovelItems.value = []
  } finally {
    pickNovelLoading.value = false
  }
}

function openPickNovelModal() {
  pickNovelOpen.value = true
}

async function selectNovelImportSource(id) {
  selectedNovelId.value = id
  pickNovelChapters.value = []
  selectedChapterNumber.value = null
  try {
    const res = await novelAPI.listImportChapters(id)
    pickNovelChapters.value = res.chapters || []
    const byEpisode = pickNovelChapters.value.find(
      ch => ch.chapter_number === props.episodeNumber && ch.has_content,
    )
    const firstFilled = pickNovelChapters.value.find(ch => ch.has_content)
    selectedChapterNumber.value = byEpisode?.chapter_number ?? firstFilled?.chapter_number ?? null
  } catch (e) {
    toast.error(e?.message || '加载章节失败')
  }
}

async function importNovelIntoRaw() {
  if (!selectedNovelId.value) {
    toast.warning('请先选择小说项目')
    return
  }
  if (pickNovelImportMode.value === 'chapter') {
    const ch = pickNovelChapters.value.find(c => c.chapter_number === selectedChapterNumber.value)
    if (!ch?.has_content) {
      toast.warning('请选择有正文的章节')
      return
    }
  }
  if (!confirmReplaceRawDraft()) return
  pickNovelImporting.value = true
  try {
    const res = await novelAPI.getImportContent(selectedNovelId.value, {
      episode_number: props.episodeNumber,
      mode: pickNovelImportMode.value,
    })
    rawDraft.value = res.content || ''
    pickNovelOpen.value = false
    toast.success('已导入小说正文，请保存')
  } catch (e) {
    toast.error(e?.message || '导入失败')
  } finally {
    pickNovelImporting.value = false
  }
}

watch(pickNovelOpen, (open) => {
  if (!open) return
  pickNovelKeyword.value = ''
  selectedNovelId.value = null
  pickNovelChapters.value = []
  pickNovelImportMode.value = 'chapter'
  selectedChapterNumber.value = null
  loadNovelImportSources()
})

defineEmits([
  'save-raw',
  'import-url',
  'skip-rewrite',
  'rewrite',
  'extract',
  'assign-voice',
  'batch-previews',
  'map-voice',
  'preview-character',
])
</script>

<style scoped>
.wizard-bar { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid rgba(27, 41, 64, 0.08); background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); flex-shrink: 0; }
.bar-start, .bar-end { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bar-start { flex: 1; }
.wizard-step { display: flex; align-items: center; gap: 8px; }
.wizard-num { width: 26px; height: 26px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: rgba(19, 51, 121, 0.08); font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); }
.wizard-name { font-size: 13px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.glyph-tally { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }
.wizard-pane { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.url-fetch-row { display: flex; align-items: center; gap: 10px; padding: 12px 16px 0; border-bottom: 1px solid rgba(27, 41, 64, 0.06); background: rgba(255, 255, 255, 0.35); }
.url-fetch-input { flex: 1; min-width: 0; height: 34px; padding: 0 12px; border: 1px solid rgba(27, 41, 64, 0.12); border-radius: 8px; font-size: 12.5px; background: rgba(255, 255, 255, 0.85); outline: none; }
.url-fetch-hint { margin: 0; padding: 6px 16px 10px; font-size: 11px; color: var(--text-3); border-bottom: 1px solid rgba(27, 41, 64, 0.06); }
.stretch-input { flex: 1; border: none; border-radius: 0; padding: 26px 28px; font-size: 13.5px; line-height: 1.9; resize: none; outline: none; background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12)); color: var(--text-0); }
.wizard-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; min-height: 300px; gap: 10px; padding: 46px; }
.vacant-art { width: 72px; height: 72px; border-radius: 22px; background: rgba(255,255,255,0.8); color: var(--accent); border: 1px solid rgba(27, 41, 64, 0.08); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
.vacant-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.vacant-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.wizard-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
.wizard-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 12px; }
.wait-msg { font-size: 13px; color: var(--text-2); }
.parse-stage { flex: 1; min-height: 0; overflow: hidden; padding: 12px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.parse-summary { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.parse-summary-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.parse-summary-title { font-size: 20px; font-family: var(--font-display); color: var(--text-0); }
.parse-summary-desc, .parse-summary-note { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.parse-summary-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.parse-summary-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); }
.parse-summary-stat span { font-size: 10px; color: var(--text-3); }
.parse-summary-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.parse-card { overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
.parse-card-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); font-weight: 600; }
.parse-list { padding: 8px 14px; flex: 1; min-height: 0; overflow-y: auto; }
.parse-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.parse-row + .parse-row { border-top: 1px solid var(--border); }
.cast-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent-bg); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.cast-avatar.lg { width: 38px; height: 38px; font-size: 16px; }
.set-marker { width: 30px; height: 30px; border-radius: 6px; background: var(--bg-2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.parse-info { min-width: 0; }
.parse-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.parse-name { font-size: 13px; font-weight: 600; }
.parse-meta { font-size: 11px; color: var(--text-3); }
.parse-meta.wrap { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tts-stage { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.tts-stage-panel { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.tts-stage-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.tts-stage-title { font-size: 20px; font-family: var(--font-display); color: var(--text-0); }
.tts-stage-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.tts-stage-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.tts-stage-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); }
.tts-stage-stat-label { font-size: 10px; color: var(--text-3); }
.tts-catalog-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.tts-catalog { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 280px; }
.tts-catalog-item { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); }
.tts-catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tts-catalog-name { font-size: 13px; font-weight: 700; color: var(--text-0); }
.tts-catalog-traits { font-size: 11px; color: var(--text-1); }
.tts-catalog-fit { font-size: 10px; color: var(--text-3); line-height: 1.5; }
.tts-profile-card { padding: 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(19, 51, 121, 0.08), rgba(255,255,255,0.78)); border: 1px solid rgba(19, 51, 121, 0.1); }
.tts-profile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tts-profile-name { font-size: 13px; font-weight: 700; color: var(--accent-text); }
.tts-profile-traits { font-size: 11px; color: var(--text-1); }
.tts-profile-fit { font-size: 10px; color: var(--text-2); line-height: 1.5; }
.tts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-content: start; }
.tts-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; border-radius: 22px; }
.tts-char { display: flex; align-items: center; gap: 10px; }
.tts-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tts-card-text { font-size: 12px; line-height: 1.7; color: var(--text-2); }
.tts-select-block { display: flex; flex-direction: column; gap: 6px; }
.tts-block-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.tts-actions-row { display: flex; align-items: center; gap: 8px; }
.tts-player audio { width: 100%; height: 30px; }
@media (max-width: 960px) {
  .parse-stage, .tts-stage { grid-template-columns: 1fr; }
}
.raw-gen-modal, .pick-novel-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: min(86vh, 720px);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
}
.pick-novel-modal { width: min(720px, calc(100vw - 32px)); }
.raw-gen-modal-head { display: flex; align-items: flex-start; gap: 12px; }
.raw-gen-modal-title { margin: 0; font-size: 18px; font-family: var(--font-display); color: var(--text-0); }
.raw-gen-modal-desc { margin: 6px 0 0; font-size: 12px; line-height: 1.65; color: var(--text-2); }
.raw-gen-field { display: flex; flex-direction: column; gap: 6px; }
.raw-gen-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-3); }
.raw-gen-textarea {
  width: 100%;
  min-height: 132px;
  padding: 12px 14px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  background: rgba(255, 255, 255, 0.88);
}
.raw-gen-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.pick-novel-search-row { display: flex; gap: 8px; }
.pick-novel-search {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 8px;
  font-size: 12.5px;
  background: rgba(255, 255, 255, 0.85);
  outline: none;
}
.pick-novel-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 12px;
  min-height: 240px;
  max-height: 360px;
  overflow: hidden;
}
.pick-novel-list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.45);
}
.pick-novel-item {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: none;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: transparent;
  cursor: pointer;
}
.pick-novel-item:last-child { border-bottom: none; }
.pick-novel-item:hover { background: rgba(19, 51, 121, 0.04); }
.pick-novel-item.active { background: rgba(19, 51, 121, 0.08); }
.pick-novel-item-title { font-size: 13px; font-weight: 600; color: var(--text-0); }
.pick-novel-item-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 11px; color: var(--text-3); }
.pick-novel-empty { padding: 24px 14px; font-size: 12px; color: var(--text-3); text-align: center; }
.pick-novel-detail {
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.56);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pick-novel-mode-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.pick-novel-mode { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-1); cursor: pointer; }
@media (max-width: 720px) {
  .pick-novel-body { grid-template-columns: 1fr; max-height: none; }
}
</style>
