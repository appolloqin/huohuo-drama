/**
 * npx tsx scripts/verify-forward-seam-next-head.ts
 * 通用正向章缝：只禁字面抄下章开篇；剥尾不得把整章砍短。
 */
import { detectChapterForwardSeamCopy } from '../src/services/novel/novel-outline-compliance.js'
import {
  formatNextChapterForbidBlock,
  formatNextChapterForwardSeamBlock,
  stripForwardSeamCopyEnding,
} from '../src/services/novel/novel-chapter-seam.js'

const nextHead = (
  '赵大彪那句“中午请你验验”还在耳边绕着没散干净，秦卫国脚下已经绕进了茅屋后头那条背风的窄道。'
  + '积雪冻得瓷实，踩上去咔嚓咔嚓响。两只野兔还带着点余温，血腥味被外头的凛冽寒风一压，只剩一丝若有若无的腥。'
  + '他特意绕了个大圈，从后窗翻进自家院子。'
)

const handoffOk = (
  '赵大彪嗓门拔高截：“中午请你验验！”秦卫国侧过半张脸，闷声道：“我赶着回家。”'
  + '他背上两只野兔鼓鼓囊囊，抬脚往回程毛道走，不再回头。赵大彪阴着脸盯着他的背影，拇指在袖口里捻了捻。'
).repeat(6)
if (detectChapterForwardSeamCopy({ content: handoffOk, nextChapterHead: nextHead })) {
  throw new Error('false positive copy on handoff without next-head paste')
}

const body = (
  '秦卫国盯着他看了一秒。就一秒。然后他嘴角动一下，只是平平浅浅把目光收回来。'
  + '没再说话，脚步往旁边挪了半步，从赵大彪身侧绕了过去。赵大彪身子还想再横，秦卫国那只手轻轻往他肩膀上搭了搭。'
  + '等秦卫国走出三四步，赵大彪才在背后阴阳怪气地丢了句：“行，秦哥，您走好。改天得了空，我请您验验您这兔子的成色。”'
  + '秦卫国没回头。提着那只野兔，一步一步往山下走。'
)
const copiedEnding = '身后赵大彪那句“中午请你验验”还在耳边绕着没散干净，他脚下已经绕进了茅屋后头那条背风的窄道。'
const copied = (body.repeat(8) + copiedEnding)

const copyHit = detectChapterForwardSeamCopy({
  content: copied,
  nextChapterHead: nextHead,
})
if (!copyHit || copyHit.code !== 'chapter_forward_seam_copy') {
  throw new Error(`expected forward seam copy, got ${JSON.stringify(copyHit)}`)
}

const stripped = stripForwardSeamCopyEnding({
  content: copied,
  nextChapterHead: nextHead,
})
if (!stripped.stripped) throw new Error('expected strip of copied ending')
if (/还在耳边绕着没散干净/.test(stripped.text)) {
  throw new Error('stripped text still contains next-head recall frame')
}
if ([...stripped.text].length < Math.floor([...copied].length * 0.9)) {
  throw new Error('strip removed too much body')
}
if (detectChapterForwardSeamCopy({ content: stripped.text, nextChapterHead: nextHead })) {
  throw new Error('copy should clear after strip')
}

// 短正文禁止剥尾（防止只剩首拍）
const shortOnly = ('太阳压到山脊上了。秦卫国收紧麻绳。第二处有戏，套子里是只野兔。').repeat(3)
const noStripShort = stripForwardSeamCopyEnding({
  content: shortOnly + copiedEnding,
  nextChapterHead: nextHead,
})
if (noStripShort.stripped && [...noStripShort.text].length < 800) {
  throw new Error('must not strip short chapters down')
}

const officeNext = '李姐那句「明天把方案交上来」还在会议室回荡，林晚已经坐回工位打开了文档。'
const officeBody = ('林晚点了点头，收拾好笔记本。会议室内气氛凝重，投影还亮着。').repeat(8)
const officeCopy = officeBody + '李姐那句「明天把方案交上来」还在会议室回荡，林晚已经坐回工位打开了文档。'
if (!detectChapterForwardSeamCopy({ content: officeCopy, nextChapterHead: officeNext })) {
  throw new Error('expected office forward copy')
}

const forbid = formatNextChapterForbidBlock('【本章起因】晨会翻盘', 5)
if (!forbid.includes('禁止提前写')) throw new Error('forbid block')

const forward = formatNextChapterForwardSeamBlock(nextHead, 5)
if (!forward.includes('不提供下章开篇原文')) throw new Error('forward block must refuse raw next-head dump')
if (!forward.includes('停在下章开篇之前')) throw new Error('forward block missing stop-before rule')
if (forward.includes('中午请你验验') || forward.includes('还在耳边')) {
  throw new Error('forward block must not embed next-head prose')
}
if (forward.includes('仅供对照')) throw new Error('old copy-bait wording must be gone')

console.log('verify-forward-seam-next-head OK (no raw next-head in prompts)')
