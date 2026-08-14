/**
 * 状态卡 6 维 + 账本 15 维：本地验收用正/反例目录（不调 LLM）。
 * 每维至少 1 组 ok（逻辑自洽）+ 1 组 bad（该维逻辑断裂）。
 */
import type { NovelContinuityFields } from '../../common/novel/novel-continuity-state.js'
import type { ChapterStateCard } from '../../common/novel/novel-state-card.js'
import {
  CONTINUITY_LEDGER_DIM_LABELS,
} from '../../common/novel/novel-continuity-state.js'
import { STATE_CARD_SIX_DIM_LABELS } from '../../common/novel/novel-state-card.js'

export type DimensionAuditGroup = 'state_card' | 'ledger'

export type DimensionAuditFixture = {
  id: string
  group: DimensionAuditGroup
  /** 中文维名，须与 STATE_CARD_SIX_DIM_LABELS / CONTINUITY_LEDGER_DIM_LABELS 一致 */
  dimension: string
  /** 注入块中须出现的锚点事实（证明该维有记录） */
  okAnchor: string
  /** 反例正文中的断裂摘录（供 mock violation） */
  badExcerpt: string
  /** 反例逻辑说明（给人看 / mock message） */
  breakHint: string
  prevCard: ChapterStateCard
  prevLedger: NovelContinuityFields
  okContent: string
  badContent: string
}

function padNovel(seed: string, minChars = 240): string {
  let s = seed.trim()
  const filler = '他继续在雪地里放慢脚步，仔细辨认脚印方向与风向，不敢发出多余声响。'
  while ([...s].length < minChars) s += filler
  return s
}

const BASE_CARD: ChapterStateCard = {
  chapter_number: 3,
  content_hash: 'fixture-ch3',
  updated_at: '2026-08-08T00:00:00.000Z',
  schema_version: 1,
  timeline: '同日下午',
  place: '林场边缘',
  scene: '雪地进林',
  cast: '秦卫国',
  progress: {
    catalyst_done: true,
    last_event: '往林子深处走',
    open_threads: '野兔脚印未追尽',
  },
  props: '猎刀',
  summary_line: '进林寻踪',
}

const BASE_LEDGER: NovelContinuityFields = {
  environment: '林场雪地，冷风贴地',
  realm: '凡人无功法',
  resources: '猎刀一把、糠饼半块',
  appearance: '粗布棉袄、冻红的脸',
  personality: '寡言务实，少废话',
  injuries: '左腕擦伤未愈',
  timeline: '同日下午未过申时',
  relations: '与林场看守有隙',
  foreshadowing: '野兔脚印通向林深处岔路',
  actions: '正往林深处走、准备设陷阱',
  knowledge: '记得岔路口可下套',
  abilities: '不会法术，只会打猎手艺',
  emotion: '警惕紧张',
  reminder: '勿写归家炖汤越界',
  delta: '从林缘推进到设陷阱前',
}

const OUTLINE = '【本章起因】踏入林场寻踪\n【阻碍】雪深难行\n【局面变化】发现野兔脚印\n【人物选择】设下陷阱'

function withCard(patch: Partial<ChapterStateCard>): ChapterStateCard {
  return {
    ...BASE_CARD,
    ...patch,
    progress: { ...BASE_CARD.progress, ...(patch.progress || {}) },
  }
}

function withLedger(patch: Partial<NovelContinuityFields>): NovelContinuityFields {
  return { ...BASE_LEDGER, ...patch }
}

/** 21 维完整目录：每维正/反各一例 */
export const DIMENSION_AUDIT_FIXTURES: readonly DimensionAuditFixture[] = [
  {
    id: 'sc-timeline',
    group: 'state_card',
    dimension: '时间线',
    okAnchor: '同日下午',
    badExcerpt: '翌日清晨日头刚露',
    breakHint: '无交代从同日下午跳到翌日清晨',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('同日下午，秦卫国沿脚印往林深处挪，雪深没踝，他握紧猎刀，找合适处设下陷阱。'),
    badContent: padNovel('翌日清晨日头刚露，秦卫国忽然已在林深处醒来，仿佛昨夜从未发生过进林之事。'),
  },
  {
    id: 'sc-place',
    group: 'state_card',
    dimension: '地点',
    okAnchor: '林场边缘',
    badExcerpt: '站在门廊下整理行装',
    breakHint: '上章已离出发点在途，本章以当前进行时重演出发前状态且无补叙/回忆/跨日交代，逻辑不自洽',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他仍在林场边缘一带，循着脚印往深处挪，雪地吱呀作响，准备设陷阱。'),
    badContent: padNovel(
      '他站在门廊下整理行装，又回屋取绳刀，再推门出门往林子走，仿佛尚未离宅，上章已在途的事实被无交代抹掉。',
    ),
  },
  {
    id: 'sc-scene',
    group: 'state_card',
    dimension: '场景',
    okAnchor: '雪地进林',
    badExcerpt: '盛夏烈日晒得河滩发烫',
    breakHint: '雪地进林与盛夏河滩场景互斥且无交代',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('雪地进林，寒气贴脸。秦卫国弯腰辨脚印，在灌木后设下陷阱。'),
    badContent: padNovel('盛夏烈日晒得河滩发烫，他赤脚踩沙捉鱼，与进林寻踪毫无承接。'),
  },
  {
    id: 'sc-cast',
    group: 'state_card',
    dimension: '人物',
    okAnchor: '秦卫国',
    badExcerpt: '我本是知府公子赵明远',
    breakHint: '无交代替换主角身份',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('秦卫国独自在雪地里挪步，握刀，盯着脚印，决定在岔路口设下陷阱。'),
    badContent: padNovel('我本是知府公子赵明远，此刻在雪地里闲逛，与秦卫国进林寻踪的事实相悖。'),
  },
  {
    id: 'presence-bad-teleport',
    group: 'state_card',
    dimension: '人物',
    okAnchor: '推门进了山',
    badExcerpt: '苏婉拿过那截湿糟糟的麻绳',
    breakHint: '独处/离场已立后，他者无桥接即以同场动作出场',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel(
      '秦卫国推门进了山。雪粒子砸脸。他正挑桦木，苏婉从坡下赶了上来，接过麻绳说这哪能用。',
    ),
    badContent: padNovel(
      '秦卫国捆成一卷背上身，推门进了山。雪粒子砸脸。他压住桦木试弹力。苏婉拿过那截湿糟糟的麻绳，捻了两下说这哪能用。',
    ),
  },
  {
    id: 'presence-ok-bridge',
    group: 'state_card',
    dimension: '动作逻辑',
    okAnchor: '赶了上来',
    badExcerpt: '苏婉拿过那截湿糟糟的麻绳',
    breakHint: '有赶来桥接则同场合法；无桥接则动作逻辑不自洽',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel(
      '秦卫国推门进了山。听见雪壳响，苏婉从坡下赶了上来，拿过麻绳捻了两下。',
    ),
    badContent: padNovel(
      '秦卫国推门进了山。他独自挑树。苏婉拿过那截湿糟糟的麻绳，在手指间捻了两下。',
    ),
  },
  {
    id: 'presence-ok-mention-only',
    group: 'state_card',
    dimension: '人物',
    okAnchor: '想起苏婉',
    badExcerpt: '苏婉拿过那截湿糟糟的麻绳',
    breakHint: '仅想起不构成同场；同场无桥接才是硬伤',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel(
      '秦卫国独自推门进了山。雪地里他想起苏婉还在屋里纳鞋底，便加快手脚布套。',
    ),
    badContent: padNovel(
      '秦卫国独自推门进了山。苏婉拿过那截湿糟糟的麻绳，在手指间捻了两下。',
    ),
  },
  {
    id: 'sc-last-event',
    group: 'state_card',
    dimension: '刚发生',
    okAnchor: '往林子深处走',
    badExcerpt: '刚在灶台边炖好野兔汤',
    breakHint: '未承接「往林子深处走」，却写成已归家炖汤',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他继续往林子深处走，脚印更密，终于选定灌木后沿，动手设下陷阱。'),
    badContent: padNovel('刚在灶台边炖好野兔汤，屋里暖香扑鼻，他早已离开林场回到家中。'),
  },
  {
    id: 'sc-props',
    group: 'state_card',
    dimension: '道具/衣着',
    okAnchor: '猎刀',
    badExcerpt: '手里空空从没带过刀',
    breakHint: '上章持猎刀，本章无交代变为从未带刀',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他抽出猎刀削藤条，在雪地灌木后布下绳套，完成陷阱布置。'),
    badContent: padNovel('他手里空空从没带过刀，只能徒手扒雪，与持刀进林的事实相悖。'),
  },
  {
    id: 'lg-environment',
    group: 'ledger',
    dimension: '环境场景',
    okAnchor: '雪已下密',
    badExcerpt: '雪是下午才开始落的',
    breakHint: '上章环境过程已进入更重相位，本章无跨日/新过程交代写回才开始/初起，逻辑不自洽',
    prevCard: withCard({}),
    prevLedger: withLedger({ environment: '林场雪地，雪已下密，冷风贴地' }),
    okContent: padNovel('林场雪地里雪已下密，冷风贴地，秦卫国缩着肩往深处走，找地方设陷阱。'),
    badContent: padNovel(
      '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒，让风卷着往领口里钻。他站在门廊下抬头看天，仿佛密雪从未下过。',
    ),
  },
  {
    id: 'lg-realm',
    group: 'ledger',
    dimension: '修为境界',
    okAnchor: '凡人无功法',
    badExcerpt: '他催动金丹真元飞身而起',
    breakHint: '凡人无功却突然金丹飞身',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他仍是凡人手段，靠脚印与手艺设陷阱，不敢指望什么功法。'),
    badContent: padNovel('他催动金丹真元飞身而起，雪地瞬间被灵力掀开，与凡人无功法矛盾。'),
  },
  {
    id: 'lg-resources',
    group: 'ledger',
    dimension: '资源道具',
    okAnchor: '猎刀一把、糠饼半块',
    badExcerpt: '粮袋里装满十斤白面',
    breakHint: '资源从猎刀糠饼半块无交代变为十斤白面',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他摸了摸怀里仅剩的半块糠饼，握紧猎刀，继续在雪地设陷阱。'),
    badContent: padNovel('粮袋里装满十斤白面，他大嚼白馍，与只有糠饼半块的资源账矛盾。'),
  },
  {
    id: 'lg-appearance',
    group: 'ledger',
    dimension: '神态衣着',
    okAnchor: '粗布棉袄、冻红的脸',
    badExcerpt: '身披锦袍粉底描眉',
    breakHint: '衣着从粗布棉袄变为锦袍描眉且无交代',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('粗布棉袄沾满雪末，冻红的脸上神色凝重，他弯腰布设陷阱。'),
    badContent: padNovel('身披锦袍粉底描眉，他在雪地里顾影自怜，与粗布棉袄形象矛盾。'),
  },
  {
    id: 'lg-personality',
    group: 'ledger',
    dimension: '人设口吻',
    okAnchor: '寡言务实，少废话',
    badExcerpt: '他连篇累牍吟诗作赋卖弄才学',
    breakHint: '寡言务实人设变为卖弄才学',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他只哼一声，不多话，动手把绳套系好，继续盯着脚印。'),
    badContent: padNovel('他连篇累牍吟诗作赋卖弄才学，与寡言务实的口吻人设相悖。'),
  },
  {
    id: 'lg-injuries',
    group: 'ledger',
    dimension: '身体伤势',
    okAnchor: '左腕擦伤未愈',
    badExcerpt: '双手完好从未受过伤',
    breakHint: '左腕擦伤未愈被无交代抹掉',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('左腕擦伤牵扯得生疼，他仍咬牙用右手系绳，把陷阱设稳。'),
    badContent: padNovel('双手完好从未受过伤，他灵活舞刀，与左腕擦伤未愈矛盾。'),
  },
  {
    id: 'lg-timeline',
    group: 'ledger',
    dimension: '时间节奏',
    okAnchor: '同日下午未过申时',
    badExcerpt: '已是三天后的黎明',
    breakHint: '时间节奏从同日下午无交代跳到三天后',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('同日下午未过申时，天光仍亮，他抓紧把陷阱布置完。'),
    badContent: padNovel('已是三天后的黎明，他才想起进林一事，时间节奏断裂。'),
  },
  {
    id: 'lg-relations',
    group: 'ledger',
    dimension: '人际势力',
    okAnchor: '与林场看守有隙',
    badExcerpt: '林场看守是他生死兄弟',
    breakHint: '与看守有隙变为生死兄弟',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他故意避开看守巡逻的小路，悄声在岔路口设陷阱。'),
    badContent: padNovel('林场看守是他生死兄弟，两人把酒言欢，与有隙关系矛盾。'),
  },
  {
    id: 'lg-foreshadow',
    group: 'ledger',
    dimension: '伏笔设定',
    okAnchor: '野兔脚印通向林深处岔路',
    badExcerpt: '这林子里从无野兽脚印',
    breakHint: '已埋脚印伏笔被无交代否定',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('野兔脚印通向林深处岔路，他循迹而去，在岔口外侧设下陷阱。'),
    badContent: padNovel('这林子里从无野兽脚印，他空手而归，否定已成立的脚印伏笔。'),
  },
  {
    id: 'lg-actions',
    group: 'ledger',
    dimension: '动作逻辑',
    okAnchor: '正往林深处走、准备设陷阱',
    badExcerpt: '他其实一直躺在家里睡觉',
    breakHint: '动作链从进林设陷阱被改写成一直在家睡觉',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他正往林深处走，选好灌木后沿，蹲下开始设陷阱。'),
    badContent: padNovel('他其实一直躺在家里睡觉，从未进林，动作逻辑整段断裂。'),
  },
  {
    id: 'lg-knowledge',
    group: 'ledger',
    dimension: '认知记忆',
    okAnchor: '记得岔路口可下套',
    badExcerpt: '他完全不记得任何岔路与下套法',
    breakHint: '已知岔路口可下套被抹成失忆',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他记得岔路口可下套，于是径直走到岔口，动手布置。'),
    badContent: padNovel('他完全不记得任何岔路与下套法，站在雪地发呆，认知记忆矛盾。'),
  },
  {
    id: 'lg-abilities',
    group: 'ledger',
    dimension: '功法能力',
    okAnchor: '不会法术，只会打猎手艺',
    badExcerpt: '他掐诀放出火球融化积雪',
    breakHint: '不会法术却掐诀放火球',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他不会法术，只靠打猎手艺削藤结套，把陷阱藏进雪窝。'),
    badContent: padNovel('他掐诀放出火球融化积雪，与不会法术的能力账矛盾。'),
  },
  {
    id: 'lg-emotion',
    group: 'ledger',
    dimension: '情绪递进',
    okAnchor: '警惕紧张',
    badExcerpt: '他欢天喜地毫无戒心大声唱歌',
    breakHint: '警惕紧张无过渡变为欢天喜地无戒心',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他仍警惕紧张，压低呼吸，轻轻把陷阱踩实，生怕惊动猎物。'),
    badContent: padNovel('他欢天喜地毫无戒心大声唱歌，情绪递进从紧张直接跳到狂欢。'),
  },
  {
    id: 'lg-reminder',
    group: 'ledger',
    dimension: '一致性提醒',
    okAnchor: '勿写归家炖汤越界',
    badExcerpt: '回家炖汤庆祝丰收',
    breakHint: '明确提醒勿写归家炖汤却写成归家炖汤',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('他按提醒留在林场，专注设陷阱，绝不提前写归家情节。'),
    badContent: padNovel('回家炖汤庆祝丰收，热气腾腾，直接踩中勿写归家炖汤的提醒。'),
  },
  {
    id: 'lg-delta',
    group: 'ledger',
    dimension: '本章变化',
    okAnchor: '从林缘推进到设陷阱前',
    badExcerpt: '本章变化是他已回城当了掌柜',
    breakHint: 'delta 推进方向被改成回城当掌柜',
    prevCard: withCard({}),
    prevLedger: withLedger({}),
    okContent: padNovel('承接上章变化，他从林缘继续推进，终于在设陷阱前站定，动手布套。'),
    badContent: padNovel('本章变化是他已回城当了掌柜，算盘打得噼啪响，与进林推进矛盾。'),
  },
] as const

export const DIMENSION_AUDIT_OUTLINE = OUTLINE

export function listAllDimensionLabels(): string[] {
  return [...STATE_CARD_SIX_DIM_LABELS, ...CONTINUITY_LEDGER_DIM_LABELS]
}

export function assertDimensionFixtureCoverage(): void {
  const expected = listAllDimensionLabels()
  const got = DIMENSION_AUDIT_FIXTURES.map(f => f.dimension)
  if (DIMENSION_AUDIT_FIXTURES.length !== 21) {
    throw new Error(`expected 21 fixtures, got ${DIMENSION_AUDIT_FIXTURES.length}`)
  }
  for (const lab of expected) {
    if (!got.includes(lab)) throw new Error(`missing fixture for dimension: ${lab}`)
  }
  const dup = got.filter((d, i) => got.indexOf(d) !== i)
  if (dup.length) throw new Error(`duplicate fixtures: ${dup.join(',')}`)
}
