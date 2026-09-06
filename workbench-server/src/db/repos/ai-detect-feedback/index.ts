import { isMysqlDriver } from '../../driver.js'
import type { AiDetectFeedbackInput, TrainableFeedbackRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { AiDetectFeedbackInput, TrainableFeedbackRow } from '../types.js'

export async function insertFeedback(input: AiDetectFeedbackInput): Promise<number> {
  return isMysqlDriver() ? mysql.insertFeedback(input) : sqlite.insertFeedback(input)
}

export async function listTrainableFeedback(): Promise<TrainableFeedbackRow[]> {
  return isMysqlDriver() ? mysql.listTrainableFeedback() : sqlite.listTrainableFeedback()
}

export async function setAdminLabel(id: number, label: 'human' | 'ai'): Promise<void> {
  if (isMysqlDriver()) return mysql.setAdminLabel(id, label)
  sqlite.setAdminLabel(id, label)
}

export async function findFeedbackById(id: number): Promise<Record<string, unknown> | null> {
  return isMysqlDriver() ? mysql.findFeedbackById(id) : sqlite.findFeedbackById(id)
}

/** 已声明标签但尚未管理员复核的反馈条数 */
export async function countPendingReview(): Promise<number> {
  return isMysqlDriver() ? mysql.countPendingReview() : sqlite.countPendingReview()
}
