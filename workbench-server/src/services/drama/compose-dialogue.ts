const AMBIENT_SPEAKER = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const SKIP_DIALOGUE = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

export interface ParsedDialogueLine {
  speaker: string
  pureText: string
  ignorable: boolean
}

export function parseDialogueForTTS(dialogue?: string | null): ParsedDialogueLine {
  const raw = dialogue?.trim() || ''
  if (!raw) {
    return { speaker: '', pureText: '', ignorable: true }
  }

  const speakerMatch = raw.match(/^(.+?)[:：]/)
  const speaker = speakerMatch
    ? speakerMatch[1].replace(/[（(].+?[)）]/g, '').trim()
    : ''

  const pureText = raw
    .replace(/^.+?[:：]\s*/, '')
    .replace(/[（(].+?[)）]/g, '')
    .trim()

  const ignorable = (!!speaker && AMBIENT_SPEAKER.test(speaker))
    || !pureText
    || SKIP_DIALOGUE.test(pureText)

  return { speaker, pureText, ignorable }
}

export function buildSubtitleDocument(text: string, durationSeconds: number): string {
  const endMs = Math.max(500, Math.round(durationSeconds * 1000) - 500)
  const endMinutes = Math.floor(endMs / 60000)
  const endSeconds = Math.floor((endMs % 60000) / 1000)
  const endMillis = endMs % 1000
  const endTimestamp = `00:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')},${String(endMillis).padStart(3, '0')}`
  return `1\n00:00:00,500 --> ${endTimestamp}\n${text}\n`
}
