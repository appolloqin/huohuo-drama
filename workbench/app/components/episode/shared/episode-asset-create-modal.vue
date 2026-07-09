<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @click.self="close">
      <form class="card asset-create-modal" @submit.prevent="submit">
        <div class="asset-create-modal-head">
          <div>
            <h2 class="asset-create-modal-title">{{ modalTitle }}</h2>
            <p class="asset-create-modal-desc">{{ modalDesc }}</p>
          </div>
          <button type="button" class="modal-close-btn" aria-label="关闭" :disabled="busy" @click="close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <template v-if="kind === 'characterForm'">
          <label class="field">
            <span class="field-label">所属角色 <span class="required">*</span></span>
            <BaseSelect
              v-model="formDraft.character_id"
              :options="castSelectOptions"
              placeholder="选择本集角色"
              searchable
              style="width:100%"
              :disabled="busy"
            />
          </label>
          <label class="field">
            <span class="field-label">形态名称 <span class="required">*</span></span>
            <input
              v-model="formDraft.name"
              class="input"
              placeholder="如：觉醒态、战甲形态、便装"
              maxlength="64"
              required
              :disabled="busy"
            />
          </label>
          <label class="field">
            <span class="field-label">外观描述</span>
            <textarea
              v-model="formDraft.appearance"
              class="input textarea"
              rows="3"
              placeholder="该形态下的服装、发型、配饰等视觉特征"
              :disabled="busy"
            />
          </label>
          <label class="field">
            <span class="field-label">说明</span>
            <textarea
              v-model="formDraft.description"
              class="input textarea"
              rows="2"
              placeholder="何时出现、剧情意义（可选）"
              :disabled="busy"
            />
          </label>
        </template>

        <template v-else>
          <label class="field">
            <span class="field-label">道具名称 <span class="required">*</span></span>
            <input
              v-model="propDraft.name"
              class="input"
              placeholder="如：青龙剑、玉佩、古书"
              maxlength="64"
              required
              :disabled="busy"
            />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">类型</span>
              <BaseSelect
                v-model="propDraft.type"
                :options="propTypeOptions"
                placeholder="选择类型"
                searchable
                style="width:100%"
                :disabled="busy"
              />
            </label>
            <label class="field">
              <span class="field-label">专属角色</span>
              <BaseSelect
                v-model="propDraft.character_id"
                :options="castSelectOptionsWithNone"
                placeholder="通用道具"
                searchable
                style="width:100%"
                :disabled="busy"
                @update:model-value="onPropOwnerChange"
              />
            </label>
          </div>
          <label v-if="propDraft.character_id" class="field">
            <span class="field-label">专属形态</span>
            <BaseSelect
              v-model="propDraft.character_form_id"
              :options="propFormSelectOptions"
              placeholder="不限形态（角色通用）"
              searchable
              style="width:100%"
              :disabled="busy"
            />
          </label>
          <label class="field">
            <span class="field-label">描述</span>
            <textarea
              v-model="propDraft.description"
              class="input textarea"
              rows="3"
              placeholder="外观、材质、用途等"
              :disabled="busy"
            />
          </label>
        </template>

        <div class="asset-create-modal-actions">
          <button type="button" class="btn" :disabled="busy" @click="close">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !canSubmit">
            <Loader2 v-if="busy" :size="12" class="animate-spin" />
            {{ busy ? '创建中…' : '创建' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '~/components/base-select.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, default: 'characterForm' },
  castList: { type: Array, default: () => [] },
  characterFormList: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const formDraft = ref({
  character_id: null,
  name: '',
  appearance: '',
  description: '',
})

const propDraft = ref({
  name: '',
  type: '',
  character_id: null,
  character_form_id: null,
  description: '',
})

const propTypeOptions = [
  { value: 'weapon', label: '武器' },
  { value: 'daily', label: '日常物品' },
  { value: 'decor', label: '陈设' },
  { value: 'vehicle', label: '载具' },
  { value: 'other', label: '其他' },
]

const modalTitle = computed(() => (
  props.kind === 'characterForm' ? '新增衍生形态' : '新增道具'
))

const modalDesc = computed(() => (
  props.kind === 'characterForm'
    ? '基于本集已有角色创建变身、换装等衍生形态，用于后续场景与镜头参考。'
    : '创建武器、法器或关键陈设；可选绑定专属角色或形态。'
))

const castSelectOptions = computed(() =>
  props.castList.map(c => ({ value: c.id, label: c.name })),
)

const castSelectOptionsWithNone = computed(() => [
  { value: null, label: '通用道具（不绑定角色）' },
  ...castSelectOptions.value,
])

const propFormSelectOptions = computed(() => {
  if (!propDraft.value.character_id) return []
  return props.characterFormList
    .filter(f => (f.character_id || f.characterId) === propDraft.value.character_id)
    .map(f => ({ value: f.id, label: f.name }))
})

const canSubmit = computed(() => {
  if (props.kind === 'characterForm') {
    return !!(formDraft.value.character_id && formDraft.value.name.trim())
  }
  return !!propDraft.value.name.trim()
})

function resetDrafts() {
  formDraft.value = { character_id: null, name: '', appearance: '', description: '' }
  propDraft.value = { name: '', type: '', character_id: null, character_form_id: null, description: '' }
}

function onPropOwnerChange() {
  propDraft.value.character_form_id = null
}

function close() {
  if (props.busy) return
  emit('update:modelValue', false)
}

function submit() {
  if (props.busy || !canSubmit.value) return
  if (props.kind === 'characterForm') {
    emit('submit', {
      kind: 'characterForm',
      character_id: formDraft.value.character_id,
      name: formDraft.value.name.trim(),
      appearance: formDraft.value.appearance.trim() || undefined,
      description: formDraft.value.description.trim() || undefined,
    })
    return
  }
  emit('submit', {
    kind: 'prop',
    name: propDraft.value.name.trim(),
    type: propDraft.value.type || undefined,
    character_id: propDraft.value.character_id || undefined,
    character_form_id: propDraft.value.character_form_id || undefined,
    description: propDraft.value.description.trim() || undefined,
  })
}

watch(() => props.modelValue, (open) => {
  if (open) resetDrafts()
})
</script>

<style scoped>
.asset-create-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: min(86vh, 720px);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-elevated);
  overflow: auto;
  animation: scaleIn 0.2s var(--ease-out);
}

.asset-create-modal-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.asset-create-modal-title {
  margin: 0;
  font-size: 18px;
  font-family: var(--font-display);
  color: var(--text-0);
}

.asset-create-modal-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-2);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.required {
  color: var(--danger, #e5484d);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field-row .field {
  min-width: 0;
}

.asset-create-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  padding-top: 4px;
}

@media (max-width: 560px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
