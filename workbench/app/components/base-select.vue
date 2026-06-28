<template>
  <div class="wb-select" ref="hostRef">
    <!-- Creatable：可输入 + 下拉 -->
    <div v-if="creatable" class="wb-select-trigger wb-select-combobox" :class="{ open: panelOpen }">
      <input
        ref="comboInputRef"
        class="wb-select-combo-input"
        :value="freeformText"
        :placeholder="idleCaption"
        @input="onComboType"
        @focus="onComboFocusIn"
        @keydown="onComboKeyNav"
        @blur="onComboFocusOut"
      />
      <button type="button" class="wb-select-combo-toggle" tabindex="-1" aria-label="toggle" @mousedown.prevent="flipComboPanel">
        <ChevronDown :size="13" class="wb-select-arrow" :class="{ open: panelOpen }" />
      </button>
    </div>
    <!-- 标准只读触发器 -->
    <button v-else type="button" class="wb-select-trigger" :class="{ open: panelOpen }" @click="flipReadonlyPanel">
      <span :class="resolvedLabel ? '' : 'placeholder'" class="wb-select-label" :title="resolvedLabel || undefined">{{ resolvedLabel || idleCaption }}</span>
      <ChevronDown :size="13" class="wb-select-arrow" />
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
      <div v-if="panelOpen" class="wb-select-dropdown" :style="floatingStyle" ref="panelRef">
        <!-- Search（非 creatable 模式） -->
        <div v-if="searchable && !creatable" class="wb-select-search">
          <Search :size="12" />
          <input
            ref="filterInputRef"
            v-model="filterQuery"
            class="wb-select-search-input"
            :placeholder="filterPlaceholder"
            @keydown="onFilterKeyNav"
          />
        </div>

        <!-- Options -->
        <div class="wb-select-options" ref="listPaneRef">
          <template v-if="flattenedChoices.length">
            <template v-for="(bucket, bi) in visibleBuckets" :key="bi">
              <div v-if="bucket.label" class="wb-select-group-label">{{ bucket.label }}</div>
              <button
                v-for="(choice, ci) in bucket.options"
                :key="choice.value"
                type="button"
                :class="['wb-select-option', { selected: choice.value === modelValue, highlighted: activeChoiceIdx === flatIndexFromBucket(bi, ci) }]"
                @mousedown.prevent="cancelComboBlurTimer"
                @click="commitChoice(choice)"
                @mousemove="activeChoiceIdx = flatIndexFromBucket(bi, ci)"
              >{{ choice.label }}</button>
            </template>
          </template>
          <div v-else class="wb-select-empty">{{ emptyCaption }}</div>
        </div>
      </div>
    </Teleport>

    <!-- Backdrop -->
    <Teleport to="body">
      <div v-if="panelOpen" class="wb-select-backdrop" @click="closeViaBackdrop" />
    </Teleport>
  </div>
</template>

<script setup>
import { useI18n } from '~/composables/use-i18n'
import { ChevronDown, Search } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: undefined },
  searchPlaceholder: { type: String, default: undefined },
  emptyText: { type: String, default: undefined },
  searchable: { type: Boolean, default: true },
  creatable: { type: Boolean, default: false },
  creatableHint: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const { messages: tm } = useI18n()
const idleCaption = computed(() => props.placeholder ?? tm.value.common.baseSelectDefaultPh)
const filterPlaceholder = computed(() => props.searchPlaceholder ?? tm.value.common.baseSelectSearch)
const emptyCaption = computed(() => props.emptyText ?? tm.value.common.baseSelectEmpty)

const panelOpen = ref(false)
const filterQuery = ref('')
const hostRef = ref()
const panelRef = ref()
const filterInputRef = ref()
const comboInputRef = ref()
const listPaneRef = ref()
const comboBlurHandle = ref(null)
const activeChoiceIdx = ref(-1)
const floatingStyle = ref({})

/** 将 props.options 规范为分组结构 */
const optionBuckets = computed(() => {
  if (!props.options.length) return []
  if (props.options[0]?.options) {
    return props.options.map(bucket => ({
      label: bucket.label || '',
      options: bucket.options.map(row => ({
        label: row.label ?? row,
        value: row.value ?? row,
        searchText: row.searchText,
      })),
    }))
  }
  const bucketMap = new Map()
  for (const row of props.options) {
    const label = row.group || ''
    if (!bucketMap.has(label)) bucketMap.set(label, [])
    bucketMap.get(label).push({
      label: row.label ?? row,
      value: row.value ?? row,
      searchText: row.searchText,
    })
  }
  return Array.from(bucketMap.entries()).map(([label, options]) => ({ label, options }))
})

const freeformText = computed(() => {
  if (props.modelValue == null || props.modelValue === '') return ''
  return String(props.modelValue)
})

const visibleBuckets = computed(() => {
  if (props.creatable) return optionBuckets.value
  if (!filterQuery.value.trim()) return optionBuckets.value
  const needle = filterQuery.value.trim().toLowerCase()
  return optionBuckets.value
    .map(bucket => ({
      label: bucket.label,
      options: bucket.options.filter(row => {
        const haystack = `${row.label} ${row.searchText ?? ''} ${row.value ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      }),
    }))
    .filter(bucket => bucket.options.length > 0)
})

const flattenedChoices = computed(() => visibleBuckets.value.flatMap(bucket => bucket.options))

function flatIndexFromBucket(bucketIdx, choiceIdx) {
  let offset = 0
  for (let i = 0; i < bucketIdx; i++) offset += optionBuckets.value[i].options.length
  return offset + choiceIdx
}

function bucketCoordsFromFlatIndex(flatIdx) {
  for (let bi = 0; bi < visibleBuckets.value.length; bi++) {
    const span = visibleBuckets.value[bi].options.length
    if (flatIdx < span) return [bi, flatIdx]
    flatIdx -= span
  }
  return [0, 0]
}

const resolvedLabel = computed(() => {
  for (const bucket of optionBuckets.value) {
    const hit = bucket.options.find(row => row.value === props.modelValue)
    if (hit) return hit.label
  }
  if (props.creatable && props.modelValue != null && props.modelValue !== '') {
    return String(props.modelValue)
  }
  return ''
})

function flipReadonlyPanel() {
  panelOpen.value ? shutPanel() : openPanel()
}

function flipComboPanel() {
  if (panelOpen.value) {
    shutPanel()
    comboInputRef.value?.focus()
  } else {
    openPanel()
    comboInputRef.value?.focus()
  }
}

async function openPanel() {
  panelOpen.value = true
  activeChoiceIdx.value = flattenedChoices.value.findIndex(row => row.value === props.modelValue)
  await nextTick()
  if (!props.creatable) {
    filterQuery.value = ''
    filterInputRef.value?.focus()
  }
  repositionFloatingPanel()
}

function shutPanel() {
  panelOpen.value = false
  filterQuery.value = ''
}

function closeViaBackdrop() {
  shutPanel()
  if (props.creatable) comboInputRef.value?.blur()
}

function commitChoice(choice) {
  emit('update:modelValue', choice.value)
  shutPanel()
  if (props.creatable) comboInputRef.value?.focus()
}

function cancelComboBlurTimer() {
  if (comboBlurHandle.value) {
    clearTimeout(comboBlurHandle.value)
    comboBlurHandle.value = null
  }
}

function onComboType(e) {
  emit('update:modelValue', e.target.value)
  if (!panelOpen.value) openPanel()
  else repositionFloatingPanel()
}

function onComboFocusIn() {
  cancelComboBlurTimer()
  openPanel()
}

function onComboFocusOut() {
  comboBlurHandle.value = setTimeout(() => {
    shutPanel()
    comboBlurHandle.value = null
  }, 160)
}

function onComboKeyNav(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!panelOpen.value) openPanel()
    activeChoiceIdx.value = Math.min(
      activeChoiceIdx.value < 0 ? 0 : activeChoiceIdx.value + 1,
      Math.max(flattenedChoices.value.length - 1, 0),
    )
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!panelOpen.value) openPanel()
    activeChoiceIdx.value = Math.max(activeChoiceIdx.value - 1, 0)
  } else if (e.key === 'Enter' && panelOpen.value && activeChoiceIdx.value >= 0 && flattenedChoices.value[activeChoiceIdx.value]) {
    e.preventDefault()
    commitChoice(flattenedChoices.value[activeChoiceIdx.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    shutPanel()
  }
}

function repositionFloatingPanel() {
  const rect = hostRef.value?.getBoundingClientRect()
  if (!rect) return
  const top = rect.bottom + 4
  const left = Math.max(8, rect.left)
  const maxHeight = window.innerHeight - top - 16
  const width = Math.min(rect.width, window.innerWidth - left - 8)
  floatingStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(maxHeight, 400)}px`,
  }
}

function onFilterKeyNav(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeChoiceIdx.value = Math.min(activeChoiceIdx.value + 1, flattenedChoices.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeChoiceIdx.value = Math.max(activeChoiceIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeChoiceIdx.value >= 0 && flattenedChoices.value[activeChoiceIdx.value]) {
      commitChoice(flattenedChoices.value[activeChoiceIdx.value])
    }
  } else if (e.key === 'Escape') {
    shutPanel()
  }
}

watch(panelOpen, isOpen => {
  if (isOpen) document.addEventListener('scroll', repositionFloatingPanel, true)
  else document.removeEventListener('scroll', repositionFloatingPanel, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('scroll', repositionFloatingPanel, true)
  if (comboBlurHandle.value) clearTimeout(comboBlurHandle.value)
})
</script>

<style scoped>
.wb-select {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
}

.wb-select-trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 28px 7px 10px;
  font-size: 12px;
  font-family: var(--font-body);
  color: var(--text-0);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.wb-select-trigger:hover {
  border-color: var(--border-strong);
  background: var(--bg-0);
}
.wb-select-trigger.open {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-glow);
  background: var(--bg-0);
}
.wb-select-trigger .placeholder {
  color: var(--text-3);
  font-weight: 300;
}
.wb-select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.wb-select-arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  margin-left: 0;
  color: var(--text-2);
  transition: transform 0.2s var(--ease-out);
  flex-shrink: 0;
  pointer-events: none;
  transform: translateY(-50%);
}
.wb-select-trigger.open .wb-select-arrow,
.wb-select-arrow.open {
  transform: translateY(-50%) rotate(180deg);
}

.wb-select-combobox {
  padding: 0;
  cursor: text;
  overflow: hidden;
}
.wb-select-combobox:hover {
  background: var(--bg-input);
}
.wb-select-combo-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 7px 4px 7px 10px;
  font-size: 12px;
  font-family: var(--font-body);
  color: var(--text-0);
}
.wb-select-combo-input::placeholder {
  color: var(--text-3);
  font-weight: 300;
}
.wb-select-combo-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-2);
}
.wb-select-combo-toggle:hover {
  color: var(--text-1);
}

.wb-select-dropdown {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 9999;
  animation: wbSelectReveal 0.15s var(--ease-out);
}

.wb-select-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
}
.wb-select-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: var(--font-body);
  color: var(--text-0);
}
.wb-select-search-input::placeholder {
  color: var(--text-3);
}

.wb-select-options {
  overflow-y: auto;
  max-height: 260px;
  padding: 4px;
}

.wb-select-group-label {
  padding: 6px 10px 3px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  margin-top: 4px;
}
.wb-select-group-label:first-child {
  margin-top: 0;
}

.wb-select-option {
  display: block;
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  font-family: var(--font-body);
  color: var(--text-1);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
}
.wb-select-option:hover,
.wb-select-option.highlighted {
  background: var(--bg-hover);
  color: var(--text-0);
}
.wb-select-option.selected {
  background: var(--accent-bg);
  color: var(--accent-dark);
  font-weight: 600;
}
.wb-select-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--text-3);
  text-align: center;
}

.wb-select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

@keyframes wbSelectReveal {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
