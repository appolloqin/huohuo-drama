import '../src/db/bootstrap.js'
import { collectDetectSamples } from '../src/services/ai/ai-detect-store.js'

const out = await collectDetectSamples({ sampleChars: 4000, perModel: 3, limitEpisodes: 40 })
if (!Array.isArray(out.samples)) throw new Error('shape')
if (!((out.byLabel.web_fiction.ai_count + out.byLabel.web_fiction.human_count) >= 0)) {
  throw new Error('bucket')
}
for (const s of out.samples) {
  if (!['human', 'ai'].includes(s.label)) throw new Error('label')
  if (!s.text || s.text.length < 80) throw new Error('text too short: ' + s.id)
  if (s.label === 'ai' && !s.model) throw new Error('ai needs model')
}
if (out.samples.length < 1) {
  throw new Error('expected at least fixture samples under fixtures/{human,ai}')
}
console.log('verify-ai-detect-corpus OK', { n: out.samples.length, byLabel: out.byLabel })
process.exit(0)
