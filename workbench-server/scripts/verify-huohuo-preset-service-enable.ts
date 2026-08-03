/**
 * 火火按服务启用：无行/null → 开；0/false → 关
 * Run: npx tsx scripts/verify-huohuo-preset-service-enable.ts
 */
import { parsePresetEnabledFlag, presetRowEnabled } from '../src/services/ai/huohuo-preset-enable.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

assert(presetRowEnabled(null) === true, 'null row → enabled')
assert(presetRowEnabled(undefined) === true, 'undefined row → enabled')
assert(presetRowEnabled({}) === true, 'missing enabled → enabled')
assert(presetRowEnabled({ enabled: null }) === true, 'null enabled → enabled')
assert(presetRowEnabled({ enabled: true }) === true, 'true → enabled')
assert(presetRowEnabled({ enabled: 1 }) === true, '1 → enabled')
assert(presetRowEnabled({ enabled: false }) === false, 'false → disabled')
assert(presetRowEnabled({ enabled: 0 }) === false, '0 → disabled')

assert(parsePresetEnabledFlag(undefined) === undefined, 'parse omit')
assert(parsePresetEnabledFlag(true) === true, 'parse true')
assert(parsePresetEnabledFlag(false) === false, 'parse false')
assert(parsePresetEnabledFlag(0) === false, 'parse 0')
assert(parsePresetEnabledFlag(1) === true, 'parse 1')
assert(parsePresetEnabledFlag('false') === false, 'parse "false"')

console.log('PASS')
