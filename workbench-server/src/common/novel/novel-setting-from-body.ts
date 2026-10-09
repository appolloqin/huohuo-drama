/** 从 create/meta/premise body 归一化立项设定字段 */

import {
  getNovelGenreEntryBySkillKey,
  getNovelGenreEntryByValue,
  isActiveNovelGenreSkillKey,
} from './novel-genre-registry.js'
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

function cultivationIds(v: unknown, legacyId?: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const id = raw.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push(id)
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === 'string') push(item)
      if (out.length >= 8) break
    }
  }
  if (!out.length && legacyId) push(legacyId)
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
    cultivation_custom: str(body.cultivation_custom),
    golden_finger_id: str(body.golden_finger_id),
    golden_finger_custom: str(body.golden_finger_custom),
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'cultivation_ids')
    || Object.prototype.hasOwnProperty.call(body, 'cultivation_id')
  ) {
    const cuIds = cultivationIds(body.cultivation_ids, str(body.cultivation_id))
    patch.cultivation_ids = cuIds
    patch.cultivation_id = cuIds[0] || ''
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

/** @deprecated 修炼体系已不与题材绑定；保留空操作以兼容旧调用 */
export function stripCultivationIfNonPower(meta: NovelMetadata): NovelMetadata {
  return meta
}
