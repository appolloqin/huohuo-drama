<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="overlay"
      @click.self="onCancel"
      @keydown.esc.prevent="onCancel"
    >
      <div
        class="confirm-dialog card"
        role="alertdialog"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
        tabindex="-1"
        ref="dialogRef"
      >
        <div class="confirm-dialog-head">
          <div :class="['confirm-dialog-icon', danger ? 'is-danger' : 'is-neutral']" aria-hidden="true">
            <svg v-if="danger" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="confirm-dialog-copy">
            <h2 :id="titleId" class="confirm-dialog-title">{{ title }}</h2>
            <p v-if="message" :id="messageId" class="confirm-dialog-message">{{ message }}</p>
          </div>
        </div>
        <div class="confirm-dialog-actions">
          <button type="button" class="btn" :disabled="busy" @click="onCancel">{{ resolvedCancelLabel }}</button>
          <button
            type="button"
            :class="['btn', danger ? 'btn-danger' : 'btn-primary']"
            :disabled="busy"
            @click="onConfirm"
          >{{ resolvedConfirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useI18n } from '~/composables/use-i18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: '' },
  cancelLabel: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  danger: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const { messages: tm } = useI18n()
const dialogRef = ref(null)
const titleId = `confirm-title-${useId()}`
const messageId = `confirm-message-${useId()}`

const resolvedConfirmLabel = computed(() => props.confirmLabel || tm.value.common.confirm)
const resolvedCancelLabel = computed(() => props.cancelLabel || tm.value.common.cancel)

function onCancel() {
  if (props.busy) return
  emit('update:modelValue', false)
  emit('cancel')
}

function onConfirm() {
  if (props.busy) return
  emit('confirm')
}

watch(
  () => props.modelValue,
  open => {
    if (!open) return
    nextTick(() => dialogRef.value?.focus())
  },
)
</script>

<style scoped>
.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 28px;
  box-shadow: var(--shadow-elevated);
  animation: scaleIn 0.2s var(--ease-out);
}

.confirm-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 24px;
}

.confirm-dialog-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.confirm-dialog-icon.is-danger {
  background: color-mix(in srgb, var(--danger, #e5484d) 12%, transparent);
  color: var(--danger, #e5484d);
}

.confirm-dialog-icon.is-neutral {
  background: var(--accent-bg);
  color: var(--accent);
}

.confirm-dialog-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-dialog-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-0);
}

.confirm-dialog-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  word-break: break-word;
}

.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
