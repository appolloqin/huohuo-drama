/**
 * npx tsx scripts/verify-novel-chapter-prose-load.ts
 */
import {
  looksLikeWritingBriefDocument,
  stripChapterSeamNoise,
  stripLengthAdjustInstructionEcho,
  resolveNovelEpisodeStoryProse,
} from '../src/services/novel/novel-chapter-prose.js'
import { deriveChapterEndSnapshot } from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamClimaxReplay } from '../src/services/novel/novel-chapter-seam.js'
import type { EpisodeRow } from '../src/db/repos/types.js'

const brief = `## 本章写作说明

**情节目标**：展示主角破局第一步。

**建议出场人物**：甲、乙。

**场景氛围**：清晨山林。

**篇幅侧重**：
1. **追踪过程**：脚印与粪便。
2. **锁定目标**：设套。

**章末钩子**：发现异样痕迹。

**【一致性账本】**
环境：后山。
**【一致性提醒】**严禁现代装备。
`

if (!looksLikeWritingBriefDocument(brief)) throw new Error('brief detect')
if (stripChapterSeamNoise(brief) !== '') throw new Error('brief must strip to empty')

const prose = `晨雾还没散透，林子里灰蒙蒙一片。秦卫国把猎刀往腰带里掖了掖。

雪地上有一串细碎脚印，他蹲下来辨认方向，决定先稳妥捕兔。

**【一致性账本】**
环境：后山。
**【一致性提醒】**勿现代装备。
`
const cleaned = stripChapterSeamNoise(prose)
if (!cleaned.includes('晨雾')) throw new Error('keep prose')
if (/一致性账本|一致性提醒/.test(cleaned)) throw new Error('strip ledger')
if (looksLikeWritingBriefDocument(cleaned)) throw new Error('prose not brief')

// scriptContent 有写作说明、content 为空且无 blob → 不得用 scriptContent
const fakeEp = {
  id: 1,
  dramaId: 99,
  episodeNumber: 4,
  content: null,
  contentBlobPath: null,
  scriptContent: brief,
  metadata: null,
} as unknown as EpisodeRow

const resolved = resolveNovelEpisodeStoryProse(fakeEp)
if (resolved !== '') {
  throw new Error(`must ignore scriptContent brief, got ${resolved.slice(0, 80)}`)
}

// inline content 为真正文时可用
const fakeProseEp = {
  ...fakeEp,
  content: prose,
  scriptContent: brief,
} as unknown as EpisodeRow
const fromInline = resolveNovelEpisodeStoryProse(fakeProseEp)
if (!fromInline.includes('晨雾')) throw new Error('prefer inline prose over scriptContent')
if (fromInline.includes('情节目标')) throw new Error('must not mix brief')

// derive last_event 取尾句，勿取窗口首句
const longTail = [
  '他抬头竖起耳朵，风里有极细动静，像荆条丛里拱雪。',
  '后来他绕到土坎上蹲下，开始顺着脚印找。',
  '风向忽然变了，岩壁阴影里露出一截枯黄茎秆。',
  '他眯起眼！',
].join('')
const snap = deriveChapterEndSnapshot({
  chapterNumber: 4,
  content: longTail,
  contentHash: 'test',
})
if (!snap?.last_event) throw new Error('no last_event')
if (/竖起耳朵|拱雪/.test(snap.last_event)) {
  throw new Error(`last_event should be chapter tip, got ${snap.last_event}`)
}
if (!/眯起眼|茎秆|阴影/.test(snap.last_event)) {
  throw new Error(`unexpected last_event ${snap.last_event}`)
}

const echoed = `【硬性字数】须输出 2520～3136 字（当前约 2427 字，明显偏短须补写到贴近目标）。

在原线索上加场面与反应，禁止注水。【待补写正文】雪坡上那道阴影被风一掀，露出半截灰褐色的脊背。秦卫国瞳孔一缩。`
const stripped = stripLengthAdjustInstructionEcho(echoed)
if (/硬性字数|待补写正文|禁止注水/.test(stripped)) throw new Error('echo not stripped')
if (!stripped.startsWith('雪坡上')) throw new Error(`strip head ${stripped.slice(0, 40)}`)

const continueOpen = '雪坡上那道阴影被风一掀，露出半截灰褐色的脊背。秦卫国瞳孔一缩，不是野猪，是野兔。他把猎刀换到顺手的姿势，兔子的耳朵朝四面转了两下。'
const falseReplay = detectChapterSeamClimaxReplay({
  content: continueOpen,
  chapterNumber: 5,
  prevChapterTail: longTail,
  prevSnapshot: {
    chapter_number: 4,
    time: '午后',
    place: '岩壁一带',
    cast: '耳朵、么东西、秦卫国',
    last_event: '阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。',
    updated_at: new Date().toISOString(),
  },
})
if (falseReplay) {
  throw new Error(`continuation must not be climax replay: ${falseReplay.message}`)
}

const trueReplay = detectChapterSeamClimaxReplay({
  content: '阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。秦卫国又盯着那截茎秆看了很久，心里打鼓。风里动静极细。他再一次把耳朵侧过去听。',
  chapterNumber: 5,
  prevChapterTail: longTail + '阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。',
  prevSnapshot: {
    chapter_number: 4,
    time: '午后',
    place: '岩壁一带',
    cast: '秦卫国',
    last_event: '阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。',
    updated_at: new Date().toISOString(),
  },
})
if (!trueReplay) throw new Error('literal last_event echo must hit replay')

console.log('verify-novel-chapter-prose-load OK')
