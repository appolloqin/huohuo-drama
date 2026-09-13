import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  contentRefUrls,
  detectComfyImageMode,
  detectComfyVideoMode,
  isComfyFamilyProvider,
  preferredComfyProvider,
  pickComfySiblingConfig,
  reconcileComfyDecision,
  resolveRuntimeComfyMode,
  throwIfReconcileError,
} from './comfyui-mode-resolve.js'
import type { AIConfig } from './adapter-shared.js'
import { UserAiConfigError } from '../user-ai-config-resolve.js'

describe('comfyui-mode-resolve', () => {
  it('strips style URL from content refs', () => {
    assert.deepEqual(
      contentRefUrls(['style.png', 'face.png'], 'style.png'),
      ['face.png'],
    )
  })

  it('style-only => t2i', () => {
    assert.equal(detectComfyImageMode(['style.png'], 'style.png'), 't2i')
  })

  it('content ref => i2i', () => {
    assert.equal(detectComfyImageMode(['style.png', 'face.png'], 'style.png'), 'i2i')
  })

  it('video frames => i2v', () => {
    assert.equal(
      detectComfyVideoMode({ firstFrameUrl: 'a.png', referenceImageUrls: [], styleReferenceUrl: 's.png' }),
      'i2v',
    )
  })

  it('style-only video refs => t2v', () => {
    assert.equal(
      detectComfyVideoMode({ referenceImageUrls: ['s.png'], styleReferenceUrl: 's.png' }),
      't2v',
    )
  })

  it('pickComfySiblingConfig prefers same base_url', () => {
    const current = { id: 1, provider: 'comfyui-t2i', baseUrl: 'http://a', serviceType: 'image' } as AIConfig
    const rows = [
      { id: 2, provider: 'comfyui-i2i', baseUrl: 'http://b', serviceType: 'image', isActive: true },
      { id: 3, provider: 'comfyui-i2i', baseUrl: 'http://a', serviceType: 'image', isActive: true },
    ]
    const picked = pickComfySiblingConfig(current, 'i2i', rows as any)
    assert.equal(picked?.id, 3)
  })

  it('non-comfy preferred provider is null path', () => {
    assert.equal(isComfyFamilyProvider('minimax'), false)
    assert.equal(preferredComfyProvider('image', 'i2i'), 'comfyui-i2i')
  })

  it('reconcileComfyDecision keeps matching provider', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-i2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'keep')
  })

  it('reconcileComfyDecision switches to sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-t2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      { id: 9 },
    )
    assert.deepEqual(d, { action: 'switch', id: 9 })
  })

  it('reconcileComfyDecision keeps legacy comfyui when no sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'keep')
  })

  it('reconcileComfyDecision errors on mode mismatch without sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-t2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'error')
  })

  it('throwIfReconcileError throws UserAiConfigError', () => {
    assert.throws(
      () =>
        throwIfReconcileError({
          action: 'error',
          message: '需要 comfyui-i2i',
        }),
      (err: unknown) => err instanceof UserAiConfigError && /comfyui-i2i/.test(err.message),
    )
  })

  it('resolveRuntimeComfyMode uses provider slug; legacy returns detected', () => {
    assert.equal(resolveRuntimeComfyMode('comfyui-t2i', 'i2i'), 't2i')
    assert.equal(resolveRuntimeComfyMode('comfyui-i2v', 't2v'), 'i2v')
    assert.equal(resolveRuntimeComfyMode('comfyui', 'i2i'), 'i2i')
    assert.equal(resolveRuntimeComfyMode('comfyui', 't2v'), 't2v')
  })
})
