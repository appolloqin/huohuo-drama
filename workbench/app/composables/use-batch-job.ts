import { toast } from 'vue-sonner'
import {
  batchJobsAPI,
  type BatchJobSnapshot,
  type BatchJobStatus,
  type BatchProgressPayload,
  type ContinuityBlockingItem,
  type BatchScope,
  type ProjectType,
} from '~/composables/use-api'
import { useI18n } from '~/composables/use-i18n'

// ── 服务端批量撰写（数字作家 / 数字导演）────────────────────
export type BatchJobProgress = {
  index: number
  total: number
  episode_number: number
  phase: string
  rewrite_attempt: number
  check_score: number
  check_summary: string
  conflicts: string[]
  blocking_items: ContinuityBlockingItem[]
  rule_hints: string[]
  model_rejected: string[]
  rewrite_mode: string
}

export type TrackedBatchJob = {
  id: string
  dramaId: number
  dramaTitle: string
  projectType: ProjectType
  status: BatchJobStatus
  progress: BatchJobProgress
  errorHint: string
  summaryHint: string
  summary: BatchJobSnapshot['summary']
  running: boolean
  finished: boolean
}

const TERMINAL: BatchJobStatus[] = ['completed', 'failed', 'stopped', 'cancelled']

const emptyProgress = (): BatchJobProgress => ({
  index: 0,
  total: 0,
  episode_number: 0,
  phase: '',
  rewrite_attempt: 0,
  check_score: 0,
  check_summary: '',
  conflicts: [],
  blocking_items: [],
  rule_hints: [],
  model_rejected: [],
  rewrite_mode: '',
})

let batchPollInterval: ReturnType<typeof setInterval> | null = null
let batchPollBusy = false
export type DramaBatchCallbacks = {
  /** 批量中某一章/集写入完成 */
  onChapterDone?: (progress: BatchProgressPayload) => void | Promise<void>
  /** 批量任务结束（成功/失败/停止） */
  onFinished?: () => void | Promise<void>
}

const onFinishedHooks = new Map<string, () => void | Promise<void>>()

function isTerminal(status: BatchJobStatus) {
  return TERMINAL.includes(status)
}

function isActive(status: BatchJobStatus) {
  return status === 'pending' || status === 'running'
}

function deriveProgressFromSnapshot(job: BatchJobSnapshot, fallbackTotal = 0): BatchJobProgress {
  const p = job.progress
  if (!p) return { ...emptyProgress(), total: fallbackTotal }
  const completed = p.status === 'start' ? Math.max(0, (p.index || 0) - 1) : (p.index || 0)
  return {
    index: completed,
    total: p.total || fallbackTotal,
    episode_number: p.episode_number || 0,
    phase: p.phase || '',
    rewrite_attempt: p.rewrite_attempt || 0,
    check_score: p.check_score || 0,
    check_summary: p.check_summary || '',
    conflicts: Array.isArray(p.conflicts) ? p.conflicts.filter((c): c is string => typeof c === 'string') : [],
    blocking_items: Array.isArray(p.blocking_items)
      ? p.blocking_items.filter((x): x is ContinuityBlockingItem =>
        x != null && typeof x === 'object'
        && (x.layer === 'hard' || x.layer === 'model')
        && typeof x.rule === 'string'
        && typeof x.label === 'string'
        && typeof x.message === 'string')
      : [],
    rule_hints: Array.isArray(p.rule_hints) ? p.rule_hints.filter((h): h is string => typeof h === 'string') : [],
    model_rejected: Array.isArray(p.model_rejected) ? p.model_rejected.filter((h): h is string => typeof h === 'string') : [],
    rewrite_mode: p.rewrite_mode || '',
  }
}

function processedCountFromSummary(summary: BatchJobSnapshot['summary']): number | null {
  if (!summary) return null
  return summary.generated + summary.failed + summary.skipped
}

function mapSnapshotToTrackedJob(job: BatchJobSnapshot, fallbackTotal = 0): TrackedBatchJob {
  let errorHint = ''
  if (job.progress?.status === 'error' && job.progress.message) {
    errorHint = job.progress.message
  } else if (job.error_message) {
    errorHint = job.error_message
  }
  const running = isActive(job.status)
  const finished = isTerminal(job.status)
  let progress = deriveProgressFromSnapshot(job, fallbackTotal)
  if (finished) {
    const total = job.progress?.total || progress.total || fallbackTotal
    const processed = processedCountFromSummary(job.summary)
    if (processed != null && total > 0) {
      progress = { ...progress, index: processed, total }
    } else if (job.status === 'failed' && job.progress?.status === 'error') {
      progress = {
        ...progress,
        index: job.progress.index,
        total: job.progress.total || progress.total,
      }
    } else if (job.status === 'completed' && total > 0) {
      progress = { ...progress, index: total, total }
    }
    progress = { ...progress, episode_number: 0, phase: '', rewrite_attempt: 0, check_score: 0, check_summary: '', conflicts: [], blocking_items: [], rule_hints: [], model_rejected: [], rewrite_mode: '' }
  }
  return {
    id: job.id,
    dramaId: job.drama_id,
    dramaTitle: job.drama_title || '',
    projectType: job.project_type,
    status: job.status,
    progress,
    errorHint,
    summaryHint: '',
    summary: job.summary,
    running,
    finished,
  }
}

function summarizeRewriteFailures(
  novel: {
    batchPhaseRewriteScoreOnly: string
    batchPhaseRewriteScoreMissing: string
    batchPhaseRewriteModelFailed: string
    batchPhaseRewriteUnknown: string
    continuityCheckLayerHard: string
    continuityCheckLayerModel: string
  },
  conflicts: string[],
  score: number,
  summary: string,
  blockingItems: ContinuityBlockingItem[] = [],
  ruleHints: string[] = [],
  modelRejected: string[] = [],
): string {
  if (blockingItems.length) {
    return blockingItems.slice(0, 3).map((item, i) => {
      const layer = item.layer === 'hard' ? novel.continuityCheckLayerHard : novel.continuityCheckLayerModel
      const text = item.message.length > 56 ? `${item.message.slice(0, 56)}…` : item.message
      return `${i + 1}. [${layer}·${item.label}] ${text}`
    }).join(' ')
  }
  if (conflicts.length) {
    return conflicts.slice(0, 3).map((c, i) => {
      const text = c.length > 72 ? `${c.slice(0, 72)}…` : c
      return `${i + 1}. ${text}`
    }).join(' ')
  }
  if (ruleHints.length) {
    return ruleHints.slice(0, 2).map((h, i) => {
      const text = h.length > 64 ? `${h.slice(0, 64)}…` : h
      return `${i + 1}. ${text}`
    }).join(' ')
  }
  if (modelRejected.length) {
    const text = modelRejected[0].length > 64 ? `${modelRejected[0].slice(0, 64)}…` : modelRejected[0]
    return `模型疑点（缺摘录）：${text}`
  }
  if (score === 0 && (summary === '审校未通过，详见规则明细' || !summary.trim())) {
    return novel.batchPhaseRewriteScoreMissing
  }
  if (score < 78) {
    return novel.batchPhaseRewriteScoreOnly.replace('{score}', String(score))
  }
  if (score >= 78 && (summary === '存在一致性问题' || summary === '审校未通过，详见规则明细' || !summary.trim())) {
    return novel.batchPhaseRewriteModelFailed.replace('{score}', String(score))
  }
  if (summary && summary !== '存在一致性问题' && summary !== '审校未通过，详见规则明细') {
    return summary
  }
  return novel.batchPhaseRewriteUnknown
}

export function useBatchJob() {
  const { messages: tm, tx } = useI18n()

  const jobs = useState<Record<string, TrackedBatchJob>>('batch-jobs-by-id', () => ({}))
  const focusedJobId = useState<string | null>('batch-job-focused-id', () => null)
  const batchSheetOpen = useState('batch-job-panel-open', () => false)
  const hydrated = useState('batch-job-hydrated', () => false)
  const dramaCallbacks = useState<Record<number, DramaBatchCallbacks>>('batch-drama-callbacks', () => ({}))
  const lastChapterDoneKeyByJob = useState<Record<string, string>>('batch-last-chapter-done', () => ({}))

  const jobList = computed(() => Object.values(jobs.value))
  const runningJobs = computed(() => jobList.value.filter(j => j.running))
  const visiblePills = computed(() => jobList.value.filter(j => j.running))
  const hasAnyActive = computed(() => runningJobs.value.length > 0)

  const focusedJob = computed(() => {
    const id = focusedJobId.value
    if (id && jobs.value[id]) return jobs.value[id]
    return runningJobs.value[0] ?? jobList.value.find(j => j.finished) ?? null
  })

  const isNovel = computed(() => focusedJob.value?.projectType === 'novel')
  const running = computed(() => !!focusedJob.value?.running)
  const finished = computed(() => !!focusedJob.value?.finished && !focusedJob.value?.running)
  const dramaId = computed(() => focusedJob.value?.dramaId ?? null)
  const dramaTitle = computed(() => focusedJob.value?.dramaTitle ?? '')
  const progress = computed(() => focusedJob.value?.progress ?? emptyProgress())
  const errorHint = computed(() => focusedJob.value?.errorHint ?? '')
  const jobStatus = computed(() => focusedJob.value?.status ?? 'pending')
  const summaryHint = computed(() => {
    const job = focusedJob.value
    if (!job?.finished || !job.summary) return ''
    const type = job.projectType
    return tx(
      type === 'novel' ? tm.value.novel.batchDone : tm.value.drama.batchDone,
      { ok: job.summary.generated, skip: job.summary.skipped, fail: job.summary.failed },
    )
  })
  const kickerLabel = computed(() => {
    if (running.value) {
      return isNovel.value ? tm.value.novel.batchRunningKicker : tm.value.drama.batchRunningKicker
    }
    const st = jobStatus.value
    if (st === 'failed') return tm.value.common.batchFailedKicker
    if (st === 'stopped' || st === 'cancelled') return tm.value.common.batchStoppedKicker
    return tm.value.common.batchFinishedKicker
  })
  const jobId = computed(() => focusedJob.value?.id ?? null)

  const progressPercent = computed(() => {
    const { index, total } = progress.value
    if (!total) return 0
    return Math.min(100, Math.round((index / total) * 100))
  })

  const progressLabel = computed(() => {
    const { index, total } = progress.value
    if (!total) return tm.value.novel.batchProgressIdle
    const key = isNovel.value ? tm.value.novel.batchProgress : tm.value.drama.batchProgress
    return tx(key, { current: index, total })
  })

  const phaseLabel = computed(() => {
    if (!focusedJob.value || !running.value) return ''
    const { episode_number, phase, rewrite_attempt, conflicts, blocking_items, check_score, check_summary, rule_hints, model_rejected, total, index } = progress.value
    const novel = focusedJob.value.projectType === 'novel'
    const idle = novel ? tm.value.novel.batchProgressIdle : tm.value.drama.batchProgressIdle

    if (!episode_number) {
      if (phase && total > 0) {
        const n = index + 1
        if (novel) {
          if (phase === 'brief') return tx(tm.value.novel.batchPhaseBrief, { n })
          if (phase === 'check') return tx(tm.value.novel.batchPhaseCheck, { n })
          if (phase === 'rewrite') return tx(tm.value.novel.batchPhaseChapter, { n })
          return tx(tm.value.novel.batchPhaseChapter, { n })
        }
        const d = tm.value.drama
        const dramaPhaseMap: Record<string, string> = {
          raw: d.batchPhaseRaw,
          rewrite: d.batchPhaseRewrite,
          extract: d.batchPhaseExtract,
          voice: d.batchPhaseVoice,
          storyboards: d.batchPhaseStoryboards,
          char_images: d.batchPhaseCharImages,
          scene_images: d.batchPhaseSceneImages,
          shot_images: d.batchPhaseShotImages,
          dubbing: d.batchPhaseDubbing,
          videos: d.batchPhaseVideos,
          slideshow: d.batchPhaseSlideshow,
          compose: d.batchPhaseCompose,
          merge: d.batchPhaseMerge,
        }
        const template = dramaPhaseMap[phase] || d.batchPhaseRaw
        return tx(template, { n })
      }
      return idle
    }

    if (novel) {
      if (phase === 'brief') return tx(tm.value.novel.batchPhaseBrief, { n: episode_number })
      if (phase === 'check') return tx(tm.value.novel.batchPhaseCheck, { n: episode_number })
      if (phase === 'rewrite') {
        const attempt = rewrite_attempt > 1 ? `（第 ${rewrite_attempt} 次）` : ''
        const issues = summarizeRewriteFailures(tm.value.novel, conflicts, check_score, check_summary, blocking_items, rule_hints, model_rejected)
        return tx(tm.value.novel.batchPhaseRewrite, { n: episode_number, attempt, issues })
      }
      return tx(tm.value.novel.batchPhaseChapter, { n: episode_number })
    }
    const d = tm.value.drama
    const dramaPhaseMap: Record<string, string> = {
      raw: d.batchPhaseRaw,
      rewrite: d.batchPhaseRewrite,
      extract: d.batchPhaseExtract,
      voice: d.batchPhaseVoice,
      storyboards: d.batchPhaseStoryboards,
      char_images: d.batchPhaseCharImages,
      scene_images: d.batchPhaseSceneImages,
      shot_images: d.batchPhaseShotImages,
      dubbing: d.batchPhaseDubbing,
      videos: d.batchPhaseVideos,
      slideshow: d.batchPhaseSlideshow,
      compose: d.batchPhaseCompose,
      merge: d.batchPhaseMerge,
    }
    const template = dramaPhaseMap[phase] || d.batchPhaseRaw
    return tx(template, { n: episode_number })
  })

  const jobTitle = computed(() =>
    isNovel.value ? tm.value.novel.digitalWriter : tm.value.drama.digitalDirector,
  )

  function pillLabelFor(job: TrackedBatchJob) {
    const { index, total } = job.progress
    const novel = job.projectType === 'novel'
    if (total) {
      const shortTitle = job.dramaTitle.length > 12 ? `${job.dramaTitle.slice(0, 12)}…` : job.dramaTitle
      return tx(
        novel ? tm.value.novel.batchPillItem : tm.value.drama.batchPillItem,
        { title: shortTitle || (novel ? tm.value.novel.digitalWriter : tm.value.drama.digitalDirector), current: index, total },
      )
    }
    return job.dramaTitle || (novel ? tm.value.novel.digitalWriter : tm.value.drama.digitalDirector)
  }

  function upsertJob(snapshot: BatchJobSnapshot, fallbackTotal = 0) {
    jobs.value = {
      ...jobs.value,
      [snapshot.id]: mapSnapshotToTrackedJob(snapshot, fallbackTotal),
    }
  }

  function stopPolling() {
    if (batchPollInterval) {
      clearInterval(batchPollInterval)
      batchPollInterval = null
    }
  }

  function ensurePolling() {
    if (batchPollInterval) return
    void refreshAll()
    batchPollInterval = setInterval(() => { void refreshAll() }, 2000)
  }

  async function handleTerminalJob(job: BatchJobSnapshot, tracked: TrackedBatchJob) {
    const hook = onFinishedHooks.get(job.id)
    onFinishedHooks.delete(job.id)
    delete lastChapterDoneKeyByJob.value[job.id]

    await hook?.()
    await dramaCallbacks.value[job.drama_id]?.onFinished?.()

    const type = job.project_type
    const title = job.drama_title || ''
    if (job.status === 'stopped' || job.status === 'cancelled') {
      toast.info(
        title
          ? tx(type === 'novel' ? tm.value.novel.batchStoppedFor : tm.value.drama.batchStoppedFor, { title })
          : (type === 'novel' ? tm.value.novel.batchStopped : tm.value.drama.batchStopped),
      )
      return
    }

    if (job.summary) {
      const doneMsg = tx(
        type === 'novel' ? tm.value.novel.batchDone : tm.value.drama.batchDone,
        { ok: job.summary.generated, skip: job.summary.skipped, fail: job.summary.failed },
      )
      const prefix = title ? `${title}：` : ''
      if (job.summary.failed > 0 || job.status === 'failed') toast.warning(`${prefix}${doneMsg}`)
      else toast.success(`${prefix}${doneMsg}`)
    } else if (job.status === 'failed') {
      toast.error(job.error_message || `${title} 批量任务失败`)
    }
  }

  function maybeNotifyChapterDone(job: BatchJobSnapshot) {
    const p = job.progress
    if (!p || p.status !== 'done' || !p.episode_number) return
    const dedupeKey = `${p.index}:${p.episode_number}`
    if (lastChapterDoneKeyByJob.value[job.id] === dedupeKey) return
    lastChapterDoneKeyByJob.value = { ...lastChapterDoneKeyByJob.value, [job.id]: dedupeKey }
    void dramaCallbacks.value[job.drama_id]?.onChapterDone?.(p)
  }

  async function refreshOne(id: string) {
    const prev = jobs.value[id]
    const wasRunning = prev?.running ?? false
    const job = await batchJobsAPI.get(id)
    upsertJob(job, prev?.progress.total)
    const tracked = jobs.value[id]!

    if (wasRunning && isActive(job.status)) {
      maybeNotifyChapterDone(job)
    }

    if (isTerminal(job.status)) {
      if (wasRunning) await handleTerminalJob(job, tracked)
      if (focusedJobId.value === id || !focusedJobId.value) {
        focusedJobId.value = id
        batchSheetOpen.value = true
      }
    }
  }

  async function refreshAll() {
    if (batchPollBusy) return
    const ids = Object.values(jobs.value).filter(j => j.running).map(j => j.id)
    if (!ids.length) {
      stopPolling()
      return
    }
    batchPollBusy = true
    try {
      await Promise.all(ids.map(id => refreshOne(id).catch(() => {})))
    } finally {
      batchPollBusy = false
    }
  }

  function openPanel(id?: string) {
    const target = id ?? runningJobs.value[0]?.id ?? jobList.value.find(j => j.finished)?.id
    if (!target) return
    focusedJobId.value = target
    batchSheetOpen.value = true
  }

  function minimizePanel() {
    batchSheetOpen.value = false
  }

  function resetJob(id?: string) {
    const target = id ?? focusedJobId.value
    if (!target) return
    onFinishedHooks.delete(target)
    const next = { ...jobs.value }
    delete next[target]
    jobs.value = next
    if (focusedJobId.value === target) {
      focusedJobId.value = runningJobs.value[0]?.id ?? null
      if (!runningJobs.value.length && !Object.values(next).some(j => j.finished)) {
        batchSheetOpen.value = false
      }
    }
    if (!runningJobs.value.length) stopPolling()
  }

  async function stopJob(id?: string) {
    const target = id ?? focusedJobId.value
    const tracked = target ? jobs.value[target] : null
    if (!target || !tracked?.running) return
    try {
      await batchJobsAPI.cancel(target)
      toast.info(
        tracked.projectType === 'novel'
          ? tm.value.novel.batchStopRequested
          : tm.value.drama.batchStopRequested,
      )
    } catch (e: any) {
      toast.error(e?.message || '停止失败')
    }
  }

  async function hydrateFromServer() {
    if (!import.meta.client || hydrated.value) return
    const token = useState<string | null>('huohuo_token')
    if (!token.value) return
    hydrated.value = true
    try {
      const { active } = await batchJobsAPI.active()
      if (!active.length) return
      for (const job of active) upsertJob(job)
      ensurePolling()
      toast.info(
        active.length > 1
          ? tx(tm.value.common.batchResumedMultiple, { n: active.length })
          : (active[0].project_type === 'novel' ? tm.value.novel.batchResumed : tm.value.drama.batchResumed),
      )
    } catch {
      /* ignore */
    }
  }

  function registerDramaCallbacks(id: number, callbacks: DramaBatchCallbacks) {
    dramaCallbacks.value = { ...dramaCallbacks.value, [id]: callbacks }
  }

  function unregisterDramaCallbacks(id: number) {
    const next = { ...dramaCallbacks.value }
    delete next[id]
    dramaCallbacks.value = next
  }

  async function startJob(args: {
    dramaId: number
    dramaTitle: string
    projectType: ProjectType
    total: number
    scope?: BatchScope
    openPanel?: boolean
    onFinished?: () => void | Promise<void>
  }) {
    const {
      dramaId: id,
      dramaTitle: title,
      projectType: type,
      total,
      scope: scopeArg,
      openPanel: showPanel = true,
      onFinished,
    } = args
    const scope = scopeArg ?? { mode: 'remaining' }

    try {
      const { job, alreadyRunning } = await batchJobsAPI.create({
        drama_id: id,
        scope,
      })

      if (onFinished) onFinishedHooks.set(job.id, onFinished)

      if (alreadyRunning) {
        toast.info(type === 'novel' ? tm.value.novel.batchAlreadyRunning : tm.value.drama.batchAlreadyRunning)
      } else {
        toast.info(type === 'novel' ? tm.value.novel.batchBackgroundStarted : tm.value.drama.batchBackgroundStarted)
      }

      upsertJob(job, total)
      focusedJobId.value = job.id
      batchSheetOpen.value = showPanel
      ensurePolling()
    } catch (e: any) {
      toast.error(e?.message || '创建批量任务失败')
    }
  }

  function isRunningForDrama(id: number) {
    return jobList.value.some(j => j.dramaId === id && j.running)
  }

  return {
    jobs,
    jobList,
    runningJobs,
    visiblePills,
    hasAnyActive,
    focusedJobId,
    focusedJob,
    jobId,
    running,
    finished,
    batchSheetOpen,
    dramaId,
    dramaTitle,
    projectType: computed(() => focusedJob.value?.projectType ?? 'drama'),
    isNovel,
    progress,
    errorHint,
    summaryHint,
    kickerLabel,
    jobStatus,
    progressPercent,
    progressLabel,
    phaseLabel,
    jobTitle,
    pillLabelFor,
    openPanel,
    minimizePanel,
    resetJob,
    stopJob,
    startJob,
    hydrateFromServer,
    isRunningForDrama,
    registerDramaCallbacks,
    unregisterDramaCallbacks,
  }
}
