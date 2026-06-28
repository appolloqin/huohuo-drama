<template>
  <div class="clip-pane">
    <div class="clip-section-bar">
      <span class="text-muted" style="font-size:12px">{{ ttsEligibleShotCount }} 条可生成配音</span>
      <span class="tag mono">{{ ttsCompletedShotCount }}/{{ ttsEligibleShotCount }} 已生成</span>
      <span class="tag">{{ boundAudioConfigCaption }}</span>
      <div class="ml-auto flex gap-1">
        <button class="btn btn-sm" @click="$emit('batch-generate')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
          批量生成
        </button>
      </div>
    </div>

    <div v-if="!ttsEligibleShotCount" class="wizard-empty" style="min-height:260px">
      <div class="vacant-art">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
      </div>
      <div class="vacant-title">当前没有可生成的配音</div>
      <div class="vacant-desc">先在分镜里填写“角色名：台词”或“旁白：文案”，这里就会出现待生成的语音镜头。</div>
    </div>

    <div v-else class="narration-grid">
      <div v-for="(sb, i) in eligibleShots" :key="sb.id" class="card narration-card">
        <div class="narration-head">
          <div class="narration-copy">
            <div class="narration-title">
              <span class="keyframe-num">#{{ String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2, '0') }}</span>
              <span class="keyframe-badge">{{ speakerLabel(sb) }}</span>
            </div>
            <div class="narration-desc">{{ dialogueText(sb) || '未填写文本' }}</div>
          </div>
          <span class="tag" :class="hasTts(sb) ? 'tag-success' : ''">{{ hasTts(sb) ? '已生成' : '待生成' }}</span>
        </div>
        <div class="narration-meta">
          <span class="text-muted">{{ sb.shot_type || sb.shotType || '未设景别' }}</span>
          <span class="text-muted">{{ sb.duration || 10 }}s</span>
          <span class="text-muted">{{ sb.location || '未设地点' }}</span>
        </div>
        <div class="narration-foot">
          <audio v-if="hasTts(sb)" :src="'/' + ttsUrl(sb)" controls preload="none" class="narration-audio" />
          <div v-else class="text-muted" style="font-size:12px">尚未生成语音文件</div>
          <button class="btn btn-sm ml-auto" @click="$emit('generate-shot', sb)">生成配音</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  eligibleShots: { type: Array, default: () => [] },
  ttsEligibleShotCount: { type: Number, default: 0 },
  ttsCompletedShotCount: { type: Number, default: 0 },
  boundAudioConfigCaption: { type: String, default: '' },
  speakerLabel: { type: Function, required: true },
  dialogueText: { type: Function, required: true },
  hasTts: { type: Function, required: true },
  ttsUrl: { type: Function, required: true },
})

defineEmits(['batch-generate', 'generate-shot'])
</script>

<style scoped>
.narration-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.narration-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.narration-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.narration-copy { min-width: 0; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.narration-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.narration-desc { font-size: 13px; line-height: 1.6; color: var(--text-1); }
.narration-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11px; }
.narration-foot { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.narration-audio { flex: 1; min-width: 0; height: 30px; }
.keyframe-num { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.keyframe-badge { font-size: 11px; font-weight: 600; }
.text-muted { color: var(--text-3); }
.ml-auto { margin-left: auto; }
</style>
