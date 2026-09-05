<script setup lang="ts">
// One block on the home screen (section 44, item 6).
//
// Every block links into its own tab, so every block is a link — one `<button>`
// with the whole card inside it, not a card with a "view" affordance tucked in
// a corner. That is the difference between a dashboard you navigate from and a
// dashboard you look at and then go and find the tab for.
//
// The heading carries a `title` and the destination, so what a screen reader
// announces is "Today's move, opens Trades" rather than a heap of numbers with
// no relationship to each other.
//
// The glyph comes in as a SLOT rather than as an icon name, so each block can
// carry the glyph its own tab uses — the trade family's target and balance
// marks, the feed family's PR and forex marks, the sprite for the rest. Two
// sets exist on purpose (see `components/icons/index.ts`), and a name-only prop
// would have forced every block onto whichever one the prop was typed against.
import { useUiStore } from '@/stores/ui'
import { tabLabel } from '@/tabs.config'
import type { TabKey } from '@/types'

const props = defineProps<{
  title: string
  tab: TabKey
  /** A short figure shown beside the title, when one summarises the block. */
  hint?: string
}>()

const ui = useUiStore()
</script>

<template>
  <button
    type="button"
    class="dblock"
    :aria-label="`${props.title} — opens ${tabLabel(props.tab)}`"
    @click="ui.setTab(props.tab)"
  >
    <span class="dblock__head">
      <span class="dblock__icon"><slot name="icon" /></span>
      <span class="dblock__title ui-label">{{ props.title }}</span>
      <span v-if="props.hint" class="dblock__hint">{{ props.hint }}</span>
    </span>
    <span class="dblock__body"><slot /></span>
  </button>
</template>

<style scoped>
.dblock {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  /* A grid child holding text without this is as wide as its longest word,
     which is how a card pushes the one beside it off its own row. */
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.dblock:hover {
  border-color: var(--accent, var(--theme-accent));
}
.dblock:active {
  transform: translateY(1px);
}
.dblock__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.dblock__icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--accent, var(--theme-accent));
}
.dblock__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dblock__hint {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--theme-dim));
}
.dblock__body {
  display: block;
  min-width: 0;
}
</style>
