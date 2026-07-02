<template>
  <view class="project-card" :class="item.project_type" @click="$emit('open')">
    <view class="card-top">
      <view class="type-badge" :class="item.project_type">
        {{ item.project_type === 'novel' ? '小说' : '短剧' }}
      </view>
      <text v-if="item.genre || item.style" class="meta-tag">{{ item.genre || item.style }}</text>
      <text class="progress-pct">{{ progressPct }}%</text>
    </view>
    <text class="card-title">{{ item.title }}</text>
    <view class="stats-line">
      <text class="stat-text">
        已完成 {{ item.written_count || 0 }} / {{ item.total_episodes || 0 }}
        {{ item.project_type === 'novel' ? '章' : '集' }}
      </text>
    </view>
    <view class="progress-rail">
      <view
        class="progress-bar"
        :class="item.project_type"
        :style="{ width: progressPct + '%' }"
      />
    </view>
    <view class="card-actions" @click.stop>
      <view class="action-chip action-chip-primary" @click="$emit('command')">发指令</view>
      <view class="action-chip" @click="$emit('web')">电脑编辑</view>
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
}
.project-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent-gradient);
}
.project-card.drama::before {
  background: linear-gradient(180deg, #f0b45c, #d4882d);
}
.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-left: 2px;
}
.type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}
.type-badge.novel {
  color: var(--accent-text);
  background: var(--accent-bg);
}
.type-badge.drama {
  color: #8a5a12;
  background: var(--drama-bg);
}
.meta-tag {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-pct {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-text);
}
.project-card.drama .progress-pct {
  color: #8a5a12;
}
.card-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 8px;
  line-height: 1.35;
  word-break: break-all;
}
.stats-line {
  margin-bottom: 10px;
}
.stat-text {
  font-size: 12px;
  color: var(--text-2);
}
.progress-rail {
  margin-bottom: 14px;
}
.card-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
