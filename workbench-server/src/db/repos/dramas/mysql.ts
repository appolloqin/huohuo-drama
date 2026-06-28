import { and, desc, eq, inArray, like, isNull, or, sql } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { CharacterRow, DbRunResult, DramaRow, EpisodeRow, NewDramaInput, PropRow, SceneRow } from '../types.js'

const db = () => getMysqlDb()

const SUPPORTED_PROJECT_KINDS = ['drama', 'novel'] as const

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

type OwnedDramaPageFilter = {
  status?: string
  keyword?: string
  projectType?: string
}

function buildOwnedDramaPredicate(userId: number, filter: OwnedDramaPageFilter) {
  // Same baseline as listOwnedDramas: exclude pure-template rows (is_template_only=1)
  // so the project catalog only shows each project once.
  const conditions: ReturnType<typeof and>[] = [
    isNull(schema.dramas.deletedAt),
    eq(schema.dramas.userId, userId),
    or(eq(schema.dramas.isTemplateOnly, 0), isNull(schema.dramas.isTemplateOnly)),
  ]
  if (filter.status) conditions.push(eq(schema.dramas.status, filter.status))
  if (filter.keyword) conditions.push(like(schema.dramas.title, `%${filter.keyword}%`))
  if (filter.projectType && SUPPORTED_PROJECT_KINDS.includes(filter.projectType as typeof SUPPORTED_PROJECT_KINDS[number])) {
    conditions.push(eq(schema.dramas.projectType, filter.projectType))
  }
  return and(...conditions)
}

export async function countOwnedDramas(userId: number, filter: OwnedDramaPageFilter = {}): Promise<number> {
  // SQL-side count so the project list's pagination total reflects the
  // server-applied filters (status/keyword/project_type), not the full
  // unfiltered ownership.
  const rows = await db().select({ id: schema.dramas.id })
    .from(schema.dramas)
    .where(buildOwnedDramaPredicate(userId, filter))
  return rows.length
}

export async function countOwnedDramasByStatus(userId: number): Promise<{ status: string; count: number }[]> {
  // Server-side GROUP BY status so the /dramas/stats endpoint never pulls the
  // full project set into Node memory just to count by status.
  const rows = await db().select({
    status: schema.dramas.status,
    count: sql<number>`COUNT(*)`,
  })
    .from(schema.dramas)
    .where(buildOwnedDramaPredicate(userId, {}))
    .groupBy(schema.dramas.status)
  return rows.map(r => ({ status: r.status ?? 'draft', count: Number(r.count) }))
}

export async function listOwnedDramasPage(
  userId: number,
  filter: OwnedDramaPageFilter = {},
  page: number = 1,
  pageSize: number = 20,
): Promise<Partial<DramaRow>[]> {
  // Page directly in SQL so we don't ship the full ownership set to Node on
  // every "获取项目" call. The composite idx_dramas_user_updated covers
  // user_id+deleted_at+is_template_only+updated_at, so this stays cheap as
  // the table grows on the server.
  //
  // We also project away the LONGTEXT columns the home card never reads
  // (template_summary, metadata). The detail page still pulls them via
  // findDramaById; on the list path a single drama row with description +
  // metadata set in MySQL can be ~20 KB, and ~28 rows * 20 KB = 560 KB of
  // mostly-useless TEXT per page before we even touch episodes.
  const safePage = Math.max(1, page | 0)
  const safePageSize = Math.max(1, Math.min(200, pageSize | 0))
  return db().select({
    id: schema.dramas.id,
    title: schema.dramas.title,
    description: schema.dramas.description,
    genre: schema.dramas.genre,
    style: schema.dramas.style,
    totalEpisodes: schema.dramas.totalEpisodes,
    totalDuration: schema.dramas.totalDuration,
    status: schema.dramas.status,
    thumbnail: schema.dramas.thumbnail,
    tags: schema.dramas.tags,
    createdAt: schema.dramas.createdAt,
    updatedAt: schema.dramas.updatedAt,
    deletedAt: schema.dramas.deletedAt,
    userId: schema.dramas.userId,
    projectType: schema.dramas.projectType,
    isTemplate: schema.dramas.isTemplate,
    isTemplateOnly: schema.dramas.isTemplateOnly,
  })
    .from(schema.dramas)
    .where(buildOwnedDramaPredicate(userId, filter))
    .orderBy(desc(schema.dramas.updatedAt))
    .limit(safePageSize)
    .offset((safePage - 1) * safePageSize)
}

export type NovelImportScope = 'own' | 'template' | 'platform'

type NovelImportRow = DramaRow & {
  scope: NovelImportScope
}

/**
 * Push the novel import-sources picker into SQL.
 *
 * Visibility rules (mirror listNovelImportSources in common/novel/novel-import-access.ts):
 *   - role='admin' sees all novels ('own' for self-owned rows, 'template' for
 *     is_template=1 rows, 'platform' otherwise).
 *   - non-admin sees their own novels ('own') and is_template=1 novels
 *     ('template'); everyone else's rows are hidden.
 * The keyword is matched against title + description; project_type is fixed
 * to 'novel' so drama rows never bleed into the picker.
 */
export async function listNovelImportSourcesPage(args: {
  viewerUserId: number
  isAdmin: boolean
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<{ items: NovelImportRow[]; total: number }> {
  const page = Math.max(1, (args.page ?? 1) | 0)
  const pageSize = Math.max(1, Math.min(100, (args.pageSize ?? 20) | 0))
  const kw = (args.keyword || '').trim()

  const base: ReturnType<typeof and>[] = [
    eq(schema.dramas.projectType, 'novel'),
  ]
  if (!args.isAdmin) {
    base.push(or(
      eq(schema.dramas.userId, args.viewerUserId),
      eq(schema.dramas.isTemplate, 1),
    )!)
  }
  if (kw) {
    const pattern = `%${kw.replace(/[%_\\]/g, ch => '\\' + ch)}%`
    base.push(or(
      like(schema.dramas.title, pattern),
      like(schema.dramas.description, pattern),
    )!)
  }

  const whereExpr = and(...base)
  const scopeExpr = args.isAdmin
    ? sql<string>`
        CASE
          WHEN ${schema.dramas.isTemplate} = 1 THEN 'template'
          WHEN ${schema.dramas.userId} = ${args.viewerUserId} THEN 'own'
          ELSE 'platform'
        END
      `
    : sql<string>`
        CASE
          WHEN ${schema.dramas.isTemplate} = 1 THEN 'template'
          ELSE 'own'
        END
      `

  const [itemRows, totalRow] = await Promise.all([
    db().select({
      drama: schema.dramas,
      scope: scopeExpr.as('scope'),
    })
      .from(schema.dramas)
      .where(whereExpr)
      .orderBy(desc(schema.dramas.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db().select({ n: sql<number>`COUNT(*)` })
      .from(schema.dramas)
      .where(whereExpr),
  ])

  const total = Number((totalRow[0] as { n: number } | undefined)?.n ?? 0)
  return {
    items: itemRows.map(r => ({ ...r.drama, scope: r.scope as NovelImportScope })),
    total,
  }
}

export async function insertDrama(input: NewDramaInput): Promise<DbRunResult> {
  const result = await db().insert(schema.dramas).values(input)
  return normalizeRun(result)
}

export async function findDramaById(id: number): Promise<DramaRow | null> {
  const rows = await db().select().from(schema.dramas).where(eq(schema.dramas.id, id))
  return rows[0] ?? null
}

export async function updateDrama(id: number, patch: Partial<typeof schema.dramas.$inferInsert>): Promise<void> {
  await db().update(schema.dramas).set(patch).where(eq(schema.dramas.id, id))
}

export async function softDeleteDrama(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.dramas).set({ deletedAt }).where(eq(schema.dramas.id, id))
}

export async function hardDeleteDrama(id: number): Promise<void> {
  // Hard-delete a drama row and all its child rows. Used only for pure-template
  // rows (is_template_only=1) created via the template library's manual/url
  // flow, which have no associated project. Never call this on a project.
  await db().delete(schema.episodes).where(eq(schema.episodes.dramaId, id))
  await db().delete(schema.characters).where(eq(schema.characters.dramaId, id))
  await db().delete(schema.scenes).where(eq(schema.scenes.dramaId, id))
  await db().delete(schema.props).where(eq(schema.props.dramaId, id))
  await db().delete(schema.dramas).where(eq(schema.dramas.id, id))
}

export async function seedEpisodeStubs(
  dramaId: number,
  unitCount: number,
  unitLabel: string,
  timestamp: string,
): Promise<void> {
  for (let i = 1; i <= unitCount; i++) {
    await db().insert(schema.episodes).values({
      dramaId,
      episodeNumber: i,
      title: `第${i}${unitLabel}`,
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
}

export async function listEpisodesByDrama(dramaId: number): Promise<EpisodeRow[]> {
  return db().select().from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId))
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
}

export async function listScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
}

export async function listActiveEpisodesByDrama(dramaId: number): Promise<EpisodeRow[]> {
  return db().select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
}

export async function listPropsByDrama(dramaId: number): Promise<PropRow[]> {
  return db().select().from(schema.props).where(eq(schema.props.dramaId, dramaId))
}

export async function listPublishedTemplates(): Promise<DramaRow[]> {
  // Templates are independent of project soft-delete: a published template must
  // remain visible in the template library even after the originating project
  // is deleted. Do NOT filter on deleted_at here.
  return db().select().from(schema.dramas)
    .where(eq(schema.dramas.isTemplate, 1))
    .orderBy(desc(schema.dramas.updatedAt))
}

export async function findPublishedTemplate(id: number): Promise<DramaRow | null> {
  // See listPublishedTemplates: ignore deleted_at so a template survives
  // deletion of its originating project.
  const rows = await db().select().from(schema.dramas)
    .where(and(
      eq(schema.dramas.id, id),
      eq(schema.dramas.isTemplate, 1),
    ))
  return rows[0] ?? null
}

export async function listActiveCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  const rows = await listCharactersByDrama(dramaId)
  return rows.filter(item => !item.deletedAt)
}

export async function listActiveScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  const rows = await listScenesByDrama(dramaId)
  return rows.filter(item => !item.deletedAt)
}

export async function batchListEpisodesByDramaIds(dramaIds: number[]): Promise<EpisodeRow[]> {
  if (!dramaIds.length) return []
  return db().select().from(schema.episodes)
    .where(inArray(schema.episodes.dramaId, dramaIds))
}

export async function batchListCharactersByDramaIds(dramaIds: number[]): Promise<CharacterRow[]> {
  if (!dramaIds.length) return []
  return db().select().from(schema.characters)
    .where(inArray(schema.characters.dramaId, dramaIds))
}

export async function batchListScenesByDramaIds(dramaIds: number[]): Promise<SceneRow[]> {
  if (!dramaIds.length) return []
  return db().select().from(schema.scenes)
    .where(inArray(schema.scenes.dramaId, dramaIds))
}

/**
 * SQL-side aggregate that powers the project list ("获取项目") page.
 *
 * The old `buildProjectListItems` path pulled *all* episodes/characters/scenes
 * rows for the page — including LONGTEXT columns (content / script_content /
 * metadata) on episodes — just to derive counts and total chars. A single
 * page on this server weighed ~18 MB, even when the home card only reads
 * `d.episodes.length`, `d.characters.length`, `d.scenes.length` and (for
 * novels) `totalChars(content)`.
 *
 * This query produces every number the UI needs in one GROUP BY pass:
 *   - episode_count   → home card total / pagination
 *   - written_count   → novel "已写 X / Y 章"
 *   - character_count → home card avatar count
 *   - scene_count     → home card scene count
 *   - total_chars     → novel "全书 N 字" (SUM(CHAR_LENGTH(content)) on
 *                        utf8mb4 matches the front-end Unicode code-point
 *                        counter in computeNovelProjectStats)
 */
export type ProjectListStats = {
  dramaId: number
  episodeCount: number
  writtenCount: number
  characterCount: number
  sceneCount: number
  totalChars: number
}

export async function getProjectListStatsByDramaIds(
  dramaIds: number[],
  novelDramaIds: number[] = [],
): Promise<ProjectListStats[]> {
  if (!dramaIds.length) return []

  const episodeCounts = await db().select({
    dramaId: schema.episodes.dramaId,
    episodeCount: sql<number>`COUNT(*)`,
  })
    .from(schema.episodes)
    .where(inArray(schema.episodes.dramaId, dramaIds))
    .groupBy(schema.episodes.dramaId)

  const novelIds = novelDramaIds.filter(id => dramaIds.includes(id))
  const novelEpisodeStats = novelIds.length
    ? await db().select({
        dramaId: schema.episodes.dramaId,
        writtenCount: sql<number>`SUM(CASE WHEN CHAR_LENGTH(COALESCE(${schema.episodes.content}, '')) > 0 OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END)`,
        totalChars: sql<number>`COALESCE(SUM(CASE
          WHEN CHAR_LENGTH(COALESCE(${schema.episodes.content}, '')) > 0 THEN CHAR_LENGTH(${schema.episodes.content})
          ELSE COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${schema.episodes.metadata}, '$.prose_char_count')) AS UNSIGNED), 0)
        END), 0)`,
      })
        .from(schema.episodes)
        .where(inArray(schema.episodes.dramaId, novelIds))
        .groupBy(schema.episodes.dramaId)
    : []

  const characterStats = await db().select({
    dramaId: schema.characters.dramaId,
    characterCount: sql<number>`COUNT(*)`,
  })
    .from(schema.characters)
    .where(inArray(schema.characters.dramaId, dramaIds))
    .groupBy(schema.characters.dramaId)

  const sceneStats = await db().select({
    dramaId: schema.scenes.dramaId,
    sceneCount: sql<number>`COUNT(*)`,
  })
    .from(schema.scenes)
    .where(inArray(schema.scenes.dramaId, dramaIds))
    .groupBy(schema.scenes.dramaId)

  const byId = new Map<number, ProjectListStats>()
  for (const id of dramaIds) {
    byId.set(id, {
      dramaId: id,
      episodeCount: 0,
      writtenCount: 0,
      characterCount: 0,
      sceneCount: 0,
      totalChars: 0,
    })
  }
  for (const r of episodeCounts) {
    const s = byId.get(r.dramaId)
    if (!s) continue
    s.episodeCount = Number(r.episodeCount) || 0
  }
  for (const r of novelEpisodeStats) {
    const s = byId.get(r.dramaId)
    if (!s) continue
    s.writtenCount = Number(r.writtenCount) || 0
    s.totalChars = Number(r.totalChars) || 0
  }
  for (const r of characterStats) {
    const s = byId.get(r.dramaId)
    if (!s) continue
    s.characterCount = Number(r.characterCount) || 0
  }
  for (const r of sceneStats) {
    const s = byId.get(r.dramaId)
    if (!s) continue
    s.sceneCount = Number(r.sceneCount) || 0
  }
  return dramaIds.map(id => byId.get(id)!)
}
