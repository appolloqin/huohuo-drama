import { navigateTo } from '#app'
import { MESSAGES } from '~/i18n/messages'
import { LANG_STORAGE_KEY, detectDefaultLang, isLang, type Lang } from '~/i18n/constants'

const API_ROOT = '/api/v1'

type ApiEnvelope = { code?: number; message?: string; data?: unknown }

function resolveLang(): Lang {
  if (import.meta.client) {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (stored && isLang(stored)) return stored
  }
  return detectDefaultLang()
}

function sessionExpiredMessage(): string {
  const lang = resolveLang()
  return MESSAGES[lang]?.errors?.sessionExpired ?? MESSAGES['zh-CN'].errors.sessionExpired
}

function redactRequestBody(path: string, body: unknown) {
  if (!body) return body
  if (path.includes('/auth/login') || path.includes('/auth/register')) return '[redacted]'
  return body
}

function authToken() {
  return useState<string | null>('huohuo_token')
}

function authUser() {
  return useState<{ username: string; role: string; credits: number } | null>('huohuo_user')
}

function bearerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra }
  const token = authToken().value
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function invalidateSession(path: string, message?: string): Promise<never> {
  if (import.meta.client) {
    authToken().value = null
    authUser().value = null
    localStorage.removeItem('huohuo_token')
    if (!path.startsWith('/auth/')) await navigateTo('/login')
  }
  throw new Error(message || sessionExpiredMessage())
}

async function jsonFetch<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers = bearerHeaders({ 'Content-Type': 'application/json' })
  const opts: RequestInit = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(
    `%c[API] %c${method} %c${path}`,
    'color:#888',
    'color:#4fc3f7;font-weight:bold',
    'color:#ccc',
    redactRequestBody(path, body) || '',
  )

  try {
    const resp = await fetch(`${API_ROOT}${path}`, opts)
    const json = await resp.json().catch(() => ({} as ApiEnvelope))
    const ms = Math.round(performance.now() - start)

    if (resp.status === 401) {
      console.log(`%c[API] %c${method} ${path} %c401 %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888')
      return invalidateSession(path, json.message)
    }

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(json.message || `${resp.status}`)
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

// ── JSON 传输层 ─────────────────────────────────────────────

export const api = {
  get: <T = any>(p: string) => jsonFetch<T>('GET', p),
  post: <T = any>(p: string, b?: any) => jsonFetch<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => jsonFetch<T>('PUT', p, b),
  patch: <T = any>(p: string, b?: any) => jsonFetch<T>('PATCH', p, b),
  del: <T = any>(p: string) => jsonFetch<T>('DELETE', p),
}

type NovelStreamEvent = { text?: string; started?: boolean; done?: boolean; error?: string; content?: string }

export type NovelAiDetection = {
  probability: number
  confidence: 'low' | 'medium' | 'high'
  verdict: 'likely_human' | 'mixed' | 'likely_ai'
  char_count: number
  content_hash: string
  detected_at: string
  is_stale?: boolean
  method?: string
  elapsed_ms?: number
  perplexity?: number
  mean_logprob?: number
  analyzed_tokens?: number
  sampled_char_count?: number
  fallback_reason?: string
  signals: Array<{ key: string; score: number }>
  suggestions?: Array<{
    kind: string
    signal_key: string
    excerpt: string
    char_start?: number
    char_end?: number
    line_number?: number
    paragraph_index?: number
    sentence_index?: number
    char_offset?: number
    match_text?: string
    phrase?: string
    count?: number
    bigram?: string
  }>
}

export type ContinuityBlockingItem = {
  layer: 'hard' | 'model'
  rule: string
  label: string
  message: string
}

export type ContinuityCheckResult = {
  passed: boolean
  score: number
  conflicts: string[]
  blocking_items: ContinuityBlockingItem[]
  summary: string
  checked_at?: string
  content_hash?: string
}

export type AiDetectHubResult = NovelAiDetection & {
  source_type: 'text' | 'file' | 'audio' | 'video'
  source_name?: string
  transcript?: string
  transcript_source?: 'subtitle' | 'asr' | 'file' | 'input'
  analysis_note?: string
  pipeline?: string
}

async function uploadMultipart<T>(path: string, formData: FormData): Promise<T> {
  const resp = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: bearerHeaders(),
    body: formData,
  })
  const json = await resp.json().catch(() => ({} as ApiEnvelope))
  if (resp.status === 401) return invalidateSession(path, json.message)
  if (!resp.ok || (json.code && json.code >= 400)) {
    throw new Error(json.message || `${resp.status}`)
  }
  return (json.data ?? json) as T
}

export type BatchProgressPayload = {
  index: number
  total: number
  episode_id: number
  episode_number: number
  phase?: 'raw' | 'rewrite' | 'chapter' | 'brief' | 'check'
  status: 'start' | 'done' | 'skip' | 'error'
  message?: string
  rewrite_attempt?: number
  check_score?: number
  check_summary?: string
  conflicts?: string[]
  blocking_items?: ContinuityBlockingItem[]
  rule_hints?: string[]
  model_rejected?: string[]
  rewrite_mode?: 'patch' | 'regen'
}

export type BatchSummary = {
  generated: number
  skipped: number
  failed: number
  errors: Array<{ episode_number: number; message: string }>
}

export type ProjectType = 'drama' | 'novel'

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'cancelled'

export type BatchJobSnapshot = {
  id: string
  user_id: number
  drama_id: number
  project_type: ProjectType
  drama_title: string | null
  status: BatchJobStatus
  payload: { scope?: BatchScope } | null
  progress: BatchProgressPayload | null
  summary: BatchSummary | null
  error_message: string | null
  cancel_requested: boolean
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

async function enqueueBatchJob(body: { drama_id: number; scope?: BatchScope }): Promise<{
  job: BatchJobSnapshot
  alreadyRunning?: boolean
}> {
  const resp = await fetch(`${API_ROOT}/batch-jobs`, {
    method: 'POST',
    headers: bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const json = await resp.json().catch(() => ({} as ApiEnvelope & { data?: { job?: BatchJobSnapshot } }))

  if (resp.status === 401) return invalidateSession('/batch-jobs', json.message)

  if (resp.status === 409) {
    const data = json.data as { job?: BatchJobSnapshot } | undefined
    if (data?.job) return { job: data.job, alreadyRunning: true }
  }

  if (!resp.ok || (json.code && json.code >= 400)) {
    throw new Error(json.message || `${resp.status}`)
  }

  return { job: json.data!.job as BatchJobSnapshot }
}

export const batchJobsAPI = {
  create: enqueueBatchJob,
  get: (id: string) => api.get<BatchJobSnapshot>(`/batch-jobs/${id}`),
  active: () => api.get<{ active: BatchJobSnapshot[]; recent: BatchJobSnapshot[] }>('/batch-jobs/active'),
  cancel: (id: string) => api.post<BatchJobSnapshot>(`/batch-jobs/${id}/cancel`, {}),
}

export type BatchScope = {
  mode?: 'remaining' | 'all' | 'range' | 'chapters'
  chapter_numbers?: number[]
  from_chapter?: number
  to_chapter?: number
  overwrite?: boolean
  production_pipeline?: 'ai_video' | 'frame_slideshow'
}

type BatchStreamEvent = {
  progress?: BatchProgressPayload
  summary?: BatchSummary
  done?: boolean
  error?: string
}

async function consumeBatchSSE(
  path: string,
  onEvent: (event: BatchStreamEvent) => void,
  signal?: AbortSignal,
  body: Record<string, unknown> = {},
): Promise<BatchSummary | undefined> {
  const resp = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  })

  if (resp.status === 401) return invalidateSession(path)

  if (!resp.ok) {
    const json = await resp.json().catch(() => ({} as { message?: string }))
    throw new Error(json.message || `${resp.status}`)
  }

  const reader = resp.body?.getReader()
  if (!reader) throw new Error('无流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  let summary: BatchSummary | undefined

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        break
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        for (const line of part.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          const json = JSON.parse(payload) as BatchStreamEvent
          if (json.error) throw new Error(json.error)
          if (json.progress) onEvent(json)
          if (json.summary) {
            summary = json.summary
            onEvent(json)
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted || err?.name === 'AbortError') return summary
    throw err
  }

  return summary
}

/** 消费小说章节 SSE 流（续写 / 一次生成） */
export async function consumeNovelSSE(
  path: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onStarted?: () => void,
  onFinal?: (content: string) => void,
): Promise<void> {
  const resp = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: bearerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

  if (resp.status === 401) return invalidateSession(path)

  if (!resp.ok) {
    const json = await resp.json().catch(() => ({} as { message?: string }))
    throw new Error(json.message || `${resp.status}`)
  }

  const reader = resp.body?.getReader()
  if (!reader) throw new Error('无流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload) continue
        const json = JSON.parse(payload) as NovelStreamEvent
        if (json.error) throw new Error(json.error)
        if (json.started) onStarted?.()
        if (json.text) onChunk(json.text)
        if (json.content) onFinal?.(json.content)
      }
    }
  }
}

// ── 火火扩展：模板库 ─────────────────────────────────────────

export const templatesAPI = {
  list: (params?: { project_type?: ProjectType; keyword?: string }) => {
    const q = new URLSearchParams()
    if (params?.project_type) q.set('project_type', params.project_type)
    if (params?.keyword) q.set('keyword', params.keyword)
    const qs = q.toString()
    return api.get<{ items: any[] }>(`/templates${qs ? `?${qs}` : ''}`)
  },
  get: (id: number) => api.get(`/templates/${id}`),
  use: (id: number) => api.post<{ id: number }>(`/templates/${id}/use`, {}),
  publish: (dramaId: number, body?: { template_summary?: string }) =>
    api.post(`/templates/publish/${dramaId}`, body ?? {}),
  unpublish: (dramaId: number) => api.post(`/templates/unpublish/${dramaId}`, {}),
  remove: (id: number) => api.del<{ kind: 'hard' | 'unpublish' }>(`/templates/${id}`),
  create: (body: {
    source: 'project' | 'url' | 'manual'
    drama_id?: number
    url?: string
    title?: string
    project_type?: ProjectType
    template_summary?: string
    description?: string
    genre?: string
    content?: string
  }) => api.post<{ id: number }>('/templates/create', body),
  fetchUrl: (url: string) =>
    api.post<{ title: string; text: string; char_count: number }>('/templates/fetch-url', { url }),
}

// ── 短剧流水线 API（REST 路径与上游一致）────────────────────

export const dramaAPI = {
  list: (params?: { project_type?: ProjectType; page?: number; page_size?: number }) => {
    const q = new URLSearchParams()
    if (params?.project_type) q.set('project_type', params.project_type)
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    const qs = q.toString()
    return api.get<{
      items: any[]
      pagination: { page: number; page_size: number; total: number; total_pages: number }
    }>(`/dramas${qs ? `?${qs}` : ''}`)
  },
  get: (id: number, opts?: { include_episodes?: boolean; include_assets?: boolean }) => {
    const q = new URLSearchParams()
    if (opts?.include_episodes === false) q.set('include_episodes', '0')
    if (opts?.include_assets === false) q.set('include_assets', '0')
    const qs = q.toString()
    return api.get(`/dramas/${id}${qs ? `?${qs}` : ''}`)
  },
  listEpisodes: (
    id: number,
    params?: { page?: number; page_size?: number; filter?: 'all' | 'written' | 'pending' },
  ) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    if (params?.filter) q.set('filter', params.filter)
    const qs = q.toString()
    return api.get<{
      items: any[]
      pagination: { page: number; page_size: number; total: number; total_pages: number }
      stats: { total: number; written: number; pending: number; total_chars: number }
    }>(`/dramas/${id}/episodes${qs ? `?${qs}` : ''}`)
  },
  getEpisodeByNumber: (dramaId: number, episodeNumber: number) =>
    api.get(`/dramas/${dramaId}/episodes/${episodeNumber}`),
  listAllEpisodes: async (
    id: number,
    params?: { filter?: 'all' | 'written' | 'pending' },
  ) => {
    const items: any[] = []
    let page = 1
    while (true) {
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('page_size', '100')
      if (params?.filter) q.set('filter', params.filter)
      const res = await api.get<{
        items: any[]
        pagination: { page: number; page_size: number; total: number; total_pages: number }
      }>(`/dramas/${id}/episodes?${q}`)
      items.push(...(res.items || []))
      const totalPages = res.pagination?.total_pages || 1
      if (page >= totalPages) break
      page += 1
    }
    return items
  },
  styles: () => api.get('/dramas/styles'),
  generateSynopsis: (body: { keywords: string; title?: string; style?: string; total_episodes?: number }) =>
    api.post<{ synopsis: string }>('/dramas/generate-synopsis', body),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
  generateRemainingStream: (
    dramaId: number,
    onEvent: (event: BatchStreamEvent) => void,
    signal?: AbortSignal,
  ) => consumeBatchSSE(`/dramas/${dramaId}/generate-remaining/stream`, onEvent, signal),
}

// ── 火火扩展：小说 / 批量 / AI 检测 ─────────────────────────

export const novelAPI = {
  generatePremise: (body: { keywords: string; title?: string; genre?: string; total_chapters?: number }) =>
    api.post<{ premise: string }>('/novel/generate-premise', body),
  getMeta: (dramaId: number) => api.get<{
    outline: string
    premise: string
    novel_genre: string
    context_chars: number
    target_chapter_chars: number
    continue_segment_chars: number
  }>(`/novel/dramas/${dramaId}/meta`),
  saveMeta: (dramaId: number, data: {
    outline?: string
    premise?: string
    novel_genre?: string
    context_chars?: number
    target_chapter_chars?: number
    continue_segment_chars?: number
  }) => api.put(`/novel/dramas/${dramaId}/meta`, data),
  generateOutline: (dramaId: number, body?: { premise?: string }) =>
    api.post<{ outline: string; titles_updated?: number }>(`/novel/dramas/${dramaId}/outline`, body ?? {}),
  syncChapterTitles: (dramaId: number) =>
    api.post<{ updated: number }>(`/novel/dramas/${dramaId}/sync-chapter-titles`, {}),
  createChapter: (dramaId: number, data?: { title?: string }) =>
    api.post(`/novel/dramas/${dramaId}/chapters`, data || {}),
  getChapterBrief: (chapterId: number) =>
    api.get<{
      chapter_outline: string
      writing_brief: string
      display_title: string
      source: string
      has_book_outline: boolean
      chapter_number: number
      chapter_title: string
      ai_detection: NovelAiDetection | null
      continuity_check: ContinuityCheckResult | null
    }>(`/novel/chapters/${chapterId}/brief`),
  detectChapterAi: (chapterId: number, body?: { text?: string }) =>
    api.post<NovelAiDetection>(`/novel/chapters/${chapterId}/detect-ai`, body ?? {}),
  listImportSources: (params?: { keyword?: string; page?: number; page_size?: number }) => {
    const q = new URLSearchParams()
    if (params?.keyword) q.set('keyword', params.keyword)
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    const qs = q.toString()
    return api.get<{
      items: Array<{
        id: number
        title: string
        source: 'own' | 'template' | 'platform'
        author_name: string
        chapter_count: number
        filled_chapter_count: number
        updated_at: string
      }>
      pagination: { page: number; page_size: number; total: number; total_pages: number }
    }>(`/novel/import-sources${qs ? `?${qs}` : ''}`)
  },
  listImportChapters: (novelId: number) => api.get<{
    chapters: Array<{
      chapter_number: number
      title: string
      char_count: number
      has_content: boolean
    }>
  }>(`/novel/import-sources/${novelId}/chapters`),
  getImportContent: (
    novelId: number,
    params: { episode_number: number; mode: 'chapter' | 'full' },
  ) => {
    const q = new URLSearchParams()
    q.set('episode_number', String(params.episode_number))
    q.set('mode', params.mode)
    return api.get<{
      content: string
      mode: 'chapter' | 'full'
      char_count: number
      chapter_number?: number
      chapter_title?: string
      chapter_count?: number
      novel_id: number
      novel_title: string
      source: string
    }>(`/novel/import-sources/${novelId}/content?${q.toString()}`)
  },
  generateWritingBrief: (chapterId: number, body: { keywords: string }) =>
    api.post<{ writing_brief: string }>(`/novel/chapters/${chapterId}/generate-brief`, body),
  continueChapter: (chapterId: number, body: { text: string; length?: number }) =>
    api.post<{ segment: string }>(`/novel/chapters/${chapterId}/continue`, body),
  continueChapterStream: (
    chapterId: number,
    body: { text: string; length?: number },
    onChunk: (text: string) => void,
    onStarted?: () => void,
    onFinal?: (content: string) => void,
  ) => consumeNovelSSE(`/novel/chapters/${chapterId}/continue/stream`, body, onChunk, onStarted, onFinal),
  generateChapter: (chapterId: number, body: { prompt: string; text?: string; target_length?: number }) =>
    api.post<{ content: string; continuity_check?: ContinuityCheckResult | null }>(`/novel/chapters/${chapterId}/generate`, body),
  generateChapterStream: (
    chapterId: number,
    body: { prompt: string; text?: string; target_length?: number },
    onChunk: (text: string) => void,
    onStarted?: () => void,
    onFinal?: (content: string) => void,
  ) => consumeNovelSSE(`/novel/chapters/${chapterId}/generate/stream`, body, onChunk, onStarted, onFinal),
  generateRemainingStream: (
    dramaId: number,
    onEvent: (event: BatchStreamEvent) => void,
    signal?: AbortSignal,
    scope?: BatchScope,
  ) => consumeBatchSSE(`/novel/dramas/${dramaId}/generate-remaining/stream`, onEvent, signal, scope ?? {}),
}

export const aiDetectAPI = {
  detectText: (text: string) => api.post<AiDetectHubResult>('/ai-detect/text', { text }),
  detectFile: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return uploadMultipart<AiDetectHubResult>('/ai-detect/file', fd)
  },
  detectAudio: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return uploadMultipart<AiDetectHubResult>('/ai-detect/audio', fd)
  },
  detectVideo: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return uploadMultipart<AiDetectHubResult>('/ai-detect/video', fd)
  },
  humanize: (body: {
    text: string
    detection?: {
      probability?: number
      verdict?: string
      signals?: Array<{ key: string; score: number }>
      suggestions?: Array<{
        signal_key?: string
        excerpt?: string
        advice?: string
        match_text?: string
      }>
    } | null
  }) => api.post<{ content: string; char_count: number; pipeline?: string }>('/ai-detect/humanize', body),
}

// ── 分集 / 分镜 / 素材生成（流水线核心）────────────────────

export const episodeAPI = {
  get: (id: number) => api.get(`/episodes/${id}`),
  getByNumber: (dramaId: number, episodeNumber: number) =>
    dramaAPI.getEpisodeByNumber(dramaId, episodeNumber),
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  /** 根据剧情/创意说明生成「原始内容」初稿（正文，非图片视频提示词） */
  generateContent: (id: number, body: { prompt: string }) =>
    api.post<{ content: string }>(`/episodes/${id}/generate-content`, body),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  characterForms: (id: number) => api.get(`/episodes/${id}/character-forms`),
  props: (id: number) => api.get(`/episodes/${id}/props`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  generateTTS: (id: number) => api.post(`/storyboards/${id}/generate-tts`),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  voiceSample: (id: number, episodeId: number) => api.post(`/characters/${id}/generate-voice-sample`, { episode_id: episodeId }),
  generateImage: (id: number, episodeId: number, opts?: { aspect_ratio?: string; reference_sheet?: boolean }) =>
    api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, ...opts }),
  batchImages: (ids: number[], episodeId: number, opts?: { aspect_ratio?: string; reference_sheet?: boolean }) =>
    api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId, ...opts }),
}

export const characterFormAPI = {
  listByDrama: (dramaId: number, characterId?: number) => {
    const q = characterId ? `?character_id=${characterId}` : ''
    return api.get(`/character-forms/drama/${dramaId}${q}`)
  },
  create: (data: any) => api.post('/character-forms', data),
  update: (id: number, data: any) => api.put(`/character-forms/${id}`, data),
  del: (id: number) => api.del(`/character-forms/${id}`),
  generateImage: (id: number, episodeId: number, opts?: { aspect_ratio?: string; reference_sheet?: boolean }) =>
    api.post(`/character-forms/${id}/generate-image`, { episode_id: episodeId, ...opts }),
  batchImages: (ids: number[], episodeId: number, opts?: { aspect_ratio?: string; reference_sheet?: boolean }) =>
    api.post('/character-forms/batch-generate-images', { character_form_ids: ids, episode_id: episodeId, ...opts }),
}

export const propAPI = {
  listByDrama: (dramaId: number, characterId?: number) => {
    const q = characterId ? `?character_id=${characterId}` : ''
    return api.get(`/props/drama/${dramaId}${q}`)
  },
  create: (data: any) => api.post('/props', data),
  update: (id: number, data: any) => api.put(`/props/${id}`, data),
  del: (id: number) => api.del(`/props/${id}`),
  generateImage: (id: number, episodeId: number, opts?: { aspect_ratio?: string; white_background?: boolean }) =>
    api.post(`/props/${id}/generate-image`, { episode_id: episodeId, ...opts }),
  batchImages: (ids: number[], episodeId: number, opts?: { aspect_ratio?: string; white_background?: boolean }) =>
    api.post('/props/batch-generate-images', { prop_ids: ids, episode_id: episodeId, ...opts }),
}

export const sceneAPI = {
  generateImage: (
    id: number,
    episodeId: number,
    opts?: {
      aspect_ratio?: string
      scene_mode?: 'backdrop' | 'composed'
      character_form_ids?: number[]
      prop_ids?: number[]
      character_ids?: number[]
    },
  ) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, ...opts }),
}

export const imageAPI = {
  generate: (d: any) => api.post('/images', d),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const gridAPI = {
  prompt: (d: any) => api.post('/grid/prompt', d),
  generate: (d: any) => api.post('/grid/generate', d),
  status: (id: number) => api.get(`/grid/status/${id}`),
  split: (d: any) => api.post('/grid/split', d),
}
export const videoAPI = {
  generate: (d: any) => api.post('/videos', d),
  get: (id: number) => api.get(`/videos/${id}`),
}
export const composeAPI = {
  shot: (id: number, motionPipeline?: string) =>
    api.post(`/compose/storyboards/${id}/compose${motionPipeline ? `?motion_pipeline=${motionPipeline}` : ''}`),
  all: (epId: number, motionPipeline?: string) =>
    api.post(`/compose/episodes/${epId}/compose-all${motionPipeline ? `?motion_pipeline=${motionPipeline}` : ''}`),
  status: (epId: number, motionPipeline?: string) =>
    api.get(`/compose/episodes/${epId}/compose-status${motionPipeline ? `?motion_pipeline=${motionPipeline}` : ''}`),
}
export const slideshowAPI = {
  shot: (id: number) => api.post(`/slideshow/storyboards/${id}/slideshow`),
  all: (epId: number) => api.post(`/slideshow/episodes/${epId}/slideshow-all`),
  status: (epId: number) => api.get(`/slideshow/episodes/${epId}/slideshow-status`),
}
export const mergeAPI = {
  merge: (epId: number, motionPipeline?: string) =>
    api.post(`/merge/episodes/${epId}/merge${motionPipeline ? `?motion_pipeline=${motionPipeline}` : ''}`),
  status: (epId: number, motionPipeline?: string, mergeId?: number) => {
    const params = new URLSearchParams()
    if (motionPipeline) params.set('motion_pipeline', motionPipeline)
    if (mergeId) params.set('merge_id', String(mergeId))
    const query = params.toString()
    return api.get(`/merge/episodes/${epId}/merge${query ? `?${query}` : ''}`)
  },
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
  huohuoPreset: (apiKey: string) => api.post('/ai-configs/huohuo-preset', { api_key: apiKey }),
  // 「火火一键配置」可编辑存储：DB 优先 + env 兜底 + 代码常量兜底
  listPreset: () => api.get<{
    policy?: { credit_billing_enabled: boolean }
    can_edit_platform_fields?: boolean
    services: Array<{
      preset_key: 'text' | 'image' | 'video' | 'audio'
      service_type: string
      provider: string
      base_url: string
      api_key: string
      model: string
      label: string
      priority: number
      source: 'db' | 'env' | 'code'
    }>
    agent: { preset_key: 'agent'; model: string; label: string; source: 'db' | 'env' | 'code' }
  }>('/ai-configs/preset'),
  savePreset: (items: Array<Record<string, unknown>>) => api.put('/ai-configs/preset', { items }),
  saveUserPreset: (items: Array<Record<string, unknown>>) => api.put('/ai-configs/user-preset', { items }),
  getUserDefaultModels: () => api.get<{ items: Array<{ service_type: string; config_id: number | null; ready: boolean; message?: string }> }>('/ai-configs/user-default-models'),
  saveUserDefaultModels: (items: Array<{ service_type: string; config_id: number }>) =>
    api.put('/ai-configs/user-default-models', { items }),
  readiness: (scope?: 'novel' | 'drama' | 'full') =>
    api.get<{ ready: boolean; credit_billing_enabled: boolean; items: Array<{ block: string; service_type: string; ready: boolean; config_id?: number | null; message?: string }> }>(
      `/ai-configs/readiness${scope ? `?scope=${scope}` : ''}`,
    ),
  savePresetPolicy: (creditBillingEnabled: boolean) =>
    api.put<{ credit_billing_enabled: boolean }>('/ai-configs/preset/policy', { credit_billing_enabled: creditBillingEnabled }),
}

export const agentConfigAPI = {
  list: () => api.get('/agent-configs'),
  get: (id: number) => api.get(`/agent-configs/${id}`),
  create: (d: any) => api.post('/agent-configs', d),
  update: (id: number, d: any) => api.put(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
  upload: (agentType: string, file: File, opts?: { subId?: string; overwrite?: boolean }) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('agent_type', agentType)
    if (opts?.subId) fd.append('sub_id', opts.subId)
    if (opts?.overwrite) fd.append('overwrite', '1')
    return uploadMultipart<{ imported: Array<{ id: string; name: string; description: string }> }>('/skills/upload', fd)
  },
}

export const generationLessonsAPI = {
  list: (params?: { project_kind?: string; agent_type?: string; verdict?: string }) => {
    const q = new URLSearchParams()
    if (params?.project_kind) q.set('project_kind', params.project_kind)
    if (params?.agent_type) q.set('agent_type', params.agent_type)
    if (params?.verdict) q.set('verdict', params.verdict)
    const qs = q.toString()
    return api.get(`/generation-lessons${qs ? `?${qs}` : ''}`)
  },
  get: (id: number) => api.get(`/generation-lessons/${id}`),
  create: (d: Record<string, unknown>) => api.post('/generation-lessons', d),
  update: (id: number, d: Record<string, unknown>) => api.put(`/generation-lessons/${id}`, d),
  del: (id: number) => api.del(`/generation-lessons/${id}`),
  extract: (d: { drama_id: number; hint?: string; max_items?: number }) =>
    api.post<{ drama_id: number; drama_title: string; project_kind: string; lessons: any[] }>('/generation-lessons/extract', d),
  batchCreate: (lessons: Record<string, unknown>[]) =>
    api.post<{ count: number; items: any[] }>('/generation-lessons/batch', { lessons }),
}

export const voicesAPI = {
  list: (provider?: string) => api.get(`/ai-voices${provider ? `?provider=${provider}` : ''}`),
  sync: () => api.post('/ai-voices/sync', {}),
}

export type AuthUserPayload = {
  id?: number
  username: string
  role: string
  credits: number
  credit_billing_enabled?: boolean
  nav_modules?: string[]
  nav_modules_source?: 'role' | 'user'
}

export type AdminUserAccessRow = {
  id: number
  username: string
  role: string
  credits: number
  nav_modules_override: string[] | null
  role_nav_modules?: string[]
  nav_modules: string[]
  nav_modules_source: 'role' | 'user'
}

// ── 火火扩展：账户 / 积分 / 支付 ───────────────────────────

export const authAPI = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUserPayload }>('/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUserPayload }>('/auth/register', { username, password }),
  me: () => api.get<AuthUserPayload>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/password', { current_password, new_password }),
  adminNavModules: () => api.get<{
    modules: Array<{ id: string; path: string }>
    roles: string[]
    config: Record<string, string[]>
  }>('/auth/admin/nav-modules'),
  adminSaveNavModules: (config: Record<string, string[]>) =>
    api.put<{ config: Record<string, string[]> }>('/auth/admin/nav-modules', { config }),
  adminSearchUsers: (keyword = '', limit = 20) => {
    const q = new URLSearchParams()
    if (keyword) q.set('q', keyword)
    q.set('limit', String(limit))
    return api.get<Array<{ id: number; username: string; role: string; credits: number }>>(
      `/auth/admin/users/search?${q.toString()}`,
    )
  },
  adminGetUserAccess: (userId: number) =>
    api.get<AdminUserAccessRow>(`/auth/admin/users/${userId}/access`),
  adminUpdateUserAccess: (userId: number, body: { role?: string; nav_modules_override?: string[] | null }) =>
    api.patch<AdminUserAccessRow>(`/auth/admin/users/${userId}`, body),
  creditLogs: (limit = 50) => api.get<Array<{
    id: number
    delta: number
    balance_after: number
    reason: string
    service_type?: string | null
    provider?: string | null
    model?: string | null
    token_count?: number | null
    tokens_estimated?: boolean | null
    created_at: string
  }>>(`/auth/credits/logs?limit=${limit}`),
  adminUsers: () => api.get<AdminUserAccessRow[]>('/auth/admin/users'),
  adminCreateUser: (body: { username: string; password?: string; role: string; credits: number }) =>
    api.post<{ user: AdminUserAccessRow; initial_password: string }>('/auth/admin/users', body),
  adminDeleteUser: (userId: number) =>
    api.del<{ user_id: number; deleted: true }>(`/auth/admin/users/${userId}`),
  adminAdjustCredits: (userId: number, delta: number, reason = '') =>
    api.post<{ user_id: number; credits: number }>('/auth/admin/credits', {
      user_id: userId,
      delta,
      reason,
    }),
}

type PaymentProviderCode = 'paypal' | 'pingpong' | 'wechat' | 'alipay'

export const paymentAPI = {
  methods: () => api.get<{ providers: Array<{
    code: PaymentProviderCode
    name: string
    methods: string[]
    note?: string
    credit_per_usd?: number
    custom_max_usd?: number
    credit_per_cny?: number
    custom_max_cny?: number
    usd_to_cny_rate?: number
    bonus_tiers?: Array<{ threshold_usd?: number; threshold_cny?: number; bonus_percent: number }>
  }> }>('/payments/methods'),
  adminProviders: () => api.get<{ providers: Array<{ code: PaymentProviderCode; name: string; methods: string[]; note?: string; enabled: boolean; ready: boolean; settings?: Record<string, any> }> }>('/payments/admin/providers'),
  adminUpdateProviders: (providers: Array<{ code: PaymentProviderCode; enabled: boolean; settings?: Record<string, any> }>) =>
    api.put<{ ok: boolean }>('/payments/admin/providers', { providers }),
  adminTestProvider: (code: PaymentProviderCode, settings: Record<string, any>) =>
    api.post<{ reachable: boolean; message: string; account?: Record<string, any>; scope?: string }>('/payments/admin/providers/test', { code, settings }),
  plans: () => api.get<{ plans: Array<{ id: string; name: string; amount: number; currency: string; credits: number }> }>('/payments/plans'),
  createCheckout: (payload: {
    provider: PaymentProviderCode
    plan_id?: string
    custom_amount_usd?: number
    custom_amount_cny?: number
  }) => api.post<{ order_no: string; checkout_url: string; provider: string; pay_type?: string }>('/payments/checkout-session', payload),
  capturePaypal: (paypalOrderId: string) =>
    api.post<{ ok: boolean; order_no: string; already_paid?: boolean }>('/payments/paypal/capture-order', { paypal_order_id: paypalOrderId }),
  pingpongConfirm: (orderNo: string) =>
    api.post<{ ok: boolean; order_no: string; already_paid?: boolean }>('/payments/pingpong/confirm', { order_no: orderNo }),
  wechatConfirm: (orderNo: string) =>
    api.post<{ ok: boolean; order_no: string; already_paid?: boolean }>('/payments/wechat/confirm', { order_no: orderNo }),
  alipayConfirm: (orderNo: string) =>
    api.post<{ ok: boolean; order_no: string; already_paid?: boolean }>('/payments/alipay/confirm', { order_no: orderNo }),
}
