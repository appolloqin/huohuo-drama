import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MiniMaxH3VideoAdapter } from './minimax-h3-video.js'
import { getVideoAdapter } from './registry.js'

const cfg = {
  provider: 'minimax-h3',
  baseUrl: 'https://api.minimaxi.com',
  apiKey: 'test-key',
  model: 'MiniMax-H3',
}

describe('MiniMaxH3VideoAdapter', () => {
  it('posts to v2 video_generation with required H3 fields for text-to-video', () => {
    const adapter = new MiniMaxH3VideoAdapter()
    const req = adapter.buildGenerateRequest(cfg, {
      id: 1,
      model: 'MiniMax-H3',
      prompt: 'a girl running',
      duration: 5,
      aspectRatio: '16:9',
      referenceMode: 'none',
    })
    assert.equal(req.method, 'POST')
    assert.match(req.url, /\/v2\/video_generation$/)
    assert.equal(req.body.model, 'MiniMax-H3')
    assert.equal(req.body.resolution, '768P')
    assert.equal(req.body.duration, 5)
    assert.equal(req.body.ratio, '16:9')
    assert.equal(req.body.content[0].type, 'text')
    assert.match(String(req.body.content[0].text), /a girl running/)
  })

  it('clamps duration to 4–15 and omits ratio when an image reference is present', () => {
    const adapter = new MiniMaxH3VideoAdapter()
    const req = adapter.buildGenerateRequest(cfg, {
      id: 2,
      prompt: 'zoom in',
      duration: 2,
      aspectRatio: '9:16',
      referenceMode: 'single',
      imageUrl: 'https://example.com/a.png',
    })
    assert.equal(req.body.duration, 4)
    assert.equal(req.body.ratio, undefined)
    assert.equal(req.body.content.some((b: { role?: string }) => b.role === 'reference_image'), true)
  })

  it('reads resolution from config settings and polls v2 query URL', () => {
    const adapter = new MiniMaxH3VideoAdapter()
    const req = adapter.buildGenerateRequest(
      { ...cfg, settings: { resolution: '2K' } },
      { id: 3, prompt: 'x', duration: 20, referenceMode: 'none' },
    )
    assert.equal(req.body.resolution, '2K')
    assert.equal(req.body.duration, 15)

    const poll = adapter.buildPollRequest(cfg, 'task-1')
    assert.equal(poll.method, 'GET')
    assert.match(poll.url, /\/v2\/query\/video_generation\/task-1$/)
  })

  it('parses async task_id and completed video_url', () => {
    const adapter = new MiniMaxH3VideoAdapter()
    const created = adapter.parseGenerateResponse({ task_id: 'abc' })
    assert.equal(created.isAsync, true)
    assert.equal(created.taskId, 'abc')

    const done = adapter.parsePollResponse({ status: 'success', video_url: 'https://cdn.example/v.mp4' })
    assert.equal(done.status, 'completed')
    assert.equal(done.videoUrl, 'https://cdn.example/v.mp4')
  })

  it('registers minimax-h3 without replacing hailuo minimax adapter', () => {
    assert.equal(getVideoAdapter('minimax-h3').provider, 'minimax-h3')
    assert.equal(getVideoAdapter('minimax').provider, 'minimax')
  })
})
