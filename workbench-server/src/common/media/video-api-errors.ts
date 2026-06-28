const VIDEO_API_ERROR_HINTS: Array<{ match: RegExp; message: string }> = [
  {
    match: /InputImageSensitiveContentDetected\.PrivacyInformation/i,
    message: 'Seedance 判定首帧/参考图可能包含真人肖像，已拒绝生成。请改用 AI 绘制的角色图或更卡通化的首帧，勿使用真人照片、网图或写实人脸截图。',
  },
  {
    match: /InputImageSensitiveContentDetected/i,
    message: 'Seedance 判定输入图片内容敏感，已拒绝生成。请更换首帧或参考图后重试。',
  },
  {
    match: /SensitiveContentDetected/i,
    message: '视频服务判定输入内容敏感，已拒绝生成。请调整提示词或参考图后重试。',
  },
]

function extractVendorErrorText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return raw

  const jsonStart = trimmed.indexOf('{')
  if (jsonStart < 0) return trimmed

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
      error?: { code?: string; message?: string }
      message?: string
      code?: string
    }
    const nested = parsed.error
    if (nested?.message || nested?.code) {
      return [nested.code, nested.message].filter(Boolean).join(': ')
    }
    if (parsed.message || parsed.code) {
      return [parsed.code, parsed.message].filter(Boolean).join(': ')
    }
  } catch {
    /* keep raw */
  }
  return trimmed
}

/** 将厂商原始报错转为用户可读的简短说明 */
export function formatVideoApiError(raw: unknown): string {
  const text = extractVendorErrorText(String(raw || '视频生成失败'))
  for (const rule of VIDEO_API_ERROR_HINTS) {
    if (rule.match.test(text)) return rule.message
  }

  if (text.startsWith('API error')) {
    const vendor = extractVendorErrorText(text.replace(/^API error \d+:\s*/, ''))
    for (const rule of VIDEO_API_ERROR_HINTS) {
      if (rule.match.test(vendor)) return rule.message
    }
    if (vendor.length <= 240) return vendor
    return `${vendor.slice(0, 240)}…`
  }

  return text.length <= 240 ? text : `${text.slice(0, 240)}…`
}
