import { api } from './client'
import type {
  AuthUserPayload,
  BatchJobSnapshot,
  BatchScope,
  ProjectListResponse,
  ProjectType,
} from './types'

export * from './types'
export * from './client'
export * from './mobile'

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUserPayload }>('/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUserPayload }>('/auth/register', { username, password }),
  me: () => api.get<AuthUserPayload>('/auth/me'),
}

export const dramasApi = {
  list: (params?: { project_type?: ProjectType; page?: number; page_size?: number }) => {
    const q: string[] = []
    if (params?.project_type) q.push(`project_type=${params.project_type}`)
    if (params?.page) q.push(`page=${params.page}`)
    if (params?.page_size) q.push(`page_size=${params.page_size}`)
    const qs = q.length ? `?${q.join('&')}` : ''
    return api.get<ProjectListResponse>(`/dramas${qs}`)
  },
  create: (body: {
    title: string
    project_type: ProjectType
    description?: string
    genre?: string
    total_episodes?: number
    style?: string
  }) => api.post<{ id: number }>('/dramas', body),
  get: (id: number) => api.get<Record<string, unknown>>(`/dramas/${id}?include_episodes=0&include_assets=0`),
}

export const batchJobsApi = {
  active: () =>
    api.get<{ active: BatchJobSnapshot[]; recent: BatchJobSnapshot[] }>('/batch-jobs/active'),
  get: (id: string) => api.get<BatchJobSnapshot>(`/batch-jobs/${id}`),
  create: (body: { drama_id: number; scope?: BatchScope }) =>
    api.post<{ job: BatchJobSnapshot; already_running?: boolean }>('/batch-jobs', body),
  cancel: (id: string) => api.post<BatchJobSnapshot>(`/batch-jobs/${id}/cancel`, {}),
}
