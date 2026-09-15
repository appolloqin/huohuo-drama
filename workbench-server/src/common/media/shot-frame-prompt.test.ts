import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ensureShotFrameNoOnscreenText,
  isShotFrameImageJob,
  promptAlreadyBansOnscreenText,
} from './shot-frame-prompt.js'

describe('shot-frame-prompt', () => {
  it('appends no-text guard once', () => {
    const once = ensureShotFrameNoOnscreenText('厨房中景')
    assert.match(once, /禁止出现任何文字/)
    assert.match(once, /no speech bubbles/)
    const twice = ensureShotFrameNoOnscreenText(once)
    assert.equal(twice, once)
    assert.equal(promptAlreadyBansOnscreenText(once), true)
  })

  it('detects shot frame jobs by storyboard or frame type', () => {
    assert.equal(isShotFrameImageJob({ storyboardId: 14 }), true)
    assert.equal(isShotFrameImageJob({ frameType: 'first_frame' }), true)
    assert.equal(isShotFrameImageJob({ frameType: 'reference:2' }), true)
    assert.equal(isShotFrameImageJob({ frameType: null, storyboardId: null }), false)
  })
})
