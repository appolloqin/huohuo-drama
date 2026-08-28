/**
 * 伪【变更记录】散文须回收为正文；结构化块才剥离
 * Run: npx tsx scripts/verify-change-record-reclaim.ts
 */
import {
  normalizeChangeRecordArtifacts,
  stripNovelChangeRecord,
  isStructuredChangeRecordBlock,
} from '../src/common/novel/novel-change-record.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const tip = '林子里黑得快，秦卫国眯起眼数着树干上的苔痕分辨方向。'
const fakeProse = '风小了些，可冷得更扎骨头。秦卫国蹲在松林边沿一棵老松背后，两只手拢在袖筒里。'
const fake2 = '他往手心里哈了口气，搓了搓，然后才抬脚往脚印方向摸过去。'
const dumped = [
  tip,
  '',
  '【变更记录】',
  '',
  fakeProse,
  '',
  '【变更记录】',
  '',
  fake2,
].join('\n')

assert(!isStructuredChangeRecordBlock(`【变更记录】\n\n${fakeProse}`), 'prose dump not structured')

const n = normalizeChangeRecordArtifacts(dumped)
assert(n.reclaimedFakeBlocks === 2, `expected 2 fake blocks, got ${n.reclaimedFakeBlocks}`)
assert(!n.changeBlock, 'fake dump must not become metadata')
assert(n.prose.includes(tip) && n.prose.includes(fakeProse) && n.prose.includes(fake2), 'all prose reclaimed')
assert(!n.prose.includes('【变更记录】'), 'headers removed from prose')

const stripped = stripNovelChangeRecord(dumped)
assert(!stripped.includes('【变更记录】'), 'strip must hide headers')
assert(stripped.includes(fakeProse), 'strip must keep reclaimed story')
console.log('fake change-record reclaim ok')

const structured = [
  tip.repeat(3),
  '',
  '【变更记录】',
  '- 场景: 林缘 → 松林道口',
  '  因果: 循野兔脚印摸到背风灌木丛并布下铁丝套',
].join('\n')
assert(isStructuredChangeRecordBlock(structured.slice(structured.indexOf('【变更记录】'))), 'structured ok')
const n2 = normalizeChangeRecordArtifacts(structured)
assert(!!n2.changeBlock, 'structured kept as metadata')
assert(n2.prose.includes(tip) && !n2.prose.includes('因果:'), 'prose excludes structured block')
assert(!stripNovelChangeRecord(structured).includes('【变更记录】'), 'editor strips structured')
console.log('structured change-record ok')

/** 加粗标题 + 夹在正文中间：后续故事必须回收，元数据不得吞进编辑区 */
const before = [
  '三百两。',
  '',
  '清河县一个壮劳力卖命干一个月，刨去嚼裹也就剩二两上下。三百两，等于一百五十个壮劳力白干一个月。这是秦家砸锅卖铁也凑不出来的数。',
  '',
  '更何况还要一具游煞骸骨——那东西沾上就甩不掉，谁敢往家里搬？',
  '',
  '秦霄肩头被压得生疼，骨头咯吱作响。',
  '',
  '他没说话，眼睛慢慢抬起来，看着钱虎那张横肉乱颤的脸。',
  '',
  '（三百两的债，印在肩头）',
].join('\n')
const after = [
  '三百两，清河县卖命1月剩二两上下，一百五十个月——这是要拿秦家全族男女老少的命去填。',
  '',
  '钱虎那张横肉脸已经凑到秦霄鼻尖前头，满嘴大蒜味冲得人脑仁疼。',
  '',
  '“听见没？画押！”',
].join('\n')
const midChapterBold = [
  before,
  '',
  '**【变更记录】**',
  '- 场景: 清河县·秦家祠堂前院（日落前后）',
  '  因果: 钱虎踹门入祠堂摔借据→按秦霄肩头要画押→秦霄被压至画押边缘',
  '  触发: 钱虎以尸傀门外门弟子身份上门逼债',
  '  代价: 秦霄下巴被借据划出血印，肩头骨节受压',
  '  感知: 煞气腥膻、祠堂压抑、众人噤声',
  '  耗时: 约一刻钟',
  '',
  '- 时间: 日落前后约一个时辰内（祠堂对峙开场）',
  '  因果: 钱虎登门逼债起算对峙时间',
  '',
  '- 人物/钱虎: 主动上门逼债，亮出尸傀门名头与镇魔司备案威胁',
  '  因果: 以“通魔”为名限期1日交三百两+游煞骸骨，否则逐族备案',
  '',
  '- 人物/秦卫东: 在场攥拳未动',
  '  因果: 护短但无实权（三房无产业挂名），不敢当场翻脸',
  '',
  '- 人物/秦卫南: 在场盘算',
  '  因果: 暗中算账，倾向交出秦霄一人保秦家其余',
  '',
  '- 人物/秦耀祖: 在场沉默',
  '  因果: 大房掌家但脸色难看，未表态',
  '',
  '- 物品/借据: 被钱虎摔到秦霄脸上并压住',
  '  因果: 三百两白银的限期借据成为当场主催物',
  '',
  '- 伏笔: 【V-003】',
  '',
  after,
].join('\n')

const n3 = normalizeChangeRecordArtifacts(midChapterBold)
assert(!!n3.changeBlock, 'mid-chapter structured block kept')
assert(n3.changeBlock!.includes('因果: 钱虎踹门'), 'changeBlock keeps causal entries')
assert(!n3.changeBlock!.includes('听见没'), 'changeBlock must not swallow trailing story')
assert(n3.prose.includes(before.slice(0, 20)), 'leading prose kept')
assert(n3.prose.includes('听见没？画押！'), 'trailing story reclaimed into prose')
assert(!n3.prose.includes('**【变更记录】**') && !n3.prose.includes('【变更记录】'), 'headers gone from prose')
assert(!n3.prose.includes('因果: 钱虎踹门'), 'causal meta not in prose')
const stripped3 = stripNovelChangeRecord(midChapterBold)
assert(stripped3.includes('听见没？画押！'), 'editor shows trailing story')
assert(!stripped3.includes('变更记录'), 'editor hides change-record')
assert(!stripped3.includes('因果:'), 'editor hides causal lines')
console.log('mid-chapter bold header + trailing prose ok')

/** 无标题：直接把 - 场景/因果 插进正文中间 */
const orphanBefore = [
  '钱虎脸上青一阵白一阵。他往地上啐了一口，甩着发麻的半边胳膊，皮笑肉不笑地哼了一声：“行，秦霄，你有种。尸傀门的账，从来不是靠撕一张纸就能了结的。”',
  '',
  '“那就请钱兄回去，把账本换一本新的来。”秦霄垂着眼，把那片借据角叠好，塞进袖袋里，“这一本，秦家不认。”',
].join('\n')
const orphanAfter =
  '钱虎把那半张借据揉成一团，揣回怀里。他整了整被油灯泼脏的袖口，眯起眼盯了秦霄半晌，忽然仰头大笑三声。'
const orphanMid = [
  orphanBefore,
  '',
  '- 场景: 清河县秦家祠堂前院（落地即入，未离场）',
  '  因果: 秦霄接住钱虎的战书→未起冲突，仅对峙→祠堂逼债开场，钱虎按肩要他画押，秦家无人敢出头',
  '  触发: 钱虎当面摔借据，限期1日三百两',
  '- 时间: 日落前后（穿越落点衔接，未跳切）',
  '  因果: 上章末穿越当夜→本章接日落祠堂戏，时间连贯',
  '- 人际: 秦卫东欲护侄被秦卫南扯回；秦卫南暗自盘算；秦耀祖不偏袒',
  '  因果: 钱虎尸傀门名头压人→秦家叔伯各怀心思',
  '- 状态: 秦霄肩头被按，嗓子发哑，尚未还手',
  '  因果: 刚穿越→躯体陌生，五脏如拧，肩伤属实',
  '',
  orphanAfter,
].join('\n')

const n4 = normalizeChangeRecordArtifacts(orphanMid)
assert(!!n4.changeBlock, 'orphan structured block extracted')
assert(n4.changeBlock!.includes('因果: 秦霄接住钱虎'), 'orphan changeBlock keeps causal')
assert(!n4.changeBlock!.includes('仰头大笑'), 'orphan changeBlock no trailing story')
assert(n4.prose.includes('秦家不认'), 'leading orphan prose kept')
assert(n4.prose.includes('仰头大笑三声'), 'trailing orphan prose kept')
assert(!n4.prose.includes('因果:'), 'orphan causal not in prose')
assert(!n4.prose.includes('- 场景:'), 'orphan bullets not in prose')
const stripped4 = stripNovelChangeRecord(orphanMid)
assert(stripped4.includes('仰头大笑三声'), 'editor keeps story around orphan')
assert(!stripped4.includes('因果:'), 'editor strips orphan causal')
assert(!stripped4.includes('- 人际:'), 'editor strips orphan bullets')
console.log('orphan no-header mid-chapter ok')

console.log('PASS')
