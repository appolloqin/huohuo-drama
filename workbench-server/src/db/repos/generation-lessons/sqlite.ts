import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, GenerationLessonRow } from '../types.js'

const db = () => getSqliteDb()

export type LessonListQuery = {
  projectKind?: string
  agentType?: string
  verdict?: 'recommend' | 'avoid'
}

export type NewLessonInput = {
  projectKind: string
  agentType: string | null
  verdict: string
  title: string
  content: string
  tags: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
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

export function listLessons(query: LessonListQuery): GenerationLessonRow[] {
  return db().select().from(schema.generationLessons)
    .where(buildListConditions(query))
    .orderBy(asc(schema.generationLessons.sortOrder), asc(schema.generationLessons.id))
    .all()
}

export function listActiveLessonsForAgent(projectKind: string, agentType: string): GenerationLessonRow[] {
  return db().select().from(schema.generationLessons)
    .where(and(
      isNull(schema.generationLessons.deletedAt),
      eq(schema.generationLessons.isActive, true),
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
    .all()
}

export function findLessonById(id: number): GenerationLessonRow | null {
  const [row] = db().select().from(schema.generationLessons)
    .where(and(eq(schema.generationLessons.id, id), isNull(schema.generationLessons.deletedAt)))
    .all()
  return row ?? null
}

export function findLessonByIdIncludingDeleted(id: number): GenerationLessonRow | null {
  const [row] = db().select().from(schema.generationLessons)
    .where(eq(schema.generationLessons.id, id))
    .all()
  return row ?? null
}

export function insertLesson(input: NewLessonInput): DbRunResult {
  const res = db().insert(schema.generationLessons).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateLesson(id: number, patch: Record<string, unknown>): void {
  db().update(schema.generationLessons).set(patch).where(eq(schema.generationLessons.id, id)).run()
}

export function softDeleteLesson(id: number, deletedAt: string): void {
  db().update(schema.generationLessons).set({ deletedAt }).where(eq(schema.generationLessons.id, id)).run()
}
