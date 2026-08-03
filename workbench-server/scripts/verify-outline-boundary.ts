/**
 * 大纲边界对齐 P0 验收
 * Run: npx tsx scripts/verify-outline-boundary.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  alignNovelChapterOutlineBoundary,
  extractBriefNonStructuralMeta,
} from '../src/services/novel/novel-outline-boundary.js'

function pad(s: string, minChars: number): string {
  let out = s
  while ([...out].length < minChars) out += '补充环境与心理若干字。'
  return out
}

const pendingOutline =
  '林远醒来发现身处草垛 / 身边是衣衫不整的柳如梅 / 门外火把通明村民叫骂逼近 / 他迅速理清现状决定不再逃避'

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    failed++
  } else {
    console.log('ok', msg)
  }
}

const a1 = alignNovelChapterOutlineBoundary({
  chapterOutline: pendingOutline,
  writingBrief: '本章情节目标：确立穿越事实，化解捉奸绝境，完成从逃避到担当的心态转折。需在前三分之一篇幅内确立穿越。',
})
assert(a1.endpointPending, 'endpointPending for 决定不再逃避')
assert(a1.conflictNotes.length > 0, 'brief conflict notes')
assert(!/化解捉奸绝境/.test(a1.alignedBrief) || /留后章|不得写完/.test(a1.alignedBrief), 'alignedBrief demotes done goals')
assert(/本章大纲边界/.test(a1.boundaryBlock), 'boundary block present')
assert(/只在本章大纲已列拍点|禁止用大纲未列/.test(a1.boundaryBlock), 'boundary length is outline-agnostic')

const a2 = alignNovelChapterOutlineBoundary({
  chapterOutline: '主角当众表态完成翻盘 / 众人散去他接下这一局',
  writingBrief: '本章完成当众表态与局势落地。',
})
assert(!a2.endpointPending || a2.conflictNotes.length === 0, 'climax-aligned brief may have no demotion')
// 末拍含完成 — endpointPending 可能仍因「完成」不在 PENDING；若含「接下」无过程词则 pending false
assert(a2.conflictNotes.length === 0 || !a2.endpointPending, 'no false brief demotion when not pending')

const overDraft = pad(
  '痛。林远撑开眼皮。破草垛。一个名字浮上来：柳如梅。门外火把。唯一的活路不是逃。信。',
  800,
) + pad(
  '随后外头的人闯了进来，双方当众升级，他站起身大声表态并许下一个月期限，众人让路，他扶着人往外走。',
  1000,
)
const a3 = alignNovelChapterOutlineBoundary({
  chapterOutline: pendingOutline,
  writingBrief: '需在前三分之一确立开篇。',
  existingText: overDraft,
  mode: 'rewrite',
  chapterNumber: 1,
})
assert(a3.draftConflictsOutline, 'overshoot draft flagged')
assert(a3.conflictNotes.some(n => /旧稿/.test(n)), 'draft conflict note')

const a3c = alignNovelChapterOutlineBoundary({
  chapterOutline: pendingOutline,
  writingBrief: '需在前三分之一确立开篇。',
  existingText: overDraft,
  mode: 'continue',
  chapterNumber: 1,
})
assert(a3c.draftConflictsOutline, 'continue overshoot body flagged')
assert(a3c.conflictNotes.some(n => /续写/.test(n)), 'continue conflict note')

const cleanDraft = pad(
  '痛。林远撑开眼皮，破草垛。柳如梅在身边。门外火把通明，村民叫骂声逼近。思绪乱成一团。',
  750,
) + '他迅速理清现状，决定不再逃避。'
const a4 = alignNovelChapterOutlineBoundary({
  chapterOutline: pendingOutline,
  writingBrief: '需在前三分之一确立开篇。',
  existingText: cleanDraft,
  mode: 'rewrite',
  chapterNumber: 1,
})
assert(!a4.draftConflictsOutline, 'clean draft not flagged')

// 过期写作说明：他章「起势/过程」挂到本章不同大纲时须剔除（题材无关）
const chOutline = '当众摊牌 / 出示关键证物逼对方让步 / 对方反咬一口 / 主角冷处理收束'
const staleBrief = [
  '## 本章写作说明',
  '**情节目标**：展示主角从被动防守转向主动反击的破局第一步。通过暗中调查锁定把柄建立信心。',
  '**场景氛围**：雨夜街巷，灯火昏黄。',
  '**情绪基调**：专注、冷冽、掌控感。',
  '**篇幅侧重**：',
  '1. **开场铺垫**：简短交代出门前准备与家人叮嘱。',
  '2. **环境适应**：详细描写雨夜中调整呼吸与步伐。',
  '3. **暗中调查**：通过细微线索层层推导对方行踪。',
].join('\n')
const a5 = alignNovelChapterOutlineBoundary({
  chapterOutline: chOutline,
  writingBrief: staleBrief,
})
assert(a5.conflictNotes.some(n => /无关的情节|已剔除/.test(n)), 'stale cross-chapter brief pruned')
assert(!/开场铺垫/.test(a5.alignedBrief), 'unrelated setup clause removed')
assert(!/家人叮嘱|出门前准备/.test(a5.alignedBrief), 'leave-home setup removed')
assert(!/暗中调查/.test(a5.alignedBrief) || /当众摊牌|证物|反咬|冷处理/.test(a5.alignedBrief), 'unrelated drive pruned or outline stub kept')
assert(/场景氛围|情绪基调|雨夜/.test(a5.alignedBrief), 'meta atmosphere kept')

// 狩猎章：毒 brief 含离别叮嘱时必须剔除
const huntOutline = '精准击杀 / 设好简易陷阱成功猎获两只肥野兔 / 娴熟剥皮处理 / 归途遇赵大虎挑衅冷眼无视'
const huntBrief = [
  '**情节目标**：从居家防御转向主动狩猎的破局第一步。',
  '**场景氛围**：北疆林场后山，清晨。',
  '**情绪基调**：专注、冷冽。',
  '**篇幅侧重**：',
  '1. **离别与叮嘱**：出门前准备，嘱咐锁门。',
  '2. **环境适应**：严寒中调整呼吸步伐。',
  '3. **追踪过程**：通过脚印推导野兔踪迹。',
].join('\n')
const a6 = alignNovelChapterOutlineBoundary({
  chapterOutline: huntOutline,
  writingBrief: huntBrief,
})
assert(!/离别与叮嘱|嘱咐锁门|出门前/.test(a6.alignedBrief), 'hunt chapter leave-home brief stripped')
assert(!/目送/.test(a6.alignedBrief), 'farewell cue stripped from cast line')
assert(a6.conflictNotes.some(n => /已剔除/.test(n)), 'hunt brief prune noted')
const metaOnly = extractBriefNonStructuralMeta(a6.alignedBrief)
assert(!/目送|清晨|离家/.test(metaOnly), 'style-only meta has no leave-home cues')

// 完整毒 brief：目送须在 align 阶段被洗掉
const fullPoison = [
  '**建议出场人物**：秦卫国（主导）、苏婉（短暂出场，目送担忧）。',
  '**场景氛围**：北疆林场后山，清晨至上午。',
  '**情绪基调**：专注、冷冽。从离家时的凝重转为警觉。',
].join('\n')
const a7 = alignNovelChapterOutlineBoundary({
  chapterOutline: huntOutline,
  writingBrief: fullPoison,
})
assert(!/目送|清晨|离家时/.test(a7.alignedBrief), 'aligned brief sanitized leave-home meta')

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-outline-boundary.ts'),
  'utf8',
)
assert(!/破门|提亲|踹门|捉奸/.test(src), 'no scene-word tables')
assert(!/\bcontract\b/i.test(src), 'no contract identifier')
assert(!/合同/.test(a1.boundaryBlock), 'boundary copy has no forbidden term')

if (failed) {
  console.error(`\nFAILED: ${failed}`)
  process.exit(1)
}
console.log('\nPASS')
