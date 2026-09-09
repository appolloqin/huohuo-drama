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

const DEFAULT_IMAGE_WORKFLOW: ComfyGraph = {
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

const DEFAULT_VIDEO_WORKFLOW: ComfyGraph = {
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

function nodeTitle(node: ComfyNode): string {
  return String(node._meta?.title || node.title || '').trim().toLowerCase()
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
  kind: 'image' | 'video',
): ComfyGraph {
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
  return cloneGraph(custom || (kind === 'video' ? DEFAULT_VIDEO_WORKFLOW : DEFAULT_IMAGE_WORKFLOW))
}

export function applyComfyuiTitleInputs(graph: ComfyGraph, values: ComfyTitleInputs): ComfyGraph {
  const next = cloneGraph(graph)
  const byTitle = new Map<string, ComfyNode>()
  for (const node of Object.values(next)) {
    const title = nodeTitle(node)
    if (title) byTitle.set(title, node)
  }

  const positive = byTitle.get('positive')
  if (!positive) throw new Error('ComfyUI workflow 缺少标题为 positive 的节点')
  positive.inputs = { ...(positive.inputs || {}), text: values.prompt || '' }

  const negative = byTitle.get('negative')
  if (negative) {
    negative.inputs = { ...(negative.inputs || {}), text: values.negative || '' }
  }

  const loadImage = byTitle.get('load_image')
  if (loadImage && values.loadImage) {
    loadImage.inputs = { ...(loadImage.inputs || {}), image: values.loadImage }
  }

  const firstFrame = byTitle.get('first_frame')
  if (firstFrame && values.firstFrame) {
    firstFrame.inputs = { ...(firstFrame.inputs || {}), image: values.firstFrame }
  }

  const lastFrame = byTitle.get('last_frame')
  if (lastFrame && values.lastFrame) {
    lastFrame.inputs = { ...(lastFrame.inputs || {}), image: values.lastFrame }
  }

  const duration = byTitle.get('duration')
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
      if (!Array.isArray(arr) || !arr[0] || typeof arr[0] !== 'object') continue
      const file = arr[0] as { filename?: string; subfolder?: string; type?: string }
      if (typeof file.filename === 'string' && file.filename) {
        return { filename: file.filename, subfolder: file.subfolder, type: file.type }
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
    return { status: 'failed', error: entry.status?.messages?.[0]?.[1] || 'ComfyUI 生成失败' }
  }

  const completed = entry.status?.completed === true || statusStr === 'success'
  const file = firstOutputFile(entry.outputs)
  if (completed && file) {
    return { status: 'completed', mediaUrl: resolveRelativeMediaUrl(_baseUrl || '', comfyViewPath(file)) }
  }
  if (completed && !file) {
    return { status: 'failed', error: 'ComfyUI history 没有输出文件' }
  }
  return { status: 'processing' }
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
