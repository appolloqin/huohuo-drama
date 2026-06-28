<template>
  <span
    ref="hostEl"
    class="field-help"
    tabindex="0"
    :aria-label="text"
    @mouseenter="revealTip"
    @mouseleave="hideTip"
    @focus="revealTip"
    @blur="hideTip"
  >
    <span class="field-help-mark" aria-hidden="true">!</span>
  </span>
  <Teleport to="body">
    <div
      v-if="tipOpen"
      ref="popoverEl"
      class="field-help-tip"
      :class="{ 'tip-above': flipAbove }"
      :style="popoverStyle"
      role="tooltip"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// ── 表单字段旁「!」提示：悬停/聚焦显示说明气泡 ───────────────

const props = defineProps({
  text: { type: String, required: true },
})

const hostEl = ref<HTMLElement | null>(null)
const popoverEl = ref<HTMLElement | null>(null)
const tipOpen = ref(false)
const flipAbove = ref(false)
const popoverStyle = ref<Record<string, string | number>>({})

function syncPopoverPosition() {
  const el = hostEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const gap = 8
  const maxW = Math.min(280, window.innerWidth - 24)
  const estH = 100
  const spaceBelow = window.innerHeight - r.bottom - gap
  const spaceAbove = r.top - gap
  flipAbove.value = spaceBelow < estH && spaceAbove > spaceBelow

  let centerX = r.left + r.width / 2
  const half = maxW / 2
  centerX = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, centerX))

  if (flipAbove.value) {
    popoverStyle.value = {
      position: 'fixed',
      left: `${centerX}px`,
      bottom: `${window.innerHeight - r.top + gap}px`,
      transform: 'translateX(-50%)',
      maxWidth: `${maxW}px`,
      zIndex: 10000,
    }
  } else {
    popoverStyle.value = {
      position: 'fixed',
      left: `${centerX}px`,
      top: `${r.bottom + gap}px`,
      transform: 'translateX(-50%)',
      maxWidth: `${maxW}px`,
      zIndex: 10000,
    }
  }
}

function revealTip() {
  tipOpen.value = true
  nextTick(() => {
    syncPopoverPosition()
    const tip = popoverEl.value
    if (!tip || !hostEl.value) return
    const r = hostEl.value.getBoundingClientRect()
    const tipH = tip.offsetHeight
    const gap = 8
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    if (spaceBelow < tipH && spaceAbove > spaceBelow) {
      flipAbove.value = true
      const maxW = Math.min(280, window.innerWidth - 24)
      let centerX = r.left + r.width / 2
      const half = maxW / 2
      centerX = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, centerX))
      popoverStyle.value = {
        position: 'fixed',
        left: `${centerX}px`,
        bottom: `${window.innerHeight - r.top + gap}px`,
        transform: 'translateX(-50%)',
        maxWidth: `${maxW}px`,
        zIndex: 10000,
      }
    }
  })
}

function hideTip() {
  tipOpen.value = false
}

function repositionOnScroll() {
  if (tipOpen.value) syncPopoverPosition()
}

onMounted(() => {
  window.addEventListener('scroll', repositionOnScroll, true)
  window.addEventListener('resize', repositionOnScroll)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', repositionOnScroll, true)
  window.removeEventListener('resize', repositionOnScroll)
})
</script>

<style scoped>
.field-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text-3);
  cursor: help;
  border-radius: 50%;
  outline: none;
}
.field-help:hover,
.field-help:focus-visible {
  color: var(--accent);
  background: var(--accent-bg);
}
.field-help-mark {
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  font-family: var(--font-display, inherit);
}
</style>

<style>
.field-help-tip {
  position: relative;
  width: max-content;
  padding: 10px 12px;
  border-radius: var(--radius, 8px);
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  box-shadow: 0 8px 24px rgba(15, 23, 38, 0.14);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--text-1, #1a1a1a);
  white-space: normal;
  text-align: left;
  pointer-events: none;
  animation: fieldHelpIn 0.12s ease-out;
}
.field-help-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
}
.field-help-tip:not(.tip-above)::after {
  top: -12px;
  border-bottom-color: var(--border, rgba(0, 0, 0, 0.1));
}
.field-help-tip.tip-above::after {
  bottom: -12px;
  border-top-color: var(--border, rgba(0, 0, 0, 0.1));
}
@keyframes fieldHelpIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
