/**
 * 通用状态跳切：完成态重做仍拦；先果后因/后置起势放行
 * npx tsx scripts/verify-seam-quiet-close-jump.ts
 */
import {
  detectChapterSeamStateJump,
} from '../src/services/novel/novel-chapter-end-snapshot.js'
import {
  buildForcedSeamOpeningBlock,
  detectChapterSeamColdOpen,
} from '../src/services/novel/novel-chapter-seam.js'

const prevTail = `
秦卫国走在前头，替她把门推开。
屋里的灶火还旺着，炕上那床破棉被叠得整整齐齐——是苏婉出门前叠的。
秦卫国把门闩插死，把剩下的狍肉搁在阴凉处，又把张伯给的两块土盐用草纸包好，搁在灶台边。这一趟人情，算是还上了。
`.trim()

const snap = {
  chapter_number: 11,
  time: '傍晚',
  place: '屋里',
  cast: '秦卫国、苏婉',
  last_event: '把门闩插死，搁好狍肉与土盐',
  open_threads: '',
  updated_at: new Date().toISOString(),
}

const poison = `
秦卫国不卑不亢，用话术周旋，没露出破绽。
门闩重新插死，秦卫国却没立刻回炕。他在原地站了两息，耳朵贴着门缝，听外头的脚步声一点点远下去。
“当家的……”苏婉还缩在炕角，声音细得几乎听不见。
`.trim()

const hit = detectChapterSeamStateJump({
  content: poison,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (!hit) throw new Error('应对完成态重做或没头没尾他者报警')
if (!/动作吃书|叙事跳切/.test(hit.message)) {
  throw new Error(`文案应抽象点明类型：${hit.message}`)
}

const hit2 = detectChapterSeamStateJump({
  content: '他坐在桌前，又把那封信重新烧了，纸灰落进碗里。窗外没有任何动静。',
  chapterNumber: 5,
  prevChapterTail: '他看完，把那封信烧了，灰烬搅进水碗。屋里只剩他一人。灯油快尽了。',
  prevSnapshot: {
    chapter_number: 4,
    time: '夜里',
    place: '屋里',
    cast: '秦卫国',
    last_event: '把那封信烧了',
    open_threads: '',
    updated_at: new Date().toISOString(),
  },
})
if (!hit2 || !/动作吃书/.test(hit2.message)) {
  throw new Error('非门闩的完成态重做也应命中')
}

const cold = detectChapterSeamColdOpen({
  content: poison,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  chapterOutline: '来人试探 / 周旋 / 夜里不安',
  prevSnapshot: snap,
})
if (!cold) throw new Error('冷开篇路径应命中')

const ok = detectChapterSeamStateJump({
  content: `
门外忽然响起敲门声。秦卫国透过门缝看清来人，才开了一条缝应付几句。
把人打发走后，他再把门闩插死，耳朵贴着门缝听脚步远去。
苏婉在炕角问：“什么人？”
`.trim(),
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (ok) throw new Error(`有起势不应拦：${ok.message}`)

const flashOk2 = detectChapterSeamStateJump({
  content: `
他在原地站了两息，耳朵贴着门缝，听外头的脚步声一点点远下去。
方才门外响起敲门声。来人是林场的刘干事，笑着说上门关心。秦卫国不卑不亢周旋几句，把人打发走。
苏婉在炕角问：“什么人？”
“探底的。”
`.trim(),
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (flashOk2) throw new Error(`先果后因补清起势不应拦：${flashOk2.message}`)

const orphanOnly = detectChapterSeamStateJump({
  content: `
他在原地站了两息，耳朵贴着门缝，听外头的脚步声一点点远下去。
苏婉在炕角问：“怎么了？”
“没事。”他没回头。
`.trim(),
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (!orphanOnly || !/叙事跳切/.test(orphanOnly.message)) {
  throw new Error('纯没头没尾他者仍应拦')
}

const forced = buildForcedSeamOpeningBlock({
  chapterOutline: '刘干事上门关心，秦卫国不卑不亢，用话术周旋',
  prevTail,
  prevSnapshot: snap,
})
if (!/收束→外来冲突|手法自选|先果后因/.test(forced)) {
  throw new Error(`强制接缝应含手法自选：${forced.slice(0, 240)}`)
}
if (/他处收束|场合桥/.test(forced)) {
  throw new Error('同场合收束不应含他处归家特例')
}
if (!/场合连续/.test(forced)) {
  throw new Error('应含通用场合连续纪律')
}

console.log('verify-seam-quiet-close-jump OK', {
  doorCase: hit.message.slice(0, 40),
  letterCase: hit2.message.slice(0, 40),
  flashbackOk: !flashOk2,
  orphanOnly: true,
  forcedVisit: true,
})
