<template>
  <div class="admin-user-search" ref="hostRef">
    <div class="admin-user-search-input-wrap">
      <Search :size="14" class="admin-user-search-icon" />
      <input
        ref="inputRef"
        v-model="query"
        class="input admin-user-search-input"
        :placeholder="displayPlaceholder"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />
      <button
        v-if="modelValue"
        type="button"
        class="admin-user-search-clear"
        :aria-label="tm.settings.navModulesClearUser"
        @mousedown.prevent
        @click="clearSelection"
      >
        <X :size="14" />
      </button>
    </div>

    <div v-if="panelOpen" class="admin-user-search-panel card">
      <div v-if="loading" class="admin-user-search-meta">{{ tm.settings.navModulesSearching }}</div>
      <template v-else-if="results.length">
        <button
          v-for="(row, idx) in results"
          :key="row.id"
          type="button"
          :class="['admin-user-search-option', { active: idx === activeIdx }]"
          @mousedown.prevent
          @click="pickUser(row)"
          @mouseenter="activeIdx = idx"
        >
          <span class="admin-user-search-name">{{ row.username }}</span>
          <span class="admin-user-search-option-meta">{{ roleLabel(row.role) }} · ID {{ row.id }}</span>
        </button>
        <p v-if="hintMore" class="admin-user-search-hint">{{ tm.settings.navModulesSearchMoreHint }}</p>
      </template>
      <div v-else class="admin-user-search-meta">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup>
import { Search, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { authAPI } from '~/composables/use-api'
import { useI18n } from '~/composables/use-i18n'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  selectedLabel: { type: String, default: '' },
  placeholder: { type: String, default: undefined },
  limit: { type: Number, default: 20 },
  /** (role: string) => string — 将 role 转为展示文案，如 admin → 管理员 */
  roleLabel: { type: Function, default: (role) => role },
})

const emit = defineEmits(['update:modelValue', 'select'])

const { messages: tm } = useI18n()

const hostRef = ref(null)
const inputRef = ref(null)
const query = ref('')
const results = ref([])
const loading = ref(false)
const panelOpen = ref(false)
const activeIdx = ref(-1)
const searchTimer = ref(null)
const blurTimer = ref(null)
const pickedLabel = ref('')

const displayPlaceholder = computed(() => {
  if (props.modelValue && (pickedLabel.value || props.selectedLabel)) {
    return pickedLabel.value || props.selectedLabel
  }
  return props.placeholder ?? tm.value.settings.navModulesSearchPlaceholder
})

const emptyText = computed(() => {
  if (!query.value.trim()) return tm.value.settings.navModulesSearchEmptyIdle
  return tm.value.settings.navModulesSearchEmpty
})

const hintMore = computed(() => results.value.length >= props.limit)

watch(() => props.selectedLabel, (label) => {
  if (label) pickedLabel.value = label
}, { immediate: true })

watch(() => props.modelValue, (id) => {
  if (!id) {
    pickedLabel.value = ''
    if (!panelOpen.value) query.value = ''
  }
})

function scheduleSearch() {
  if (searchTimer.value) clearTimeout(searchTimer.value)
  searchTimer.value = setTimeout(runSearch, 280)
}

async function runSearch() {
  loading.value = true
  try {
    results.value = await authAPI.adminSearchUsers(query.value.trim(), props.limit)
    activeIdx.value = results.value.length ? 0 : -1
  } catch {
    results.value = []
    activeIdx.value = -1
  } finally {
    loading.value = false
  }
}

function onFocus() {
  if (blurTimer.value) {
    clearTimeout(blurTimer.value)
    blurTimer.value = null
  }
  panelOpen.value = true
  if (!results.value.length) runSearch()
}

function onInput() {
  panelOpen.value = true
  scheduleSearch()
}

function onBlur() {
  blurTimer.value = setTimeout(() => {
    panelOpen.value = false
    if (props.modelValue) query.value = ''
  }, 160)
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!panelOpen.value) panelOpen.value = true
    activeIdx.value = Math.min(activeIdx.value + 1, Math.max(results.value.length - 1, 0))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIdx.value >= 0 && results.value[activeIdx.value]) {
      pickUser(results.value[activeIdx.value])
    }
  } else if (e.key === 'Escape') {
    panelOpen.value = false
    inputRef.value?.blur()
  }
}

function formatUserLabel(row) {
  return `${row.username}（${props.roleLabel(row.role)}）`
}

function pickUser(row) {
  pickedLabel.value = formatUserLabel(row)
  query.value = ''
  panelOpen.value = false
  emit('update:modelValue', row.id)
  emit('select', row)
}

function clearSelection() {
  pickedLabel.value = ''
  query.value = ''
  results.value = []
  activeIdx.value = -1
  emit('update:modelValue', 0)
  emit('select', null)
  inputRef.value?.focus()
}

onBeforeUnmount(() => {
  if (searchTimer.value) clearTimeout(searchTimer.value)
  if (blurTimer.value) clearTimeout(blurTimer.value)
})
</script>

<style scoped>
.admin-user-search {
  position: relative;
  width: 100%;
}

.admin-user-search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.admin-user-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.admin-user-search-input {
  width: 100%;
  padding-left: 32px;
  padding-right: 34px;
}

.admin-user-search-clear {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.admin-user-search-clear:hover {
  color: var(--text-1);
  background: var(--bg-hover);
}

.admin-user-search-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}

.admin-user-search-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.admin-user-search-option:hover,
.admin-user-search-option.active {
  background: var(--bg-hover);
}

.admin-user-search-name {
  font-size: 13px;
  color: var(--text-0);
  font-weight: 500;
}

.admin-user-search-option-meta {
  font-size: 12px;
  color: var(--text-3);
}

.admin-user-search-meta {
  font-size: 12px;
  color: var(--text-3);
  padding: 8px 10px;
}

.admin-user-search-hint {
  margin: 0;
  padding: 6px 10px 4px;
  font-size: 11px;
  color: var(--text-3);
}
</style>
