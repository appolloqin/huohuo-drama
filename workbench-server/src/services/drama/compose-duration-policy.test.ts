import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  audioExceedsPicture,
  resolvePicturePrimaryDurationSec,
  resolveSlideshowPictureDurationSec,
  resolveSubtitleDurationSec,
} from './compose-duration-policy.js'

describe('compose-duration-policy', () => {
  it('keeps picture duration as the compose output length', () => {
    assert.equal(resolvePicturePrimaryDurationSec(12.4), 12.4)
    assert.equal(resolvePicturePrimaryDurationSec(0), 0.1)
    assert.equal(resolvePicturePrimaryDurationSec(-3), 0.1)
  })

  it('uses storyboard plan for slideshow length, never TTS', () => {
    assert.equal(resolveSlideshowPictureDurationSec(13), 13)
    assert.equal(resolveSlideshowPictureDurationSec(null), 10)
    assert.equal(resolveSlideshowPictureDurationSec(1), 3)
  })

  it('detects when audio is longer than the picture', () => {
    assert.equal(audioExceedsPicture(8, 5), true)
    assert.equal(audioExceedsPicture(5, 8), false)
    assert.equal(audioExceedsPicture(5.02, 5), false)
    assert.equal(audioExceedsPicture(5.2, 5), true)
  })

  it('caps subtitle span to the picture when audio overruns', () => {
    assert.equal(resolveSubtitleDurationSec(3.2, 10), 3.2)
    assert.equal(resolveSubtitleDurationSec(12, 10), 10)
  })
})
