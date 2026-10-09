/**
 * 写作说明人名门禁：出场名须 ⊆【本章人物】（可并入已锁定角色名）。
 * 题材无关：只做名单解析与外溢检测，不绑定书情。
 */
import { extractTagBlock } from './novel-outline-drama-fields.js'

/** 非人名常见词（避免频次扫描误杀） */
const CAST_STOP = new Set([
  '领主', '账房', '朝廷', '读者', '主角', '本章', '开篇', '章末', '正文', '大纲',
  '令牌', '文书', '军令', '军令状', '刀盾', '刀盾手', '铁骑', '旧部', '族老',
  '父亲', '二叔', '三叔', '头领', '百姓', '灾民', '土匪', '山寨', '北境',
  '压迫', '欲望', '说话', '习惯', '失态', '压场', '钩子', '承诺', '冲突',
  '代价', '选择', '信息', '增量', '场景', '目标', '舞台', '章职', '演法',
  '物件', '身体', '动作', '环境', '旁人', '反应', '内心', '情绪', '落点',
  '禁止', '必须', '硬性', '不得', '可以', '以及', '或者', '然后', '因为',
  '所以', '已经', '什么', '这个', '那个', '自己', '他们', '我们', '你们',
])

function isPlausiblePersonName(name: string): boolean {
  const n = (name || '').trim()
  if (![...n].length || [...n].length > 4 || [...n].length < 2) return false
  if (!/^[\u4e00-\u9fff]+$/.test(n)) return false
  if (CAST_STOP.has(n)) return false
  return true
}

/** 从【本章人物】解析允许出场人名 */
export function extractChapterCastAllowlist(chapterOutline?: string): string[] {
  const raw = (extractTagBlock(chapterOutline || '', '本章人物') || '').replace(/\s+/g, ' ').trim()
  if (!raw) return []
  // 只按条目分隔，勿按逗号切（逗号常在「｜身份，备注」里）
  const parts = raw.split(/[；;、\n|/／]+/)
  const out: string[] = []
  for (const part of parts) {
    const seg = part.trim()
    if (!seg) continue
    const head = seg.split(/[｜|：:：—\-–]/)[0] || ''
    const name = head.replace(/[（(].*$/, '').trim()
    // 条目名须像人名：2～3 字为主（少数复姓 4 字）；拒绝「伤残老卒」类身份串
    if (![...name].length || [...name].length > 3) {
      if ([...name].length === 4 && /^[欧阳上官司马诸葛皇甫尉迟]/.test(name) && isPlausiblePersonName(name)) {
        out.push(name)
      }
      continue
    }
    if (isPlausiblePersonName(name)) out.push(name)
  }
  return [...new Set(out)]
}

/** 合并大纲名单与额外锁定名（角色表/上章契约等） */
export function mergeCastAllowlist(outlineNames: string[], extra?: string[]): string[] {
  const out: string[] = []
  for (const n of [...outlineNames, ...(extra || [])]) {
    const t = (n || '').trim()
    if (isPlausiblePersonName(t)) out.push(t)
  }
  return [...new Set(out)]
}

/**
 * 从写作说明中检出疑似人名且不在允许名单内。
 * 优先抓人物卡「X：欲望」等高置信结构，再辅以「X藏账/哭穷」类 cast 槽位写法。
 */
export function findForeignPersonNamesInBrief(brief: string, allowlist: string[]): string[] {
  const text = brief || ''
  if (!text.trim()) return []
  const allow = new Set(allowlist.filter(isPlausiblePersonName))
  if (!allow.size) return [] // 无名单则不拦（避免空大纲误杀）

  const candidates = new Set<string>()
  const push = (raw: string) => {
    const n = (raw || '').trim()
    if (!isPlausiblePersonName(n)) return
    if (allow.has(n)) return
    // 允许名单中更长名包含时也不报（极少见）
    if ([...allow].some(a => a.includes(n) || n.includes(a))) return
    candidates.add(n)
  }

  for (const m of text.matchAll(/(?<![被让扣逼把向对给])([\u4e00-\u9fff]{2,3})\s*[:：]\s*欲望/g)) {
    push(m[1] || '')
  }
  for (const m of text.matchAll(/(?<![被让扣逼把向对给])([\u4e00-\u9fff]{2,3})(?:藏账|哭穷|腿软|讨债|冷眼|看死)/g)) {
    push(m[1] || '')
  }
  // 「被X哭穷 / 扣下X的账本 / 让X交出烂账」——后缀必带，避免「被揭穿/逼死」误抓
  for (const m of text.matchAll(/被([\u4e00-\u9fff]{2,4})(?:哭穷|讨债|冷眼)/g)) {
    push(m[1] || '')
  }
  for (const m of text.matchAll(/扣下([\u4e00-\u9fff]{2,4})的/g)) {
    push(m[1] || '')
  }
  for (const m of text.matchAll(/让([\u4e00-\u9fff]{2,3})交出/g)) {
    push(m[1] || '')
  }

  // 去掉被更长候选包含的短串（「孙满仓哭穷」勿再抓出「满仓」）
  const list = [...candidates]
  return list.filter(n => !list.some(o => o !== n && o.includes(n)))
}

/** 写前注入：人名硬约束块 */
export function buildWritingBriefCastConstraintBlock(args: {
  chapterOutline?: string
  extraAllow?: string[]
}): string {
  const allow = mergeCastAllowlist(
    extractChapterCastAllowlist(args.chapterOutline),
    args.extraAllow,
  )
  if (!allow.length) {
    return [
      '【人名硬性】',
      '本章大纲未给出【本章人物】时：人物卡/压迫叠层不得新造专名配角；可用职分称呼（账房、都尉、族老）代替。',
      '有【本章人物】后：出场专名必须来自该名单。',
    ].join('\n')
  }
  return [
    '【人名硬性 — 以本章大纲为准】',
    `允许出场专名（仅此名单）：${allow.join('、')}`,
    '硬性：人物卡、压迫叠层、开头承诺、场景目标中的专名必须 ∈ 上表；禁止为凑字段新造人名。',
    '缺人时用职分/关系称呼（账房、二叔、旧部头领），或只写名单内角色；禁止另起「孙某某」式新配角。',
    '情节目标、冲突、章末钩子须与【本章大纲】一致，可细化场面，不可改换核心对手/关键人物。',
  ].join('\n')
}
