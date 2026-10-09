/**
 * 主流网文平台审稿标准（注入 novel_review）。
 * 番茄条目对齐官方「安全审核 + 质量评估」口径；其余为平台气质摘要。
 */

export const NOVEL_REVIEW_PLATFORMS = ['fanqie', 'qidian', 'jinjiang', 'generic'] as const
export type NovelReviewPlatform = (typeof NOVEL_REVIEW_PLATFORMS)[number]

export const NOVEL_REVIEW_PLATFORM_LABELS: Record<NovelReviewPlatform, string> = {
  fanqie: '番茄小说',
  qidian: '起点中文网',
  jinjiang: '晋江文学城',
  generic: '通用网文',
}

export function normalizeNovelReviewPlatform(raw?: string | null): NovelReviewPlatform {
  const k = (raw || '').trim().toLowerCase()
  if ((NOVEL_REVIEW_PLATFORMS as readonly string[]).includes(k)) return k as NovelReviewPlatform
  if (/番茄|fanqie|tomato/.test(raw || '')) return 'fanqie'
  if (/起点|qidian/.test(raw || '')) return 'qidian'
  if (/晋江|jjwxc|jinjiang/.test(raw || '')) return 'jinjiang'
  return 'fanqie' // 默认番茄：当前过审痛点最高
}

/** 注入审稿 system/user 的平台标准正文 */
export function buildNovelReviewPlatformRubric(platform: NovelReviewPlatform): string {
  switch (platform) {
    case 'fanqie':
      return FANQIE_RUBRIC
    case 'qidian':
      return QIDIAN_RUBRIC
    case 'jinjiang':
      return JINJIANG_RUBRIC
    default:
      return GENERIC_RUBRIC
  }
}

const FANQIE_RUBRIC = `【平台审稿标准·番茄小说】（本章必须按此过一遍；命中安全项优先 S1）

## 一、安全审核（一票否决向）
审核作品是否存在内容安全风险，包括但不限于：
- 低俗色情、性暗示擦边、未成年人相关不当描写
- 违反公序良俗、美化违法犯罪、可操作违法步骤
- 侵权抄袭嫌疑（大段套用知名桥段却无本书独有切入）
- 仇恨煽动、敏感政治细节、过度血腥酷刑教学
→ 任一项明确命中：severity=S1，category=safety，verdict 倾向 REJECT

## 二、质量评估 · 低质否决（❌）
下列任一项明显成立 → 至少 S2（category=platform），多项则 REJECT：
- 粗制滥造：套话堆砌、模板打脸流水、无具体场面
- 逻辑混乱：因果断裂、人设突变、前后矛盾
- 结构失常：无主线、章功能不清、过场灌水当正文
- 内容空洞：无信息增量、无冲突、无选择代价
- 刻意注水：重复解释、工序清单、同一条款复读凑字

## 三、质量评估 · 优质标准（✅ 须尽量满足）
1. **创新切入**：题材切口、开篇事件或人物设定有新鲜点，能快速激发好奇（开篇勿天气/冻醒盘点当唯一钩子）
2. **三观正向**：立意可自然融入故事，不说教；恶可存在但价值落点稳
3. **文笔清晰**：能准确生动讲故事；短段快节奏；禁说明书腔与章尾预告升华
4. **结构完整**：主线清晰、节奏稳定、有长期发展潜力（章末须留未决具体事件/期待）

## 四、番茄气质加分项（不达标多为 S2/S3）
- 前 3 段内出现冲突/悬念/钩子
- 章尾有翻页动力（悬念/反转/新信息/倒计时）
- 短段落、高信息密度；每约 1000 字有情绪起伏
- 标签卖点（逆袭/打脸/甜宠等）在本章可见兑现或推进`

const QIDIAN_RUBRIC = `【平台审稿标准·起点中文网】

## 安全
同通用安全红线：色情擦边、违法教学、仇恨煽动、侵权硬套 → S1/safety

## 质量
- 爽点/情绪节点：本章应有可见升级、打脸、获宝、破局或关系推进之一
- 金手指/核心卖点：须被提及或使用，禁止连续空转
- 章尾钩子：悬念/新信息/未决事件
- 主角代理权：关键结果由主角选择挣来，禁止配角无声夺走高光
- 设定自洽与长线潜力：勿提前打光终局底牌
- 注水/空洞/逻辑混乱 → platform S2+

## 气质
偏长线升级与世界观承载力；节奏可略慢于番茄，但不得无推进。`

const JINJIANG_RUBRIC = `【平台审稿标准·晋江文学城】

## 安全
严打低俗色情、未成年不当、侵犯名誉；感情线同意与边界清晰 → 违规 S1/safety

## 质量
- 人物关系与情感逻辑可信；禁止无铺垫的突然亲密/仇敌变情侣
- 情绪拉扯有层次；爽点可软可甜，但须有信息/关系变化
- 文笔细腻不等于注水；禁止大段空转心理与总结体
- 开篇人设/处境切口清晰，能留住目标读者
- 抄袭套路堆砌、逻辑混乱 → platform S2+`

const GENERIC_RUBRIC = `【平台审稿标准·通用网文】

## 安全
内容安全、低俗色情、公序良俗、侵权抄袭、违法教学 → S1/safety

## 质量
- 有卖点、冲突、选择与代价；章末有期待
- 文笔清楚可感；禁空洞注水与逻辑混乱
- 结构完整、主线清晰、节奏稳定`

/** 平台列表（给 API/前端） */
export function listNovelReviewPlatforms(): Array<{ id: NovelReviewPlatform; label: string }> {
  return NOVEL_REVIEW_PLATFORMS.map((id) => ({
    id,
    label: NOVEL_REVIEW_PLATFORM_LABELS[id],
  }))
}
