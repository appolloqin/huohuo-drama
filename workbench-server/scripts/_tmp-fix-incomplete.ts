import '../src/load-env.js'
import '../src/db/bootstrap.js'
import mysql from 'mysql2/promise'
import { fillMissingOutlineChapterFields } from '../src/services/novel/novel-outline-drama-ensure.js'
import { assertOutlineChapterFields } from '../src/services/novel/novel-outline-drama-fields.js'
import { syncChapterTitlesFromOutline } from '../src/common/novel/novel-chapter-titles.js'

const c = await mysql.createConnection(process.env.DATABASE_URL!)
const [rows] = await c.query('SELECT metadata, title FROM dramas WHERE id=27') as any
const meta = typeof rows[0].metadata === 'object' ? rows[0].metadata : JSON.parse(rows[0].metadata)
let outline = String(meta.outline || '')

const bad: number[] = []
for (let n = 1; n <= 100; n++) {
  const check = assertOutlineChapterFields(outline, n)
  if (!check.ok) {
    bad.push(n)
    console.log('incomplete', n, check.missing, check.invalid)
  }
}

for (const n of bad) {
  const check = assertOutlineChapterFields(outline, n)
  outline = await fillMissingOutlineChapterFields({
    outline,
    chapterNumber: n,
    missing: check.missing,
    invalid: check.invalid,
    title: rows[0].title,
  })
  const again = assertOutlineChapterFields(outline, n)
  console.log('fixed', n, again.ok, again.missing)
}

meta.outline = outline
await c.query('UPDATE dramas SET metadata=? WHERE id=?', [JSON.stringify(meta), 27])
await c.end()
const titlesUpdated = await syncChapterTitlesFromOutline(27, outline)
console.log('titlesUpdated', titlesUpdated, 'chars', outline.length)

// spot print ch70, ch8 place, ch100
const show = (n: number) => {
  const re = new RegExp(`第\\s*${n}\\s*章[：:][^]*?(?=第\\s*${n + 1}\\s*章|$)`)
  const m = outline.match(re)
  console.log('\n====', n, '====\n', (m?.[0] || '').slice(0, 500))
}
show(8)
show(70)
show(100)
