import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SEEDREAM_MIN_PIXELS,
  ensureMinPixelArea,
  mapAspectRatioToPixelDims,
  mapAspectRatioToSeedreamSize,
  resolveSeedreamSizeSpec,
  isSeedreamLikeImageModel,
} from './image-size-spec.js'
import { OpenAIImageAdapter } from '../../services/ai/adapters/openai-image.js'

describe('seedream image size', () => {
  it('maps 16:9 to at least Seedream min pixels', () => {
    const dims = mapAspectRatioToPixelDims('16:9')
    assert.ok(dims.width * dims.height >= SEEDREAM_MIN_PIXELS)
    assert.equal(mapAspectRatioToSeedreamSize('16:9'), `${dims.width}x${dims.height}`)
  })

  it('scales undersized pixel specs up to min area', () => {
    const dims = ensureMinPixelArea(1792, 1024)
    assert.ok(dims.width * dims.height >= SEEDREAM_MIN_PIXELS)
  })

  it('resolveSeedreamSizeSpec accepts aspect and pixels', () => {
    const fromRatio = resolveSeedreamSizeSpec('16:9')
    const [w, h] = fromRatio.split('x').map(Number)
    assert.ok(w * h >= SEEDREAM_MIN_PIXELS)

    const fromPixels = resolveSeedreamSizeSpec('1024x1024')
    const [pw, ph] = fromPixels.split('x').map(Number)
    assert.ok(pw * ph >= SEEDREAM_MIN_PIXELS)
  })

  it('OpenAI adapter uses Seedream size for doubao models via huohuo', () => {
    const adapter = new OpenAIImageAdapter()
    const req = adapter.buildGenerateRequest(
      { provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', apiKey: 'k', model: 'doubao-seedream-5.0-lite' } as any,
      { id: 1, prompt: 'a cat', model: 'doubao-seedream-5.0-lite', size: '16:9' },
    )
    const size = String((req.body as any).size)
    const [w, h] = size.split('x').map(Number)
    assert.ok(w * h >= SEEDREAM_MIN_PIXELS, `size ${size} too small`)
    assert.equal(isSeedreamLikeImageModel('doubao-seedream-5.0-lite'), true)
  })

  it('OpenAI adapter keeps DALL-E sizes for dall-e-3', () => {
    const adapter = new OpenAIImageAdapter()
    const req = adapter.buildGenerateRequest(
      { provider: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'k', model: 'dall-e-3' } as any,
      { id: 1, prompt: 'a cat', model: 'dall-e-3', size: '16:9' },
    )
    assert.equal((req.body as any).size, '1792x1024')
    assert.equal((req.body as any).image, undefined)
  })

  it('OpenAI/huohuo Seedream passes reference images as image field', () => {
    const adapter = new OpenAIImageAdapter()
    const refs = JSON.stringify(['data:image/jpeg;base64,aaa', 'static/images/char.jpeg'])
    const req = adapter.buildGenerateRequest(
      { provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', apiKey: 'k', model: 'doubao-seedream-5.0-lite' } as any,
      {
        id: 1,
        prompt: '镜头画面',
        model: 'doubao-seedream-5.0-lite',
        size: '16:9',
        referenceImages: refs,
      },
    )
    const body = req.body as any
    assert.ok(Array.isArray(body.image) || typeof body.image === 'string')
    const list = Array.isArray(body.image) ? body.image : [body.image]
    assert.equal(list.length, 2)
    assert.match(String(body.prompt), /角色形象参考图/)
    assert.equal(body.sequential_image_generation, 'disabled')
  })
})
