/** 修炼体系设定目录 SSOT（不按题材过滤；境界名取网文高频约定，全书须统一） */

import {
  filterCatalogByGenre,
  type NovelSettingCatalogEntry,
} from './novel-setting-catalog-types.js'

/**
 * 目录条目均为「主流网文常见模板」，非某一本书官方设定。
 * summary：短链便于卡片展示；injectPrompt：完整链 + 小境界约定。
 */
export const NOVEL_CULTIVATION_CATALOG: NovelSettingCatalogEntry[] = [
  {
    id: 'cu_standard_xianxia',
    label: '经典修仙（人界九境）',
    summary: '炼气-筑基-金丹-元婴-化神-炼虚-合体-大乘-渡劫',
    genreSkillKeys: [],
    injectPrompt:
      '修炼体系用人界九境（用「-」连接，全书只准这一套）：炼气-筑基-金丹（亦称结丹）-元婴-化神-炼虚-合体-大乘-渡劫。小境界：炼气分一至十三层；筑基及以上分初期/中期/后期/大圆满。破境须有心魔、资源或天劫代价；禁止同书混用炼气/凝气等别称，禁止无铺垫跳境。',
    status: 'active',
  },
  {
    id: 'cu_mortal_immortal',
    label: '修仙+仙阶（凡人流）',
    summary: '人界九境 → 真仙-金仙-太乙-大罗-道祖',
    genreSkillKeys: [],
    injectPrompt:
      '修炼体系为人界九境接仙阶（用「-」连接）：炼气-筑基-金丹-元婴-化神-炼虚-合体-大乘-渡劫/飞升-真仙-金仙-太乙-大罗-道祖。人界各境可分初中后/大圆满；炼气可分十三层。飞升/渡劫为跨界节点，须有天劫代价；禁止人界与仙阶名称混用或无铺垫连跳。',
    status: 'active',
  },
  {
    id: 'cu_quench_body_chain',
    label: '淬体起手修仙链',
    summary: '淬体-炼气-筑基-金丹-元婴-化神-炼虚-合体-大乘-渡劫',
    genreSkillKeys: [],
    injectPrompt:
      '修炼体系从淬体起手（用「-」连接）：淬体-炼气-筑基-金丹-元婴-化神-炼虚-合体-大乘-渡劫。淬体侧重肉身排杂打底，可再分重数；其后与经典修仙链一致（初中后/大圆满）。禁止混用别称与无铺垫跳境。',
    status: 'active',
  },
  {
    id: 'cu_daoist_alchemy',
    label: '传统丹道四阶',
    summary: '炼精化气-炼气化神-炼神还虚-炼虚合道',
    genreSkillKeys: [],
    injectPrompt:
      '修炼体系用传统丹道四阶（用「-」连接）：炼精化气-炼气化神-炼神还虚-炼虚合道；各阶可再分初中后。偏道门古典表述，禁止中途改成炼气筑基金丹等另一套叫法。',
    status: 'active',
  },
  {
    id: 'cu_honghuang',
    label: '洪荒仙阶',
    summary: '天仙-真仙-玄仙-金仙-太乙-大罗-准圣-圣人',
    genreSkillKeys: [],
    injectPrompt:
      '修炼体系用洪荒仙阶（用「-」连接）：天仙-真仙-玄仙-金仙-太乙金仙-大罗金仙-准圣（混元金仙）-圣人（混元大罗金仙）。各境分初期/中期/后期/大圆满；准圣可对应斩三尸。禁止与凡人炼气筑基链混用名称，禁止无铺垫证道成圣。',
    status: 'active',
  },
  {
    id: 'cu_douqi',
    label: '斗气十二阶',
    summary: '斗之气-斗者-斗师-大斗师-斗灵-斗王-斗皇-斗宗-斗尊-半圣-斗圣-斗帝',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系为斗气十二阶（用「-」连接）：斗之气-斗者-斗师-大斗师-斗灵-斗王-斗皇-斗宗-斗尊-半圣-斗圣-斗帝。斗之气分一至九段；斗者至斗圣分一至九星（斗圣每星可再分初中后）；斗帝无星级。破境须有斗气/功法/资源代价，禁止无铺垫连跨多阶。',
    status: 'active',
  },
  {
    id: 'cu_martial_title',
    label: '武者称号阶',
    summary: '武徒-武者-武师-武宗-武王-武尊-武圣-武帝-武神',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系为武者称号阶（用「-」连接）：武徒-武者-武师-武宗-武王-武尊-武圣-武帝-武神。各大境分初期/中期/后期/大圆满（或一至九重）。气血/真气有消耗与短板，禁止写成无代价无敌。',
    status: 'active',
  },
  {
    id: 'cu_martial_peak',
    label: '高武后天先天链',
    summary: '淬体-后天-先天-宗师-大宗师-武圣-武神',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系为高武后天/先天链（用「-」连接）：淬体-后天-先天-宗师-大宗师-武圣-武神。后天/先天可分一至九重或小大周天；宗师以上分初中后。内力凝真元为先天门槛；打斗服务恩怨、道义或国运，禁止无铺垫跳境与无代价无敌。',
    status: 'active',
  },
  {
    id: 'cu_wuxia_jianghu',
    label: '江湖流派档',
    summary: '不入流-三流-二流-一流-超一流-宗师-大宗师-陆地神仙',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系为江湖武学档位（用「-」连接）：不入流-三流-二流-一流-超一流-宗师-大宗师-陆地神仙。侧重内力、招式与道义，非法力飞剑；各档可再分前后期。禁止写成修仙炼气筑基链，禁止无代价无敌。',
    status: 'active',
  },
  {
    id: 'cu_body_temper',
    label: '炼体肉身链',
    summary: '淬体-锻骨-易筋-洗髓-换血-金身-不灭',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系以炼体肉身为主（用「-」连接）：淬体-锻骨-易筋-洗髓-换血-金身-不灭。各境可分重数；突破伴随伤痛、药浴或资源代价。可与法修并行，但本书须固定主链名称，禁止前后改名。',
    status: 'active',
  },
  {
    id: 'cu_xuanhuan_bloodline',
    label: '血脉品阶',
    summary: '凡血-灵血-玄血-王血-帝血-神血-祖血',
    genreSkillKeys: [],
    injectPrompt:
      '战力以血脉品阶为主（用「-」连接）：凡血-灵血-玄血-王血-帝血-神血-祖血；或同书统一为一至九品血脉。觉醒/进阶绑定反噬与资源，禁止无铺垫乱改品阶名称或无代价越级。',
    status: 'active',
  },
  {
    id: 'cu_physique_rank',
    label: '体质品阶',
    summary: '凡体-灵体-玄体-王体-圣体-神体-仙体',
    genreSkillKeys: [],
    injectPrompt:
      '力量/天赋以体质品阶为主（用「-」连接）：凡体-灵体-玄体-王体-圣体-神体-仙体。各大阶可再分小成/大成；顶级特体质（如荒古圣体、霸体、混沌体）须开篇点名并写清代价与觉醒条件。体质进阶绑定资源与反噬，禁止无铺垫换体质名或无代价连跳多阶。',
    status: 'active',
  },
  {
    id: 'cu_alchemy_rank',
    label: '炼药师品阶',
    summary: '一品-二品-三品-四品-五品-六品-七品-八品-九品-帝品',
    genreSkillKeys: [],
    injectPrompt:
      '炼药体系用炼药师品阶（用「-」连接）：一品-二品-三品-四品-五品-六品-七品-八品-九品-帝品。每品可分初/中/高；七品可称大师、八品宗师，九品可再分宝丹/玄丹/金丹宗师（全书择一写法固定）。丹药品级与炼药师品阶对应，炼丹须有火种、药材与失败风险，禁止无材料无代价连跨多品。',
    status: 'active',
  },
  {
    id: 'cu_alchemy_soul',
    label: '炼药灵魂境',
    summary: '凡境-灵境-天境-帝境（辅炼药）',
    genreSkillKeys: [],
    injectPrompt:
      '炼药辅线写灵魂境界（用「-」连接）：凡境-灵境-天境-帝境；可与炼药师品阶并行（如灵境对应可炼八品、天境九品、帝境帝品，全书固定对应关系）。灵魂力消耗与反噬须落地，禁止只写品阶不写代价。',
    status: 'active',
  },
  {
    id: 'cu_exorcism_dao',
    label: '驱魔道行阶',
    summary: '学徒-道士-法师-高功-真人-天师',
    genreSkillKeys: [],
    injectPrompt:
      '力量体系写道行/驱魔层级（用「-」连接）：学徒-道士-法师-高功-真人-天师；可并行炼体重数。符箓、法器与近身搏杀并重，每次斗法有往来与代价，禁止状态清单式无脑升级。',
    status: 'active',
  },
  {
    id: 'cu_ability_rank',
    label: '异能字母品级',
    summary: 'E-D-C-B-A-S-SS-SSS',
    genreSkillKeys: [],
    injectPrompt:
      '异能/觉醒者按字母品级（用「-」连接）：E-D-C-B-A-S-SS-SSS（可按需向下加 F 或向上加王级）。使用绑定精神力消耗与异化风险；升级有测评或资源门槛，禁止无限制开大。',
    status: 'active',
  },
  {
    id: 'cu_system_level',
    label: '系统等级面板',
    summary: 'Lv.1 → Lv.100（技能槽/任务驱动）',
    genreSkillKeys: [],
    injectPrompt:
      '成长表现为系统等级面板：以 Lv.1 起，标明进阶节点（如每 10 级一阶或技能槽解锁）；升级依赖任务、经验或资源，技能有冷却与代价。禁止无冷却无代价技能刷屏，禁止等级与剧情战力脱节。',
    status: 'active',
  },
  {
    id: 'cu_dual_path',
    label: '双修并行',
    summary: '任选两条完整境界链并行且互相掣肘',
    genreSkillKeys: [],
    injectPrompt:
      '采用双体系并行：须各自写清完整境界链（用「-」连接），并写明两线如何互相掣肘或争夺资源；禁止两条线都无代价同时满级，禁止中途改名。',
    status: 'active',
  },
  {
    id: 'cu_generic_realm',
    label: '自定义境界链',
    summary: '自定一套全书统一的进阶名称',
    genreSkillKeys: [],
    injectPrompt:
      '自定一套完整境界/品阶链并用「-」连接；全书只准这一套名称，各大境须有可感知的小境界或重数，破境须有代价，禁止中途换一套叫法。',
    status: 'active',
  },
]

/** 修炼体系不按题材过滤；参数保留以兼容旧调用 */
export function listActiveCultivations(_genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_CULTIVATION_CATALOG)
}
