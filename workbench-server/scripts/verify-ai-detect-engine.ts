// scripts/verify-ai-detect-engine.ts
import '../src/db/bootstrap.js'
import { runAiDetect } from '../src/services/ai/ai-detect-engine.js'
import { getAppSetting, upsertAppSetting } from '../src/db/repos/app-settings/index.js'
import { resetCalibMemoForTest } from '../src/services/ai/ai-detect-calibration.js'
import { APP_SETTING_KEYS } from '../src/common/novel/novel-detect-calib.js'
import { now } from '../src/common/http/response.js'

const prevCalib = (await getAppSetting(APP_SETTING_KEYS.calibration))?.value ?? null
await upsertAppSetting(APP_SETTING_KEYS.calibration, JSON.stringify({
  version: 900,
  ppl_tracks: { 'echo-m': { echo: { mu: 20, sd: 2 } }, 'proxy-m': { proxy: { mu: 20, sd: 2 } } },
}), now())
resetCalibMemoForTest()

const AI_TEXT = Array(40).fill(
  '首先我们需要认识到问题的复杂性。其次应当从多个维度进行分析。与此同时数据积累不可或缺。此外值得注意的是任何结论都需要证据。综上所述系统性推进才能取得实质进展。',
).join('\n')
const HUMAN_TEXT = Array(12).fill([
  '雨下了三天。瓦缝里的水线越来越粗，滴进脸盆，叮咚作响。阿桂把最后的干柴抱进灶房，骂了句老天，声音却在抖。',
  '“柴不多了。”她说。他不敢看她的眼睛，只说明早前雨停就好。她追问要是没停呢，他没接话。灶膛的火苗舔着锅底，影子在土墙上晃。',
  '他想起去年秋收存的那垛稻草，还压在场院东头，可这时候出去跟泡在水里没什么两样，裤腿早湿透了贴在皮上。',
  '夜里她咳了好几回。他听着，翻个身又坐起来。“等开春去赊两斤煤，账先记着。”他终于开口。她声音哑了，但听着不像要骂他。',
  '外头风声紧，窗纸鼓一下又瘪下去，像谁憋着话不敢说。他把仅有的一件干衣裳盖在她腿上，自己缩进潮被子里。',
].join('\n\n')).join('\n\n\n')

// 夹具长度闸门：确保两者都进 standard tier（≥2000 字）才有 S2/扰动预算
function countNovel(s: string) { return s.replace(/\s/g, '').length }
if (countNovel(AI_TEXT) < 2400 || countNovel(HUMAN_TEXT) < 2400) throw new Error('fixtures must exceed standard-tier min')

// 1) echo 低 ppl（mu=20，ppl=4 → z≈-3 强 AI）+ AI 模板特征 → likely_ai
const e1 = await runAiDetect(AI_TEXT, {
  genre: 'web_fiction', skipCacheStore: true, enableAdversarial: false,
  referenceScorer: async () => ({ mode: 'echo', ppl: 4, meanLogprob: -Math.log(4), tokenCount: 300, model: 'echo-m' }),
})
if (e1.method !== 'fusion_v2' || e1.verdict !== 'likely_ai' || e1.probability < 65) throw new Error('e1 ' + JSON.stringify({ m: e1.method, p: e1.probability }))
if (e1.ref_mode !== 'echo' || e1.calibration !== 'calibrated') throw new Error('e1 evidence')
if ((e1.high_band_count ?? 0) < 1) throw new Error('e1 high bands')
if (!e1.coverage || e1.coverage.windows_scored < 1) throw new Error('e1 coverage')

// 2) 高 ppl + 人写特征 → likely_human 且非顶格高
const e2 = await runAiDetect(HUMAN_TEXT, {
  genre: 'web_fiction', skipCacheStore: true, enableAdversarial: false,
  referenceScorer: async () => ({ mode: 'echo', ppl: 38, meanLogprob: -Math.log(38), tokenCount: 300, model: 'echo-m' }),
})
if (!(e2.probability < 45 && e2.verdict === 'likely_human')) throw new Error('e2 ' + e2.probability)

// 3) scorer 全挂 → statistical_v2 + S2 缺失 + fallback_reason + 置信封顶（纯统计护栏见 Task 4.2 单线用例）
const e3 = await runAiDetect(AI_TEXT, {
  genre: 'web_fiction', skipCacheStore: true, enableAdversarial: false,
  referenceScorer: async () => { throw new Error('boom') },
})
if (e3.method !== 'statistical_v2' || !e3.fallback_reason) throw new Error('e3 meta')
if (!(e3.evidence?.find((e) => e.key === 'S2_reference')?.missing ?? false)) throw new Error('e3 S2 missing flag')
if (e3.confidence === 'high') throw new Error('e3 confidence')
if (!e3.needs_review) throw new Error('e3 needs review')

// 4) 参考返回但模型无校准 track → 视同不可用：calibration='none'、S2 missing、不抛
const e4 = await runAiDetect(AI_TEXT, {
  genre: 'web_fiction', skipCacheStore: true, enableAdversarial: false,
  referenceScorer: async () => ({ mode: 'prompt_logprobs', ppl: 5, meanLogprob: -1.6, tokenCount: 300, model: 'no-such-model' }),
})
if (e4.calibration !== 'none' || e4.method !== 'statistical_v2') throw new Error('e4 ' + JSON.stringify({ c: e4.calibration, m: e4.method }))
if (!(e4.evidence?.find((e) => e.key === 'S2_reference')?.missing ?? false)) throw new Error('e4 S2 flag')

// 5) 扰动：临界带可达性。对同一混合样本扫一组 ppl，存在能落 40±10 / 65±10 的值（seed 权重下理论可达，实测任一命中即过）
const MID_TEXT = HUMAN_TEXT + '\n\n\n' + AI_TEXT.slice(0, AI_TEXT.length * 0.4)
const perturbRewriter = async (t: string) => '同义替换后：' + t.slice(0, 200) + '，其余段落保持原样的表达与节奏安排。'
let e5: Awaited<ReturnType<typeof runAiDetect>> | null = null
let fired = false
for (const ppl of [17, 18, 19, 20, 21]) {
  const r = await runAiDetect(MID_TEXT, {
    genre: 'web_fiction', skipCacheStore: true,
    referenceScorer: async () => ({ mode: 'echo', ppl, meanLogprob: -Math.log(ppl), tokenCount: 300, model: 'echo-m' }),
    perturbRewriter,
  })
  if (r.perturb?.applied === true && r.perturb.stability != null) { fired = true; e5 = r; break }
  e5 = e5 || r
}
if (!fired) throw new Error('e5 never entered critical band across ppl sweep' + JSON.stringify(e5 && { p: e5.probability, perturb: e5.perturb }))

// 6) 缓存往返：同参数第二次直接命中，不再调 scorer；首次写入可缓存行
const ct = MID_TEXT.slice(0, 3200) + String(Date.now())
let calls = 0
const scorerCt = async () => { calls++; return { mode: 'echo' as const, ppl: 4, meanLogprob: -1.4, tokenCount: 100, model: 'echo-m' } }
const rec1 = await runAiDetect(ct, { genre: 'web_fiction', userIdForCache: 1, enableAdversarial: false, referenceScorer: scorerCt })
if (rec1.cache_hit || calls < 1) throw new Error('r1')
const rec2 = await runAiDetect(ct, { genre: 'web_fiction', userIdForCache: 1, enableAdversarial: false, referenceScorer: async () => { calls++; throw new Error('should not call') } })
if (!rec2.cache_hit) throw new Error('cache miss on identical run')
if (rec1.probability !== rec2.probability) throw new Error('cache drift')
console.log('verify-ai-detect-engine OK', { e1: e1.probability, e2: e2.probability, e5: e5!.probability })
await upsertAppSetting(APP_SETTING_KEYS.calibration, prevCalib ?? '', now())
resetCalibMemoForTest()
process.exit(0)
