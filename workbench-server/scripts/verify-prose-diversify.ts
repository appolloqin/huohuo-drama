/**
 * 润色同构打散：了一 / —— / 。他
 * npx tsx scripts/verify-prose-diversify.ts
 */
import {
  countSubstring,
  diversifyNovelProseTells,
  maxLeYiKeep,
} from '../src/common/novel/novel-prose-diversify.js'

const sample = [
  Array.from({ length: 10 }, () =>
    '他蹲下看了一眼蹄印。他停了一下。他听了一会儿风。',
  ).join(''),
  '脚下一滑——身子一矮——手一探——刀一亮——人一伏——。',
  '砰——！远处有动静。',
].join('')

const out = diversifyNovelProseTells(sample)
const leyiBefore = countSubstring(sample, '了一')
const leyiAfter = countSubstring(out, '了一')
const dashBefore = countSubstring(sample, '——')
const dashAfter = countSubstring(out, '——')
const taBefore = countSubstring(sample, '。他')
const taAfter = countSubstring(out, '。他')

if (leyiBefore < 10) throw new Error(`了一 fixture 不足 ${leyiBefore}`)
if (leyiAfter >= 4) throw new Error(`了一 须 <4：${leyiBefore}→${leyiAfter}`)
if (leyiAfter > maxLeYiKeep(sample.replace(/\s/g, '').length)) {
  throw new Error(`了一 超预算 ${leyiAfter}`)
}
if (dashAfter >= dashBefore) throw new Error(`破折号应减少 ${dashBefore}→${dashAfter}`)
if (taAfter >= taBefore) throw new Error(`。他应减少 ${taBefore}→${taAfter}`)
if (!out.includes('砰——')) throw new Error('拟声破折号应保留')
if (out.includes('看瞅了瞅')) throw new Error('动词拼接错误')

console.log('verify-prose-diversify OK', {
  leyi: `${leyiBefore}→${leyiAfter}`,
  dash: `${dashBefore}→${dashAfter}`,
  '。他': `${taBefore}→${taAfter}`,
})
