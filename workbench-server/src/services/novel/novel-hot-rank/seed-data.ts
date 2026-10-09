import type { HotRankPlatform, HotRankProviderItem } from './types.js'

type SeedDraft = Omit<HotRankProviderItem, 'platform' | 'heat'> & { heat?: number }

function withPlatform(platform: HotRankPlatform, drafts: SeedDraft[]): HotRankProviderItem[] {
  return drafts.map((d, i) => ({
    platform,
    externalId: d.externalId,
    title: d.title,
    tags: d.tags,
    heat: d.heat ?? 1000 - i * 10,
    blurbShort: d.blurbShort.slice(0, 200),
    mapped: d.mapped,
    mapSource: 'manual' as const,
  }))
}

const FANQIE: SeedDraft[] = [
  {
    externalId: 'fq_seed_01',
    title: '签到百年，我成了天道替身',
    tags: ['玄幻', '系统', '签到', '爽文'],
    blurbShort: '灵感卡：底层修士误绑签到面板，每日常规打卡撬动天道缺口，越级杀敌与身份错位交替推进。',
    mapped: {
      genrePrimary: 'xuanhuan',
      genreSecondary: ['game'],
      worldviewId: 'wv_generic_fantasy',
      cultivationId: 'cu_xuanhuan_bloodline',
      goldenFingerId: 'gf_checkin',
    },
  },
  {
    externalId: 'fq_seed_02',
    title: '末日囤货：我有无限仓库',
    tags: ['末世', '囤货', '生存', '空间'],
    blurbShort: '灵感卡：灾变前夜觉醒仓储空间，资源有上限、据点有风险，人性灰度与物资博弈并行。',
    mapped: {
      genrePrimary: 'apocalypse',
      genreSecondary: [],
      worldviewId: 'wv_apocalypse',
      goldenFingerId: 'gf_inventory',
    },
  },
  {
    externalId: 'fq_seed_03',
    title: '规则怪谈：电梯到负十三层',
    tags: ['诡异', '规则怪谈', '都市'],
    blurbShort: '灵感卡：日常场景绑定残酷规则，违者受罚；主角拆解盲区而非无脑硬闯。',
    mapped: {
      genrePrimary: 'weird',
      genreSecondary: ['urban'],
      worldviewId: 'wv_rule_weird',
      goldenFingerId: 'gf_slow_time',
    },
  },
  {
    externalId: 'fq_seed_04',
    title: '重生九八：从小作坊到供应链',
    tags: ['重生', '种田', '经营'],
    blurbShort: '灵感卡：带着行业预知回乡创业，小步增益与人情债并存，禁止写成无限开挂。',
    mapped: {
      genrePrimary: 'isekai',
      genreSecondary: ['farming'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_rebirth_memory',
    },
  },
  {
    externalId: 'fq_seed_05',
    title: '高武时代：我在学院藏锋',
    tags: ['高武', '学院', '武道'],
    blurbShort: '灵感卡：全球高武背景下低调发育，境界突破绑定心魔与国运任务。',
    mapped: {
      genrePrimary: 'martial_peak',
      genreSecondary: ['campus'],
      worldviewId: 'wv_modern_hidden',
      cultivationId: 'cu_martial_peak',
      goldenFingerId: 'gf_face_slap_halo',
    },
  },
  {
    externalId: 'fq_seed_06',
    title: '穿成反派后我只想种田',
    tags: ['穿书', '种田', '轻松'],
    blurbShort: '灵感卡：误入剧本的反派位，用经营线躲开原著死旗，轻冲突烟火向。',
    mapped: {
      genrePrimary: 'farming',
      genreSecondary: ['isekai'],
      worldviewId: 'wv_generic_fantasy',
      goldenFingerId: 'gf_craft_bonus',
    },
  },
  {
    externalId: 'fq_seed_07',
    title: '道门实习生与城市夜游神',
    tags: ['驱魔', '都市', '师徒'],
    blurbShort: '灵感卡：现代隐秘侧收邪，符箓阵法有消耗，案件串联成长。',
    mapped: {
      genrePrimary: 'exorcism',
      genreSecondary: ['urban'],
      worldviewId: 'wv_modern_hidden',
      cultivationId: 'cu_exorcism_dao',
      goldenFingerId: 'gf_inventory',
    },
  },
  {
    externalId: 'fq_seed_08',
    title: '副本世界：死亡即掉级',
    tags: ['游戏', '副本', '生存代价'],
    blurbShort: '灵感卡：闯关有真实死亡惩罚，组队信任与规则漏洞智取强敌。',
    mapped: {
      genrePrimary: 'game',
      genreSecondary: [],
      worldviewId: 'wv_game_instance',
      cultivationId: 'cu_system_level',
      goldenFingerId: 'gf_checkin',
    },
  },
]

const QIDIAN: SeedDraft[] = [
  {
    externalId: 'qd_seed_01',
    title: '三界快递员：快递必达',
    tags: ['仙侠', '轻松', '三界'],
    blurbShort: '灵感卡：凡界小伙入职跨界物流，飞升门槛与人情单交织成长。',
    mapped: {
      genrePrimary: 'xianxia',
      genreSecondary: [],
      worldviewId: 'wv_three_realms',
      cultivationId: 'cu_standard_xianxia',
      goldenFingerId: 'gf_inventory',
    },
  },
  {
    externalId: 'qd_seed_02',
    title: '万族战场：废血觉醒',
    tags: ['玄幻', '血脉', '征伐'],
    blurbShort: '灵感卡：底层血脉被嘲，秘境夺宝后越级杀敌，种族冲突升级。',
    mapped: {
      genrePrimary: 'xuanhuan',
      genreSecondary: [],
      worldviewId: 'wv_generic_fantasy',
      cultivationId: 'cu_xuanhuan_bloodline',
      goldenFingerId: 'gf_bloodline',
    },
  },
  {
    externalId: 'qd_seed_03',
    title: '江湖夜雨：刀名无赦',
    tags: ['武侠', '恩怨', '侠义'],
    blurbShort: '灵感卡：血仇开局，武学有短板，道义与情侠拉扯终局。',
    mapped: {
      genrePrimary: 'wuxia',
      genreSecondary: [],
      worldviewId: 'wv_sect_jianghu',
      cultivationId: 'cu_generic_realm',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'qd_seed_04',
    title: '星际矿工与文明墓碑',
    tags: ['科幻', '星际', '伦理'],
    blurbShort: '灵感卡：硬科幻代价体系下，个人求生撞上文明级秘密。',
    mapped: {
      genrePrimary: 'scifi',
      genreSecondary: [],
      worldviewId: 'wv_generic_fantasy',
      goldenFingerId: 'gf_inventory',
    },
  },
  {
    externalId: 'qd_seed_05',
    title: '脑洞：如果记忆可交易',
    tags: ['脑洞', '高概念', '规则'],
    blurbShort: '灵感卡：记忆市场公平残酷，主角在欲望与恐惧间做选择。',
    mapped: {
      genrePrimary: 'brainhole',
      genreSecondary: [],
      worldviewId: 'wv_rule_weird',
      goldenFingerId: 'gf_slow_time',
    },
  },
  {
    externalId: 'qd_seed_06',
    title: '官场新丁：烂摊子与民生单',
    tags: ['官场', '权谋', '实干'],
    blurbShort: '灵感卡：基层烂摊子开局，派系试探与民生实事双线。',
    mapped: {
      genrePrimary: 'officialdom',
      genreSecondary: [],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'qd_seed_07',
    title: '异能管理局编外人员',
    tags: ['异能', '都市', '隐藏身份'],
    blurbShort: '灵感卡：能力有反噬，普通人生活与地下势力周旋。',
    mapped: {
      genrePrimary: 'superpower',
      genreSecondary: ['urban'],
      worldviewId: 'wv_modern_hidden',
      cultivationId: 'cu_ability_rank',
      goldenFingerId: 'gf_bloodline',
    },
  },
  {
    externalId: 'qd_seed_08',
    title: '悬疑：雨夜车站少了一排座位',
    tags: ['悬疑', '推理', '细思极恐'],
    blurbShort: '灵感卡：可验证线索分层揭谜，表层结案后另有反转。',
    mapped: {
      genrePrimary: 'mystery',
      genreSecondary: [],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
]

const JINJIANG: SeedDraft[] = [
  {
    externalId: 'jj_seed_01',
    title: '偏爱藏在顺路里',
    tags: ['言情', '甜宠', '都市'],
    blurbShort: '灵感卡：现代双向试探，心动落在破例细节而非直白告白。',
    mapped: {
      genrePrimary: 'romance',
      genreSecondary: [],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'jj_seed_02',
    title: '校服下的未寄出的信',
    tags: ['校园', '青春', '暗恋'],
    blurbShort: '灵感卡：学业与感情双线，升学抉择制造遗憾或圆满。',
    mapped: {
      genrePrimary: 'campus',
      genreSecondary: ['romance'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'jj_seed_03',
    title: '我们终将带着伤疤相爱',
    tags: ['虐恋', '救赎', '误会'],
    blurbShort: '灵感卡：枷锁使相爱有代价，心理虐重于血腥，结局带疤。',
    mapped: {
      genrePrimary: 'angst',
      genreSecondary: ['romance'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_rebirth_memory',
    },
  },
  {
    externalId: 'jj_seed_04',
    title: '穿书后我成了炮灰师姐',
    tags: ['穿书', '仙侠', '逆袭'],
    blurbShort: '灵感卡：避开原著死线，道心与情线并行改写剧本。',
    mapped: {
      genrePrimary: 'isekai',
      genreSecondary: ['xianxia'],
      worldviewId: 'wv_three_realms',
      cultivationId: 'cu_standard_xianxia',
      goldenFingerId: 'gf_rebirth_memory',
    },
  },
  {
    externalId: 'jj_seed_05',
    title: '宗门后山的药田日常',
    tags: ['种田', '仙侠', '治愈'],
    blurbShort: '灵感卡：修真背景轻经营，季节更替推剧情，冲突克制。',
    mapped: {
      genrePrimary: 'farming',
      genreSecondary: ['xianxia'],
      worldviewId: 'wv_sect_jianghu',
      cultivationId: 'cu_dual_path',
      goldenFingerId: 'gf_craft_bonus',
    },
  },
  {
    externalId: 'jj_seed_06',
    title: '重生后我先立住事业线',
    tags: ['重生', '都市', '成长'],
    blurbShort: '灵感卡：信息差稳健翻盘，感情线后置、禁止无脑打脸连发。',
    mapped: {
      genrePrimary: 'isekai',
      genreSecondary: ['urban'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_rebirth_memory',
    },
  },
  {
    externalId: 'jj_seed_07',
    title: '规则怪谈恋爱禁止项',
    tags: ['诡异', '言情', '规则'],
    blurbShort: '灵感卡：怪谈规则下克制暧昧，未知大于血腥。',
    mapped: {
      genrePrimary: 'weird',
      genreSecondary: ['romance'],
      worldviewId: 'wv_rule_weird',
      goldenFingerId: 'gf_slow_time',
    },
  },
  {
    externalId: 'jj_seed_08',
    title: '双强：秘境里的道侣契约',
    tags: ['仙侠', '双强', '道侣'],
    blurbShort: '灵感卡：修为升级与宿命情爱双线，破境有心魔代价。',
    mapped: {
      genrePrimary: 'xianxia',
      genreSecondary: ['romance'],
      worldviewId: 'wv_three_realms',
      cultivationId: 'cu_standard_xianxia',
      goldenFingerId: 'gf_face_slap_halo',
    },
  },
]

const QIMAO: SeedDraft[] = [
  {
    externalId: 'qm_seed_01',
    title: '从零开始的城中村老板',
    tags: ['都市', '经营', '爽文'],
    blurbShort: '灵感卡：阶层资源破局，职业线为主，轻超自然不喧宾。',
    mapped: {
      genrePrimary: 'urban',
      genreSecondary: ['farming'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_face_slap_halo',
    },
  },
  {
    externalId: 'qm_seed_02',
    title: '签到超市：每天多一件货',
    tags: ['系统', '都市', '签到'],
    blurbShort: '灵感卡：日常签到增益小而稳，人际与现金流冲突并行。',
    mapped: {
      genrePrimary: 'urban',
      genreSecondary: ['game'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_checkin',
    },
  },
  {
    externalId: 'qm_seed_03',
    title: '末日公交终点站',
    tags: ['末世', '求生', '人性'],
    blurbShort: '灵感卡：封闭载具微末世，物资与信任双重稀缺。',
    mapped: {
      genrePrimary: 'apocalypse',
      genreSecondary: [],
      worldviewId: 'wv_apocalypse',
      goldenFingerId: 'gf_inventory',
    },
  },
  {
    externalId: 'qm_seed_04',
    title: '我在怪谈公司做客服',
    tags: ['诡异', '脑洞', '职场'],
    blurbShort: '灵感卡：工单即怪谈案件，规则自洽、留白恐怖。',
    mapped: {
      genrePrimary: 'weird',
      genreSecondary: ['brainhole'],
      worldviewId: 'wv_rule_weird',
      goldenFingerId: 'gf_slow_time',
    },
  },
  {
    externalId: 'qm_seed_05',
    title: '高考前夜的平行课堂',
    tags: ['校园', '科幻', '成长'],
    blurbShort: '灵感卡：学业压力叠轻微平行设定，落点仍是青春抉择。',
    mapped: {
      genrePrimary: 'campus',
      genreSecondary: ['scifi'],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'qm_seed_06',
    title: '假面下的情报员',
    tags: ['谍战', '潜伏', '牺牲'],
    blurbShort: '灵感卡：伪装身份高压试探，局中局与取舍牺牲。',
    mapped: {
      genrePrimary: 'spy',
      genreSecondary: [],
      worldviewId: 'wv_campus_city',
      goldenFingerId: 'gf_no_cheat',
    },
  },
  {
    externalId: 'qm_seed_07',
    title: '架空史：边关粮草账本',
    tags: ['历史', '权谋', '种田'],
    blurbShort: '灵感卡：考据适度的架空边关，粮草经营撬动战局。',
    mapped: {
      genrePrimary: 'historical',
      genreSecondary: ['farming'],
      worldviewId: 'wv_generic_fantasy',
      goldenFingerId: 'gf_craft_bonus',
    },
  },
  {
    externalId: 'qm_seed_08',
    title: '觉醒后我先学会装普通人',
    tags: ['异能', '都市', '克制'],
    blurbShort: '灵感卡：能力绑定反噬，隐藏身份与智谋破局。',
    mapped: {
      genrePrimary: 'superpower',
      genreSecondary: ['urban'],
      worldviewId: 'wv_modern_hidden',
      cultivationId: 'cu_ability_rank',
      goldenFingerId: 'gf_bloodline',
    },
  },
]

export const HOT_RANK_SEED_BY_PLATFORM: Record<HotRankPlatform, HotRankProviderItem[]> = {
  fanqie: withPlatform('fanqie', FANQIE),
  qidian: withPlatform('qidian', QIDIAN),
  jinjiang: withPlatform('jinjiang', JINJIANG),
  qimao: withPlatform('qimao', QIMAO),
}

export function getSeedItems(platform: HotRankPlatform): HotRankProviderItem[] {
  return HOT_RANK_SEED_BY_PLATFORM[platform].map((item) => ({
    ...item,
    tags: [...item.tags],
    mapped: { ...item.mapped, genreSecondary: [...item.mapped.genreSecondary] },
  }))
}
