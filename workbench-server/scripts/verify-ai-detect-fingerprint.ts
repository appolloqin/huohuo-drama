import '../src/db/bootstrap.js'
import { upsertAppSetting } from '../src/db/repos/app-settings/index.js'
import { APP_SETTING_KEYS } from '../src/common/novel/novel-detect-calib.js'
import { extractRawFeatures, topBigrams } from '../src/services/ai/ai-detect-features.js'
import { fingerprintEvidence, resetFpCacheForTest } from '../src/services/ai/ai-detect-model-fingerprint.js'
import * as episodesRepo from '../src/db/repos/episodes/index.js'
import { now } from '../src/common/http/response.js'

if (typeof episodesRepo.listEpisodesForAiDetect !== 'function') {
  throw new Error('listEpisodesForAiDetect missing')
}
const listed = await episodesRepo.listEpisodesForAiDetect(3)
if (!Array.isArray(listed)) throw new Error('listEpisodesForAiDetect shape')

const fixture = '首先我们需要认识到问题的复杂性。其次应当从多个维度进行分析。与此同时数据积累不可或缺。此外值得注意的是任何结论都需要证据支撑。综上所述系统性推进才能取得实质进展。'.repeat(10)
const r = extractRawFeatures(fixture)
await upsertAppSetting(APP_SETTING_KEYS.fingerprints, JSON.stringify({
  version: 1,
  updated_at: new Date().toISOString(),
  min_samples: 3,
  models: {
    'x-model': {
      samples: 5,
      avg: Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'char_count')),
      top_bigrams: topBigrams(fixture, 300).map((g) => g[0]),
    },
  },
}), now())
resetFpCacheForTest()
const hit = await fingerprintEvidence(fixture)
if (!hit || hit.model !== 'x-model' || hit.sim < 0.9) throw new Error('self-match failed' + JSON.stringify(hit))
const other = await fingerprintEvidence('雨下了三天。瓦缝里的水线滴进脸盆叮咚作响。阿桂骂了句老天声音在抖。“柴不多了。”她说。“够。”他不敢看她眼睛。'.repeat(4))
if (other && other.sim > 0.8) throw new Error('false positive on unrelated human-ish text: ' + JSON.stringify(other))
console.log('verify-ai-detect-fingerprint OK', { hit })
process.exit(0)
