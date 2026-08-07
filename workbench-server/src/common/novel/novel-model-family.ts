/**
 * C2：写作模型 vs 困惑度检测模型是否同系（可单测）。
 */

export function normalizeModelId(model: string): string {
  return String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function modelFamily(model: string): string {
  const n = normalizeModelId(model)
  if (!n) return ''
  if (n.startsWith('qwen')) return 'qwen'
  if (n.startsWith('deepseek')) return 'deepseek'
  if (n.startsWith('gpt') || n.startsWith('o1') || n.startsWith('o3') || n.startsWith('o4')) return 'openai'
  if (n.startsWith('claude')) return 'anthropic'
  if (n.startsWith('glm') || n.startsWith('chatglm')) return 'zhipu'
  return n.slice(0, 6)
}

export function sameFamilyDetect(generateModel: string, perplexityModel: string): boolean {
  const a = modelFamily(generateModel)
  const b = modelFamily(perplexityModel)
  if (!a || !b) return true
  return a === b
}

const BASE_WARNING =
  '当前困惑度模型与写作同系，AI 率易虚高；请在文本服务配置异系「困惑度检测模型」'

export function crossModelDetectWarning(opts: {
  sameFamily: boolean
  preferCrossModel?: boolean
}): string | undefined {
  if (!opts.sameFamily) return undefined
  if (opts.preferCrossModel) return `[建议异模型] ${BASE_WARNING}`
  return BASE_WARNING
}
