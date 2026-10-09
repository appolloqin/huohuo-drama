/** 金手指设定目录 SSOT */

import {
  filterCatalogByGenre,
  type NovelSettingCatalogEntry,
} from './novel-setting-catalog-types.js'

export const NOVEL_GOLDEN_FINGER_CATALOG: NovelSettingCatalogEntry[] = [
  {
    id: 'gf_checkin',
    label: '签到系统',
    summary: '定期签到获取资源或机缘',
    genreSkillKeys: [],
    injectPrompt:
      '金手指为签到/日常任务型系统：收益稳定但有冷却与上限，前期靠积累，禁止写成无条件无限暴富。',
    status: 'active',
  },
  {
    id: 'gf_rebirth_memory',
    label: '重生记忆',
    summary: '携前世记忆改写命运',
    genreSkillKeys: [],
    injectPrompt:
      '金手指为重生记忆：信息优势有时效与偏差风险，关键节点须付出行动代价，禁止全知全能预判一切。',
    status: 'active',
  },
  {
    id: 'gf_inventory',
    label: '随身空间',
    summary: '储物/种植空间类便利',
    genreSkillKeys: [],
    injectPrompt:
      '金手指为随身空间：容量、取出规则与暴露风险明确；空间不能直接解决所有战斗与权谋。',
    status: 'active',
  },
  {
    id: 'gf_slow_time',
    label: '时停/减速',
    summary: '短暂操控时间差',
    genreSkillKeys: ['brainhole', 'scifi'],
    injectPrompt:
      '金手指为时停或时间减速：持续时间短、副作用重，关键战局可用但不可无脑碾压全剧。',
    status: 'active',
  },
  {
    id: 'gf_bloodline',
    label: '逆天血脉',
    summary: '稀有血脉带来成长与麻烦',
    genreSkillKeys: ['xuanhuan', 'xianxia'],
    injectPrompt:
      '金手指为逆天血脉：强力伴随追杀、反噬或身份暴露；血脉觉醒分阶段，禁止开局满级血脉无敌。',
    status: 'active',
  },
  {
    id: 'gf_no_cheat',
    label: '无金手指',
    summary: '靠智谋与积累，不挂外挂',
    genreSkillKeys: [],
    injectPrompt:
      '明确无系统/外挂金手指：爽点来自信息差、人脉、技艺与抉择；禁止中途无铺垫塞入签到系统。',
    status: 'active',
  },
  {
    id: 'gf_face_slap_halo',
    label: '打脸光环',
    summary: '被轻视后反转打脸的叙事优势',
    genreSkillKeys: [],
    injectPrompt:
      '金手指偏叙事打脸节奏：被低估→反转须有事先铺垫的实力或布局，禁止纯运气无脑打脸循环。',
    status: 'active',
  },
  {
    id: 'gf_craft_bonus',
    label: '炼丹/制造加成',
    summary: '炼器炼丹或制造成功率提升',
    genreSkillKeys: ['xianxia', 'farming'],
    injectPrompt:
      '金手指为炼丹/制造类加成：材料、失败率与市场风险仍在；加成不直接等于战力无敌。',
    status: 'active',
  },
]

export function listActiveGoldenFingers(genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_GOLDEN_FINGER_CATALOG, genreSkillKey)
}
