// scripts/verify-ai-detect-calib-constants.ts
import '../src/db/bootstrap.js'
import {
  AI_DETECT_ENGINE_VERSION, CRITICAL_MARGIN, VERDICT_AI_THRESHOLD, VERDICT_MIXED_THRESHOLD,
  HUMANIZE_TARGET_MIN, HUMANIZE_TARGET_MAX, DEFAULT_HUMANIZE_TARGET,
  CALIB_MAX_HUMAN_FPR, CALIB_MIN_AI_RECALL, CACHE_TTL_DAYS,
  normalizeGenre, isCriticalBand, APP_SETTING_KEYS, type Genre,
} from '../src/common/novel/novel-detect-calib.js'

if (!AI_DETECT_ENGINE_VERSION.startsWith('fusion_v2')) throw new Error('engine version')
if (isCriticalBand(50) !== true) throw new Error('50 should be critical (40+/-10)')
if (isCriticalBand(58) !== true) throw new Error('58 should be critical (65-10)')
if (!isCriticalBand(30)) throw new Error('30 = 40-10 闭区间内 → critical（spec 阈值±10 含端点）')
if (isCriticalBand(29)) throw new Error('29 not critical')
if (isCriticalBand(76)) throw new Error('76 not critical (65+10)')
if (normalizeGenre('paper') !== 'academic') throw new Error('alias academic')
if ((normalizeGenre('haha') as Genre) !== 'web_fiction') throw new Error('default genre')
if (HUMANIZE_TARGET_MIN !== 15 || HUMANIZE_TARGET_MAX !== 50) throw new Error('target clamp')
if (DEFAULT_HUMANIZE_TARGET !== 40) throw new Error('target default')
if (CALIB_MAX_HUMAN_FPR !== 0.1 || CALIB_MIN_AI_RECALL !== 0.8) throw new Error('guardrail')
if (CACHE_TTL_DAYS !== 30) throw new Error('ttl')
if (APP_SETTING_KEYS.calibration !== 'ai_detect_calibration') throw new Error('settings key')
if (VERDICT_AI_THRESHOLD !== 65 || VERDICT_MIXED_THRESHOLD !== 40) throw new Error('verdict thresholds')

import { detectAiText } from '../src/services/ai/ai-text-detection.js'
// 多样叙事（避免 .repeat 压低字种比导致合法 low_ai 高分）；校验三项新线不得给极端 AI 倾向
const TTR_FIXTURE = [
  '老赵把旱烟在鞋帮上磕了磕，火星子溅进雪里，滋的一响。他没说话，远处狗叫了两声，屋檐水滴在冰壳上。',
  '他嘟囔了句"冷得很呐"，她哼了声"嗯，可不嘛"，屋里火盆噼啪炸了下。窗纸被风掀起一角，露出灰白的天。',
  '巷子尽头有人倒水，铁桶磕在石阶上。孩子追着纸糊的风车跑过，鞋底踩碎薄冰。',
  '灶台上的水壶嘶嘶响着，她把菜叶洗净，搁在竹篮里。门外雪又密了些，路变得更滑。',
  '他想起去年冬天也是这样，只是那时候家里还有余粮。如今缸底见了沙，心里便发紧。',
  '邻居王婶探进头来，问要不要捎点炭。他说不用，说完又后悔，炭火毕竟暖些。',
  '夜深了，灯花爆了一下。她缝着破棉裤，线头在指间绕了又绕，终于打了个死结。',
  '远处更鼓敲过两下。雪停了，屋顶上厚厚一层白，像谁把旧棉絮翻了出来晒在天上。',
].join('')
const d = detectAiText(TTR_FIXTURE)
const lex = d.signals.find((s) => s.key === 'lexical_pattern')!
if (lex.score >= 0.65) throw new Error(`lexical regression: normal TTR got ${lex.score}`)
const punct = d.signals.find((s) => s.key === 'punctuation_rhythm')!
if (punct.score >= 0.65) throw new Error('punctuation should not be extreme')
const oral = d.signals.find((s) => s.key === 'colloquial_markers')!
if (oral.score >= 0.6) throw new Error(`colloquial regression: ${oral.score}`)

import { parseEpisodeMetadata } from '../src/common/drama/episode-meta.js'
const pm = parseEpisodeMetadata({ ai_detection: {
  probability: 72, verdict: 'likely_ai', confidence: 'medium',
  genre: 'web_fiction', engine_version: 'fusion_v2.0', needs_review: true, probability_band: '57-87',
  coverage: { windows_total: 3, windows_scored: 2, scored_chars: 3000, text_chars: 5000 },
  evidence: [{ key: 'S1', score: 0.8 }, { key: 'S2', score: null, missing: true, note: '参考模型不可用' }],
  humanize_target: 15, perturb: { applied: true, stability: 0.7 }, suspected_source: 'x-model',
  content_hash: 'abc', detected_at: new Date().toISOString(), char_count: 5000, signals: [],
} })
const a = pm.ai_detection!
if (a.genre !== 'web_fiction' || a.engine_version !== 'fusion_v2.0' || a.needs_review !== true) {
  throw new Error('new fields dropped by parse (spec F1)')
}
if (a.coverage?.windows_scored !== 2 || a.coverage?.windows_total !== 3) throw new Error('coverage sanitize')
if (a.humanize_target !== 15) throw new Error('clamp sync failed: ' + a.humanize_target)
if (a.evidence?.length !== 2) throw new Error('evidence sanitize')
const bad = parseEpisodeMetadata({
  ai_detection: {
    probability: 40, genre: 123, evidence: 'nope', coverage: { windows_scored: -4 }, perturb: 7,
  },
})
if (bad.ai_detection?.genre !== undefined || bad.ai_detection?.evidence !== undefined
  || (bad.ai_detection?.coverage?.windows_scored ?? 0) !== 0 || bad.ai_detection?.perturb !== undefined) {
  throw new Error('permissive sanitize failed')
}

import { detectAiTextWithPerplexity } from '../src/services/ai/ai-perplexity-detection.js'
if (typeof detectAiTextWithPerplexity !== 'function') throw new Error('shell broken')

import { resolveAiHumanizeTarget } from '../src/common/novel/novel-meta.js'
if (resolveAiHumanizeTarget({}) !== 40) throw new Error('novel default humanize target')
if (resolveAiHumanizeTarget({ ai_humanize_target: 10 }) !== 15) throw new Error('novel clamp min')
if (resolveAiHumanizeTarget({ ai_humanize_target: 99 }) !== 50) throw new Error('novel clamp max')

console.log('verify-ai-detect-calib-constants OK', { CRITICAL_MARGIN })
process.exit(0)
