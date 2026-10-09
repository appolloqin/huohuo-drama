/** 修炼体系设定目录 SSOT */

import {
  filterCatalogByGenre,
  type NovelSettingCatalogEntry,
} from './novel-setting-catalog-types.js'

export const NOVEL_CULTIVATION_CATALOG: NovelSettingCatalogEntry[] = [
  {
    id: 'cu_standard_xianxia',
    label: '标准炼气筑基链',
    summary: '淬体-炼气-筑基-金丹…经典仙侠境界',
    genreSkillKeys: ['xianxia'],
    injectPrompt:
      '修炼体系使用完整境界链（用「-」连接），建议：淬体-炼气-筑基-金丹-元婴-化神…；破境有心魔/资源/天劫代价，禁止同书混用炼气/凝气等别称。',
    status: 'active',
  },
  {
    id: 'cu_xuanhuan_bloodline',
    label: '血脉觉醒阶',
    summary: '血脉品阶与觉醒层级驱动战力',
    genreSkillKeys: ['xuanhuan'],
    injectPrompt:
      '修炼/战力以血脉觉醒阶为主（用「-」连接完整品阶链）；觉醒绑定反噬与资源，禁止无铺垫越级乱改品阶名称。',
    status: 'active',
  },
  {
    id: 'cu_martial_peak',
    label: '武道境界',
    summary: '武道分层，适合高武/武侠向',
    genreSkillKeys: ['martial_peak', 'wuxia'],
    injectPrompt:
      '力量体系为武道境界链（用「-」连接）；内力/真气有消耗与短板，打斗服务恩怨与道义，禁止写成无代价无敌。',
    status: 'active',
  },
  {
    id: 'cu_exorcism_dao',
    label: '道行/炼体层级',
    summary: '道行、符箓与炼体并行的驱魔层级',
    genreSkillKeys: ['exorcism'],
    injectPrompt:
      '力量体系写道行/炼体层级（用「-」连接）；法器、符箓与近身搏杀并重，每次斗法有往来与代价，禁止状态清单式升级。',
    status: 'active',
  },
  {
    id: 'cu_system_level',
    label: '系统等级',
    summary: '面板等级、技能槽与任务驱动',
    genreSkillKeys: ['game', 'brainhole'],
    injectPrompt:
      '成长表现为系统等级/技能面板（用「-」或等级数字标明进阶）；升级有任务或资源门槛，禁止无冷却无代价的技能刷屏。',
    status: 'active',
  },
  {
    id: 'cu_ability_rank',
    label: '异能分级',
    summary: '异能品级与精神力消耗',
    genreSkillKeys: ['superpower'],
    injectPrompt:
      '异能按分级体系运作（用「-」连接品级）；使用绑定精神力消耗与异化风险，禁止无限制开大。',
    status: 'active',
  },
  {
    id: 'cu_dual_path',
    label: '双修并行',
    summary: '两条成长线并行且互相掣肘',
    genreSkillKeys: ['xianxia', 'xuanhuan'],
    injectPrompt:
      '采用双修/双体系并行（各写完整境界链，用「-」连接）；两线互相掣肘或资源争夺，禁止两条线都无代价同时满级。',
    status: 'active',
  },
  {
    id: 'cu_generic_realm',
    label: '通用境界链',
    summary: '自定一套全书统一的进阶名称',
    genreSkillKeys: [],
    injectPrompt:
      '自定一套完整境界/品阶链并用「-」连接；全书只准这一套名称，破境须有代价，禁止中途换一套叫法。',
    status: 'active',
  },
]

export function listActiveCultivations(genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_CULTIVATION_CATALOG, genreSkillKey)
}
