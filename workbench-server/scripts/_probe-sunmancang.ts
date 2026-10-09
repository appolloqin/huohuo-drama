import 'dotenv/config'
import mysql from 'mysql2/promise'

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || '')
  const dramaId = 37

  const [drama] = await conn.query<any[]>(
    `SELECT id, title, metadata FROM dramas WHERE id=?`,
    [dramaId],
  )
  const d = (drama as any[])[0]
  console.log('drama', d.id, d.title)
  const mdRaw = d.metadata
  const mdObj = typeof mdRaw === 'string' ? JSON.parse(mdRaw || '{}') : (mdRaw || {})
  const md = JSON.stringify(mdObj)
  console.log('premise has 孙满仓', String(mdObj.premise || '').includes('孙满仓'))
  console.log('outline has 孙满仓', String(mdObj.outline || '').includes('孙满仓'))
  console.log('metadata has 孙满仓', md.includes('孙满仓'), 'count', (md.match(/孙满仓/g) || []).length)
  if (md.includes('孙满仓')) {
    let i = 0
    let n = 0
    while (n < 8) {
      const j = md.indexOf('孙满仓', i)
      if (j < 0) break
      console.log('meta@', j, md.slice(Math.max(0, j - 60), j + 80).replace(/\s+/g, ' '))
      i = j + 3
      n++
    }
  }

  const [eps] = await conn.query<any[]>(
    `SELECT episode_number, title,
            CHAR_LENGTH(COALESCE(description,'')) AS dlen,
            CHAR_LENGTH(COALESCE(script_content,'')) AS blen,
            CHAR_LENGTH(COALESCE(content,'')) AS clen,
            (description LIKE '%孙满仓%') AS d_has,
            (script_content LIKE '%孙满仓%') AS b_has,
            (content LIKE '%孙满仓%') AS c_has,
            (metadata LIKE '%孙满仓%') AS m_has
     FROM episodes WHERE drama_id=? ORDER BY episode_number`,
    [dramaId],
  )
  const list = eps as any[]
  console.log('\nepisode 孙满仓 hits:')
  for (const e of list.filter(x => x.d_has || x.b_has || x.c_has || x.m_has)) {
    console.log(e.episode_number, e.title, {
      outline: !!e.d_has,
      brief: !!e.b_has,
      content: !!e.c_has,
      meta: !!e.m_has,
      blen: e.blen,
    })
  }

  // sample a chapter with brief hit but outline miss
  const bad = list.find(x => x.b_has && !x.d_has)
    || list.find(x => x.b_has)
  if (bad) {
    const [rows] = await conn.query<any[]>(
      `SELECT episode_number, title, description, script_content, metadata
       FROM episodes WHERE drama_id=? AND episode_number=?`,
      [dramaId, bad.episode_number],
    )
    const ep = (rows as any[])[0]
    const brief = String(ep.script_content || '')
    const outline = String(ep.description || '')
    console.log('\n#### sample ep', ep.episode_number, ep.title)
    console.log('outline 本章人物', (outline.match(/【本章人物】[^\n]+/) || [])[0])
    console.log('outline has 孙满仓', outline.includes('孙满仓'))
    console.log('brief 孙满仓 count', (brief.match(/孙满仓/g) || []).length)
    console.log('brief head', brief.slice(0, 600).replace(/\s+/g, ' '))
    let i = 0
    let n = 0
    while (n < 8) {
      const j = brief.indexOf('孙满仓', i)
      if (j < 0) break
      console.log(' brief@', j, brief.slice(Math.max(0, j - 50), j + 70).replace(/\s+/g, ' '))
      i = j + 3
      n++
    }
    const em = typeof ep.metadata === 'string' ? ep.metadata : JSON.stringify(ep.metadata || {})
    if (em.includes('孙满仓')) {
      const j = em.indexOf('孙满仓')
      console.log('ep meta ctx', em.slice(Math.max(0, j - 80), j + 100).replace(/\s+/g, ' '))
    }
  }

  // who is in early chapters content
  const [early] = await conn.query<any[]>(
    `SELECT episode_number, title,
            (content LIKE '%孙满仓%') c,
            (description LIKE '%孙满仓%') d,
            (script_content LIKE '%孙满仓%') b
     FROM episodes WHERE drama_id=? AND episode_number<=15 ORDER BY episode_number`,
    [dramaId],
  )
  console.log('\nearly ch 1-15 flags', early)

  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
