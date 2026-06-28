import { and, desc, eq, inArray, like, isNull, or, sql } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { CharacterRow, DbRunResult, DramaRow, EpisodeRow, NewDramaInput, PropRow, SceneRow } from '../types.js'

const db = () => getSqliteDb()

const SUPPORTED_PROJECT_KINDS = ['drama', 'novel'] as const

type OwnedDramaPageFilter = {
  status?: string
  keyword?: string
  projectType?: string
}

function buildOwnedDramaPredicate(userId: number, filter: OwnedDramaPageFilter) {
  // Same baseline as listOwnedDramas: exclude pure-template rows (is_template_only=1)
  // so the project catalog only shows each project once.
  const conditions = [
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

export function countOwnedDramas(userId: number, filter: OwnedDramaPageFilter = {}): number {
  // SQL-side count so the project list's pagination total reflects the
  // server-applied filters (status/keyword/project_type), not the full
  // unfiltered ownership.
  const result = db().select({ n: schema.dramas.id })
    .from(schema.dramas)
    .where(buildOwnedDramaPredicate(userId, filter))
    .all()
  return result.length
}

export function countOwnedDramasByStatus(userId: number): { status: string; count: number }[] {
  // Server-side GROUP BY status so the /dramas/stats endpoint never pulls the
  // full project set into Node memory just to count by status.
  const rows = db().select({
    status: schema.dramas.status,
    count: sql<number>`COUNT(*)`,
  })
    .from(schema.dramas)
    .where(buildOwnedDramaPredicate(userId, {}))
    .groupBy(schema.dramas.status)
    .all()
  return rows.map(r => ({ status: r.status ?? 'draft', count: Number(r.count) }))
}

export function listOwnedDramasPage(
  userId: number,
  filter: OwnedDramaPageFilter = {},
  page: number = 1,
  pageSize: number = 20,
): Partial<DramaRow>[] {
  // Page directly in SQL so we don't ship the full ownership set to Node on
  // every "获取项目" call. The composite idx_dramas_user_updated covers
  // user_id+deleted_at+is_template_only+updated_at, so this stays cheap as
  // the table grows on the server.
  //
  // We also project away the LONGTEXT columns the home card never reads
  // (template_summary, metadata). See the MySQL implementation for the
  // rationale; the same applies on the SQLite path.
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
    .all()
}

export function insertDrama(input: NewDramaInput): DbRunResult {
  const res = db().insert(schema.dramas).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function findDramaById(id: number): DramaRow | null {
  const [row] = db().select().from(schema.dramas).where(eq(schema.dramas.id, id)).all()
  return row ?? null
}

export function updateDrama(id: number, patch: Partial<typeof schema.dramas.$inferInsert>): void {
  db().update(schema.dramas).set(patch).where(eq(schema.dramas.id, id)).run()
}

export function softDeleteDrama(id: number, deletedAt: string): void {
  db().update(schema.dramas).set({ deletedAt }).where(eq(schema.dramas.id, id)).run()
}

export function hardDeleteDrama(id: number): void {
  // Hard-delete a drama row and all its child rows. Used only for pure-template
  // rows (is_template_only=1) created via the template library's manual/url
  // flow, which have no associated project. Never call this on a project.
  db().delete(schema.episodes).where(eq(schema.episodes.dramaId, id)).run()
  db().delete(schema.characters).where(eq(schema.characters.dramaId, id)).run()
  db().delete(schema.scenes).where(eq(schema.scenes.dramaId, id)).run()
  db().delete(schema.props).where(eq(schema.props.dramaId, id)).run()
  db().delete(schema.dramas).where(eq(schema.dramas.id, id)).run()
}

export function seedEpisodeStubs(dramaId: number, unitCount: number, unitLabel: string, timestamp: string): void {
  for (let i = 1; i <= unitCount; i++) {
    db().insert(schema.episodes).values({
      dramaId,
      episodeNumber: i,
      title: `第${i}${unitLabel}`,
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run()
  }
}

export function listEpisodesByDrama(dramaId: number): EpisodeRow[] {
  return db().select().from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId)).all()
}

export function listCharactersByDrama(dramaId: number): CharacterRow[] {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)).all()
}

export function listScenesByDrama(dramaId: number): SceneRow[] {
  return db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId)).all()
}

export function listActiveEpisodesByDrama(dramaId: number): EpisodeRow[] {
  return db().select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    .all()
}

export function listPropsByDrama(dramaId: number): PropRow[] {
  return db().select().from(schema.props).where(eq(schema.props.dramaId, dramaId)).all()
}

export function listPublishedTemplates(): DramaRow[] {
  // Templates are independent of project soft-delete: a published template must
  // remain visible in the template library even after the originating project
  // is deleted. Do NOT filter on deleted_at here.
  return db().select().from(schema.dramas)
    .where(eq(schema.dramas.isTemplate, 1))
    .orderBy(desc(schema.dramas.updatedAt))
    .all()
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
export function listNovelImportSourcesPage(args: {
  viewerUserId: number
  isAdmin: boolean
  keyword?: string
  page?: number
  pageSize?: number
}): { items: NovelImportRow[]; total: number } {
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
    // Match title OR description; LIKE is fine here because the result set is
    // already pre-filtered by project_type='novel' + the visibility rule, and
    // keyword-driven picker queries are interactive (humans type short strings).
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

  const items = db().select({
    drama: schema.dramas,
    scope: scopeExpr.as('scope'),
  })
    .from(schema.dramas)
    .where(whereExpr)
    .orderBy(desc(schema.dramas.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  // SQLite doesn't expose a cheap row-count for a SELECT before LIMIT, so we
  // do a separate COUNT(*) over the same predicate. SQLite handles this with
  // the same index, so it's O(matching rows) — much cheaper than materializing
  // the full novel set in Node.
  const totalRow = db().select({ n: sql<number>`COUNT(*)` })
    .from(schema.dramas)
    .where(whereExpr)
    .get() as { n: number } | undefined
  const total = Number(totalRow?.n ?? 0)

  return {
    items: items.map(r => ({ ...r.drama, scope: r.scope as NovelImportScope })),
    total,
  }
}

export function findPublishedTemplate(id: number): DramaRow | null {
  // See listPublishedTemplates: ignore deleted_at so a template survives
  // deletion of its originating project.
  const [row] = db().select().from(schema.dramas)
    .where(and(
      eq(schema.dramas.id, id),
      eq(schema.dramas.isTemplate, 1),
    ))
    .all()
  return row ?? null
}

export function listActiveCharactersByDrama(dramaId: number): CharacterRow[] {
  return listCharactersByDrama(dramaId).filter(item => !item.deletedAt)
}

export function listActiveScenesByDrama(dramaId: number): SceneRow[] {
  return listScenesByDrama(dramaId).filter(item => !item.deletedAt)
}

export function batchListEpisodesByDramaIds(dramaIds: number[]): EpisodeRow[] {
  if (!dramaIds.length) return []
  return db().select().from(schema.episodes)
    .where(inArray(schema.episodes.dramaId, dramaIds))
    .all()
}

export function batchListCharactersByDramaIds(dramaIds: number[]): CharacterRow[] {
  if (!dramaIds.length) return []
  return db().select().from(schema.characters)
    .where(inArray(schema.characters.dramaId, dramaIds))
    .all()
}

export function batchListScenesByDramaIds(dramaIds: number[]): SceneRow[] {
  if (!dramaIds.length) return []
  return db().select().from(schema.scenes)
    .where(inArray(schema.scenes.dramaId, dramaIds))
    .all()
}

/**
 * SQL-side aggregate that powers the project list ("获取项目") page.
 * Mirrors the MySQL implementation in mysql.ts — see the docstring there for
 * the rationale. The old path pulled every LONGTEXT column on episodes
 * (content / script_content / metadata) just to count rows and sum chars.
 */
export type ProjectListStats = {
  dramaId: number
  episodeCount: number
  writtenCount: number
  characterCount: number
  sceneCount: number
  totalChars: number
}

export function getProjectListStatsByDramaIds(
  dramaIds: number[],
  novelDramaIds: number[] = [],
): ProjectListStats[] {
  if (!dramaIds.length) return []

  const episodeCounts = db().select({
    dramaId: schema.episodes.dramaId,
    episodeCount: sql<number>`COUNT(*)`,
  })
    .from(schema.episodes)
    .where(inArray(schema.episodes.dramaId, dramaIds))
    .groupBy(schema.episodes.dramaId)
    .all()

  const novelIds = novelDramaIds.filter(id => dramaIds.includes(id))
  const novelEpisodeStats = novelIds.length
    ? db().select({
        dramaId: schema.episodes.dramaId,
        writtenCount: sql<number>`SUM(CASE WHEN LENGTH(COALESCE(${schema.episodes.content}, '')) > 0 OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END)`,
        totalChars: sql<number>`COALESCE(SUM(CASE
          WHEN LENGTH(COALESCE(${schema.episodes.content}, '')) > 0 THEN LENGTH(${schema.episodes.content})
          ELSE COALESCE(CAST(json_extract(${schema.episodes.metadata}, '$.prose_char_count') AS INTEGER), 0)
        END), 0)`,
      })
        .from(schema.episodes)
        .where(inArray(schema.episodes.dramaId, novelIds))
        .groupBy(schema.episodes.dramaId)
        .all()
    : []

  const characterStats = db().select({
    dramaId: schema.characters.dramaId,
    characterCount: sql<number>`COUNT(*)`,
  })
    .from(schema.characters)
    .where(inArray(schema.characters.dramaId, dramaIds))
    .groupBy(schema.characters.dramaId)
    .all()

  const sceneStats = db().select({
    dramaId: schema.scenes.dramaId,
    sceneCount: sql<number>`COUNT(*)`,
  })
    .from(schema.scenes)
    .where(inArray(schema.scenes.dramaId, dramaIds))
    .groupBy(schema.scenes.dramaId)
    .all()

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
