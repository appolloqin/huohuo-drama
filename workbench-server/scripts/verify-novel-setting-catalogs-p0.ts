/**
 * npx tsx scripts/verify-novel-setting-catalogs-p0.ts
 */
import { filterCatalogByGenre } from '../src/common/novel/novel-setting-catalog-types.js'
import { NOVEL_WORLDVIEW_CATALOG } from '../src/common/novel/novel-worldview-catalog.js'
import { NOVEL_CULTIVATION_CATALOG } from '../src/common/novel/novel-cultivation-catalog.js'
import { NOVEL_GOLDEN_FINGER_CATALOG } from '../src/common/novel/novel-golden-finger-catalog.js'
import { buildNovelSettingInjectBlock } from '../src/common/novel/novel-setting-inject.js'
import {
  bodyHasIdeationSettingKeys,
  validateNovelIdeationSettings,
} from '../src/common/novel/novel-setting-validate.js'
import { mergeNovelMetadata, parseNovelMetadata } from '../src/common/novel/novel-meta.js'
import {
  ideationPatchFromBody,
  stripCultivationIfNonPower,
} from '../src/common/novel/novel-setting-from-body.js'
import { isCultivationPowerGenre } from '../src/common/novel/novel-power-genre.js'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const wvActive = filterCatalogByGenre(NOVEL_WORLDVIEW_CATALOG)
const cuActive = filterCatalogByGenre(NOVEL_CULTIVATION_CATALOG)
const gfActive = filterCatalogByGenre(NOVEL_GOLDEN_FINGER_CATALOG)
assert(wvActive.length >= 8, `worldview active < 8: ${wvActive.length}`)
assert(cuActive.length >= 8, `cultivation active < 8: ${cuActive.length}`)
assert(gfActive.length >= 8, `golden_finger active < 8: ${gfActive.length}`)

const forXianxia = filterCatalogByGenre(NOVEL_WORLDVIEW_CATALOG, 'xianxia')
assert(forXianxia.some(e => e.id === 'wv_three_realms'), 'wv_three_realms must show for xianxia')
const forRomance = filterCatalogByGenre(NOVEL_WORLDVIEW_CATALOG, 'romance')
assert(!forRomance.some(e => e.id === 'wv_three_realms'), 'wv_three_realms must hide for romance')

const customText = 'CUSTOM_WORLD_LINE_UNIQUE_XYZ'
const injectCustom = buildNovelSettingInjectBlock({
  novel_genre: '仙侠文',
  novel_genre_skill_key: 'xianxia',
  novel_genre_secondary_keys: ['angst'],
  worldview_id: 'wv_three_realms',
  worldview_custom: customText,
  cultivation_id: 'cu_standard_xianxia',
  golden_finger_id: 'gf_checkin',
})
assert(injectCustom.includes(customText), 'custom worldview must win')
assert(!injectCustom.includes('三界格局'), 'catalog inject should not appear when custom set')
assert(injectCustom.includes('【修炼体系】'), 'power genre must inject cultivation')
assert(injectCustom.includes('【辅题材·轻融合】'), 'secondary must appear')

const injectRomance = buildNovelSettingInjectBlock({
  novel_genre: '言情文',
  novel_genre_skill_key: 'romance',
  worldview_id: 'wv_campus_city',
  golden_finger_id: 'gf_no_cheat',
  cultivation_id: 'cu_standard_xianxia',
})
assert(!injectRomance.includes('【修炼体系】'), 'romance must not inject cultivation')

assert(
  validateNovelIdeationSettings({
    novel_genre_skill_key: 'xianxia',
    novel_genre: '仙侠文',
    worldview_id: 'wv_three_realms',
    golden_finger_id: 'gf_checkin',
  }) !== null,
  'power genre missing cultivation must fail',
)

assert(
  validateNovelIdeationSettings({
    novel_genre_skill_key: 'xianxia',
    novel_genre: '仙侠文',
    novel_genre_secondary_keys: ['angst', 'farming', 'brainhole', 'weird'],
    worldview_id: 'wv_three_realms',
    cultivation_id: 'cu_standard_xianxia',
    golden_finger_id: 'gf_checkin',
  }) !== null,
  'secondary > 3 must fail',
)

assert(
  validateNovelIdeationSettings({
    novel_genre_skill_key: 'xianxia',
    novel_genre: '仙侠文',
    worldview_id: 'wv_three_realms',
    cultivation_id: 'cu_standard_xianxia',
    golden_finger_id: 'gf_checkin',
  }) === null,
  'valid xianxia settings must pass',
)

const merged = mergeNovelMetadata(null, {
  novel_genre_skill_key: 'xianxia',
  novel_genre: '仙侠文',
  novel_genre_secondary_keys: ['angst', 'angst', 'farming'],
  worldview_id: 'wv_three_realms',
  hot_source: { platform: 'fanqie', externalId: '1', title: '测试' },
})
const parsed = parseNovelMetadata(merged)
assert(parsed.novel_genre_secondary_keys?.length === 2, 'secondary dedupe')
assert(parsed.hot_source?.platform === 'fanqie', 'hot_source parse')

const cleared = parseNovelMetadata(mergeNovelMetadata(merged, { hot_source: null }))
assert(!cleared.hot_source, 'hot_source null deletes')

assert(isCultivationPowerGenre('仙侠文'), 'power genre helper')
assert(!isCultivationPowerGenre('言情文'), 'romance not power')

const powerBody = ideationPatchFromBody({
  novel_genre_skill_key: 'xianxia',
  novel_genre_secondary_keys: ['angst'],
  worldview_id: 'wv_three_realms',
  cultivation_id: 'cu_standard_xianxia',
  golden_finger_id: 'gf_checkin',
})
const powerMeta = parseNovelMetadata(mergeNovelMetadata(null, {
  ...powerBody,
  premise: '梗概',
}))
assert(powerMeta.cultivation_id === 'cu_standard_xianxia', 'create-like merge keeps cultivation')
assert(powerMeta.novel_genre === '仙侠文', 'skillKey backfills genre label')

const romanceBody = ideationPatchFromBody({
  novel_genre: '言情文',
  novel_genre_skill_key: 'romance',
  worldview_id: 'wv_campus_city',
  cultivation_id: 'cu_standard_xianxia',
  golden_finger_id: 'gf_no_cheat',
})
const romanceMerged = stripCultivationIfNonPower(
  parseNovelMetadata(mergeNovelMetadata(null, romanceBody)),
)
assert(!romanceMerged.cultivation_id, 'non-power strips cultivation')
assert(
  validateNovelIdeationSettings({
    ...romanceMerged,
    worldview_custom: undefined,
  }) === null
  || validateNovelIdeationSettings(romanceMerged) === null,
  'romance with worldview+gf ok',
)
assert(
  validateNovelIdeationSettings({
    novel_genre_skill_key: 'romance',
    novel_genre: '言情文',
    golden_finger_id: 'gf_no_cheat',
  }) !== null,
  'missing worldview fails',
)

assert(!bodyHasIdeationSettingKeys({ context_chars: 4000 }), 'chars-only no ideation')
assert(bodyHasIdeationSettingKeys({ worldview_id: 'x' }), 'worldview triggers ideation')

console.log('verify-novel-setting-catalogs-p0 ok')
