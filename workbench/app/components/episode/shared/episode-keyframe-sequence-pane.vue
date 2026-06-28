<template>
  <div class="keyframe-scroll">
    <p class="keyframe-seq-hint">
      静帧出片按<strong>场景序列帧</strong>播放（存于 reference_images，不是 AI 视频的首尾帧）。
      中间为播放顺序，建议帧数 = 镜头时长 ÷ 3 秒（{{ sequenceHelpDuration }}）。
      悬停已有帧可<strong>重新生成</strong>；缺帧点虚线槽补生成；也可用「分镜拼图」一次出多张不同构图。
    </p>
    <div class="keyframe-grid">
      <div
        v-for="(sb, i) in shots"
        :key="sb.id"
        :class="['keyframe-row', 'card', { active: focusedShotId === sb.id }]"
        @click="$emit('select-shot', sb)"
      >
        <div class="keyframe-info">
          <div class="keyframe-top">
            <span class="keyframe-num">#{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="keyframe-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
            <span class="tag mono">{{ readSequencePaths(sb).length }}/{{ targetFrameCount(sb) }} 帧</span>
            <span class="tag mono">{{ sb.duration || 10 }}s</span>
          </div>
          <div class="keyframe-desc">{{ sb.description || sb.title || '—' }}</div>
        </div>

        <div class="keyframe-seq-strip">
          <div
            v-for="(path, fi) in readSequencePaths(sb)"
            :key="`${sb.id}-${path}-${fi}`"
            class="keyframe-seq-item"
          >
            <div class="keyframe-seq-thumb-wrap">
              <button
                type="button"
                class="keyframe-seq-thumb"
                @click.stop="$emit('preview-image', '/' + path, `镜头 #${String(i + 1).padStart(2, '0')} · 序列帧 ${fi + 1}`)"
              >
                <img :src="'/' + path" class="zoom-hit" />
                <span class="keyframe-seq-idx">{{ fi + 1 }}</span>
              </button>
              <button
                type="button"
                class="keyframe-seq-regen"
                :disabled="isSequenceBusy(sb.id) || isSequenceFrameBusy(sb.id, fi)"
                :title="`重新生成序列帧 ${fi + 1}`"
                @click.stop="$emit('generate-reference-frame', sb, fi)"
              >
                <Loader2 v-if="isSequenceFrameBusy(sb.id, fi)" :size="12" class="animate-spin" />
                <template v-else>重新生成</template>
              </button>
            </div>
          </div>
          <button
            v-for="slot in missingFrameSlots(sb)"
            :key="`${sb.id}-slot-${slot}`"
            type="button"
            class="keyframe-seq-slot"
            :disabled="isSequenceBusy(sb.id)"
            @click.stop="$emit('generate-reference-frame', sb, slot)"
          >
            <Loader2 v-if="isSequenceBusy(sb.id)" :size="14" class="animate-spin" />
            <template v-else>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>帧 {{ slot + 1 }}</span>
            </template>
          </button>
          <button
            type="button"
            class="keyframe-seq-add"
            title="分镜拼图 · 多参考：一次生成多张序列帧"
            @click.stop="$emit('open-mosaic', sb)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span>拼图生成</span>
          </button>
          <div v-if="!readSequencePaths(sb).length && !missingFrameSlots(sb).length" class="keyframe-seq-empty">尚无序列帧</div>
        </div>

        <div class="keyframe-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm keyframe-seq-btn"
            :disabled="isSequenceBusy(sb.id)"
            @click.stop="$emit('generate-sequence', sb)"
          >
            {{ isSequenceBusy(sb.id) ? '生成中…' : (readSequencePaths(sb).length ? '补全序列帧' : '生成序列帧') }}
          </button>
          <button
            v-if="readSequencePaths(sb).length"
            type="button"
            class="btn btn-sm keyframe-seq-btn"
            :disabled="isSequenceBusy(sb.id)"
            @click.stop="$emit('regenerate-all-sequence', sb)"
          >
            重新生成全部（含缺帧）
          </button>
          <button
            type="button"
            class="btn btn-sm keyframe-seq-btn"
            @click.stop="$emit('open-mosaic', sb)"
          >
            分镜拼图
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  shots: { type: Array, default: () => [] },
  focusedShotId: { type: [Number, String], default: null },
  sequenceHelpDuration: { type: String, default: '每帧 ≥ 3 秒' },
  readSequencePaths: { type: Function, required: true },
  targetFrameCount: { type: Function, required: true },
  isSequenceBusy: { type: Function, required: true },
  isSequenceFrameBusy: { type: Function, required: true },
})

defineEmits([
  'select-shot',
  'generate-sequence',
  'generate-reference-frame',
  'regenerate-all-sequence',
  'preview-image',
  'open-mosaic',
])

function missingFrameSlots(sb) {
  const current = props.readSequencePaths(sb).length
  const target = props.targetFrameCount(sb)
  const missing = Math.max(0, target - current)
  return Array.from({ length: Math.min(missing, 6) }, (_, index) => current + index)
}
</script>

<style scoped>
.keyframe-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.keyframe-seq-hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}
.keyframe-grid { display: flex; flex-direction: column; gap: 8px; }
.keyframe-row {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.keyframe-row:hover { background: var(--bg-0); border-color: var(--border); }
.keyframe-row.active {
  border-color: var(--accent);
  background: linear-gradient(90deg, rgba(var(--accent-rgb, 59, 130, 246), 0.06), transparent);
}
.keyframe-info { flex: 0 0 min(220px, 34%); min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.keyframe-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.keyframe-num { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--text-2); }
.keyframe-badge { font-size: 11px; font-weight: 600; color: var(--text-2); }
.keyframe-desc { font-size: 12px; line-height: 1.45; color: var(--text-1); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.keyframe-seq-strip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
}
.keyframe-seq-empty {
  font-size: 11px;
  color: var(--text-3);
  padding: 8px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
}
.keyframe-seq-add,
.keyframe-seq-slot {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 72px;
  height: 48px;
  padding: 4px 8px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  font-size: 10px;
  line-height: 1.2;
}
.keyframe-seq-slot:disabled { opacity: 0.6; cursor: not-allowed; }
.keyframe-seq-add:hover,
.keyframe-seq-slot:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(var(--accent-rgb, 59, 130, 246), 0.06);
}
.keyframe-seq-item { flex-shrink: 0; }
.keyframe-seq-thumb-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 72px;
}
.keyframe-seq-thumb {
  position: relative;
  width: 72px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-2);
  cursor: pointer;
}
.keyframe-seq-thumb:hover { border-color: var(--accent); }
.keyframe-seq-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.keyframe-seq-idx {
  position: absolute;
  left: 4px;
  top: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 10px;
  font-family: var(--font-mono);
  line-height: 16px;
  text-align: center;
}
.keyframe-seq-regen {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-1);
  color: var(--text-2);
  font-size: 10px;
  line-height: 1.2;
  padding: 3px 4px;
  cursor: pointer;
  min-height: 22px;
}
.keyframe-seq-regen:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.keyframe-seq-regen:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.keyframe-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  align-self: center;
  min-width: 96px;
}
.keyframe-seq-btn {
  width: 100%;
  white-space: normal;
  text-align: center;
  line-height: 1.25;
}
</style>
