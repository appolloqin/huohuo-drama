<template>
  <!-- Episode workbench: fullscreen shell without top navigation -->
  <main class="workbench-frame">
    <slot />
  </main>
</template>

<script setup lang="ts">
// ── Episode workbench layout: fullscreen, no default nav bar ──
</script>

<style scoped>
.workbench-frame {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}
</style>
