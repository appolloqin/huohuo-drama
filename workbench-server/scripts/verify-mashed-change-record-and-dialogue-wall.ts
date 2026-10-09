/**
 * 粘连【变更记录】须从正文剥离；中文对白「。”」墙须拆成短段
 * npx tsx scripts/verify-mashed-change-record-and-dialogue-wall.ts
 */
import {
  normalizeChangeRecordArtifacts,
  stripNovelChangeRecord,
} from '../src/common/novel/novel-change-record.js'
import {
  assertNovelProseLayoutContract,
  enforceNovelProseDeliveryLayout,
} from '../src/common/novel/novel-paragraph-format.js'

const mashed =
  '柳如烟低声问：“拿下了？” “拿下了。”- 人物/柳如烟: 廊下侍立 → 廊下问话因果: 秦默拿下秦德东后走出偏厅→柳如烟端汤触发: 秦默走出偏厅门感知: 端着一碗热汤未递耗时: 当场- 物品/账册: 王德福私藏 → 秦默收存因果: 王德福当堂呈交账目→秦默收进袖中触发: 秦默翻阅账册耗时: 当场'

const n = normalizeChangeRecordArtifacts(mashed)
if (/因果\s*[:：]|感知\s*[:：]|耗时\s*[:：]|人物\/柳如烟/.test(n.prose)) {
  throw new Error(`粘连变更记录不得留在正文: ${n.prose.slice(0, 160)}`)
}
if (!n.changeBlock || !/因果\s*[:：]/.test(n.changeBlock)) {
  throw new Error(`须剥离出结构化变更记录, got ${n.changeBlock?.slice(0, 120)}`)
}
if (!/拿下了/.test(n.prose)) {
  throw new Error('正文对白须保留')
}
const stripped = stripNovelChangeRecord(mashed)
if (/因果\s*[:：]|感知\s*[:：]|耗时\s*[:：]/.test(stripped)) {
  throw new Error(`strip 后仍有元字段: ${stripped.slice(0, 160)}`)
}

const wall =
  '“西口。”秦默替他答了，“黑风寨的铁器从西口出去，换回来的粮食进了寨子。您跟黑风虎称兄道弟三年，这笔买卖做得不小。”秦德东的脸彻底沉下来：“你查我？” “我查的是黑风岭的账。”秦默回身，从案上拿起一摞旧册子，随手翻开一页，“三年前赈灾粮拨下来，折银十两。账上记的是散与灾民，可黑风岭的灾民，这两年少了三成。人呢？”他把册子轻轻丢回案上：“卖去黑风寨当苦力了。”秦德东腮帮子绷得死紧，忽然一伸手，腰间的短刀呛啷出鞘，刀尖直指王德福：“好一个吃里扒外的账房！你串通外人伪造账目，构陷族老——今天我就替秦家清理门户！”王德福没躲，反而把脖子往前一送：“二老爷，您砍。砍了我，那沓账目照样在领主手里。您跟黑风虎的往来书信，也在。”刀尖顿住了。'

const laid = enforceNovelProseDeliveryLayout(wall)
const paras = laid.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
if (paras.length < 3) {
  throw new Error(`对白墙须拆成≥3段，got ${paras.length}: ${laid.slice(0, 200)}`)
}
// 相对未拆墙（整段一坨）须明显变短；交付合同用拆句计数（引号内。！？可同属一句）
if (Math.max(...paras.map(p => p.length)) >= wall.length * 0.85) {
  throw new Error(`最长段仍接近整墙，拆段失败: max=${Math.max(...paras.map(p => p.length))} wall=${wall.length}`)
}
const gate = assertNovelProseLayoutContract(laid)
if (!gate.ok) throw new Error(`交付合同失败: ${gate.reasons.join('；')}`)

console.log('verify-mashed-change-record-and-dialogue-wall OK', {
  proseHead: n.prose.slice(0, 40),
  paras: paras.length,
})
