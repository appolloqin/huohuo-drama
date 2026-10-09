export const HOT_RANK_PLATFORMS = ['fanqie', 'qidian', 'jinjiang', 'qimao'] as const

export type HotRankPlatform = (typeof HOT_RANK_PLATFORMS)[number]

export type HotRankMapped = {
  genrePrimary?: string
  genreSecondary: string[]
  worldviewId?: string
  cultivationId?: string
  goldenFingerId?: string
}

export type HotRankItem = {
  platform: HotRankPlatform
  externalId: string
  title: string
  tags: string[]
  heat: number
  blurbShort: string
  mapped: HotRankMapped
  fetchedAt: string
}

/** Provider fetch result before DB id / fetchedAt finalization. */
export type HotRankProviderItem = Omit<HotRankItem, 'fetchedAt'> & {
  fetchedAt?: string
  mapSource?: 'manual' | 'ai_cache' | null
}

export function isHotRankPlatform(value: string): value is HotRankPlatform {
  return (HOT_RANK_PLATFORMS as readonly string[]).includes(value)
}
