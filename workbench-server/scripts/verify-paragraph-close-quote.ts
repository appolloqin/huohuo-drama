/**
 * 句末+收引号不可拆段
 * npx tsx scripts/verify-paragraph-close-quote.ts
 */
import {
  toNaturalNovelParagraphs,
  preserveNovelLineLayout,
  mergeLeadingCloseQuoteParagraphs,
} from '../src/common/novel/novel-paragraph-format.js'

const sample = [
  '登记这事儿，得本人说。”秦卫国没挪窝，侧身把门帘掀开一角，冲里头又喊了句：“婉儿，干部问话，出来一下。”门帘子抖了抖，半晌才从里头拱出个人来。',
  '苏婉站在门槛后头，棉袄裹得紧紧的。',
  '她垂着眼皮。“多大？”刘建国问。“十九。”苏婉声音压得极低，像是从嗓子眼里挤出来的。',
].join('')

const laid = toNaturalNovelParagraphs(sample)
if (/。\s*\n+\s*[”」』]/.test(laid)) {
  throw new Error(`close quote orphaned after period:\n${laid}`)
}
if (!/“十九。”/.test(laid.replace(/\s+/g, ''))) {
  throw new Error(`nineteen dialogue must stay intact:\n${laid}`)
}
if (!/出来一下。”/.test(laid.replace(/\s+/g, ''))) {
  throw new Error(`exit dialogue must keep close quote:\n${laid}`)
}

const alreadyBroken = '“十九。\n\n”苏婉声音压得极低。'
const glued = mergeLeadingCloseQuoteParagraphs(alreadyBroken)
if (glued.includes('\n\n”') || !/“十九。”苏婉/.test(glued.replace(/\s+/g, ''))) {
  throw new Error(`merge leading close quote failed: ${JSON.stringify(glued)}`)
}

const preserved = preserveNovelLineLayout('', sample)
if (/。\s*\n+\s*[”」』]/.test(preserved)) {
  throw new Error(`preserveNovelLineLayout orphaned close quote:\n${preserved}`)
}

console.log('verify-paragraph-close-quote OK')
