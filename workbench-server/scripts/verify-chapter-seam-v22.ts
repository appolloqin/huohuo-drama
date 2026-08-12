import {
  detectChapterSeamReplay,
  detectChapterSeamColdOpen,
  findStaleOutlineBeats,
  detectOutlineBeatOrderRewind,
  detectStaleOutlineWeakContinuation,
  isWeakSeamContinuation,
  buildOutlineStaleBlock,
} from '../src/services/novel/novel-chapter-seam.js'

const prevTail = `林远打断赵德柱，站直了身子，目光发亮。
「今日当着各位父老兄弟，我把话说在这——我林远，要娶柳如梅。」
人群哗然，有人骂他不知死活，也有人笑出声来。此刻众人眼里，他不再只是那个二流子。`

const outline = '悍然提亲 / 门被撞开，林远主动走出，当众承认关系并大声宣布要娶柳如梅。村民震惊，柳如梅又羞又急，但林远的眼神让她莫名心安。'

const ch2Opening = `「砰——！」
一声闷响炸开，腐朽的木门在重击下整块崩落，扬起一篷呛人的陈灰。
门外涌进一群人。林远站在原地，身后女子发抖，她还在想门一开该怎么办。
`

const stale = findStaleOutlineBeats(outline, prevTail)
console.log('stale beats:', stale)

const order = detectOutlineBeatOrderRewind({
  content: ch2Opening + '后文填充字'.repeat(40),
  chapterNumber: 2,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
console.log('order rewind:', order?.message ?? null)

const weak = detectStaleOutlineWeakContinuation({
  content: ch2Opening + '后文填充字'.repeat(40),
  chapterNumber: 2,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
console.log('weak continuation:', weak?.message ?? null)
console.log('isWeak:', isWeakSeamContinuation(prevTail, ch2Opening))

const hit = detectChapterSeamReplay({
  content: ch2Opening + '后文填充字'.repeat(40),
  chapterNumber: 2,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
console.log('detect hit (hard path):', hit?.message ?? null)

const block = buildOutlineStaleBlock({ chapterOutline: outline, prevTail, chapterNumber: 2 })
console.log('outline block ok:', /禁止再写|过期|已在/.test(block))

const goodOpen = ('村民还在吵。柳如梅扯住他袖口，低声道：「你疯了？」林远反手握住她的手，压住嗓子：「听我说完。」众人围得更紧，赵德柱脸色铁青。').repeat(3)
const goodHit = detectChapterSeamReplay({
  content: goodOpen,
  chapterNumber: 2,
  prevChapterTail: prevTail,
  chapterOutline: '村民反应与柳如梅内心动摇，赵德柱反扑。',
})
console.log('good opening hit:', goodHit?.rule ?? null)
console.log('good isWeak:', isWeakSeamContinuation(prevTail, goodOpen))

// Lexical order rewind: opening literally does early beat while later beat done（utility）
const lexicalOpen = ('门被撞开。林远站在门边，还没来得及说话。灰尘扑面而来，外面人影晃动。').repeat(8)
const lexicalHit = detectOutlineBeatOrderRewind({
  content: lexicalOpen,
  chapterNumber: 2,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
console.log('lexical order:', lexicalHit?.message ?? null)

if (!stale.length) throw new Error('expected stale beats')
// 弱承接/拍点倒序：utility 仍可检出；一致性硬审 detectChapterSeamReplay 不再硬拦
if (!weak && !order && !lexicalHit) throw new Error('expected weak or order utility path')
if (hit && /弱承接|拍点倒序|大纲过期/.test(hit.message)) {
  throw new Error('hard path must not emit weak/order narrative seam')
}
if (goodHit) throw new Error('good opening should not hit')
if (!lexicalHit) throw new Error('expected lexical order rewind utility')

// 冷开篇：上章已在林中收束，本章大纲是设陷阱/猎获，开篇却从家里醒来出门（无过期拍点字面重叠）
const huntPrev = (`雪地里脚印还在。秦卫国收起刀，估摸着明日再来设套。林子深处风声紧，他沿着原路折回营地边缘，心里记下了那片灌木。`).repeat(3)
const huntOutline = '精准击杀 / 设好简易陷阱成功猎获两只肥野兔 / 娴熟剥皮处理 / 归途遇赵大虎挑衅冷眼无视'
const coldOpen = (`天没亮，秦卫国醒了。炕那头苏婉还蜷着。他摸出猎刀，开了门，迎着寒风往红松林走去。`).repeat(12)
const coldHit = detectChapterSeamColdOpen({
  content: coldOpen,
  chapterNumber: 5,
  prevChapterTail: huntPrev,
  chapterOutline: huntOutline,
})
const coldReplay = detectChapterSeamReplay({
  content: coldOpen,
  chapterNumber: 5,
  prevChapterTail: huntPrev,
  chapterOutline: huntOutline,
})
console.log('cold open:', coldHit?.message?.slice(0, 60) ?? null)
console.log('cold replay:', coldReplay?.rule ?? null)
if (!coldHit) throw new Error('expected chapter seam cold open (utility)')
// 叙事冷开篇交模型审：一致性硬审 detectChapterSeamReplay 不再回传
if (coldReplay && /冷开篇/.test(coldReplay.message)) {
  throw new Error('detectChapterSeamReplay must not hard-emit narrative cold open')
}

// 假强承接：开篇与上章同为雪林用词，但大纲前段 0 命中 → 仍须冷开篇
const snowPrev = (`雪地脚印还在红松林风紧。秦卫国收起刀，沿原路折回营地边缘，记下明日再来设套。`).repeat(6)
const snowOpen = (`晨光还没亮透，秦卫国已经把猎刀别进腰后。他蹲在门槛前扫了一遍屋里，嘱咐苏婉锁门，然后踩着雪壳往红松林走。`).repeat(8)
const falseStrong = detectChapterSeamColdOpen({
  content: snowOpen,
  chapterNumber: 5,
  prevChapterTail: snowPrev,
  chapterOutline: huntOutline,
})
console.log('zero-hit cold (ignore weak):', !!falseStrong, 'isWeak:', isWeakSeamContinuation(snowPrev, snowOpen))
if (!falseStrong) throw new Error('expected cold open when early beats hit=0 even if lexical overlap')

// 杂交冷头：先离家骨架，后半才切入大纲拍点（整窗命中但头段 0 命中）
const hybridOpen = (
  '天没亮他就醒了。穿好衣服嘱咐家人锁门，推门走进雨夜街巷，一路想着白天的琐事。'
).repeat(6)
  + '他当众摊牌，把关键证物拍在桌上逼对方让步。对方脸色铁青，当场反咬一口。主角冷处理收束。'
const hybridOutline = '当众摊牌 / 出示关键证物逼对方让步 / 对方反咬一口 / 主角冷处理收束'
const hybridPrev = ('证物已经到手。他收起纸袋，转身走进雨里，街灯把影子拉得很长。').repeat(4)
const hybridCold = detectChapterSeamColdOpen({
  content: hybridOpen,
  chapterNumber: 5,
  prevChapterTail: hybridPrev,
  chapterOutline: hybridOutline,
})
console.log('hybrid cold head:', !!hybridCold)
if (!hybridCold) throw new Error('expected cold open for leave-home head before outline beats')

// 时辰倒退：上章日头正中，本章晨光（拍点已进猎捕仍须拦）
const noonPrev = (
  '就在日头爬到树梢正中央的时候，岩壁根下那丛荆条动了。一团灰褐色的毛球从雪洞里探出半个脑袋。'
  + '秦卫国连呼吸都屏住了。他一动不动趴在雪地里，脸上的冷和心里的热搅在一块儿。'
).repeat(2)
const dawnOpen = (
  '晨光还没把树梢染白，秦卫国已经退到上风处一棵老松背后，整个人压低。'
  + '他盯着东南角那个树根下的窟窿口，一动不动。细线套着灰兔，他摸出猎刀剥皮。'
).repeat(4)
const timeRewind = detectChapterSeamColdOpen({
  content: dawnOpen,
  chapterNumber: 5,
  prevChapterTail: noonPrev,
  chapterOutline: huntOutline,
})
console.log('time rewind noon→dawn:', timeRewind?.message?.slice(0, 50) ?? null)
if (!timeRewind || !/时辰倒退|晨光/.test(timeRewind.message)) {
  throw new Error('expected time-of-day rewind cold open for noon→dawn')
}
const nextDayOk = detectChapterSeamColdOpen({
  content: ('次日晨光刚亮，秦卫国又摸到了那片林子。设好简易陷阱成功猎获两只肥野兔，娴熟剥皮处理。').repeat(5),
  chapterNumber: 5,
  prevChapterTail: noonPrev,
  chapterOutline: huntOutline,
})
if (nextDayOk && /时辰倒退/.test(nextDayOk.message || '')) {
  throw new Error('next-day dawn after noon should not be time rewind')
}

// 上章已意译完成「进林」→ 本章起因须判过期，不得再逼开篇重写「踏入」
const forestOutline = [
  '【本章起因】秦卫国踏入白雪皑皑的林场深处',
  '【局面变化】发现野兔踪迹',
  '【人物选择】冷静判断，设下陷阱',
  '【章末问题】陷阱能否奏效？',
].join('\n')
// 前缀夹一段早先「秦卫国」对话，末段才进林——过期须看末窗而非全文首个姓名
const forestPrev = (
  '秦卫国在屋里把话说完，苏婉点了点头。'.repeat(20)
  + '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。他脚步踩实了雪，一步步往林子深处走，踏进那片白茫茫的林场。'
)
const forestStale = findStaleOutlineBeats(forestOutline, forestPrev)
console.log('forest catalyst stale:', forestStale)
if (!forestStale.some(s => /踏入|林场深处/.test(s))) {
  throw new Error('paraphrased enter-forest in prev must stale 本章起因')
}
const forestContinue = detectChapterSeamColdOpen({
  content: ('秦卫国在雪地上放慢脚步，凭老底子扫过兽道，很快发现野兔踪迹，冷静设下陷阱。').repeat(6),
  chapterNumber: 4,
  prevChapterTail: forestPrev,
  chapterOutline: forestOutline,
})
console.log('forest continue cold:', forestContinue?.message?.slice(0, 60) ?? null)
if (forestContinue && /未命中本章起因|踏入白雪皑皑/.test(forestContinue.message || '')) {
  throw new Error('after stale catalyst, continue-in-forest must not demand 踏入 again')
}

console.log('PASS')
