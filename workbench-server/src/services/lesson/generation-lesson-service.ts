import * as lessonsRepo from '../../db/repos/generation-lessons/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase } from '../../common/http/transform.js'
import type { GenerationLessonRow } from '../../db/repos/types.js'

export type LessonListQuery = {
  projectKind?: string
  agentType?: string
  verdict?: 'recommend' | 'avoid'
}

export class GenerationLessonValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationLessonValidationError'
  }
}

function normalizeTags(tags: unknown): string | null {
  if (tags == null || tags === '') return null
  if (Array.isArray(tags)) return JSON.stringify(tags.filter(t => typeof t === 'string'))
  if (typeof tags === 'string') {
    const trimmed = tags.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('[')) return trimmed
    return JSON.stringify(trimmed.split(/[,，]/).map(s => s.trim()).filter(Boolean))
  }
  return null
}

export function formatLessonForApi(row: GenerationLessonRow) {
  return toSnakeCase({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  })
}

export async function listGenerationLessons(query: LessonListQuery) {
  const rows = await lessonsRepo.listLessons(query)
  return rows.map(formatLessonForApi)
}

export async function getGenerationLesson(id: number) {
  const row = await lessonsRepo.findLessonById(id)
  return row ? formatLessonForApi(row) : null
}

function buildLessonInput(body: Record<string, any>, timestamp: string) {
  if (!body.title?.trim()) throw new GenerationLessonValidationError('title required')
  if (!body.content?.trim()) throw new GenerationLessonValidationError('content required')
  return {
    projectKind: body.project_kind || 'all',
    agentType: body.agent_type?.trim() || null,
    verdict: body.verdict === 'avoid' ? 'avoid' : 'recommend',
    title: body.title.trim(),
    content: body.content.trim(),
    tags: normalizeTags(body.tags),
    sortOrder: body.sort_order ?? 0,
    isActive: body.is_active !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function createGenerationLesson(body: Record<string, any>) {
  const ts = now()
  const res = await lessonsRepo.insertLesson(buildLessonInput(body, ts))
  const row = await lessonsRepo.findLessonByIdIncludingDeleted(Number(res.lastInsertRowid))
  if (!row) throw new GenerationLessonValidationError('创建失败')
  return formatLessonForApi(row)
}

export async function batchCreateGenerationLessons(lessons: Record<string, any>[]) {
  if (!lessons.length) throw new GenerationLessonValidationError('lessons required')

  const ts = now()
  const created: ReturnType<typeof formatLessonForApi>[] = []
  for (const item of lessons) {
    if (!item?.title?.trim() || !item?.content?.trim()) continue
    const res = await lessonsRepo.insertLesson({
      projectKind: item.project_kind || 'all',
      agentType: item.agent_type?.trim() || null,
      verdict: item.verdict === 'avoid' ? 'avoid' : 'recommend',
      title: item.title.trim(),
      content: item.content.trim(),
      tags: normalizeTags(item.tags),
      sortOrder: item.sort_order ?? 0,
      isActive: item.is_active !== false,
      createdAt: ts,
      updatedAt: ts,
    })
    const row = await lessonsRepo.findLessonByIdIncludingDeleted(Number(res.lastInsertRowid))
    if (row) created.push(formatLessonForApi(row))
  }
  if (!created.length) throw new GenerationLessonValidationError('无有效经验条目')
  return { count: created.length, items: created }
}

export async function updateGenerationLesson(id: number, body: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updatedAt: now() }

  if ('project_kind' in body) updates.projectKind = body.project_kind || 'all'
  if ('agent_type' in body) updates.agentType = (body.agent_type as string)?.trim() || null
  if ('verdict' in body) updates.verdict = body.verdict === 'avoid' ? 'avoid' : 'recommend'
  if ('title' in body) updates.title = (body.title as string)?.trim() || ''
  if ('content' in body) updates.content = (body.content as string)?.trim() || ''
  if ('tags' in body) updates.tags = normalizeTags(body.tags)
  if ('sort_order' in body) updates.sortOrder = body.sort_order ?? 0
  if ('is_active' in body) updates.isActive = !!body.is_active

  await lessonsRepo.updateLesson(id, updates)
  const row = await lessonsRepo.findLessonByIdIncludingDeleted(id)
  if (!row) throw new GenerationLessonValidationError('Not found')
  return formatLessonForApi(row)
}

export async function deleteGenerationLesson(id: number) {
  await lessonsRepo.softDeleteLesson(id, now())
}
