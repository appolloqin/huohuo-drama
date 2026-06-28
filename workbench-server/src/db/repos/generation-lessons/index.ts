import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, GenerationLessonRow } from '../types.js'
import type { LessonListQuery, NewLessonInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { LessonListQuery, NewLessonInput } from './sqlite.js'

export async function listLessons(query: LessonListQuery): Promise<GenerationLessonRow[]> {
  return isMysqlDriver() ? mysql.listLessons(query) : sqlite.listLessons(query)
}

export async function listActiveLessonsForAgent(
  projectKind: string,
  agentType: string,
): Promise<GenerationLessonRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveLessonsForAgent(projectKind, agentType)
    : sqlite.listActiveLessonsForAgent(projectKind, agentType)
}

export async function findLessonById(id: number): Promise<GenerationLessonRow | null> {
  return isMysqlDriver() ? mysql.findLessonById(id) : sqlite.findLessonById(id)
}

export async function findLessonByIdIncludingDeleted(id: number): Promise<GenerationLessonRow | null> {
  return isMysqlDriver()
    ? mysql.findLessonByIdIncludingDeleted(id)
    : sqlite.findLessonByIdIncludingDeleted(id)
}

export async function insertLesson(input: NewLessonInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertLesson(input) : sqlite.insertLesson(input)
}

export async function updateLesson(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateLesson(id, patch)
  sqlite.updateLesson(id, patch)
}

export async function softDeleteLesson(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteLesson(id, deletedAt)
  sqlite.softDeleteLesson(id, deletedAt)
}
