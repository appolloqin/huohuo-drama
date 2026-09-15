import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILTIN_BGM_PRESETS,
  builtinBgmRef,
  DEFAULT_BUILTIN_BGM_ID,
  parseBuiltinBgmId,
  STORYBOARD_BGM_BUILTIN_LEGACY,
} from './builtin-bgm-catalog.js'

describe('builtin-bgm-catalog', () => {
  it('exposes multiple selectable presets', () => {
    assert.ok(BUILTIN_BGM_PRESETS.length >= 3)
    assert.ok(BUILTIN_BGM_PRESETS.every(p => p.id && p.label && p.relativePath))
  })

  it('parses builtin refs and legacy sentinel', () => {
    assert.equal(parseBuiltinBgmId(null), null)
    assert.equal(parseBuiltinBgmId(STORYBOARD_BGM_BUILTIN_LEGACY), DEFAULT_BUILTIN_BGM_ID)
    assert.equal(parseBuiltinBgmId(builtinBgmRef('tense-drone')), 'tense-drone')
    assert.equal(parseBuiltinBgmId(builtinBgmRef('missing-id')), DEFAULT_BUILTIN_BGM_ID)
  })
})
