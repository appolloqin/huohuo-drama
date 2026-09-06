// scripts/verify-ai-detect-profile.ts
import '../src/db/bootstrap.js'
import { upsertAppSetting, getAppSetting } from '../src/db/repos/app-settings/index.js'
import { APP_SETTING_KEYS } from '../src/common/novel/novel-detect-calib.js'
import { now } from '../src/common/http/response.js'
import {
  loadCalibProfile, pplToZ, pplLineScore, saveProfileWithRotate, rollbackCalibProfile, resetCalibMemoForTest,
} from '../src/services/ai/ai-detect-calibration.js'
import { statLine } from '../src/services/ai/ai-evidence-rules.js'

const prev = await getAppSetting(APP_SETTING_KEYS.calibration)
const ts = () => now()

// 1) 无档案 → seed，calibrated=false，weightsFor 返回 seed 维数
await upsertAppSetting(APP_SETTING_KEYS.calibration, '', ts())
resetCalibMemoForTest()
let calib = await loadCalibProfile()
if (calib.calibrated) throw new Error('seed should not be calibrated')
if (calib.weightsFor('web_fiction').w.length !== 10) throw new Error('seed weight dim')
// 2) 损坏 JSON → 不抛，保持 seed
await upsertAppSetting(APP_SETTING_KEYS.calibration, '{oops', ts())
resetCalibMemoForTest()
calib = await loadCalibProfile()
if (calib.calibrated) throw new Error('broken profile must fall back to seed')
if (!calib.meta.problems.length) throw new Error('problems must be surfaced')
// 3) 合法档案 → calibrated、ppl track 命中、statLine sub 生效
const good = {
  version: 400,
  ppl_tracks: { 'qwen-test': { echo: { mu: 14, sd: 3 } } },
  percentiles: { web_fiction: { bigram_repeat: [0.04, 0.08, 0.12, 0.18, 0.26, 0.4] } },
  stat_submodel: { w: [0, 0, 4, 0, 4, 4, 0, 0, 0, 0, 4, 0, 0, 0, 0], b: -5.4 }, // 集中在 ttr/bigram/trigram/template 四正向维
  fusion: { web_fiction: { w: [3, 2, 0.5, 0.5, 1, 0.3, 0, -1, 0, 0], b: -3 } },
  metrics: { fpr: 0.05, recall: 0.9, train: 'full' },
}
await upsertAppSetting(APP_SETTING_KEYS.calibration, JSON.stringify(good), ts())
resetCalibMemoForTest()
calib = await loadCalibProfile()
if (!calib.calibrated) throw new Error('valid profile not picked up: ' + JSON.stringify(calib.meta.problems))
if (calib.weightsFor('web_fiction').b !== -3) throw new Error('fusion weight not applied')
const z = pplToZ(8, calib.pplTrack('qwen-test@7', 'echo'))  // 低于人类基线 → 负 z（更 AI）
if (z == null || z >= -1.5) throw new Error('pplToZ direction')
const line = pplLineScore(z)
if (line == null || line < 0.6) throw new Error('pplLineScore direction')
const subLine = statLine({
  char_count: 2000, sentence_len_cv: 0.2, para_len_cv: 0.2, char_ttr: 0.3, char_entropy: 8,
  bigram_repeat: 0.3, trigram_repeat: 0.15, punct_density: 0.03, dash_density: 0.001, quote_density: 0.001,
  opening_pattern_entropy: 3, syntactic_template_index: 0.5, dialogue_len_cv: 0.3, tag_variety: 0.4,
  tells_density: 0.01, colloquial_density: 0.001,
} as never, calib.tableFor('web_fiction'), calib.statsSub)
const plainLine = statLine({
  char_count: 2000, sentence_len_cv: 0.2, para_len_cv: 0.2, char_ttr: 0.3, char_entropy: 8,
  bigram_repeat: 0.3, trigram_repeat: 0.15, punct_density: 0.03, dash_density: 0.001, quote_density: 0.001,
  opening_pattern_entropy: 3, syntactic_template_index: 0.5, dialogue_len_cv: 0.3, tag_variety: 0.4,
  tells_density: 0.01, colloquial_density: 0.001,
} as never)
if (!Number.isFinite(subLine) || subLine <= plainLine) throw new Error('statsSub should lift uniform-AI sample')
// 4) 保存轮换 + 回滚
const saved = await saveProfileWithRotate({ version: 0, percentiles: {}, fusion: good.fusion } as never)
if (!saved.backupAvailable) throw new Error('backup missing after rotate')
if (saved.to <= 400) throw new Error('version bump')
const rb = await rollbackCalibProfile()
if (!rb.ok || rb.activeVersion !== 400) throw new Error('rollback')
// 恢复现场（无 prev 也置空串：保证后续 verify 套件从 seed 态起跑，不残留测试档案）
await upsertAppSetting(APP_SETTING_KEYS.calibration, prev?.value ?? '', prev?.updatedAt ? String(prev.updatedAt) : ts())
resetCalibMemoForTest()
console.log('verify-ai-detect-profile OK')
process.exit(0)
