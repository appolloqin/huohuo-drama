import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildProviderProbeSpec } from './ai-config-probe.js'

describe('buildProviderProbeSpec comfyui', () => {
  for (const provider of ['comfyui', 'comfyui-t2i', 'comfyui-i2i', 'comfyui-t2v', 'comfyui-i2v']) {
    it(`probes ${provider} via GET /system_stats`, () => {
      const spec = buildProviderProbeSpec('image', provider, 'http://127.0.0.1:8188', 'x', 'k')
      assert.equal(spec.method, 'GET')
      assert.equal(spec.url, 'http://127.0.0.1:8188/system_stats')
      assert.equal(spec.body, undefined)
      assert.equal(spec.headers.Authorization, 'Bearer k')
    })
  }

  it('does not change openai chat probe', () => {
    const spec = buildProviderProbeSpec('text', 'openai', 'https://api.openai.com', 'gpt', 'k')
    assert.match(spec.url, /\/v1\/models$/)
  })
})
