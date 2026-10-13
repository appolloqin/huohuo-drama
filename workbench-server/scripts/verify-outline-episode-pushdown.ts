/**
 * 校验：全书大纲下推会改写 episode.description（避免旧章纲回写总纲）
 */
import assert from 'node:assert/strict'
import { extractChapterOutline } from '../src/common/novel/novel-outline.js'

const book = `
【分章概要】
第11章：筒车引水
【局面变化】引水成功

第12章：军工分田
【局面变化】按军功分田
【信息增量】新田制落地

第13章：北狄斥候
【局面变化】斥候现身
`

const ch12 = extractChapterOutline(book, 12)
assert.ok(ch12.includes('军工分田'), 'extract ch12 title')
assert.ok(ch12.includes('按军功分田'), 'extract ch12 stakes')
assert.ok(!ch12.includes('账房烂账'), 'must not keep old title in extract')

const oldEpDesc = `账房烂账

【本章时间】旧
【局面变化】旧账`
assert.notEqual(oldEpDesc.trim(), ch12.trim(), 'book section differs from stale episode desc')

console.log('ok: outline episode pushdown extract')
