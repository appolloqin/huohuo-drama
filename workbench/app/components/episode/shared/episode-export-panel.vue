<template>
  <div class="panel-root">
    <div v-if="!shotRows.length" class="wizard-empty" style="flex:1">
      <div class="vacant-art">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <div class="vacant-title">尚未准备就绪</div>
      <div class="vacant-desc">请先完成分镜和制作流程</div>
      <button class="btn btn-primary" @click="$emit('go-script')">前往剧本</button>
    </div>
    <div v-else class="deliver-split">
      <div class="deliver-main">
        <template v-if="episodeMergeInProgress">
          <div class="wizard-empty">
            <div class="vacant-art merge-spinner" aria-hidden="true" />
            <div class="vacant-title">拼接中...</div>
            <div class="vacant-desc">正在将 {{ shotRows.length }} 个镜头拼接为完整视频，请稍候</div>
          </div>
        </template>
        <template v-else-if="episodeMergedVideoUrl">
          <video :key="episodeMergedVideoUrl" :src="'/' + episodeMergedVideoUrl" controls class="deliver-video" />
          <div class="deliver-bar">
            <span :class="['tag', episodeMergeInProgress ? 'tag-warning' : 'tag-success']">
              {{ episodeMergeInProgress ? '拼接中...' : '拼接完成' }}
            </span>
            <span class="text-muted" style="font-size:12px">{{ shotRows.length }} 镜头 · {{ summedShotDurationSec }}s</span>
            <div class="deliver-bar-actions ml-auto">
              <button
                class="btn"
                :disabled="!episodeExportReady || episodeMergeInProgress"
                :title="episodeExportReady ? '按当前各镜头合成结果重新拼接' : '请先完成各镜头视频合成'"
                @click="$emit('start-merge')"
              >
                {{ episodeMergeInProgress ? '拼接中...' : '重新拼接' }}
              </button>
              <a :href="'/' + episodeMergedVideoUrl" download class="btn btn-primary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                下载视频
              </a>
            </div>
          </div>
          <p class="deliver-hint text-muted">
            修改镜头后请先在「制作 → 视频合成」重新合成，再回到此处点击「重新拼接」。
          </p>
        </template>
        <template v-else>
          <div class="wizard-empty">
            <div class="vacant-art">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </div>
            <div class="vacant-title">拼接全集视频</div>
            <div class="vacant-desc">将 {{ exportReadyShotCount }} 个镜头拼接为完整视频</div>
            <button class="btn btn-primary" :disabled="exportReadyShotCount === 0" style="margin-top:12px" @click="$emit('start-merge')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              开始拼接
            </button>
          </div>
        </template>
      </div>
      <div class="deliver-list">
        <div class="deliver-list-head">镜头概览</div>
        <div class="deliver-list-body">
          <div v-for="(sb, i) in shotRows" :key="sb.id" class="ui-exp-row">
            <span class="mono text-muted" style="font-size:10px">#{{ String(i+1).padStart(2,'0') }}</span>
            <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
            <span :class="['status-dot', shotOwnsMergedClip(sb) && 'ok']" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  shotRows: { type: Array, default: () => [] },
  episodeMergedVideoUrl: { type: String, default: null },
  episodeMergeInProgress: { type: Boolean, default: false },
  episodeExportReady: { type: Boolean, default: false },
  summedShotDurationSec: { type: Number, default: 0 },
  shotReadyForExport: { type: Function, required: true },
  shotOwnsMergedClip: { type: Function, required: true },
})

defineEmits(['start-merge', 'go-script'])

const exportReadyShotCount = computed(() => props.shotRows.filter(sb => props.shotReadyForExport(sb)).length)
</script>

<style scoped>
.deliver-split { flex: 1; display: flex; min-height: 0; }
.deliver-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
.deliver-video { max-width: 720px; width: 100%; border-radius: var(--radius-lg); background: #000; }
.deliver-bar { display: flex; align-items: center; gap: 12px; margin-top: 16px; width: 100%; max-width: 720px; }
.deliver-bar-actions { display: flex; align-items: center; gap: 8px; }
.deliver-hint { margin: 10px 0 0; max-width: 720px; width: 100%; font-size: 12px; line-height: 1.5; }
.deliver-list { width: 240px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.deliver-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.deliver-list-body { flex: 1; overflow-y: auto; padding: 6px; }
.merge-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: merge-spin 0.8s linear infinite;
}
@keyframes merge-spin {
  to { transform: rotate(360deg); }
}
.ui-exp-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); }
.ui-exp-row:hover { background: var(--bg-hover); }
.text-muted { color: var(--text-3); }
.ml-auto { margin-left: auto; }
</style>
