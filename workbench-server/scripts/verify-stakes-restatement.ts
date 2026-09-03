/**
 * 条款复读：同一金额+时限+证物/罪名簇 ≥3 次 → 剥后段；对白后数字回声也剥。
 * npx tsx scripts/verify-stakes-restatement.ts
 */
import {
  countStakesPackageHits,
  stripStakesPackageRestatement,
} from '../src/services/novel/novel-stakes-restatement.js'
import { stripIntraChapterNearDuplicate } from '../src/services/novel/novel-intra-chapter-dedupe.js'

const sample = [
  '“三百两白银，3日之内。一具游煞骸骨，3日之内。少一样，秦霄，我钱虎就把你这通魔的案子报上镇魔司。”祠堂前的青石板被日头晒得发烫，钱虎一只手把借据摔在供桌上，另一只手已经按住了秦霄的肩头。',
  '',
  '“按了手印就是欠账。三百两白银，一文不能少。”钱虎皮笑肉不笑，拇指在秦霄肩头又压了压，“你要是拿不出，我钱虎替尸傀门行个方便，把你秦家从清河县除名。通魔的罪名，可不是你一个破落门户担得起的。”三百两白银。',
  '',
  '清河县壮劳力忙死忙活一个月，余钱不过二两。三百两，那是十几年的嚼裹。',
  '',
  '“秦二爷，火气别这么大。”他慢条斯理地把借据往前推了推，“按了手印就是欠账。我钱虎好心，给你们秦家留条活路，3日之内，三百两白银，一具游煞骸骨。少一样，我报上去，秦家上下一个不留。”三百两白银加一具游煞骸骨。',
  '',
  '3日。秦霄能感觉到肩头那只手的重量。',
  '',
  '钱虎一字一句，“秦家若是清白，3日之内，拿三百两银子出来，外加一具游煞的完整骸骨。银子是给尸傀门上下喝茶赔罪，骸骨是证你秦家清白。”他左手一翻，煞刀“啪”地拍在祠堂的石供桌上。',
  '',
  '“3日。明早卯时起算。” “逾时不见——”钱虎眯起眼，“明日同时辰，尸傀门弟子亲自来秦家，逐户搜。搜出与魔物勾结的证物，秦家满门，逐出清河县。镇魔司那边，尸傀门自会去备案。”',
].join('\n')

const beforeHits = countStakesPackageHits(sample)
if (beforeHits < 3) {
  throw new Error(`expected ≥3 package hits before strip, got ${beforeHits}`)
}

const { text, removed } = stripStakesPackageRestatement(sample)
if (!removed) throw new Error('expected removed=true')

const afterHits = countStakesPackageHits(text)
if (afterHits >= beforeHits) {
  throw new Error(`hits should drop: before=${beforeHits} after=${afterHits}`)
}
if (afterHits > 2) {
  throw new Error(`expected ≤2 package hits after strip, got ${afterHits}\n${text}`)
}

// 对白后数字回声应去掉
if (/。”三百两白银。/.test(text) || /不留。”三百两白银加/.test(text)) {
  throw new Error(`narration echo left:\n${text}`)
}
if (/^3日。/m.test(text) && text.includes('肩头那只手')) {
  // bare "3日。" echo before weight beat should be gone
  throw new Error(`bare deadline echo left:\n${text}`)
}

// 带新手段的升级（搜屋/逐出）应保留
if (!text.includes('逐户搜') || !text.includes('逐出清河县')) {
  throw new Error(`escalation with new means must keep:\n${text}`)
}

// 开篇条款应完整保留（勿被回声误删）
if (!text.includes('三百两白银，3日之内') || !text.includes('报上镇魔司')) {
  throw new Error(`first package must keep intact:\n${text}`)
}

// 经章内去重入口也应生效
const viaDedupe = stripIntraChapterNearDuplicate(sample).text
const viaHits = countStakesPackageHits(viaDedupe)
if (viaHits > 2) {
  throw new Error(`dedupe path still has ${viaHits} hits`)
}

// 干净正文不动
const clean = '秦霄撕了借据。钱虎脸色铁青，转身走了。'
const cleanOut = stripStakesPackageRestatement(clean)
if (cleanOut.removed || cleanOut.text !== clean) {
  throw new Error('clean text must be unchanged')
}

console.log('verify-stakes-restatement OK', { beforeHits, afterHits })

// 跨角色接招复读：钱虎立约后秦霄整段复述 → 应剥后段
const crossSpeaker = [
  '钱虎一字一句，“明日卯时起算。拢共3日。第4日辰时，我来收骸骨。秦家三十七口人，一个不少。”',
  '',
  '秦霄抬眼，对三叔说：“三叔，家里还剩二十七两，我全拿出来。”',
  '',
  '他又补一句，“明日卯时起，拢共3日。第4日辰时，钱虎来收骸骨；骸骨不到，秦家上下三十七口，连坐。”',
  '',
  '他把「连坐」两个字又说一遍。',
].join('\n')

const crossOut = stripStakesPackageRestatement(crossSpeaker)
if (!crossOut.removed) throw new Error('cross-speaker echo should be stripped')
if (/明日卯时起，拢共3日/.test(crossOut.text)) {
  throw new Error(`cross-speaker package echo left:\n${crossOut.text}`)
}
if (/又说一遍/.test(crossOut.text)) {
  throw new Error(`emphasis term repeat left:\n${crossOut.text}`)
}
if (!crossOut.text.includes('明日卯时起算') || !crossOut.text.includes('二十七两')) {
  throw new Error(`first package and accept beat must keep:\n${crossOut.text}`)
}

console.log('verify-stakes-restatement cross-speaker OK')
