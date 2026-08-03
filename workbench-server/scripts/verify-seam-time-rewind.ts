/**
 * 章缝时辰：同日倒退硬拦；夜→晨相位正向放行（不靠睡醒词表）
 * Run: npx tsx scripts/verify-seam-time-rewind.ts
 */
import {
  detectChapterSeamTimeRewind,
  detectChapterSeamColdOpen,
  headLooksLikeOvernightBridge,
} from '../src/services/novel/novel-chapter-seam.js'

const prev = `
就在日头爬到树梢正中央的时候，岩壁根下那丛荆条动了。一团灰褐色的毛球从雪洞里探出半个脑袋，长耳朵竖得笔直。
秦卫国连呼吸都屏住了。他一动不动趴在雪地里，脸上的冷和心里的热搅在一块儿。风还在刮，刮得脸生疼。
`.repeat(3)

const dawn = `
晨光还没把树梢染白，秦卫国已经退到上风处一棵老松背后，整个人压低，只露半截棉帽沿在外头。
雪面反光晃眼，他眯着眼盯着东南角那个树根下的窟窿口，一动不动。
`.repeat(3)

const hit = detectChapterSeamTimeRewind({
  content: dawn,
  chapterNumber: 5,
  prevChapterTail: prev,
})
if (!hit) throw new Error('expected time rewind')
if (!/正午|晨光|时辰倒退|同日倒退/.test(hit.message)) throw new Error(`bad message: ${hit.message}`)

const cold = detectChapterSeamColdOpen({
  content: dawn,
  chapterNumber: 5,
  prevChapterTail: prev,
  chapterOutline: '设置简易陷阱 / 剥皮处理 / 回程遇赵大彪',
})
if (!cold) throw new Error('cold open must include time rewind')

const okSame = detectChapterSeamTimeRewind({
  content: ('日头还在当顶，秦卫国挪了挪窝，继续盯着窟窿口。').repeat(4),
  chapterNumber: 5,
  prevChapterTail: prev,
})
if (okSame) throw new Error('same midday should not rewind')

// 夜→晨：只认相位，无「睁开眼/枕下」等场面词也应放行
const nightPrev = `
马灯的火苗还在跳。他嘱她喝了再睡。
屋里静得只剩灶膛残火偶尔哔剥，窗外夜色沉沉。
`.repeat(2)

const morningOnly = `
北疆的清晨，冷得刺骨。
天光灰蒙蒙的，雾气贴着窗纸。他披上棉袄，准备出门干活。
林场装卸区，寒风卷着木屑。
`

const nightOk = detectChapterSeamTimeRewind({
  content: morningOnly,
  chapterNumber: 16,
  prevChapterTail: nightPrev,
})
if (nightOk) throw new Error(`night→morning phase forward should pass: ${nightOk.message}`)

if (!headLooksLikeOvernightBridge(morningOnly.slice(0, 200), nightPrev, {
  chapter_number: 15,
  time: '夜里',
  place: '屋里',
  cast: '秦卫国、苏婉',
  last_event: '嘱她再睡',
  open_threads: '',
  updated_at: new Date().toISOString(),
})) {
  throw new Error('overnight bridge should be phase-based')
}

// 正午→清晨无跨日明示仍拦
const noonToDawn = detectChapterSeamTimeRewind({
  content: morningOnly,
  chapterNumber: 6,
  prevChapterTail: prev,
})
if (!noonToDawn) throw new Error('noon→morning without cross-day mark must fail')

// 正午→清晨有「次日」放行
const noonNext = detectChapterSeamTimeRewind({
  content: '次日清晨，雾还没散。他走到装卸区。'.repeat(3),
  chapterNumber: 6,
  prevChapterTail: prev,
})
if (noonNext) throw new Error('noon→morning with 次日 should pass')

console.log('PASS')
