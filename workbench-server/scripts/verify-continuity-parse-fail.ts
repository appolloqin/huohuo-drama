/**
 * 模型审解析失败不得伪造成「已通过 80 分」
 * Run: npx tsx scripts/verify-continuity-parse-fail.ts
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-continuity-check.ts')
const src = readFileSync(root, 'utf8')

if (/score:\s*80[\s\S]{0,120}跳过硬性拦截/.test(src) || /跳过硬性拦截[\s\S]{0,80}score:\s*80/.test(src)) {
  throw new Error('parse-fail path must not fake pass with score 80')
}
if (!/model_parse_failed:\s*true/.test(src)) {
  throw new Error('parse-fail must set model_parse_failed')
}
if (!/审校模型未返回可用正文|model_parse_failed:\s*true/.test(src)) {
  throw new Error('must distinguish empty-content audit failure')
}

console.log('verify-continuity-parse-fail OK')
