/**
 * One-time / idempotent: append L1「本类戏法落地」to 18×2 genre SKILL.md
 * npx tsx scripts/patch-scene-drama-l1.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { NOVEL_GENRE_REGISTRY } from '../src/common/novel/novel-genre-registry.js'
import { SKILLS_ROOT } from '../src/common/novel/novel-genre-skill.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MARKER = '## 本类戏法落地（对齐横切 scene_drama）'

type L1Row = {
  pressure: string[]
  shuang: string[]
  heart: string[]
  action: string[]
  forbidden: string[]
}

const L1: Record<string, L1Row> = {
  brainhole: {
    pressure: ['规则惩罚倒计时', '认知错位', '荒诞公平'],
    shuang: ['规则漏洞反杀', '认知翻转'],
    heart: ['人性 vs 规则取舍'],
    action: ['高概念物件', '规则字面执行'],
    forbidden: ['空讲设定', '规则说明书'],
  },
  apocalypse: {
    pressure: ['物资断', '感染/变异逼近', '信任崩'],
    shuang: ['智取', '资源再利用', '反杀掠夺者'],
    heart: ['底线与人性闪念'],
    action: ['废料改造', '据点地形'],
    forbidden: ['纯打僵尸无代价'],
  },
  weird: {
    pressure: ['规则盲区', '认知恐惧', '安静压迫'],
    shuang: ['规则漏洞', '留白反制'],
    heart: ['恐惧与理性拉扯'],
    action: ['日常物件异化', '错位细节'],
    forbidden: ['jump scare 血腥', '长段解释规则'],
  },
  scifi: {
    pressure: ['技术代价', '伦理锁', '资源/权限'],
    shuang: ['技术破局', '伦理抉择翻盘'],
    heart: ['文明尺度下的闪念'],
    action: ['设备/界面/环境交互'],
    forbidden: ['百科全书式科普'],
  },
  game: {
    pressure: ['系统惩罚', '淘汰', '限时副本'],
    shuang: ['漏洞反杀', '越级操作'],
    heart: ['风险收益计算'],
    action: ['面板/副本机制互动'],
    forbidden: ['纯数值播报无场面'],
  },
  romance: {
    pressure: ['面子', '误会在场', '第三者目击'],
    shuang: ['破例偏爱', '当众维护'],
    heart: ['口是心非', '细节心动'],
    action: ['专属小动作', '信物'],
    forbidden: ['轮流演讲式告白'],
  },
  xianxia: {
    pressure: ['境界压制', '道心考验', '天劫阴影'],
    shuang: ['破境', '越级', '道心一念'],
    heart: ['因果/长生/情劫取舍'],
    action: ['剑诀', '灵物', '天象', '阵纹'],
    forbidden: ['纯境界名报级'],
  },
  angst: {
    pressure: ['宿命枷锁', '误会', '在场误解'],
    shuang: ['甜后虐落差（非打脸）'],
    heart: ['隐忍', '自我牺牲闪念'],
    action: ['克制动作', '信物'],
    forbidden: ['流水伤病堆砌'],
  },
  xuanhuan: {
    pressure: ['尊严羞辱', '境界压制', '孤立无援'],
    shuang: ['越级打脸', '血脉觉醒'],
    heart: ['力量/宿命/傲念'],
    action: ['血脉+地形+法器'],
    forbidden: ['搜身/数三个数/卸手指'],
  },
  farming: {
    pressure: ['资源断', '邻里眼色', '季节时限'],
    shuang: ['手艺露一手', '小步增益'],
    heart: ['踏实 vs 焦虑'],
    action: ['农具', '季节', '烟火'],
    forbidden: ['长篇农事说明书'],
  },
  officialdom: {
    pressure: ['层级', '派系', '潜台词', '舆论'],
    shuang: ['实绩破局', '反将一军'],
    heart: ['初心 vs 算计'],
    action: ['场合/公文/礼节细节'],
    forbidden: ['官话堆砌无潜台词'],
  },
  isekai: {
    pressure: ['原主烂摊', '土著偏见', '规则代价'],
    shuang: ['信息差降维', '反杀预判'],
    heart: ['两界三观冲突'],
    action: ['现代知识落地动作'],
    forbidden: ['长篇回忆灌设定'],
  },
  superpower: {
    pressure: ['身份暴露', '克制链', '族群对立'],
    shuang: ['智谋破局', '组合技'],
    heart: ['异化/消耗闪念'],
    action: ['能力+环境组合'],
    forbidden: ['无脑碾压'],
  },
  campus: {
    pressure: ['流言', '排名', '家庭', '目击'],
    shuang: ['公开逆袭', '维护同伴'],
    heart: ['青涩', '虚荣', '自卑'],
    action: ['校园场景物件'],
    forbidden: ['模板霸凌对白'],
  },
  mystery: {
    pressure: ['时间压力', '证词矛盾', '被盯梢'],
    shuang: ['逻辑翻盘', '证物反转'],
    heart: ['推理链', '自我怀疑'],
    action: ['物证', '微表情', '现场'],
    forbidden: ['作者上帝解说真相'],
  },
  wuxia: {
    pressure: ['江湖恩怨', '内力压制', '道义困境'],
    shuang: ['快意恩仇', '侠义反制'],
    heart: ['侠义 vs 私仇'],
    action: ['兵器', '招式', '地形'],
    forbidden: ['同质化套招对轰'],
  },
  spy: {
    pressure: ['暴露风险', '话术套', '双面身份'],
    shuang: ['将计就计', '反钓'],
    heart: ['双层面算计'],
    action: ['潜台词', '物证', '试探步'],
    forbidden: ['长段解释任务背景'],
  },
  exorcism: {
    pressure: ['规则/阴气', '符失效', '邪祟在场'],
    shuang: ['以正制邪', '借场破煞'],
    heart: ['道行/寿元/传承取舍'],
    action: ['符箓', '阵法', '磷火', '腐土'],
    forbidden: ['纯骂战无场', '金丹雷法串味'],
  },
}

function bullets(items: string[]): string {
  return items.map(i => `- ${i}`).join('\n')
}

function buildL1Block(agent: 'novel_chapter_writer' | 'novel_writing_brief', row: L1Row): string {
  const intro = agent === 'novel_writing_brief'
    ? '> L0 六条见横切 `scene_drama`；brief 须点明下列本题材表现，供正文执行。'
    : '> L0：演 / 人 / 心 / 压 / 新 / 爽 — 见横切 `scene_drama` Skill。'

  return [
    '',
    '---',
    '',
    MARKER,
    '',
    intro,
    '',
    '### 压迫',
    bullets(row.pressure),
    '',
    '### 爽',
    bullets(row.shuang),
    '',
    '### 心理',
    bullets(row.heart),
    '',
    '### 动作新意',
    bullets(row.action),
    '',
    '### 禁套',
    bullets(row.forbidden),
    '',
  ].join('\n')
}

const agents = ['novel_chapter_writer', 'novel_writing_brief'] as const
let patched = 0
let skipped = 0

for (const entry of NOVEL_GENRE_REGISTRY) {
  if (entry.status !== 'active') continue
  const row = L1[entry.skillKey]
  if (!row) {
    console.error(`No L1 data for ${entry.skillKey}`)
    process.exit(1)
  }
  for (const agent of agents) {
    const filePath = path.join(SKILLS_ROOT, agent, entry.skillKey, 'SKILL.md')
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING ${filePath}`)
      process.exit(1)
    }
    let content = fs.readFileSync(filePath, 'utf8')
    if (content.includes(MARKER)) {
      skipped++
      continue
    }
    content = content.trimEnd() + buildL1Block(agent, row)
    fs.writeFileSync(filePath, content, 'utf8')
    patched++
  }
}

console.log(`patch-scene-drama-l1 ok: patched=${patched} skipped=${skipped}`)
