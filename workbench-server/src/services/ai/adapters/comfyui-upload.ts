import type { AIConfig } from './adapter-shared.js'
import { comfyAuthHeaders, joinComfyUrl } from './comfyui-workflow.js'

export type ComfyUploads = {
  loadImage?: string
  firstFrame?: string
  lastFrame?: string
}

const pending = new Map<number, ComfyUploads>()

export function consumeComfyUploads(
  recordId: number,
  patch: ComfyUploads,
  mode: 'read' | 'write',
): ComfyUploads {
  if (mode === 'write') {
    pending.set(recordId, { ...(pending.get(recordId) || {}), ...patch })
    return pending.get(recordId) || {}
  }
  const current = pending.get(recordId) || {}
  pending.delete(recordId)
  return current
}

export async function uploadComfyuiImageFromUrl(
  cfg: AIConfig,
  sourceUrl: string,
  filename: string,
): Promise<string> {
  const fileRes = await fetch(sourceUrl)
  if (!fileRes.ok) {
    throw new Error(`ComfyUI 读取参考图失败 ${fileRes.status}`)
  }
  const buf = Buffer.from(await fileRes.arrayBuffer())
  const form = new FormData()
  form.append('image', new Blob([buf]), filename)
  form.append('overwrite', 'true')
  const up = await fetch(joinComfyUrl(cfg.baseUrl, '/upload/image'), {
    method: 'POST',
    headers: comfyAuthHeaders(cfg.apiKey),
    body: form,
  })
  if (!up.ok) {
    throw new Error(`ComfyUI 上传失败 ${up.status}: ${await up.text()}`)
  }
  const json = await up.json() as { name?: string }
  if (!json.name) throw new Error('ComfyUI 上传响应缺少 name')
  return json.name
}
