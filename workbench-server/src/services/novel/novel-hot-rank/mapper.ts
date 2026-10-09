import { isActiveNovelGenreSkillKey } from '../../../common/novel/novel-genre-registry.js'
import type { HotRankMapped, HotRankProviderItem } from './types.js'

/** Chinese tag / keyword → genre skillKey (first match wins for primary). */
const TAG_TO_GENRE: Array<{ needles: string[]; skillKey: string }> = [
  { needles: ['玄幻', '血脉', '万族'], skillKey: 'xuanhuan' },
  { needles: ['仙侠', '修仙', '飞升'], skillKey: 'xianxia' },
  { needles: ['武侠', '江湖', '侠义'], skillKey: 'wuxia' },
  { needles: ['高武', '武道'], skillKey: 'martial_peak' },
  { needles: ['乡村', '乡土', '返乡', '乡镇'], skillKey: 'rural' },
  { needles: ['末世', '废土', '丧尸'], skillKey: 'apocalypse' },
  { needles: ['诡异', '怪谈', '规则怪谈'], skillKey: 'weird' },
  { needles: ['脑洞', '高概念'], skillKey: 'brainhole' },
  { needles: ['游戏', '系统', '副本'], skillKey: 'game' },
  { needles: ['言情', '甜宠', '恋爱'], skillKey: 'romance' },
  { needles: ['虐恋', '虐文'], skillKey: 'angst' },
  { needles: ['种田', '经营', '田园'], skillKey: 'farming' },
  { needles: ['穿越', '重生', '穿书'], skillKey: 'isekai' },
  { needles: ['异能', '觉醒'], skillKey: 'superpower' },
  { needles: ['校园', '青春'], skillKey: 'campus' },
  { needles: ['悬疑', '推理', '侦探'], skillKey: 'mystery' },
  { needles: ['驱魔', '道士', '收邪'], skillKey: 'exorcism' },
  { needles: ['都市', '职场', '都市高手', '神医', '战神'], skillKey: 'urban' },
  { needles: ['军婚', '军少', '随军', '宫闱', '宅斗', '年代重生'], skillKey: 'romance' },
  { needles: ['科幻', '星际'], skillKey: 'scifi' },
  { needles: ['官场', '权谋'], skillKey: 'officialdom' },
  { needles: ['谍战', '潜伏'], skillKey: 'spy' },
  { needles: ['历史', '架空'], skillKey: 'historical' },
]

const GENRE_DEFAULT_SETTINGS: Record<
  string,
  { worldviewId?: string; cultivationId?: string; goldenFingerId?: string }
> = {
  xuanhuan: {
    worldviewId: 'wv_generic_fantasy',
    cultivationId: 'cu_xuanhuan_bloodline',
    goldenFingerId: 'gf_bloodline',
  },
  xianxia: {
    worldviewId: 'wv_three_realms',
    cultivationId: 'cu_standard_xianxia',
    goldenFingerId: 'gf_checkin',
  },
  wuxia: {
    worldviewId: 'wv_sect_jianghu',
    cultivationId: 'cu_wuxia_jianghu',
    goldenFingerId: 'gf_no_cheat',
  },
  martial_peak: {
    worldviewId: 'wv_global_martial',
    cultivationId: 'cu_martial_peak',
    goldenFingerId: 'gf_face_slap_halo',
  },
  rural: {
    worldviewId: 'wv_rural_village',
    goldenFingerId: 'gf_craft_bonus',
  },
  apocalypse: {
    worldviewId: 'wv_apocalypse',
    goldenFingerId: 'gf_inventory',
  },
  weird: {
    worldviewId: 'wv_rule_weird',
    goldenFingerId: 'gf_slow_time',
  },
  brainhole: {
    worldviewId: 'wv_rule_weird',
    goldenFingerId: 'gf_slow_time',
  },
  game: {
    worldviewId: 'wv_game_instance',
    cultivationId: 'cu_system_level',
    goldenFingerId: 'gf_checkin',
  },
  romance: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_no_cheat',
  },
  angst: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_rebirth_memory',
  },
  farming: {
    worldviewId: 'wv_generic_fantasy',
    goldenFingerId: 'gf_craft_bonus',
  },
  isekai: {
    worldviewId: 'wv_generic_fantasy',
    goldenFingerId: 'gf_rebirth_memory',
  },
  superpower: {
    worldviewId: 'wv_modern_hidden',
    cultivationId: 'cu_ability_rank',
    goldenFingerId: 'gf_bloodline',
  },
  campus: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_no_cheat',
  },
  mystery: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_no_cheat',
  },
  exorcism: {
    worldviewId: 'wv_modern_hidden',
    cultivationId: 'cu_exorcism_dao',
    goldenFingerId: 'gf_inventory',
  },
  urban: {
    worldviewId: 'wv_modern_hidden',
    goldenFingerId: 'gf_face_slap_halo',
  },
  scifi: {
    worldviewId: 'wv_generic_fantasy',
    goldenFingerId: 'gf_inventory',
  },
  officialdom: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_no_cheat',
  },
  spy: {
    worldviewId: 'wv_campus_city',
    goldenFingerId: 'gf_no_cheat',
  },
  historical: {
    worldviewId: 'wv_generic_fantasy',
    goldenFingerId: 'gf_rebirth_memory',
  },
}

function haystackFromTags(tags: string[]): string {
  return tags.join('|')
}

/** Map tags to genre skillKeys; primary = first hit, secondary = up to 3 more unique. */
export function mapTagsToGenres(tags: string[]): { primary?: string; secondary: string[] } {
  const hay = haystackFromTags(tags)
  const found: string[] = []
  for (const rule of TAG_TO_GENRE) {
    if (rule.needles.some((n) => hay.includes(n))) {
      if (!found.includes(rule.skillKey) && isActiveNovelGenreSkillKey(rule.skillKey)) {
        found.push(rule.skillKey)
      }
    }
  }
  // Also accept planned keys for mapping display (urban etc.)
  if (!found.length) {
    for (const rule of TAG_TO_GENRE) {
      if (rule.needles.some((n) => hay.includes(n)) && !found.includes(rule.skillKey)) {
        found.push(rule.skillKey)
      }
    }
  }
  return {
    primary: found[0],
    secondary: found.slice(1, 4),
  }
}

export function mapTagsToSettings(genrePrimary?: string): HotRankMapped {
  const defaults = genrePrimary ? GENRE_DEFAULT_SETTINGS[genrePrimary] : undefined
  return {
    genrePrimary,
    genreSecondary: [],
    worldviewId: defaults?.worldviewId,
    cultivationId: defaults?.cultivationId,
    goldenFingerId: defaults?.goldenFingerId,
  }
}

/**
 * Fill missing mapped_* from tag heuristics. Does not overwrite existing mapped fields.
 */
export function applyHeuristicMapping(item: HotRankProviderItem): HotRankProviderItem {
  // 标题也参与题材启发（榜单标签稀疏时）
  const genres = mapTagsToGenres([...(item.tags || []), item.title || ''])
  const primary = item.mapped.genrePrimary || genres.primary
  const secondary =
    item.mapped.genreSecondary?.length > 0
      ? item.mapped.genreSecondary
      : genres.secondary.filter((k) => k !== primary).slice(0, 3)
  const defaults = mapTagsToSettings(primary)
  return {
    ...item,
    mapped: {
      genrePrimary: primary,
      genreSecondary: secondary,
      worldviewId: item.mapped.worldviewId || defaults.worldviewId,
      cultivationId: item.mapped.cultivationId || defaults.cultivationId,
      goldenFingerId: item.mapped.goldenFingerId || defaults.goldenFingerId,
    },
    mapSource: item.mapSource ?? (item.mapped.genrePrimary ? 'manual' : primary ? 'manual' : null),
  }
}
