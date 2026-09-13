import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyStyleReferenceToImageGeneration,
  applyStyleReferenceToVideoGeneration,
} from './drama-style-reference.js'

describe('drama-style-reference', () => {
  it('stamps styleReferenceUrl when style image applied', () => {
    const out = applyStyleReferenceToImageGeneration(
      { prompt: 'a', referenceImages: ['face.png'] },
      { referenceImage: 'style.png', promptPrefix: 'STYLE' },
    )
    assert.equal(out.styleReferenceUrl, 'style.png')
    assert.deepEqual(out.referenceImages, ['style.png', 'face.png'])
  })

  it('stamps styleReferenceUrl on video generation when style image applied', () => {
    const out = applyStyleReferenceToVideoGeneration(
      { prompt: 'a', referenceImageUrls: ['face.png'] },
      { referenceImage: 'style.png', promptPrefix: 'STYLE' },
    )
    assert.equal(out.styleReferenceUrl, 'style.png')
    assert.deepEqual(out.referenceImageUrls, ['style.png', 'face.png'])
  })
})
