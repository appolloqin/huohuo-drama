import 'dotenv/config'
import mysql from 'mysql2/promise'
import { extractTagBlock } from '../src/services/novel/novel-outline-drama-fields.js'
import { extractChapterCastAllowlist } from '../src/services/novel/novel-writing-brief-cast.js'

const BAD = ['孙满仓', '秦忠', '燕擎苍', '沈翠娘']

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || '')
  const dramaId = 37
  const [eps] = await conn.query<any[]>(
    `SELECT id, episode_number, title, description, script_content, metadata
     FROM episodes WHERE drama_id=? ORDER BY episode_number`,
    [dramaId],
  )
  for (const e of eps as any[]) {
    const brief = String(e.script_content || '')
    const outline = String(e.description || '')
    const meta = typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata || {})
    const hits = BAD.filter(n => brief.includes(n) || meta.includes(n) || outline.includes(n))
    if (!hits.length) continue
    const cast = extractChapterCastAllowlist(outline)
    const castLine = extractTagBlock(outline, '本章人物') || ''
    console.log('---', e.episode_number, e.title, 'id', e.id)
    console.log(' bad', hits)
    console.log(' cast', cast)
    console.log(' castLine', castLine.slice(0, 120))
    for (const n of hits) {
      console.log(`  ${n} in brief=${brief.includes(n)} meta=${meta.includes(n)} outline=${outline.includes(n)} countBrief=${(brief.match(new RegExp(n, 'g')) || []).length}`)
    }
  }
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
