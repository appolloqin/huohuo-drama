export type ProjectType = 'drama' | 'novel'

export type BatchJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'cancelled'

export type BatchScope = {
  mode?: 'remaining' | 'all' | 'range' | 'chapters'
  chapter_numbers?: number[]
  from_chapter?: number
  to_chapter?: number
  overwrite?: boolean
  production_pipeline?: 'ai_video' | 'frame_slideshow'
}

export type BatchProgressPayload = {
  index?: number
  total?: number
  episode_id?: number
  episode_number?: number
  phase?: string
  status?: string
  rewrite_attempt?: number
  check_score?: number
  check_summary?: string
  conflicts?: string[]
  blocking_items?: unknown[]
  rule_hints?: string[]
  model_rejected?: string[]
  rewrite_mode?: string
}

export type BatchSummary = {
  generated: number
  skipped: number
  failed: number
  errors: Array<{ episode_number: number; message: string }>
}

export type BatchJobSnapshot = {
  id: string
  user_id: number
  drama_id: number
  project_type: ProjectType
  drama_title: string | null
  status: BatchJobStatus
  payload: { scope?: BatchScope } | null
  progress: BatchProgressPayload | null
  summary: BatchSummary | null
  error_message: string | null
  cancel_requested: boolean
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

export type AuthUserPayload = {
  id?: number
  username: string
  role: string
  credits: number
}

export type ProjectListItem = {
  id: number
  title: string
  description?: string | null
  project_type: ProjectType
  genre?: string | null
  style?: string | null
  status?: string
  total_episodes: number
  written_count: number
  total_chars?: number
  character_count?: number
  scene_count?: number
  updated_at?: string
}

export type ProjectListResponse = {
  items: ProjectListItem[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}
