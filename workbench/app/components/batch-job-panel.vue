<script setup>
// ── 全局批量任务浮层：右下角 pill + 进度弹窗 ───────────────
import { useBatchJob } from '~/composables/use-batch-job'
import { useI18n } from '~/composables/use-i18n'

const { messages: tm } = useI18n()
const jobTracker = useBatchJob()

const progressSheetVisible = computed(() => jobTracker.batchSheetOpen.value && jobTracker.focusedJob.value)
const floatingPillsVisible = computed(() => jobTracker.visiblePills.value.length > 0 && !jobTracker.batchSheetOpen.value)
</script>

<template>
  <Teleport to="body">
    <div v-if="floatingPillsVisible" class="batch-job-pills">
      <button
        v-for="(job, idx) in jobTracker.visiblePills.value"
        :key="job.id"
        type="button"
        class="batch-job-pill"
        :class="{ running: job.running }"
        :style="{ bottom: `${20 + idx * 52}px` }"
        @click="jobTracker.openPanel(job.id)"
      >
        <span class="batch-job-pill-dot" aria-hidden="true" />
        <span class="batch-job-pill-text">{{ jobTracker.pillLabelFor(job) }}</span>
        <span class="batch-job-pill-action">{{ tm.common.batchViewProgress }}</span>
      </button>
    </div>

    <div v-if="progressSheetVisible" class="batch-job-mask" @click.self="jobTracker.minimizePanel()">
      <div class="card dialog batch-job-dialog">
        <div v-if="jobTracker.runningJobs.value.length > 1" class="batch-job-tabs">
          <button
            v-for="job in jobTracker.runningJobs.value"
            :key="job.id"
            type="button"
            class="batch-job-tab"
            :class="{ active: jobTracker.focusedJobId.value === job.id }"
            @click="jobTracker.focusedJobId = job.id"
          >
            {{ job.dramaTitle || (job.projectType === 'novel' ? tm.novel.digitalWriter : tm.drama.digitalDirector) }}
          </button>
        </div>

        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker" :class="{ 'kicker-failed': jobTracker.jobStatus.value === 'failed' }">
              {{ jobTracker.kickerLabel.value }}
            </div>
            <div class="dialog-title batch-progress-title">{{ jobTracker.jobTitle.value }}</div>
            <div v-if="jobTracker.dramaTitle.value" class="dialog-sub">{{ jobTracker.dramaTitle.value }}</div>
            <div class="dialog-sub">{{ jobTracker.progressLabel.value }}</div>
          </div>
          <button
            type="button"
            class="modal-close-btn"
            :aria-label="tm.common.closeAria"
            @click="jobTracker.minimizePanel()"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="batch-progress-wrap">
          <div class="batch-progress-bar">
            <div class="batch-progress-fill" :style="{ width: jobTracker.progressPercent.value + '%' }" />
          </div>
          <span class="batch-progress-pct">{{ jobTracker.progressPercent.value }}%</span>
        </div>

        <p v-if="jobTracker.running.value && jobTracker.phaseLabel.value" class="batch-phase">{{ jobTracker.phaseLabel.value }}</p>

        <p class="batch-running-note">
          {{ jobTracker.isNovel.value ? tm.novel.batchRunningNote : tm.drama.batchRunningNote }}
        </p>
        <p v-if="jobTracker.running.value" class="batch-stop-hint">
          {{ jobTracker.isNovel.value ? tm.novel.batchStopHint : tm.drama.batchStopHint }}
        </p>
        <p v-if="jobTracker.summaryHint.value" class="batch-summary">{{ jobTracker.summaryHint.value }}</p>
        <p v-if="jobTracker.errorHint.value" class="batch-error">{{ jobTracker.errorHint.value }}</p>

        <div class="dialog-foot batch-progress-foot">
          <template v-if="jobTracker.running.value">
            <button type="button" class="btn" @click="jobTracker.minimizePanel()">{{ tm.common.batchMinimize }}</button>
            <button type="button" class="btn btn-warn" @click="jobTracker.stopJob()">
              {{ jobTracker.isNovel.value ? tm.novel.batchStop : tm.drama.batchStop }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn-primary" @click="jobTracker.resetJob()">{{ tm.common.batchClose }}</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-job-pills {
  position: fixed;
  right: 20px;
  bottom: 0;
  z-index: 110;
  pointer-events: none;
}
.batch-job-pill {
  position: fixed;
  right: 20px;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 40px));
  padding: 10px 14px 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 90, 200, 0.28);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 255, 0.96));
  box-shadow: 0 12px 32px rgba(32, 48, 77, 0.16);
  cursor: pointer;
  transition: transform 0.15s var(--ease-out), box-shadow 0.15s;
}
.batch-job-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 36px rgba(32, 48, 77, 0.18);
}
.batch-job-pill.running .batch-job-pill-dot {
  animation: batch-pulse 1.2s ease-in-out infinite;
}
.batch-job-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5b45b8;
  flex-shrink: 0;
}
.batch-job-pill-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-job-pill-action {
  font-size: 12px;
  font-weight: 600;
  color: #5b45b8;
  flex-shrink: 0;
}
@keyframes batch-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.batch-job-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.batch-job-tab {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 90, 200, 0.2);
  background: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-job-tab.active {
  border-color: rgba(120, 90, 200, 0.45);
  background: rgba(120, 90, 200, 0.1);
  color: #5b45b8;
}

.batch-job-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(15, 23, 38, 0.18);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.batch-job-dialog {
  max-width: 480px;
  width: 100%;
  padding: 24px;
  gap: 16px;
  background:
    radial-gradient(circle at top left, rgba(120, 90, 200, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 255, 0.94));
}
.batch-progress-title {
  font-size: 22px;
  line-height: 1.25;
}
.batch-progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.batch-progress-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(120, 90, 200, 0.12);
  overflow: hidden;
}
.batch-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #9b7ee8, #5b45b8);
  transition: width 0.25s var(--ease-out);
  border-radius: inherit;
}
.batch-progress-pct {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: #5b45b8;
  min-width: 36px;
  text-align: right;
}
.batch-running-note {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.5;
}
.batch-stop-hint {
  font-size: 12px;
  color: var(--warn, #c97a2e);
  margin: 8px 0 0;
  line-height: 1.5;
}
.batch-phase {
  font-size: 13px;
  color: var(--text-2);
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(27, 41, 64, 0.06);
}
.dialog-kicker.kicker-failed {
  color: var(--danger);
}
.batch-summary {
  font-size: 12px;
  color: var(--text-2);
  margin: 0;
  line-height: 1.5;
}
.batch-error {
  font-size: 12px;
  color: var(--danger);
  margin: 0;
  line-height: 1.5;
}
.btn-warn {
  border-color: rgba(201, 122, 46, 0.35);
  color: var(--warn, #c97a2e);
  background: rgba(201, 122, 46, 0.08);
}
.btn-warn:hover {
  background: rgba(201, 122, 46, 0.14);
}
.batch-progress-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.dialog-head-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.dialog-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}
.dialog-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-0);
}
.dialog-sub {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.5;
}
.dialog-foot {
  margin-top: 4px;
}
</style>
