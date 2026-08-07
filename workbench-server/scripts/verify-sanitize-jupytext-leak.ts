/**
 * 剥离模型泄漏的 jupytext/伪扩展标签
 * npx tsx scripts/verify-sanitize-jupytext-leak.ts
 */
import { sanitizeModelCreativeOutput, stripThinkingArtifactsFromText } from '../src/services/ai/ai.js'

const prose = `他没多想，转身进了屋。屋檐下那只风干兔子在日头底下晃晃悠悠的，倒像是一面无声的旗。

赵大彪这口气咽不下去，指定得去找刘干事。

可那又怎样？手里有证，心里不慌。秦卫国眯起眼，望一眼院门外的方向。

<jupytext.ext.vars>{"data": {"content": ""}}</jupytext.ext.vars>`

const cleaned = sanitizeModelCreativeOutput(prose)
if (/jupytext|ext\.vars/.test(cleaned)) {
  throw new Error(`jupytext leak not stripped: ${cleaned.slice(-120)}`)
}
if (!cleaned.includes('风干兔子') || !cleaned.includes('刘干事')) {
  throw new Error('prose body must remain')
}

const unclosed = stripThinkingArtifactsFromText('正文一段。\n<jupytext.ext.vars>{"x":1}')
if (/jupytext/.test(unclosed)) throw new Error('unclosed jupytext must strip to end')

console.log('verify-sanitize-jupytext-leak OK')
