import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, GenerationLessonRow } from '../types.js'
import type { LessonListQuery, NewLessonInput } from './sqlite.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function buildListConditions(query: LessonListQuery) {
  const conditions = [isNull(schema.generationLessons.deletedAt)]
  if (query.projectKind && query.projectKind !== 'all') {
    conditions.push(or(
      eq(schema.generationLessons.projectKind, 'all'),
      eq(schema.generationLessons.projectKind, query.projectKind),
    )!)
  }
  if (query.agentType === '__global__') {
    conditions.push(or(
      isNull(schema.generationLessons.agentType),
      eq(schema.generationLessons.agentType, ''),
    )!)
  } else if (query.agentType) {
    conditions.push(or(
      isNull(schema.generationLessons.agentType),
      eq(schema.generationLessons.agentType, ''),
      eq(schema.generationLessons.agentType, query.agentType),
    )!)
  }
  if (query.verdict === 'recommend' || query.verdict === 'avoid') {
    conditions.push(eq(schema.generationLessons.verdict, query.verdict))
  }
  return and(...conditions)
}

function normalizeLessonRow(row: {
  id: number
  projectKind: string
  agentType: string | null
  verdict: string
  title: string
  content: string
  tags: string | null
  sortOrder: number | null
  isActive: number | boolean | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}): GenerationLessonRow {
  return {
    ...row,
    isActive: row.isActive == null ? null : Boolean(row.isActive),
  }
}

export async function listLessons(query: LessonListQuery): Promise<GenerationLessonRow[]> {
  const rows = await db().select().from(schema.generationLessons)
    .where(buildListConditions(query))
    .orderBy(asc(schema.generationLessons.sortOrder), asc(schema.generationLessons.id))
  return rows.map(normalizeLessonRow)
}

export async function listActiveLessonsForAgent(
  projectKind: string,
  agentType: string,
): Promise<GenerationLessonRow[]> {
  const rows = await db().select().from(schema.generationLessons)
    .where(and(
      isNull(schema.generationLessons.deletedAt),
      eq(schema.generationLessons.isActive, 1),
      or(
        eq(schema.generationLessons.projectKind, 'all'),
        eq(schema.generationLessons.projectKind, projectKind),
      ),
      or(
        isNull(schema.generationLessons.agentType),
        eq(schema.generationLessons.agentType, ''),
        eq(schema.generationLessons.agentType, agentType),
      ),
    ))
    .orderBy(asc(schema.generationLessons.sortOrder), asc(schema.generationLessons.id))
  return rows.map(normalizeLessonRow)
}

export async function findLessonById(id: number): Promise<GenerationLessonRow | null> {
  const rows = await db().select().from(schema.generationLessons)
    .where(and(eq(schema.generationLessons.id, id), isNull(schema.generationLessons.deletedAt)))
  return rows[0] ? normalizeLessonRow(rows[0]) : null
}

export async function findLessonByIdIncludingDeleted(id: number): Promise<GenerationLessonRow | null> {
  const rows = await db().select().from(schema.generationLessons)
    .where(eq(schema.generationLessons.id, id))
  return rows[0] ? normalizeLessonRow(rows[0]) : null
}

export async function insertLesson(input: NewLessonInput): Promise<DbRunResult> {
  const result = await db().insert(schema.generationLessons).values({
    ...input,
    isActive: input.isActive ? 1 : 0,
  })
  return normalizeRun(result)
}

export async function updateLesson(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.generationLessons).set(patch).where(eq(schema.generationLessons.id, id))
}

export async function softDeleteLesson(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.generationLessons).set({ deletedAt }).where(eq(schema.generationLessons.id, id))
}
