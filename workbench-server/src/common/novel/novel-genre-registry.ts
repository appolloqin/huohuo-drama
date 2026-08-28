/** 小说题材 SSOT：preset、skillKey、横切 Skill 配置 */

export type NovelGenreStatus = 'active' | 'planned' | 'deprecated'

export type NovelGenreRegistryEntry = {
  value: string
  skillKey: string
  keywords: string
  premise: string
  status: NovelGenreStatus
}

export const NOVEL_GENRE_REGISTRY: NovelGenreRegistryEntry[] = [
  {
    value: '脑洞文',
    skillKey: 'brainhole',
    keywords: '高概念设定、规则自洽、认知错位、多层反转、落地人性',
    premise:
      '围绕一个「如果……」的高概念设定展开：规则公平但残酷，主角在荒诞与严肃并存的日常中被逼做出情感抉择。前期 estable 读者对规则的认知，中后期用伏笔回收完成认知颠覆，落点放在人的欲望与恐惧而非设定说明书。',
    status: 'active',
  },
  {
    value: '末世文',
    skillKey: 'apocalypse',
    keywords: '灾变爆发、资源紧缺、据点求生、人性灰度、异能进化',
    premise:
      '灾变瞬间秩序崩塌，主角在物资断绝与信任破裂中求生。资源有上限、怪物与环境同步恶化，冲突叠加外部威胁、内部猜忌与自我底线动摇，中期循环「搜物资—遇险—博弈—取舍」，后期揭开末世真相或势力格局升级。',
    status: 'active',
  },
  {
    value: '诡异文',
    skillKey: 'weird',
    keywords: '日常异化、规则怪谈、认知恐惧、留白恐怖、两难博弈',
    premise:
      '普通场景中出现微小错位异常，逐步显形一套必须遵守的诡异规则。主角冷静拆解规则盲区，在遵守与试探间博弈；未知大于血腥，结局走向细思极恐或闭环宿命，保留未解释的恐惧空间。',
    status: 'active',
  },
  {
    value: '科幻文',
    skillKey: 'scifi',
    keywords: '硬科幻逻辑、科技代价、文明冲突、星际探索、伦理两难',
    premise:
      '一套自洽的超前科技或宇宙规则驱动主线，技术绑定消耗、风险与伦理缺陷。微观个人探索与宏观文明博弈并行，冲突围绕科技伦理、种族隔阂与身份抉择，终局以思辨留白或抗争史诗收束。',
    status: 'active',
  },
  {
    value: '游戏文',
    skillKey: 'game',
    keywords: '系统面板、副本闯关、等级装备、漏洞反杀、生存代价',
    premise:
      '主角进入完整游戏系统世界，等级、技能、道具与死亡惩罚严格生效。通过开荒、组队与势力争夺积累资本，利用规则漏洞智取强敌；爽点与淘汰压迫交替，逐步揭开系统幕后真相。',
    status: 'active',
  },
  {
    value: '言情文',
    skillKey: 'romance',
    keywords: '双向试探、细节偏爱、现实壁垒、克制暧昧、共同成长',
    premise:
      '现代或古代背景下，男女主因身份与性格对冲产生拉扯感。心动落在破例、偏爱与专属细节而非直白告白，感情按陌生试探—暧昧—破局—羁绊递进；现实或礼法壁垒制造张力，结局圆满或意难平皆可。',
    status: 'active',
  },
  {
    value: '仙侠文',
    skillKey: 'xianxia',
    keywords: '修仙境界、三界历练、道心抉择、秘境机缘、仙侣羁绊',
    premise:
      '自洽修炼境界与天道因果下，主角从凡界启蒙踏入修真界崛起。道心决定言行，破境伴随心魔与渡劫代价；双线推进修为升级与宿命/情爱，终局可选逍遥圆满、悲情宿命或以身殉道。',
    status: 'active',
  },
  {
    value: '虐恋文',
    skillKey: 'angst',
    keywords: '宿命枷锁、甜衬虐、隐忍伤害、误会决裂、永久伤痕',
    premise:
      '不可轻易打破的枷锁使相爱必有代价。前期细碎温柔铺垫，中后期克制之虐、决裂与失去层层递进；心理虐重于血腥，误会源于信息差与身不由己，结局偏向 BE、意难平或带疤圆满。',
    status: 'active',
  },
  {
    value: '玄幻文',
    skillKey: 'xuanhuan',
    keywords: '血脉觉醒、下界崛起、秘境夺宝、越级杀敌、万族征伐',
    premise:
      '自定义境界与三层版图下，主角从底层屈辱中觉醒血脉或传承。武学成长依托历练与恩怨抉择，非纯闭关；种族、宗门与域外势力多重冲突，征伐位面登顶或归隐逍遥。',
    status: 'active',
  },
  {
    value: '种田文',
    skillKey: 'farming',
    keywords: '开荒经营、四季农事、稳步积累、烟火治愈、轻冲突',
    premise:
      '绝境清贫开局，靠耕种、养殖与手工加工建立自给自足闭环。小步增益、美食烟火与邻里温和矛盾交替，季节更替推动剧情；目标从温饱安稳到家业兴旺，基调慢节奏治愈踏实。',
    status: 'active',
  },
  {
    value: '官场文',
    skillKey: 'officialdom',
    keywords: '层级权责、民生实干、派系博弈、潜台词、初心抉择',
    premise:
      '完整体制层级下，主角初入基层直面烂摊子与派系试探。民生实事主线与权力博弈支线并行，对话藏深意、行事合规矩；晋升靠实绩与布局而非热血开挂，终局实干圆满、遗憾妥协或悲情警醒。',
    status: 'active',
  },
  {
    value: '穿越文',
    skillKey: 'isekai',
    keywords: '现代灵魂、信息降维、原主烂摊子、规则代价、逆风翻盘',
    premise:
      '现代人带着三观与知识落差落入旧世界或书中，穿越有规则与代价。借认知优势解开局死局并低调发育，原主遗留恩怨成为翻盘抓手；剧情偏差跳出原著剧本，终局改写宿命或时空闭环。',
    status: 'active',
  },
  {
    value: '异能文',
    skillKey: 'superpower',
    keywords: '能力觉醒、消耗反噬、隐藏身份、族群对立、智谋破局',
    premise:
      '异能起源与分级体系自洽，每次使用绑定精神力消耗与异化风险。主角在隐藏普通人生活与异能成长双线中周旋，对抗官方与地下势力；靠克制链与智谋取胜，非无脑碾压。',
    status: 'active',
  },
  {
    value: '校园文',
    skillKey: 'campus',
    keywords: '青涩暗恋、学业压力、课间微糖、成长羁绊、青春遗憾',
    premise:
      '高中或大学日常中，学业与感情双线并进。心动藏在顺路同行、共台灯与雨天共伞等细节，冲突来自排名、流言、家庭与升学抉择；基调真实烟火，结局圆满同窗或异地遗憾。',
    status: 'active',
  },
  {
    value: '悬疑文',
    skillKey: 'mystery',
    keywords: '伏笔回收、多层迷雾、物证逻辑、人性灰度、双反转',
    premise:
      '诡异疑点开局，线索可验证、真相可闭环。迷雾分层推进，证词真假混杂，每次接近真相都发现更大谎言；高潮集中回收伏笔，表层破案后另有深层反转，基调冷硬或细思极恐。',
    status: 'active',
  },
  {
    value: '武侠文',
    skillKey: 'wuxia',
    keywords: '江湖恩怨、侠义道心、内力克制、秘宝争夺、归隐侠义',
    premise:
      '正邪庙堂制衡的江湖格局中，主角背负血仇或初入武林。武学有消耗与短板，恩怨驱动打斗；道义、忠义与情侠冲突打破非黑即白，终局快意归隐、悲情漂泊或守太平。',
    status: 'active',
  },
  {
    value: '谍战文',
    skillKey: 'spy',
    keywords: '潜伏伪装、真假情报、试探钓鱼、取舍牺牲、局中局',
    premise:
      '三方势力高压制衡，主角以伪装身份执行秘密任务。单线联系与情报流程严苛，每次过关都伴随暴露风险；潜台词对话与将计就计推进剧情，终局隐忍圆满、悲壮殉道或意难平留白。',
    status: 'active',
  },
  {
    value: '驱魔文',
    skillKey: 'exorcism',
    keywords: '道士传承、符箓阵法、邪祟收服、道行炼体、斗法交锋',
    premise:
      '道门秩序与邪祟并存的现代或架空世界，主角身负异端传承或非常规术法。道行、法器、炼体与收服并进，冲突来自邪祟、同行、隐秘组织与自身反噬；符箓阵法与近身搏杀并重，每场斗法须有往来与代价，禁止把成长写成状态清单。',
    status: 'active',
  },
  {
    value: '都市文',
    skillKey: 'urban',
    keywords: '阶层资源、人脉博弈、职业线、轻超自然',
    premise: '现代都市背景下，主角在阶层、资源与人脉中破局崛起；可含轻超自然但不喧宾夺主。',
    status: 'planned',
  },
  {
    value: '高武文',
    skillKey: 'martial_peak',
    keywords: '全球高武、武道境界、学院国运、现代修炼',
    premise: '现代或全球格局下的武道修炼体系，国运/学院/秘境与境界突破并行。',
    status: 'planned',
  },
  {
    value: '历史文',
    skillKey: 'historical',
    keywords: '架空历史、权谋战争、考据适度',
    premise: '架空或半架空历史背景下，权谋与战争场面驱动主线，考据适度不教条。',
    status: 'planned',
  },
]

export const NOVEL_AGENT_CROSS_CUTTING = {
  novel_chapter_writer: [
    'chapter_craft_core',
    'scene_drama',
    'continuity',
    'compliance',
    'stage_beat',
    'chapter_role',
    'serial_pulse',
  ],
  novel_outline: ['continuity', 'chapter_hooks'],
  novel_writing_brief: [
    'chapter_craft_core',
    'scene_drama',
    'continuity',
    'stage_beat',
    'chapter_role',
    'serial_pulse',
  ],
  novel_premise: [],
} as const

export type NovelAgentType = keyof typeof NOVEL_AGENT_CROSS_CUTTING

export const NOVEL_AGENT_TYPES = Object.keys(NOVEL_AGENT_CROSS_CUTTING) as NovelAgentType[]

export function getActiveNovelGenrePresets(): NovelGenreRegistryEntry[] {
  return NOVEL_GENRE_REGISTRY.filter(e => e.status === 'active')
}

export function getNovelGenreEntryBySkillKey(skillKey: string): NovelGenreRegistryEntry | undefined {
  const key = (skillKey || '').trim()
  if (!key) return undefined
  return NOVEL_GENRE_REGISTRY.find(e => e.skillKey === key)
}

export function getNovelGenreEntryByValue(value: string): NovelGenreRegistryEntry | undefined {
  const v = (value || '').trim()
  if (!v) return undefined
  return NOVEL_GENRE_REGISTRY.find(e => e.value === v)
}

export function resolveSkillKeyFromGenreValue(value: string): string | undefined {
  return getNovelGenreEntryByValue(value)?.skillKey
}

export function isActiveNovelGenreSkillKey(skillKey: string): boolean {
  const entry = getNovelGenreEntryBySkillKey(skillKey)
  return entry?.status === 'active'
}
