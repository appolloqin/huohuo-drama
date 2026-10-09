/** 世界观设定目录 SSOT */

import {
  filterCatalogByGenre,
  type NovelSettingCatalogEntry,
} from './novel-setting-catalog-types.js'

export const NOVEL_WORLDVIEW_CATALOG: NovelSettingCatalogEntry[] = [
  {
    id: 'wv_three_realms',
    label: '三界格局',
    summary: '人界/修真界/上界分层，飞升与天道规则驱动长线',
    genreSkillKeys: ['xianxia', 'xuanhuan'],
    injectPrompt:
      '世界观采用三界格局：人界、修真界与上界层级分明；跨界须有代价与门槛。地名、势力与天道规则全书一致，禁止中途改名或混用别称。',
    status: 'active',
  },
  {
    id: 'wv_sect_jianghu',
    label: '宗门江湖',
    summary: '正邪宗门并立，江湖恩怨与门规约束行动',
    genreSkillKeys: ['xianxia', 'wuxia'],
    injectPrompt:
      '世界观以宗门与江湖势力为主轴：门规、师承、正邪立场影响抉择。冲突多来自门派利益与个人道义拉扯，地名门派名固定不改。',
    status: 'active',
  },
  {
    id: 'wv_modern_hidden',
    label: '现代隐秘侧',
    summary: '日常都市下另有隐秘组织与非常规力量',
    genreSkillKeys: ['urban', 'exorcism', 'superpower'],
    injectPrompt:
      '世界观为现代社会表层 + 隐秘侧：普通人不知全貌，组织、执法与地下势力并行。超常事件须有掩盖代价，禁止无故全城公开超凡。',
    status: 'active',
  },
  {
    id: 'wv_apocalypse',
    label: '末世废土',
    summary: '灾变后秩序崩塌，资源与据点决定生存',
    genreSkillKeys: ['apocalypse'],
    injectPrompt:
      '世界观为灾变后的废土：物资有限、据点脆弱、信任稀缺。环境与怪物威胁可持续恶化，禁止写成无限刷资源的乐园。',
    status: 'active',
  },
  {
    id: 'wv_rule_weird',
    label: '规则怪谈世界',
    summary: '日常场景绑定残酷规则，违者受罚',
    genreSkillKeys: ['weird', 'brainhole'],
    injectPrompt:
      '世界观由可验证的诡异规则驱动：遵守与试探皆有代价，未知大于血腥。规则一旦立下全书自洽，禁止无铺垫随意改规则。',
    status: 'active',
  },
  {
    id: 'wv_game_instance',
    label: '副本游戏世界',
    summary: '关卡、面板与死亡惩罚构成主舞台',
    genreSkillKeys: ['game'],
    injectPrompt:
      '世界观呈现为可闯关的游戏/副本结构：等级、技能、死亡惩罚生效。禁止无代价开挂；规则漏洞须可解释且有风险。',
    status: 'active',
  },
  {
    id: 'wv_campus_city',
    label: '都市校园日常',
    summary: '校园或都市烟火日常，冲突来自人际与选择',
    genreSkillKeys: ['campus', 'romance'],
    injectPrompt:
      '世界观锚定现实向都市/校园日常：场景、制度与社交规则可信。禁止无铺垫引入修真境界链或玄幻大陆设定。',
    status: 'active',
  },
  {
    id: 'wv_generic_fantasy',
    label: '通用架空大陆',
    summary: '自洽的架空大陆、国度与势力版图',
    genreSkillKeys: [],
    injectPrompt:
      '世界观为自洽架空大陆：主要地域、势力与通行规则开篇立住，全书名称一致。可按题材叠加力量或社会规则，但禁止前后矛盾。',
    status: 'active',
  },
]

export function listActiveWorldviews(genreSkillKey?: string): NovelSettingCatalogEntry[] {
  return filterCatalogByGenre(NOVEL_WORLDVIEW_CATALOG, genreSkillKey)
}
