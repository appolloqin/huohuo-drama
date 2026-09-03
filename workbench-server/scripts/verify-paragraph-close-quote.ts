/**
 * 句末+收引号不可拆段；引号内多句对白不可跨段；仅拆！”“粘连，勿诗化碎段
 * npx tsx scripts/verify-paragraph-close-quote.ts
 */
import {
  toNaturalNovelParagraphs,
  preserveNovelLineLayout,
  mergeLeadingCloseQuoteParagraphs,
  mergeUnclosedDialogueParagraphs,
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

/** 用户样例：引号内在？处被拆段，右引号落到下一段 */
const userBroken = [
  '“秦霄呢？叫那小子滚出来！”堂屋门槛上，秦卫东先迎了出去，赔着一脸笑：“钱爷，怎的这时辰来了？',
  '',
  '里头坐，里头坐。”钱虎没理他，径直走到院中石缸前，把一张盖着红印的借据拍在缸沿上。',
].join('\n')

const userMerged = mergeUnclosedDialogueParagraphs(userBroken)
if (/\？\s*\n+\s*里头坐/.test(userMerged) || !/来了？里头坐，里头坐。”钱虎/.test(userMerged.replace(/\s+/g, ''))) {
  throw new Error(`unclosed dialogue merge failed:\n${userMerged}`)
}

const userPreserved = preserveNovelLineLayout('', userBroken)
if (/来了？\s*\n/.test(userPreserved)) {
  throw new Error(`preserve must not break mid-dialogue:\n${userPreserved}`)
}
if (!/来了？里头坐，里头坐。”/.test(userPreserved.replace(/\s+/g, ''))) {
  throw new Error(`dialogue must stay one quote pair:\n${userPreserved}`)
}
/** 收引号后叙述可同段，勿诗化换行 */
if (/。”\s*\n+\s*钱虎没理他/.test(userPreserved)) {
  throw new Error(`must not force break before narration:\n${userPreserved}`)
}

const wall = '“秦霄呢？叫那小子滚出来！”堂屋门槛上，秦卫东先迎了出去，赔着一脸笑：“钱爷，怎的这时辰来了？里头坐，里头坐。”钱虎没理他，径直走到院中石缸前，把一张盖着红印的借据拍在缸沿上。'
const wallOut = toNaturalNovelParagraphs(wall)
if (/来了？\s*\n/.test(wallOut) || /里头坐[^\n]*\n+\s*[”"]/.test(wallOut)) {
  throw new Error(`toNatural must not split inside quotes:\n${wallOut}`)
}
if (/。”\s*\n+\s*钱虎没理他/.test(wallOut)) {
  throw new Error(`narration after close quote must stay same para:\n${wallOut}`)
}
if (!/。”钱虎没理他/.test(wallOut.replace(/\s+/g, ''))) {
  throw new Error(`。”钱虎 should remain readable:\n${wallOut}`)
}

const attrKeep = preserveNovelLineLayout('', '她垂着眼皮。“多大？”刘建国问。')
if (/\？”\s*\n/.test(attrKeep)) {
  throw new Error(`attribution must stay after close quote:\n${attrKeep}`)
}

/** 英文直引号归一；收引号后叙述仍同段 */
const asciiGlued = '"欠债还钱，天经地义。"钱虎压低身子'
const asciiOut = preserveNovelLineLayout('', asciiGlued)
if (/"/.test(asciiOut)) {
  throw new Error(`ASCII quotes must normalize to curly:\n${asciiOut}`)
}
if (!/天经地义。”钱虎压低身子/.test(asciiOut.replace(/\n/g, ''))) {
  throw new Error(`ASCII normalize + keep narration same para:\n${asciiOut}`)
}
if (/。”\s*\n+\s*钱虎/.test(asciiOut)) {
  throw new Error(`must not poetry-break before 钱虎:\n${asciiOut}`)
}

/** 仅给粘连对白加空格：！”“ → ！” “ */
const gluedQuotes = '秦卫东急了，“游煞骸骨，那是镇魔司才有的东西，我们秦家哪有那本事去猎！”“那是你们的事。”'
const gluedOut = preserveNovelLineLayout('', gluedQuotes)
if (/猎！”[ \t]*“那是你们/.test(gluedOut) === false && /猎！”\s*\n/.test(gluedOut)) {
  throw new Error(`must space not paragraph-break:\n${gluedOut}`)
}
if (/猎！”[ \t]+“那是你们的事。”/.test(gluedOut) === false) {
  throw new Error(`expected space between dialogues:\n${gluedOut}`)
}
if (/猎！”\s*\n/.test(gluedOut)) {
  throw new Error(`must not break paragraph between dialogues:\n${gluedOut}`)
}

console.log('verify-paragraph-close-quote OK')
