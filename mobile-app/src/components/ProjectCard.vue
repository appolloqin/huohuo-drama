<template>
  <view class="project-card tappable" :class="item.project_type" @click="$emit('open')">
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
        {{ item.written_count || 0 }} / {{ item.total_episodes || 0 }}
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
      <view class="action-chip action-chip-primary" @click="$emit('command')">
        <AppIcon name="command" size="sm" color="#4c7dff" />
        <text>发指令</text>
      </view>
      <view class="action-chip" @click="$emit('web')">
        <AppIcon name="web" size="sm" color="#5c6b82" />
        <text>电脑编辑</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
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
  box-sizing: border-box;
  background: var(--bg-0);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 12px;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.type-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 8px;
  color: var(--text-2);
  background: var(--bg-2);
}
.type-badge.novel {
  color: var(--text-1);
}
.type-badge.drama {
  color: #8a5a12;
  background: var(--drama-bg);
}
.meta-tag {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-pct {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-text);
}
.card-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 8px;
  line-height: 1.35;
}
.stats-line {
  margin-bottom: 10px;
}
.stat-text {
  font-size: 13px;
  color: var(--text-2);
}
.progress-rail {
  margin-bottom: 14px;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.action-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
