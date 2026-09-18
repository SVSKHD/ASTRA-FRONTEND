<script setup lang="ts">
// A row of pane actions drawn as one control: a single rounded tray the icon
// buttons sit in, so a header's bell, share, calendar and delete read as one
// group rather than five loose glyphs at slightly different sizes.
</script>

<template>
  <div class="ptb" role="toolbar"><slot /></div>
</template>

<style scoped>
.ptb {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 2px;
  border: 1px solid var(--glass-border);
  border-radius: calc(var(--radius-control) + 3px);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
/* The header also hosts buttons owned by other components (the reminder bell,
   the share globe, the deadline mover). They size themselves; this only lines
   them up on the same 30px row as the pane's own buttons. */
.ptb > :deep(*) {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
}
.ptb :deep(.pbtn) {
  border-color: transparent;
}
</style>
