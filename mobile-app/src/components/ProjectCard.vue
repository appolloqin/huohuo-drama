<template>
  <view class="project-card" @click="$emit('open')">
    <view class="card-rail" :class="item.project_type" />
    <view class="card-body">
      <view class="card-head">
        <view class="kind-chip" :class="item.project_type">
          {{ item.project_type === 'novel' ? '小说' : '短剧' }}
        </view>
        <text v-if="item.genre || item.style" class="meta-chip">{{ item.genre || item.style }}</text>
      </view>
      <text class="card-title">{{ item.title }}</text>
      <view class="stats-row">
        <text class="stat">
          {{ item.written_count || 0 }}/{{ item.total_episodes || 0 }}
          {{ item.project_type === 'novel' ? '章' : '集' }}
        </text>
      </view>
      <view class="progress-rail">
        <view class="progress-bar" :style="{ width: progressPct + '%' }" />
      </view>
      <view class="card-actions" @click.stop>
        <view class="action-chip action-chip-primary" @click="$emit('command')">发指令</view>
        <view class="action-chip" @click="$emit('web')">电脑编辑</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectListItem } from '../api'

const props = defineProps<{ item: ProjectListItem }>()
defineEmits<{ open: []; command: []; web: [] }>()

const progressPct = computed(() => {
  const total = props.item.total_episodes || 0
  if (!total) return 0
  return Math.min(100, Math.round(((props.item.written_count || 0) / total) * 100))
})
</script>

<style scoped>
.project-card {
  display: flex;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  margin-bottom: 12px;
}
.card-rail {
  width: 4px;
  flex-shrink: 0;
}
.card-rail.novel { background: linear-gradient(180deg, #7aa7ff, #4c7dff); }
.card-rail.drama { background: linear-gradient(180deg, #f0b45c, #d4882d); }
.card-body {
  flex: 1;
  min-width: 0;
  padding: 14px 14px 14px 12px;
  box-sizing: border-box;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.kind-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
}
.kind-chip.novel {
  color: var(--accent-text);
  background: var(--accent-bg);
}
.kind-chip.drama {
  color: #8a5a12;
  background: rgba(212, 136, 45, 0.12);
}
.meta-chip {
  font-size: 10px;
  color: var(--text-3);
}
.card-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-0);
  margin-bottom: 8px;
  word-break: break-all;
}
.stats-row { margin-bottom: 8px; }
.stat { font-size: 12px; color: var(--text-2); }
.progress-rail {
  height: 3px;
  background: var(--bg-3);
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 12px;
}
.progress-bar {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 99px;
}
.card-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
.action-chip {
  flex: 1;
  min-width: 0;
  height: 32px;
  line-height: 32px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius);
  color: var(--text-2);
  background: transparent;
  border: 1px solid var(--border);
  box-sizing: border-box;
}
.action-chip-primary {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: rgba(76, 125, 255, 0.35);
}
</style>
