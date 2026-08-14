/**
 * 章内在场相位：独处/离场已立后，他者无桥接同场 → 硬伤（题材无关结构信号）
 */
import { looksLikePersonName } from './novel-state-card-validate.js'

export type PresencePhaseConflict = {
  layer: 'hard'
  rule: 'intra_cast_teleport'
  message: string
}

/** 离场/外出结构（位类，非场面词表） */
const DEPART_CUE_RE =
  /推门进了|推门进(?!来)|出了门|出了屋|出了院|进了山|进了林|上了路|出了城|出了营|背上身[，,]?推门/

/** 他者同场施动（接在人名后） */
const COPRESENT_ACT_RE =
  /^(?:拿过|拿起|接过|接住|坐下|坐到|盘腿|说道|说：|说"|说“|：“|捻了|蹙成|愣了|递过|拍拍|拍了|望着|跟着|过来坐|在手指|眉心)/

/** 合法桥接：到场 / 切场 / 框 */
const BRIDGE_RE =
  /赶来|赶了上来|赶上来|跟上|同行|一道出|一起出|与他一起|与她一起|跟着他出|跟着她出|与此同时|另一边|切到|闪回|回忆框|补叙|回到[了]?[家屋院房]|从坡下|从山脚|从门外/

/** 非同场提及 */
const MENTION_ONLY_RE = /想起|忆起|念及|记得|脑海里|心里念/

function compactKeepPunct(s: string): string {
  return (s || '').replace(/\s+/g, '')
}

/** 人名后边界：标点或常见起动/施动（防滑窗吞进动词） */
const AFTER_NAME_RE =
  /^(?:[，。！？、：；“”"‘’（）()]|拿过|拿起|接过|接住|说道|说：|说"|说“|：“|把手|在手|在手指|从坡|从山|从门|爬起|眯起|眯着|伸手|压住|推门|赶了|赶来|赶上来|坐下|盘腿|愣了|蹙成|捻了|拍拍|递过|望着|过来坐|还在|已在|捆成|把家)/

/** 名内不应出现的动作/结果补语碎片 */
const NAME_NOISE_RE =
  /[翻搜罗砸划爬压弹捻戳拿接说坐走看出赶把]|出来|起来|上来|下来|过来|过去|回来|铁丝|麻绳|生疼|用啊|一戳|松手|上身|门进/

/** 从正文抽出像人名的 token（2～3 字为主；须落在名后边界） */
export function extractPersonNamesFromProse(text: string): string[] {
  const t = compactKeepPunct(text)
  const chars = [...t]
  const raw = new Set<string>()
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i + len <= chars.length; i++) {
      const s = chars.slice(i, i + len).join('')
      if (!looksLikePersonName(s)) continue
      if (NAME_NOISE_RE.test(s)) continue
      if (/(.)\1/.test(s)) continue
      // 跳过叠字词干切片：蒙蒙亮 → 勿抽「蒙亮」
      if (i > 0 && chars[i - 1] === chars[i]) continue
      const after = chars.slice(i + len).join('')
      if (!AFTER_NAME_RE.test(after)) continue
      raw.add(s)
    }
  }
  const list = [...raw].sort((a, b) => b.length - a.length)
  const kept: string[] = []
  for (const n of list) {
    if (kept.some(k => k.includes(n))) continue
    kept.push(n)
  }
  return kept
}

function findNameIndex(hay: string, name: string, from = 0): number {
  return hay.indexOf(name, from)
}

type SoloHit = { index: number; actor: string }

/**
 * 找最早的「离场/外出」相位；actor 为句内最近人名，否则「他」视作未定主语。
 */
export function findSoloAwayHit(text: string): SoloHit | null {
  const hay = compactKeepPunct(text)
  const m = DEPART_CUE_RE.exec(hay)
  if (!m || m.index == null) return null
  const idx = m.index
  const windowStart = Math.max(0, idx - 48)
  const before = hay.slice(windowStart, idx)
  const names = extractPersonNamesFromProse(before)
  let actor = ''
  let best = -1
  for (const n of names) {
    const p = before.lastIndexOf(n)
    if (p > best) {
      best = p
      actor = n
    }
  }
  if (!actor) {
    if (!/(?:独自|一人)/.test(before) && !/[他她]/.test(before.slice(-12))) return null
    actor = '（叙述主语）'
  }
  return { index: idx, actor }
}

type CopresentHit = { index: number; name: string; excerpt: string }

function findCopresentAfter(
  hay: string,
  afterIdx: number,
  soloActor: string,
  names: string[],
): CopresentHit | null {
  const candidates = soloActor === '（叙述主语）'
    ? names
    : names.filter(n => n !== soloActor)

  for (const name of candidates) {
    let from = afterIdx
    while (from < hay.length) {
      const i = findNameIndex(hay, name, from)
      if (i < 0) break
      if (i <= afterIdx) {
        from = i + name.length
        continue
      }
      const tail = hay.slice(i + name.length, i + name.length + 16)
      const pre = hay.slice(Math.max(0, i - 6), i)
      if (MENTION_ONLY_RE.test(pre)) {
        from = i + name.length
        continue
      }
      if (COPRESENT_ACT_RE.test(tail) || /^[“"]/.test(tail)) {
        const excerpt = hay.slice(Math.max(0, i - 4), Math.min(hay.length, i + name.length + 20))
        return { index: i, name, excerpt }
      }
      from = i + name.length
    }
  }
  return null
}

function hasBridgeBetween(hay: string, from: number, to: number): boolean {
  if (to <= from) return false
  const mid = hay.slice(from, Math.min(hay.length, to + 28))
  return BRIDGE_RE.test(mid)
}

/**
 * 独处/离场已立 → 他者无桥接同场 → hard
 */
export function detectIntraCastPresenceFail(content: string): PresencePhaseConflict | null {
  const hay = compactKeepPunct(content)
  if ([...hay].length < 40) return null

  const solo = findSoloAwayHit(hay)
  if (!solo) return null

  const names = extractPersonNamesFromProse(hay)
  if (names.length < 1) return null

  const co = findCopresentAfter(hay, solo.index + 2, solo.actor, names)
  if (!co) return null

  if (hasBridgeBetween(hay, solo.index, co.index)) return null

  const who = solo.actor === '（叙述主语）' ? '叙述主语' : solo.actor
  return {
    layer: 'hard',
    rule: 'intra_cast_teleport',
    message:
      `章内在场相位：已确立「${who}」独处/离场外出后，`
      + `「${co.name}」无同行/赶来/切场/闪回框等交代即以同场动作出场。`
      + `摘录「${co.excerpt.slice(0, 36)}」`,
  }
}

/** 节拍提示用：已写正文的在场相位摘要 */
export function summarizePresencePhaseForPrompt(frozenProse: string): string {
  const t = (frozenProse || '').trim()
  if (!t) return ''
  const hay = compactKeepPunct(t)
  const solo = findSoloAwayHit(hay)
  if (!solo) return ''
  const who = solo.actor === '（叙述主语）' ? '叙述主语' : solo.actor
  const anchor = [...t].slice(-120).join('').replace(/\s+/g, ' ').trim()
  return `已写相位：${who} 独处/离场外出已立。锚句：…${anchor}`
}

/**
 * 后拍注入块：软约束（不中断生成）
 */
export function buildFrozenPresencePhaseBlock(frozenProse: string): string {
  const summary = summarizePresencePhaseForPrompt(frozenProse)
  if (!summary) return ''
  return [
    '【已写在场相位 — 须桥接】',
    summary,
    '硬性：本拍若写另一人物同场动作/对白，须先写同行、赶来、切场或闪回/补叙框；无框跳切同场 = 吃书。',
    '可写名单内人物 ≠ 可无到场交代。桥接一句优先于凑字；桥接不算进度回卷。',
    '与「禁止新人物登门」并列：已知人物无桥接同场亦禁。',
  ].join('\n')
}

/** 供 verify */
export function buildFrozenPresencePhaseBlockForTest(frozenProse: string): string {
  return buildFrozenPresencePhaseBlock(frozenProse)
}
