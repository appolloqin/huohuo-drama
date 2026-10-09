import 'dotenv/config'
import mysql from 'mysql2/promise'
import {
  extractOutlineInfoDelta,
  infoDeltaPointCovered,
  splitInfoDeltaPointsForCover,
  isInfoDeltaResultStatePoint,
  outlineInfoDeltaCovered,
} from '../src/services/novel/novel-outline-beat-cover.js'
import { shouldBindEmotionBeats } from '../src/services/novel/novel-chapter-emotion-beats.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'
import { shouldUseBeatSequentialGenerate } from '../src/services/novel/novel-chapter-beat-budget.js'

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || '')
  const [rows] = await conn.query<any[]>(
    `SELECT episode_number, title,
            CHAR_LENGTH(COALESCE(content,'')) AS len,
            content, description
     FROM episodes WHERE drama_id=37 AND episode_number IN (9,10)
     ORDER BY episode_number`,
  )
  for (const r of rows) {
    console.log('=== ep', r.episode_number, r.title, 'len', r.len)
    console.log('head', String(r.content || '').slice(0, 180).replace(/\s+/g, ' '))
    console.log('tail', String(r.content || '').slice(-220).replace(/\s+/g, ' '))
  }
  const ep10 = rows.find((r: any) => r.episode_number === 10)
  const content = String(ep10?.content || '')
  const outline = String(ep10?.description || '')
  const delta = extractOutlineInfoDelta(outline)
  const points = splitInfoDeltaPointsForCover(delta)
  console.log('\nbindEmotion?', shouldBindEmotionBeats(10))
  console.log('delta points', points)
  console.log('covered all?', outlineInfoDeltaCovered(content, outline))
  for (const p of points) {
    const h = content.replace(/\s+/g, '')
    console.log({
      p: p.slice(0, 36),
      result: isInfoDeltaResultStatePoint(p),
      covered: infoDeltaPointCovered(content, p),
      has曝光: h.includes('曝光'),
      has通匪: h.includes('通匪'),
      has归心: h.includes('归心'),
      has拓跋: h.includes('拓跋'),
      has反噬: h.includes('反噬'),
    })
  }

  const budgets = resolveChapterBeatBudgets({
    chapterOutline: outline,
    userTarget: 3000,
    chapterNumber: 10,
    prevChapterTail: String(rows.find((r: any) => r.episode_number === 9)?.content || ''),
  })
  console.log('\nbudgets', {
    count: budgets.beatCount,
    sequential: shouldUseBeatSequentialGenerate({ beatCount: budgets.beatCount, enabled: true }),
    items: budgets.items.map(it => ({
      i: it.index,
      phase: it.phase,
      tag: it.tag,
      mustLand: it.mustLand?.length || 0,
      beatHead: it.beat.slice(0, 60).replace(/\s+/g, ' '),
    })),
  })
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
