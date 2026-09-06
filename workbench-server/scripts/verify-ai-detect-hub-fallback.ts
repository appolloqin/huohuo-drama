import '../src/db/bootstrap.js'
import { runAiDetect } from '../src/services/ai/ai-detect-engine.js'
import { detectHubText } from '../src/services/ai/ai-detect-hub.js'

if (typeof detectHubText !== 'function') throw new Error('no hub')
const hubless = await runAiDetect('首先我们需要认识到问题的复杂性。'.repeat(40), { genre: 'media' })
if (!['statistical_v2', 'fusion_v2'].includes(hubless.method || '')) throw new Error('hubless method: ' + hubless.method)
if (!hubless.ai_detect_warning?.includes('朱雀')) throw new Error('disclaimer')
console.log('verify-ai-detect-hub-fallback OK', hubless.method)
process.exit(0)
