/**
 * npx tsx scripts/verify-presence-phase.ts
 */
import {
  detectIntraCastPresenceFail,
  summarizePresencePhaseForPrompt,
  buildFrozenPresencePhaseBlockForTest,
} from '../src/services/novel/novel-presence-phase.js'
import { runLocalContinuityAudit } from '../src/services/novel/novel-continuity-precheck.js'

const bad = `第二天天刚蒙蒙亮，秦卫国爬起来，把家里能搜罗的铁丝、麻绳、破布条全翻出来，捆成一卷背上身，推门进了山。
雪粒子砸在脸上生疼，他眯着眼，心里早把这趟要走的山场划成了好几片。
他伸手压住一棵试了试，压到贴地，一松手，嗖一下弹回去。
苏婉拿过那截湿糟糟的麻绳，在手指间捻了两下："这哪能用啊。"
秦卫国把手里那截桦木条往雪地上一戳："过来坐，我教你。"`

const okBridge = `第二天天刚蒙蒙亮，秦卫国推门进了山。雪粒子砸在脸上生疼。
他正挑桦木条，听见雪壳子响，苏婉从坡下赶了上来，接过那截湿糟糟的麻绳："这哪能用啊。"`

const mentionOnly = `秦卫国独自推门进了山。雪地里他想起苏婉还在屋里纳鞋底，便加快手脚布套。`

const hit = detectIntraCastPresenceFail(bad)
if (!hit || hit.rule !== 'intra_cast_teleport') {
  throw new Error(`bad should hard-fail: ${JSON.stringify(hit)}`)
}
if (detectIntraCastPresenceFail(okBridge)) {
  throw new Error('bridged arrival should pass')
}
if (detectIntraCastPresenceFail(mentionOnly)) {
  throw new Error('mention-only should pass')
}

const local = runLocalContinuityAudit({ content: bad, chapterNumber: 10 })
if (!local.hard.some(h => h.rule === 'intra_cast_teleport')) {
  throw new Error(`local audit should include intra_cast_teleport: ${JSON.stringify(local.hard)}`)
}

const phase = summarizePresencePhaseForPrompt(bad.slice(0, 120))
if (!phase || !/独处|离场|在场/.test(phase)) {
  throw new Error(`summarize should flag solo phase: ${phase}`)
}

const block = buildFrozenPresencePhaseBlockForTest(
  '秦卫国捆成一卷背上身，推门进了山。雪粒子砸在脸上生疼，他眯着眼。',
)
if (!block || !/在场相位|桥接|到场/.test(block)) {
  throw new Error(`beat presence block missing: ${block}`)
}

console.log('verify-presence-phase OK')
