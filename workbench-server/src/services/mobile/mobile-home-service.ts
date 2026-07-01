/**
 * 移动端首页聚合 — 减少往返
 */
import { listUserProjects } from '../drama/drama-catalog-service.js'
import { listActiveBatchJobsForUser, listRecentBatchJobsForUser } from '../batch/batch-job-service.js'
import { getCurrentUserProfile } from '../auth/auth-service.js'
import { toSnakeCase } from '../../common/http/transform.js'

function serializeBatchJob(job: Awaited<ReturnType<typeof listActiveBatchJobsForUser>>[number]) {
  return toSnakeCase({
    ...job,
    payload: job.payload,
    progress: job.progress,
    summary: job.summary,
  })
}

export async function getMobileHomeSummary(userId: number, username: string, role: string) {
  const [user, projects, active, recent] = await Promise.all([
    getCurrentUserProfile(userId, username, role),
    listUserProjects({ userId, page: 1, pageSize: 20 }),
    listActiveBatchJobsForUser(userId),
    listRecentBatchJobsForUser(userId, 5),
  ])

  return {
    user,
    projects,
    batch: {
      active: active.map(serializeBatchJob),
      recent: recent.map(serializeBatchJob),
    },
  }
}
