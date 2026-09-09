import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyComfyuiTitleInputs,
  parseComfyuiHistoryMedia,
  resolveComfyuiWorkflow,
} from './comfyui-workflow.js'
import { getImageAdapter, getVideoAdapter } from './registry.js'

const titledGraph = {
  '6': { class_type: 'CLIPTextEncode', _meta: { title: 'positive' }, inputs: { text: 'old' } },
  '7': { class_type: 'CLIPTextEncode', _meta: { title: 'negative' }, inputs: { text: '' } },
  '10': { class_type: 'LoadImage', _meta: { title: 'load_image' }, inputs: { image: '' } },
  '11': { class_type: 'LoadImage', _meta: { title: 'first_frame' }, inputs: { image: '' } },
  '12': { class_type: 'PrimitiveInt', _meta: { title: 'duration' }, inputs: { value: 8 } },
}

describe('comfyui-workflow', () => {
  it('injects prompt and images by node title', () => {
    const next = applyComfyuiTitleInputs(titledGraph, {
      prompt: 'hero stands',
      negative: 'blur',
      loadImage: 'ref.png',
      firstFrame: 'first.png',
      duration: 6,
    })
    assert.equal(next['6'].inputs.text, 'hero stands')
    assert.equal(next['7'].inputs.text, 'blur')
    assert.equal(next['10'].inputs.image, 'ref.png')
    assert.equal(next['11'].inputs.image, 'first.png')
    assert.equal(next['12'].inputs.value, 6)
  })

  it('fails when the positive title is missing', () => {
    assert.throws(
      () => applyComfyuiTitleInputs({ '1': { class_type: 'SaveImage', inputs: {} } }, { prompt: 'x' }),
      /positive/,
    )
  })

  it('uses the built-in default workflow when settings are empty', () => {
    const graph = resolveComfyuiWorkflow(null, 'image')
    const titles = Object.values(graph).map((n) => String(n._meta?.title || n.title || ''))
    assert.equal(titles.includes('positive'), true)
  })

  it('builds a /view URL from history outputs', () => {
    const href = parseComfyuiHistoryMedia(
      {
        'pid-1': {
          status: { completed: true, status_str: 'success' },
          outputs: {
            '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] },
          },
        },
      },
      'pid-1',
      'http://127.0.0.1:8188',
    )
    assert.equal(href.status, 'completed')
    assert.equal(href.mediaUrl, 'http://127.0.0.1:8188/view?filename=out.png&subfolder=&type=output')
  })

  it('registers comfyui image and video adapters', () => {
    assert.equal(getImageAdapter('comfyui').provider, 'comfyui')
    assert.equal(getVideoAdapter('comfyui').provider, 'comfyui')
    assert.equal(getImageAdapter('minimax').provider, 'minimax')
  })
})
