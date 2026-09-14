export type ComfyNode = {
  class_type?: string
  inputs?: Record<string, unknown>
  _meta?: { title?: string }
  title?: string
}

export type ComfyGraph = Record<string, ComfyNode>

export type ComfyTitleInputs = {
  prompt?: string
  negative?: string
  loadImage?: string
  firstFrame?: string
  lastFrame?: string
  duration?: number
}

export type ComfyHistoryMedia = {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  mediaUrl?: string
  error?: string
}

export type ComfyMode = 't2i' | 'i2i' | 't2v' | 'i2v'

const DEFAULT_T2I_WORKFLOW: ComfyGraph = {
  '6': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'positive' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '7': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'negative' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '9': {
    class_type: 'SaveImage',
    _meta: { title: 'save_image' },
    inputs: { filename_prefix: 'huohuo', images: ['6', 0] },
  },
}

const DEFAULT_I2I_WORKFLOW: ComfyGraph = {
  '6': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'positive' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '7': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'negative' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '10': {
    class_type: 'LoadImage',
    _meta: { title: 'load_image' },
    inputs: { image: '' },
  },
  '9': {
    class_type: 'SaveImage',
    _meta: { title: 'save_image' },
    inputs: { filename_prefix: 'huohuo', images: ['6', 0] },
  },
}

const DEFAULT_T2V_WORKFLOW: ComfyGraph = {
  '6': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'positive' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '7': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'negative' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '14': {
    class_type: 'PrimitiveInt',
    _meta: { title: 'duration' },
    inputs: { value: 5 },
  },
  '9': {
    class_type: 'SaveImage',
    _meta: { title: 'save_video' },
    inputs: { filename_prefix: 'huohuo', images: ['6', 0] },
  },
}

const DEFAULT_I2V_WORKFLOW: ComfyGraph = {
  '6': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'positive' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '7': {
    class_type: 'CLIPTextEncode',
    _meta: { title: 'negative' },
    inputs: { text: '', clip: ['4', 1] },
  },
  '11': {
    class_type: 'LoadImage',
    _meta: { title: 'first_frame' },
    inputs: { image: '' },
  },
  '12': {
    class_type: 'LoadImage',
    _meta: { title: 'last_frame' },
    inputs: { image: '' },
  },
  '13': {
    class_type: 'LoadImage',
    _meta: { title: 'load_image' },
    inputs: { image: '' },
  },
  '14': {
    class_type: 'PrimitiveInt',
    _meta: { title: 'duration' },
    inputs: { value: 5 },
  },
  '9': {
    class_type: 'SaveImage',
    _meta: { title: 'save_video' },
    inputs: { filename_prefix: 'huohuo', images: ['6', 0] },
  },
}

const DEFAULT_WORKFLOWS: Record<ComfyMode, ComfyGraph> = {
  t2i: DEFAULT_T2I_WORKFLOW,
  i2i: DEFAULT_I2I_WORKFLOW,
  t2v: DEFAULT_T2V_WORKFLOW,
  i2v: DEFAULT_I2V_WORKFLOW,
}

const REQUIRED_COMFY_TITLES: Record<ComfyMode, string[]> = {
  t2i: ['positive'],
  i2i: ['positive', 'load_image'],
  t2v: ['positive'],
  i2v: ['positive', 'first_frame'],
}

export type ComfyNodeRole = 'positive' | 'negative' | 'load_image' | 'first_frame' | 'last_frame' | 'duration'

/** Exact / substring aliases for real ComfyUI export titles (EN + ZH). */
const ROLE_TITLE_ALIASES: Record<ComfyNodeRole, string[]> = {
  positive: ['positive', '正向', '正面提示'],
  negative: ['negative', '负向', '负面提示'],
  load_image: ['load_image', 'load image', '加载图像', '加载图片'],
  first_frame: ['first_frame', 'first frame', '首帧'],
  last_frame: ['last_frame', 'last frame', '尾帧'],
  duration: ['duration', '时长'],
}

function nodeTitle(node: ComfyNode): string {
  return String(node._meta?.title || node.title || '').trim().toLowerCase()
}

function titleMatchesRole(title: string, role: ComfyNodeRole): boolean {
  const t = title.trim().toLowerCase()
  if (!t) return false
  if (t === role) return true
  return ROLE_TITLE_ALIASES[role].some((alias) => {
    const a = alias.toLowerCase()
    return t === a || t.includes(a)
  })
}

function isTextEncodeClass(classType: string): boolean {
  return /textencode|cliptextencode/i.test(classType)
}

/**
 * Resolve a workflow node by role: fuzzy title first, then class_type heuristics.
 * Supports Comfy exports like "CLIP Text Encode (Positive Prompt)" / "加载图像".
 */
export function findComfyNodeByRole(graph: ComfyGraph, role: ComfyNodeRole): ComfyNode | null {
  const nodes = Object.values(graph)
  const titled = nodes.filter((n) => titleMatchesRole(nodeTitle(n), role))
  if (titled.length === 1) return titled[0]
  if (titled.length > 1) {
    const exact = titled.find((n) => nodeTitle(n) === role)
    if (exact) return exact
    // Prefer shorter / more specific title containing the alias (e.g. "(Positive)" over bare encode)
    return titled.sort((a, b) => nodeTitle(a).length - nodeTitle(b).length)[0]
  }

  if (role === 'load_image' || role === 'first_frame' || role === 'last_frame') {
    const loads = nodes.filter((n) => String(n.class_type || '') === 'LoadImage')
    if (role === 'load_image') return loads[0] || null
    if (role === 'first_frame') return loads[0] || null
    return loads[1] || loads[0] || null
  }

  if (role === 'positive' || role === 'negative') {
    const encoders = nodes.filter((n) => isTextEncodeClass(String(n.class_type || '')))
    if (role === 'negative') {
      const byNegTitle = encoders.filter((n) => titleMatchesRole(nodeTitle(n), 'negative'))
      return byNegTitle[0] || encoders[1] || null
    }
    const nonNeg = encoders.filter((n) => !titleMatchesRole(nodeTitle(n), 'negative'))
    return nonNeg[0] || encoders[0] || null
  }

  if (role === 'duration') {
    return nodes.find((n) => /primitiveint|int/i.test(String(n.class_type || ''))) || null
  }

  return null
}

function setPromptOnNode(node: ComfyNode, prompt: string): void {
  const original = node.inputs || {}
  if ('prompt' in original && !('text' in original)) {
    node.inputs = { ...original, prompt }
  } else if ('text' in original) {
    node.inputs = { ...original, text: prompt }
  } else if ('prompt' in original) {
    node.inputs = { ...original, prompt }
  } else {
    node.inputs = { ...original, text: prompt }
  }
}

function cloneGraph(graph: ComfyGraph): ComfyGraph {
  return JSON.parse(JSON.stringify(graph)) as ComfyGraph
}

function parseWorkflowJson(raw: unknown): ComfyGraph | null {
  if (!raw) return null
  let value = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      value = JSON.parse(trimmed)
    } catch {
      throw new Error('ComfyUI workflow JSON 无法解析')
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ComfyUI workflow 必须是节点对象')
  }
  const graph = value as ComfyGraph
  const promptWrap = (value as { prompt?: ComfyGraph }).prompt
  if (promptWrap && typeof promptWrap === 'object' && !Array.isArray(promptWrap)) {
    return promptWrap
  }
  return graph
}

export function resolveComfyuiWorkflow(
  settings: string | Record<string, unknown> | null | undefined,
  mode: ComfyMode | 'image' | 'video',
): ComfyGraph {
  const normalized: ComfyMode =
    mode === 'image' ? 't2i' : mode === 'video' ? 't2v' : mode
  let parsed: Record<string, unknown> = {}
  if (typeof settings === 'string' && settings.trim()) {
    try {
      parsed = JSON.parse(settings)
    } catch {
      parsed = {}
    }
  } else if (settings && typeof settings === 'object') {
    parsed = settings as Record<string, unknown>
  }
  const custom = parseWorkflowJson(parsed.workflow)
  return cloneGraph(custom || DEFAULT_WORKFLOWS[normalized])
}

export function assertComfyRequiredTitles(graph: ComfyGraph, mode: ComfyMode): void {
  for (const need of REQUIRED_COMFY_TITLES[mode]) {
    if (!findComfyNodeByRole(graph, need as ComfyNodeRole)) {
      throw new Error(`ComfyUI workflow 缺少标题为 ${need} 的节点（模式 ${mode}）`)
    }
  }
}

export function comfyModeFromProvider(provider: string, fallback: ComfyMode): ComfyMode {
  const p = provider.toLowerCase()
  if (p === 'comfyui-t2i') return 't2i'
  if (p === 'comfyui-i2i') return 'i2i'
  if (p === 'comfyui-t2v') return 't2v'
  if (p === 'comfyui-i2v') return 'i2v'
  return fallback
}

export function applyComfyuiTitleInputs(graph: ComfyGraph, values: ComfyTitleInputs): ComfyGraph {
  const next = cloneGraph(graph)

  const positive = findComfyNodeByRole(next, 'positive')
  if (!positive) throw new Error('ComfyUI workflow 缺少可注入提示词的节点（positive / Positive Prompt / 文本编码等）')
  setPromptOnNode(positive, values.prompt || '')

  const negative = findComfyNodeByRole(next, 'negative')
  if (negative && values.negative != null) {
    setPromptOnNode(negative, values.negative || '')
  }

  const loadImage = findComfyNodeByRole(next, 'load_image')
  if (loadImage && values.loadImage) {
    loadImage.inputs = { ...(loadImage.inputs || {}), image: values.loadImage }
  }

  const firstFrame = findComfyNodeByRole(next, 'first_frame')
  if (firstFrame && values.firstFrame) {
    firstFrame.inputs = { ...(firstFrame.inputs || {}), image: values.firstFrame }
  }

  const lastFrame = findComfyNodeByRole(next, 'last_frame')
  if (lastFrame && values.lastFrame) {
    lastFrame.inputs = { ...(lastFrame.inputs || {}), image: values.lastFrame }
  }

  const duration = findComfyNodeByRole(next, 'duration')
  if (duration && values.duration != null) {
    const n = Number(values.duration)
    duration.inputs = {
      ...(duration.inputs || {}),
      value: n,
      duration: n,
    }
  }

  return next
}

function firstOutputFile(outputs: Record<string, any> | undefined): { filename: string; subfolder?: string; type?: string } | null {
  if (!outputs || typeof outputs !== 'object') return null
  for (const node of Object.values(outputs)) {
    if (!node || typeof node !== 'object') continue
    for (const key of ['images', 'gifs', 'videos', 'files']) {
      const arr = (node as Record<string, unknown>)[key]
      if (!Array.isArray(arr) || !arr.length) continue
      const first = arr[0]
      if (typeof first === 'string' && first.trim()) {
        return { filename: first.trim(), subfolder: '', type: 'output' }
      }
      if (first && typeof first === 'object') {
        const file = first as { filename?: string; subfolder?: string; type?: string; name?: string }
        const filename = file.filename || file.name
        if (typeof filename === 'string' && filename) {
          return { filename, subfolder: file.subfolder, type: file.type }
        }
      }
    }
  }
  return null
}

export function comfyViewPath(file: { filename: string; subfolder?: string; type?: string }): string {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
  })
  return `/view?${params.toString()}`
}

function formatComfyStatusError(entry: any): string {
  const messages = entry?.status?.messages
  if (Array.isArray(messages) && messages.length) {
    const last = messages[messages.length - 1]
    if (Array.isArray(last) && last[1]) {
      return typeof last[1] === 'string' ? last[1] : JSON.stringify(last[1])
    }
    return JSON.stringify(messages[messages.length - 1])
  }
  return 'ComfyUI 生成失败'
}

export function parseComfyuiHistoryMedia(
  history: Record<string, any>,
  promptId: string,
  _baseUrl?: string,
): ComfyHistoryMedia {
  if (!history || typeof history !== 'object') return { status: 'processing' }
  const entry = history[promptId] || (Object.keys(history).length === 1 ? history[Object.keys(history)[0]] : null)
  if (!entry) return { status: 'processing' }

  const statusStr = String(entry.status?.status_str || entry.status || '').toLowerCase()
  if (statusStr === 'error' || statusStr === 'failed') {
    return { status: 'failed', error: formatComfyStatusError(entry) }
  }

  // Outputs are the source of truth — some Comfy builds omit status.completed.
  const file = firstOutputFile(entry.outputs)
  if (file) {
    return {
      status: 'completed',
      mediaUrl: resolveRelativeMediaUrl(_baseUrl || '', comfyViewPath(file)),
    }
  }

  const completed = entry.status?.completed === true || statusStr === 'success'
  if (completed) {
    return { status: 'failed', error: 'ComfyUI history 没有输出文件（请确认工作流含 SaveImage / SaveImageAdvanced）' }
  }
  return { status: 'processing' }
}

/** True when prompt_id is still queued or executing on the Comfy server. */
export function isPromptIdInComfyQueue(queueJson: any, promptId: string): boolean {
  if (!queueJson || typeof queueJson !== 'object') return false
  const buckets = [queueJson.queue_running, queueJson.queue_pending, queueJson.running, queueJson.pending]
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const item of bucket) {
      // Typical row: [number, promptId, ...]
      if (Array.isArray(item) && item.some((x) => String(x) === promptId)) return true
      if (item && typeof item === 'object' && String((item as any).prompt_id || '') === promptId) return true
    }
  }
  return false
}

export function joinComfyUrl(baseUrl: string, path: string): string {
  const base = (baseUrl || '').replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function resolveRelativeMediaUrl(baseUrl: string, href?: string): string | undefined {
  if (!href) return href
  if (/^[a-z]+:\/\//i.test(href)) return href
  return joinComfyUrl(baseUrl, href)
}

export function comfyAuthHeaders(apiKey?: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function formatComfyNodeErrors(vendorJson: any): string | null {
  const errors = vendorJson?.node_errors
  if (!errors || typeof errors !== 'object' || !Object.keys(errors).length) return null
  return JSON.stringify(errors)
}
