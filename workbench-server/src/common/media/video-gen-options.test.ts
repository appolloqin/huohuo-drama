import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  enhanceVideoPrompt,
  VIDEO_NO_SUBTITLE_PROMPT_CUE,
  VIDEO_SPOKEN_DIALOGUE_PROMPT_CUE_PREFIX,
} from './video-gen-options.js'

describe('enhanceVideoPrompt', () => {
  it('injects spoken dialogue and bans burned-in subtitles when subtitles are off', () => {
    const out = enhanceVideoPrompt('中景推镜', '李明：快走！', {
      generate_audio: true,
      generate_subtitles: false,
    })
    assert.match(out, /中景推镜/)
    assert.match(out, new RegExp(VIDEO_SPOKEN_DIALOGUE_PROMPT_CUE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(out, /李明：快走！/)
    assert.match(out, new RegExp(VIDEO_NO_SUBTITLE_PROMPT_CUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(out, /画面底部显示/)
  })

  it('burns on-screen subtitle cue only when subtitles are explicitly enabled', () => {
    const out = enhanceVideoPrompt('特写', '旁白：夜深了', {
      generate_audio: true,
      generate_subtitles: true,
    })
    assert.match(out, /画面底部显示清晰可读的中文字幕/)
    assert.match(out, /旁白：夜深了/)
    assert.doesNotMatch(out, new RegExp(VIDEO_SPOKEN_DIALOGUE_PROMPT_CUE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  it('still bans burned-in text when there is no dialogue', () => {
    const out = enhanceVideoPrompt('空镜', '', {
      generate_audio: true,
      generate_subtitles: false,
    })
    assert.match(out, /空镜/)
    assert.match(out, new RegExp(VIDEO_NO_SUBTITLE_PROMPT_CUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
})
