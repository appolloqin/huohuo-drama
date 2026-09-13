import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { stripStyleReferenceFromListJson } from './media-reference.js'

describe('stripStyleReferenceFromListJson', () => {
  it('removes static style path before normalize would rewrite it', () => {
    const style = 'static/style-previews/cinematic.png'
    const raw = JSON.stringify([style, 'static/characters/face.png'])
    assert.equal(
      stripStyleReferenceFromListJson(raw, style),
      JSON.stringify(['static/characters/face.png']),
    )
  })

  it('returns null when only style remains', () => {
    const style = 'static/style-previews/cinematic.png'
    assert.equal(stripStyleReferenceFromListJson(JSON.stringify([style]), style), null)
  })

  it('leaves list unchanged without style url', () => {
    const raw = JSON.stringify(['a.png', 'b.png'])
    assert.equal(stripStyleReferenceFromListJson(raw, null), raw)
  })
})
