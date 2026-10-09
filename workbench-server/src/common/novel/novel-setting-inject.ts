/** 立项设定 → premise/outline 注入块 */

import type { NovelMetadata } from './novel-meta.js'
import { resolveCultivationIds } from './novel-meta.js'
import { getNovelGenreEntryBySkillKey } from './novel-genre-registry.js'
import { findActiveCatalogEntry } from './novel-setting-catalog-types.js'
import { NOVEL_CULTIVATION_CATALOG } from './novel-cultivation-catalog.js'
import { NOVEL_GOLDEN_FINGER_CATALOG } from './novel-golden-finger-catalog.js'
import { NOVEL_WORLDVIEW_CATALOG } from './novel-worldview-catalog.js'
import type { NovelSettingCatalogEntry } from './novel-setting-catalog-types.js'

function resolveLine(
  custom: string | undefined,
  id: string | undefined,
  catalog: NovelSettingCatalogEntry[],
): string | undefined {
  const c = (custom || '').trim()
  if (c) return c
  const entry = findActiveCatalogEntry(catalog, id)
  return entry?.injectPrompt
}

function resolveCultivationBlock(meta: NovelMetadata): string | undefined {
  const catalogParts: Array<{ label: string; text: string }> = []
  for (const id of resolveCultivationIds(meta)) {
    const entry = findActiveCatalogEntry(NOVEL_CULTIVATION_CATALOG, id)
    if (!entry) continue
    catalogParts.push({ label: entry.label, text: entry.injectPrompt })
  }
  const custom = (meta.cultivation_custom || '').trim()
  if (!catalogParts.length && !custom) return undefined
  if (catalogParts.length === 1 && !custom) return catalogParts[0].text
  if (!catalogParts.length && custom) return custom
  const bullets = catalogParts.map(p => `- ${p.label}：${p.text}`)
  if (custom) bullets.push(`- 自定义：${custom}`)
  return `可并行多套（须写清主次与互相掣肘，全书名称不混用）：\n${bullets.join('\n')}`
}

export function buildNovelSettingInjectBlock(meta: NovelMetadata): string {
  const primaryKey = (meta.novel_genre_skill_key || '').trim()
  const primaryLabel =
    (meta.novel_genre || '').trim()
    || getNovelGenreEntryBySkillKey(primaryKey)?.value
    || primaryKey
  const secondary = (meta.novel_genre_secondary_keys || [])
    .map(k => getNovelGenreEntryBySkillKey(k)?.value || k)
    .filter(Boolean)

  const lines: string[] = []
  if (primaryLabel) lines.push(`【主题材】${primaryLabel}`)
  if (secondary.length) {
    lines.push(
      `【辅题材·轻融合】${secondary.join('、')}（只影响气质与卖点，不改变主线类型硬规则）`,
    )
  }

  const wv = resolveLine(meta.worldview_custom, meta.worldview_id, NOVEL_WORLDVIEW_CATALOG)
  if (wv) lines.push(`【世界观】${wv}`)

  const cu = resolveCultivationBlock(meta)
  if (cu) lines.push(`【修炼体系】${cu}`)

  const gf = resolveLine(meta.golden_finger_custom, meta.golden_finger_id, NOVEL_GOLDEN_FINGER_CATALOG)
  if (gf) lines.push(`【金手指】${gf}`)

  return lines.join('\n')
}
