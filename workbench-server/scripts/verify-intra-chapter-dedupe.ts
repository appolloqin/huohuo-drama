/**
 * npx tsx scripts/verify-intra-chapter-dedupe.ts
 */
import { stripIntraChapterNearDuplicate } from '../src/services/novel/novel-intra-chapter-dedupe.js'

const once = [
  '日头偏西。',
  '它把脑袋又往前探了半尺。就是这一下，麻绳套子唰地收紧。',
  '秦卫国没给它挣扎的机会，一个箭步扑过去，左手按着兔子后背，右手顺势从腰后抽出猎刀，刀背在兔子后脑勺上拍了拍。灰褐色的毛球身子一软，不动了。',
  '他把兔子揣进怀里，贴着胸口那点体温焐着。',
  '四斤肉，省着吃够一家人撑两顿；骨头和皮子还能拿到黑市换点玉米面回来。',
  '起身往西辨了辨方位。',
].join('')

const dup = [
  once,
  // 拼缝：截断 + 重起击杀
  '换点玉米面回把脑袋又往前探了半尺。就是这一下，麻绳套子唰地收紧，活扣卡在兔子脖颈上，毛球整个身子往前一栽，四条腿在雪地里乱蹬。',
  '秦卫国没给它挣扎的机会，一个箭步扑过去，左手按着兔子后背，右手顺势从腰后抽出猎刀，刀背在兔子后脑勺上拍了拍。',
  '灰褐色的毛球身子一软，不动了。',
  '他喘了口粗气，把兔子从麻绳套子里解下来掂了掂，四斤出头。',
  '做完这一切，他把兔子揣进怀里，贴着胸口那点体温焐着。',
  '起身往西辨了辨方位。掌心一带那片松林已经在身后。',
].join('')

const r = stripIntraChapterNearDuplicate(dup)
if (!r.removed) throw new Error('should strip duplicate kill')
if ((r.text.match(/一个箭步扑过去/g) || []).length !== 1) {
  throw new Error(`kill count ${(r.text.match(/一个箭步扑过去/g) || []).length}`)
}
if (/玉米面回把脑袋/.test(r.text)) throw new Error('bad splice remains')
if (!r.text.includes('换点玉米面回来') && !r.text.includes('黑市换点玉米面')) {
  // 第一次完整句应保留
  if (!once.includes('黑市换点玉米面') || !r.text.includes('黑市')) {
    throw new Error('lost first copy context')
  }
}

const clean = stripIntraChapterNearDuplicate(once)
if (clean.removed) throw new Error('clean text must not strip')

// 用户真实形态：第一次「四斤肉」句中途拼进套兔重演，第二次才写完整「回来」
const userish = [
  '秦卫国没给它挣扎的机会，一个箭步扑过去，左手按着兔子后背，右手顺势从腰后抽出猎刀，刀背在兔子后脑勺上拍了拍。灰褐色的毛球身子一软，不动了。',
  '他把兔子揣进怀里，贴着胸口那点体温焐着。',
  '四斤肉，省着吃够一家人撑两顿；骨头和皮子还能拿到黑市换点玉米面回把脑袋又往前探了半尺。就是这一下，麻绳套子唰地收紧，活扣卡在兔子脖颈上，毛球整个身子往前一栽，四条腿在雪地里乱蹬。',
  '秦卫国没给它挣扎的机会，一个箭步扑过去，左手按着兔子后背，右手顺势从腰后抽出猎刀，刀背在兔子后脑勺上拍了拍。',
  '灰褐色的毛球身子一软，不动了。他把兔子揣进怀里，贴着胸口那点体温焐着。',
  '四斤肉，省着吃够一家人撑两顿；骨头和皮子还能拿到黑市换点玉米面回来。起身往西辨了辨方位。',
].join('')

const u = stripIntraChapterNearDuplicate(userish)
if (!u.removed) throw new Error('userish should strip')
if ((u.text.match(/一个箭步扑过去/g) || []).length !== 1) {
  throw new Error(`userish kill count ${(u.text.match(/一个箭步扑过去/g) || []).length}`)
}
if (/玉米面回把脑袋/.test(u.text)) throw new Error('userish splice remains')
if (!/玉米面回来/.test(u.text)) throw new Error('userish lost complete cornmeal sentence')
if ((u.text.match(/四斤肉/g) || []).length !== 1) {
  throw new Error(`userish 四斤肉 count ${(u.text.match(/四斤肉/g) || []).length}`)
}

console.log('verify-intra-chapter-dedupe OK', {
  afterChars: [...r.text].length,
  userishChars: [...u.text].length,
})
