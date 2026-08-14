/** 将文本模型厂商报错转为用户可读说明（含 MiniMax 敏感码） */

export function isTextProviderSensitiveError(err: unknown): boolean {
  const t = String(err instanceof Error ? err.message : err || '')
  return /new_sensitive|\b1026\b|\b1027\b|content_filter|内容被安全策略|生成内容敏感|输入内容敏感/i.test(t)
}

function unwrapVendorErrorText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return raw
  const jsonStart = trimmed.indexOf('{')
  if (jsonStart < 0) return trimmed
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
      error?: { message?: string; type?: string; http_code?: string }
      message?: string
    }
    const nested = parsed.error
    if (nested?.message) {
      return [nested.type, nested.message, nested.http_code].filter(Boolean).join(' ')
    }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    /* keep raw */
  }
  return trimmed
}

/** 将厂商原始报错转为用户可读的简短说明 */
export function formatTextApiError(raw: unknown): string {
  const text = unwrapVendorErrorText(String(raw || 'AI 请求失败'))
  const hay = `${text}\n${String(raw || '')}`

  if (/output\s*new_sensitive|\b1027\b/i.test(hay)) {
    return '文本模型判定生成内容敏感（1027），已拒绝返回。请把冲突改成家庭/生意/情感与人际，弱化政治运动与敏感历史细节后重试；或换其他文本模型。'
  }
  if (/input\s*new_sensitive|\b1026\b/i.test(hay)) {
    return '文本模型判定输入内容敏感（1026），已拒绝。请修改书名或创意梗概中的敏感表述后重试。'
  }
  if (/content_filter/i.test(hay)) {
    return '文本模型内容安全策略已拦截本次生成，请调整题材表述后重试或更换模型。'
  }

  return text.length <= 280 ? text : `${text.slice(0, 280)}…`
}

export const TEXT_SENSITIVE_RETRY_STEER =
  '【系统纠偏】上次输出被平台安全策略拦截。请改写为平台友好的网文内容：冲突聚焦家庭伦理、邻里口舌、生意资源与人物选择；年代仅作生活背景一笔带过；勿写政治运动细节、敏感历史事件、色情暴力与可操作违法步骤。直接输出可用的简体中文正文。'
