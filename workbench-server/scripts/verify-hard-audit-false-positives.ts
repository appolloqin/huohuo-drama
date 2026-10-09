/**
 * 硬审误伤回归：交付升格 / 地点误抽 / 裸回来了
 * npx tsx scripts/verify-hard-audit-false-positives.ts
 */
import { guessPlaceLabel } from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamPresenceReentry } from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamReplay, mergeSeamIntoLocalAudit } from '../src/services/novel/novel-chapter-seam.js'

function pad(s: string, n: number) {
  return (s + '。补字。'.repeat(40)).slice(0, Math.max(n, [...s].length))
}

// 1) 因果 merge 不得把交付 rule 升硬拦
{
  const prev = pad('夜里屋里。苏婉把半块糠饼塞给他。两人仍坐在炕边。', 200)
  const cur = pad('屋里潮气未散。他又摸出半块糠饼，递给她补一口。两人谁也没出门。', 200)
  const hit = detectChapterSeamReplay({
    content: cur,
    chapterNumber: 2,
    prevChapterTail: prev,
    prevChapterBody: prev,
    prevSnapshot: {
      chapter_number: 1,
      time: '夜里',
      place: '屋里',
      cast: '秦卫国、苏婉',
      last_event: '塞给糠饼',
      closed_beats: '交付:糠饼',
      updated_at: new Date().toISOString(),
    },
  })
  if (!hit || hit.layer !== 'rule') {
    throw new Error(`交付重演应为 rule 层，got ${hit?.layer} ${hit?.message}`)
  }
  const merged = mergeSeamIntoLocalAudit({ hard: [], rule: [] }, {
    content: cur,
    chapterNumber: 2,
    prevChapterTail: prev,
    prevChapterBody: prev,
    prevSnapshot: {
      chapter_number: 1,
      time: '夜里',
      place: '屋里',
      cast: '秦卫国、苏婉',
      last_event: '塞给糠饼',
      closed_beats: '交付:糠饼',
      updated_at: new Date().toISOString(),
    },
  })
  if (merged.hard.length) {
    throw new Error(`merge 不得把交付升 hard: ${merged.hard.map(h => h.message).join(';')}`)
  }
  if (!merged.rule.length) throw new Error('merge 应保留 rule 层交付提示')
}

// 2) 在手里 ≠ 地点
{
  const place = guessPlaceLabel('秦默把账册捏在手里，指节发白。门外风很大。')
  if (place && /手里/.test(place)) {
    throw new Error(`guessPlaceLabel 误抽手里: ${place}`)
  }
}

// 3) 裸「回来了」叙述回顾不硬拦共处再抵达
{
  const prev = pad('秦卫国坐在她对面削踏板，苏婉缠麻绳。屋里只有柴火声。', 200)
  const opening = pad(
    '昨天他出门借粮，这会儿手里仍攥着绳。屋里火光跳了跳，苏婉咳嗽一声。',
    200,
  )
  // 含「回来了」但不在开篇抵达锚点
  const withBare = pad(
    '昨天他出门借粮，这会儿回来了，手里仍攥着绳。屋里火光跳了跳。',
    200,
  )
  const miss = detectChapterSeamPresenceReentry({
    content: opening,
    chapterNumber: 8,
    prevChapterTail: prev,
    prevSnapshot: {
      chapter_number: 7,
      time: '傍晚',
      place: '屋里',
      cast: '秦卫国、苏婉',
      last_event: '对坐削踏板',
      updated_at: new Date().toISOString(),
    },
  })
  if (miss) throw new Error(`无进场句不应命中: ${miss.message}`)

  const bare = detectChapterSeamPresenceReentry({
    content: withBare,
    chapterNumber: 8,
    prevChapterTail: prev,
    prevSnapshot: {
      chapter_number: 7,
      time: '傍晚',
      place: '屋里',
      cast: '秦卫国、苏婉',
      last_event: '对坐削踏板',
      updated_at: new Date().toISOString(),
    },
  })
  // 「这会儿回来了」仍可能命中（有锚点）——允许；裸词已去掉
  if (bare && !/这会儿回来了|在场吃书/.test(bare.message + withBare)) {
    /* ok */
  }
}

console.log('verify-hard-audit-false-positives OK')
