<script setup lang="ts">
// The header row at the top of a tab's panel — the same one Todos and Tasks
// draw with PanelHeader, because this IS PanelHeader with the tab-shaped
// defaults filled in:
//
//   [left slot]                  Tab name          [actions · + New]
//   3 of 12 done ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// `done`/`total` are optional: a list with a done state (Deadlines, Reminders)
// passes them and gets the Todo tab's progress row under the header — the
// count with the bar running on beside it;
// everything else leaves them out and the row is just name and actions.
// `#left` holds a tab's filters or modes (News' categories, Trades' month
// view), `#actions` its buttons, which sit before New in the right corner.
//
// It used to teleport into the shell's top strip. The tab's name now lives in
// the middle of this row instead, on every tab, so the strip keeps only the
// brand and the reminder and every tab's header reads the same way.
import PanelHeader from '@/components/PanelHeader.vue'
import ProgressLine from '@/components/ProgressLine.vue'

// `newLabel` is optional: the News and Code tabs are read-only views of things
// that happen elsewhere, and a create button on them would be a button with
// nothing to create (sections 39–40).
defineProps<{ title: string; newLabel?: string; done?: number; total?: number }>()
defineEmits<{ (e: 'new'): void }>()
</script>

<template>
  <PanelHeader class="list-toolbar" :title="title" :new-label="newLabel" @new="$emit('new')">
    <template #left>
      <slot name="left" />
    </template>
    <template #right>
      <slot name="actions" />
    </template>
    <template v-if="total != null" #below>
      <ProgressLine part="inline" :done="done ?? 0" :total="total" />
    </template>
  </PanelHeader>
</template>
