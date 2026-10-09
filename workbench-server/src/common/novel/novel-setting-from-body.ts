/** 从 create/meta/premise body 归一化立项设定字段 */

import {
  getNovelGenreEntryBySkillKey,
  getNovelGenreEntryByValue,
  isActiveNovelGenreSkillKey,
} from './novel-genre-registry.js'
import { isCultivationPowerGenre } from './novel-power-genre.js'
import type { NovelMetadata, NovelMetadataPatch } from './novel-meta.js'

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

function secondaryKeys(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of v) {
    if (typeof item !== 'string') continue
    const k = item.trim()
    if (!k || seen.has(k) || !isActiveNovelGenreSkillKey(k)) continue
    seen.add(k)
    out.push(k)
    if (out.length >= 3) break
  }
  return out
}

export function ideationPatchFromBody(body: Record<string, any>): NovelMetadataPatch {
  const genreLabel =
    str(body.novel_genre)
    || str(body.genre)
    || undefined
  let skillKey = str(body.novel_genre_skill_key)
  if (!skillKey && genreLabel) {
    skillKey = getNovelGenreEntryByValue(genreLabel)?.skillKey
  }
  const resolvedLabel =
    genreLabel
    || (skillKey ? getNovelGenreEntryBySkillKey(skillKey)?.value : undefined)

  const patch: NovelMetadataPatch = {
    novel_genre: resolvedLabel,
    novel_genre_skill_key: skillKey,
    novel_genre_secondary_keys: secondaryKeys(body.novel_genre_secondary_keys),
    worldview_id: str(body.worldview_id),
    worldview_custom: str(body.worldview_custom),
    cultivation_id: str(body.cultivation_id),
    cultivation_custom: str(body.cultivation_custom),
    golden_finger_id: str(body.golden_finger_id),
    golden_finger_custom: str(body.golden_finger_custom),
  }

  if (!isCultivationPowerGenre(resolvedLabel || '')) {
    patch.cultivation_id = ''
    patch.cultivation_custom = ''
  }

  if (body.hot_source === null) {
    patch.hot_source = null
  } else if (body.hot_source && typeof body.hot_source === 'object') {
    const hs = body.hot_source as Record<string, unknown>
    const platform = str(hs.platform)
    const externalId = str(hs.externalId)
    const title = str(hs.title)
    if (platform && externalId && title) {
      patch.hot_source = { platform, externalId, title }
    }
  }

  return patch
}

/** 合并后剥离非力量题材的修炼字段 */
export function stripCultivationIfNonPower(meta: NovelMetadata): NovelMetadata {
  const label =
    (meta.novel_genre || '').trim()
    || getNovelGenreEntryBySkillKey(meta.novel_genre_skill_key || '')?.value
    || ''
  if (isCultivationPowerGenre(label)) return meta
  const next = { ...meta }
  delete next.cultivation_id
  delete next.cultivation_custom
  return next
}
