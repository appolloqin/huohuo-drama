import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_COMPOSE_OPTIONS,
  normalizeComposeOptions,
  resolveStoryboardBgmSelection,
  STORYBOARD_BGM_BUILTIN,
} from './compose-options.js'
import { builtinBgmRef, STORYBOARD_BGM_BUILTIN_LEGACY } from './builtin-bgm-catalog.js'

describe('compose-options', () => {
  it('keeps a low default BGM volume at episode level', () => {
    const opts = normalizeComposeOptions(undefined)
    assert.equal(opts.bgm_volume, DEFAULT_COMPOSE_OPTIONS.bgm_volume)
    assert.ok(opts.bgm_volume < 0.25)
  })

  it('resolves per-shot BGM none / builtin preset / custom', () => {
    assert.deepEqual(resolveStoryboardBgmSelection(null), {
      enabled: false,
      mode: 'none',
      builtinId: null,
      customPath: null,
    })
    assert.equal(resolveStoryboardBgmSelection(STORYBOARD_BGM_BUILTIN).mode, 'builtin')
    assert.equal(resolveStoryboardBgmSelection(STORYBOARD_BGM_BUILTIN_LEGACY).mode, 'builtin')
    assert.deepEqual(resolveStoryboardBgmSelection(builtinBgmRef('tense-drone')), {
      enabled: true,
      mode: 'builtin',
      builtinId: 'tense-drone',
      customPath: null,
    })
    assert.deepEqual(resolveStoryboardBgmSelection('static/bgm/uploads/a.mp3'), {
      enabled: true,
      mode: 'custom',
      builtinId: null,
      customPath: 'static/bgm/uploads/a.mp3',
    })
  })
})
