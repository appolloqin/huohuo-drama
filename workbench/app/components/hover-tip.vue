<template>
  <span
    ref="anchorEl"
    class="hover-tip-wrap"
    @mouseenter="handlePointerEnter"
    @mouseleave="handlePointerLeave"
    @focusin="handlePointerEnter"
    @focusout="handlePointerLeave"
  >
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="showingTip"
      ref="floaterEl"
      class="hover-tip"
      :class="{ 'tip-above': dockAbove }"
      :style="floaterStyle"
      role="tooltip"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// ── 包裹子元素：悬停显示操作说明（批量任务等入口）────────────

const props = defineProps({
  text: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const anchorEl = ref<HTMLElement | null>(null)
const floaterEl = ref<HTMLElement | null>(null)
const showingTip = ref(false)
const dockAbove = ref(false)
const floaterStyle = ref<Record<string, string | number>>({})

function alignFloater() {
  const el = anchorEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const gap = 8
  const maxW = Math.min(300, window.innerWidth - 24)
  const estH = 88
  const spaceBelow = window.innerHeight - r.bottom - gap
  const spaceAbove = r.top - gap
  dockAbove.value = spaceBelow < estH && spaceAbove > spaceBelow

  let centerX = r.left + r.width / 2
  const half = maxW / 2
  centerX = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, centerX))

  if (dockAbove.value) {
    floaterStyle.value = {
      position: 'fixed',
      left: `${centerX}px`,
      bottom: `${window.innerHeight - r.top + gap}px`,
      transform: 'translateX(-50%)',
      maxWidth: `${maxW}px`,
      zIndex: 10000,
    }
  } else {
    floaterStyle.value = {
      position: 'fixed',
      left: `${centerX}px`,
      top: `${r.bottom + gap}px`,
      transform: 'translateX(-50%)',
      maxWidth: `${maxW}px`,
      zIndex: 10000,
    }
  }
}

function showTip() {
  if (props.disabled || !props.text?.trim()) return
  showingTip.value = true
  nextTick(() => {
    alignFloater()
    const tip = floaterEl.value
    if (!tip || !anchorEl.value) return
    const r = anchorEl.value.getBoundingClientRect()
    const tipH = tip.offsetHeight
    const gap = 8
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    if (spaceBelow < tipH && spaceAbove > spaceBelow) {
      dockAbove.value = true
      const maxW = Math.min(300, window.innerWidth - 24)
      let centerX = r.left + r.width / 2
      const half = maxW / 2
      centerX = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, centerX))
      floaterStyle.value = {
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

function dismissTip() {
  showingTip.value = false
}

function handlePointerEnter() {
  showTip()
}

function handlePointerLeave() {
  dismissTip()
}

function refreshFloaterOnScroll() {
  if (showingTip.value) alignFloater()
}

onMounted(() => {
  window.addEventListener('scroll', refreshFloaterOnScroll, true)
  window.addEventListener('resize', refreshFloaterOnScroll)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', refreshFloaterOnScroll, true)
  window.removeEventListener('resize', refreshFloaterOnScroll)
})
</script>

<style scoped>
.hover-tip-wrap {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
</style>

<style>
.hover-tip {
  position: relative;
  width: max-content;
  padding: 9px 12px;
  border-radius: var(--radius, 8px);
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  box-shadow: 0 10px 28px rgba(15, 23, 38, 0.16);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--text-1, #1a1a1a);
  white-space: normal;
  text-align: left;
  pointer-events: none;
  animation: hoverTipIn 0.12s ease-out;
}
.hover-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
}
.hover-tip:not(.tip-above)::after {
  top: -12px;
  border-bottom-color: var(--bg-elevated, #fff);
  filter: drop-shadow(0 -1px 0 var(--border, rgba(0, 0, 0, 0.08)));
}
.hover-tip.tip-above::after {
  bottom: -12px;
  border-top-color: var(--bg-elevated, #fff);
  filter: drop-shadow(0 1px 0 var(--border, rgba(0, 0, 0, 0.08)));
}
@keyframes hoverTipIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
