import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HuohuoVideoAdapter } from './huohuo-video.js'
import { getVideoAdapter } from './registry.js'

const cfg = {
  provider: 'huohuo',
  baseUrl: 'https://huo.hcpzy.com/v1',
  apiKey: 'test-key',
  model: 'happyhorse-1.1-i2v',
}

describe('HuohuoVideoAdapter', () => {
  it('strips OpenAI-style /v1 suffix and posts huohuo media-list body', () => {
    const adapter = new HuohuoVideoAdapter()
    const req = adapter.buildGenerateRequest(cfg, {
      id: 1,
      model: 'happyhorse-1.1-i2v',
      prompt: 'a girl running',
      duration: 10,
      aspectRatio: '16:9',
      referenceMode: 'first_last',
      firstFrameUrl: 'https://example.com/first.png',
      lastFrameUrl: 'https://example.com/last.png',
    })
    assert.equal(req.method, 'POST')
    assert.equal(req.url, 'https://huo.hcpzy.com/api/v1/services/aigc/video-generation/video-synthesis')
    assert.equal(req.headers['X-DashScope-Async'], 'enable')
    assert.match(String(req.headers.Authorization), /^Bearer /)
    assert.equal(req.body.model, 'happyhorse-1.1-i2v')
    assert.equal(req.body.input.prompt, 'a girl running')
    // 快活马 media 列表：首帧 type='first_frame'；尾帧不支持（网关仅接受 first_frame）
    assert.deepEqual(req.body.input.media, [{ url: 'https://example.com/first.png', type: 'first_frame' }])
    assert.equal(req.body.parameters.resolution, '1080P')
    assert.equal(req.body.parameters.duration, 10)
    // 官方外壳：不得携带 MiniMax 风格的 content/比例后缀，也不得用万相 img_url 字段
    assert.equal(req.body.content, undefined)
    assert.equal(req.body.input.img_url, undefined)
    assert.equal(String(req.body.input.prompt).includes('--ratio'), false)
  })

  it('supports data-url first frame (gateway re-hosts to OSS)', () => {
    const adapter = new HuohuoVideoAdapter()
    const req = adapter.buildGenerateRequest(cfg, {
      id: 2,
      prompt: 'zoom',
      duration: 5,
      aspectRatio: '9:16',
      referenceMode: 'single',
      imageUrl: 'data:image/jpeg;base64,AAA',
    })
    assert.deepEqual(req.body.input.media, [{ url: 'data:image/jpeg;base64,AAA', type: 'first_frame' }])
    assert.equal(req.body.parameters.resolution, '720P')
  })

  it('builds poll URL with required ?model= query on gateway origin', () => {
    const adapter = new HuohuoVideoAdapter()
    const poll = adapter.buildPollRequest(cfg, 'task-123')
    assert.equal(poll.method, 'GET')
    assert.equal(poll.url, 'https://huo.hcpzy.com/api/v1/tasks/task-123?model=happyhorse-1.1-i2v')
  })

  it('parses async task_id and completed video_url', () => {
    const adapter = new HuohuoVideoAdapter()
    const created = adapter.parseGenerateResponse({
      output: { task_id: 'abc', task_status: 'PENDING' },
    })
    assert.equal(created.isAsync, true)
    assert.equal(created.taskId, 'abc')

    const done = adapter.parsePollResponse({
      output: { task_status: 'SUCCEEDED', video_url: 'https://cdn.example/v.mp4' },
    })
    assert.equal(done.status, 'completed')
    assert.equal(done.videoUrl, 'https://cdn.example/v.mp4')

    const failed = adapter.parsePollResponse({
      output: { task_status: 'FAILED', code: 'InvalidParameter', message: 'Field required: input.media' },
    })
    assert.equal(failed.status, 'failed')
    assert.match(String(failed.error), /input\.media/)
  })

  it('rejects non-http non-data first frame refs with a clear error', () => {
    const adapter = new HuohuoVideoAdapter()
    assert.throws(
      () =>
        adapter.buildGenerateRequest(cfg, {
          id: 3,
          prompt: 'x',
          referenceMode: 'single',
          imageUrl: 'ftp://example.com/a.png',
        }),
      /首帧必须是可访问的图片 URL/,
    )
  })

  it('throws descriptive error on unexpected submit payload', () => {
    const adapter = new HuohuoVideoAdapter()
    assert.throws(() => adapter.parseGenerateResponse({ foo: 'bar' }), /Unexpected Huohuo video response/)
  })

  it('registers huohuo without replacing ali or minimax adapters', () => {
    assert.equal(getVideoAdapter('huohuo').provider, 'huohuo')
    assert.equal(getVideoAdapter('ali').provider, 'ali')
    assert.equal(getVideoAdapter('minimax').provider, 'minimax')
  })
})
