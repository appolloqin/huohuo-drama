/**
 * npx tsx scripts/verify-novel-hot-rank-p1.ts
 *
 * Pure-function checks for P1 hot-rank (seed / mapper / API shape).
 * Avoids full DB bootstrap.
 */
import {
  HOT_RANK_PLATFORMS,
  HOT_RANK_SEED_BY_PLATFORM,
  applyHeuristicMapping,
  getSeedItems,
  mapTagsToGenres,
  toHotRankItem,
  type HotRankItem,
} from '../src/services/novel/novel-hot-rank/index.js'
import type { NovelHotRankItemRow } from '../src/db/repos/types.js'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

for (const platform of HOT_RANK_PLATFORMS) {
  const items = getSeedItems(platform)
  assert(items.length >= 8, `${platform} seed < 8: ${items.length}`)
  assert(
    HOT_RANK_SEED_BY_PLATFORM[platform].length >= 8,
    `${platform} HOT_RANK_SEED_BY_PLATFORM < 8`,
  )
  for (const item of items) {
    assert(item.platform === platform, `${platform} platform mismatch`)
    assert(item.externalId, `${platform} missing externalId`)
    assert(item.title, `${platform} missing title`)
    assert(Array.isArray(item.tags) && item.tags.length > 0, `${platform} tags empty`)
    assert((item.blurbShort || '').length <= 200, `${platform} blurb_short > 200`)
    assert(item.mapped.genrePrimary, `${platform} ${item.externalId} missing mapped.genrePrimary`)
    assert(Array.isArray(item.mapped.genreSecondary), 'genreSecondary must be array')
    // Never look like chapter body storage
    assert(!('content' in item), 'must not store chapter body')
    assert(!('chapter' in item), 'must not store chapter field')
  }
}

const xuanhuan = mapTagsToGenres(['玄幻', '爽文'])
assert(xuanhuan.primary === 'xuanhuan', `玄幻→xuanhuan got ${xuanhuan.primary}`)

const xianxia = mapTagsToGenres(['仙侠', '修仙'])
assert(xianxia.primary === 'xianxia', `仙侠→xianxia got ${xianxia.primary}`)

const romance = mapTagsToGenres(['言情', '甜宠'])
assert(romance.primary === 'romance', `言情→romance got ${romance.primary}`)

const heuristic = applyHeuristicMapping({
  platform: 'fanqie',
  externalId: 't1',
  title: '测试',
  tags: ['游戏', '系统'],
  heat: 1,
  blurbShort: '短摘',
  mapped: { genreSecondary: [] },
})
assert(heuristic.mapped.genrePrimary === 'game', `game heuristic got ${heuristic.mapped.genrePrimary}`)
assert(heuristic.mapped.worldviewId === 'wv_game_instance', 'game worldview default')
assert(heuristic.mapped.goldenFingerId, 'game golden finger default')

const row: NovelHotRankItemRow = {
  id: 'id1',
  platform: 'fanqie',
  externalId: 'ext1',
  title: '标题',
  tagsJson: JSON.stringify(['玄幻', '系统']),
  heat: 99,
  blurbShort: '短摘灵感',
  mappedGenrePrimary: 'xuanhuan',
  mappedGenreSecondaryJson: JSON.stringify(['game']),
  mappedWorldviewId: 'wv_generic_fantasy',
  mappedCultivationId: 'cu_xuanhuan_bloodline',
  mappedGoldenFingerId: 'gf_checkin',
  mapSource: 'manual',
  fetchedAt: new Date().toISOString(),
}

const shaped: HotRankItem = toHotRankItem(row)
assert(shaped.externalId === 'ext1', 'shape externalId')
assert(shaped.blurbShort === '短摘灵感', 'shape blurbShort')
assert(shaped.mapped.genrePrimary === 'xuanhuan', 'shape genrePrimary')
assert(shaped.mapped.genreSecondary.includes('game'), 'shape genreSecondary')
assert(shaped.mapped.worldviewId === 'wv_generic_fantasy', 'shape worldviewId')
assert(typeof shaped.fetchedAt === 'string', 'shape fetchedAt')
assert(
  JSON.stringify(shaped).includes('externalId') && !JSON.stringify(shaped).includes('external_id'),
  'API shape prefers camelCase',
)

console.log('verify-novel-hot-rank-p1: OK')
