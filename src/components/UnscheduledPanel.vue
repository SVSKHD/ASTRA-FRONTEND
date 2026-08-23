<script setup lang="ts">
// The calendar's unscheduled list (section 26b).
//
// Three separate failures met in these rows, and they are worth naming apart
// because the fix for each is different.
//
// The text was dark blue-grey on dark navy. The rows took their colour from the
// item's *type* — the same value the event chips use for their tint — so the
// row was drawing a hue meant for a 12% fill as full-strength text on a dark
// panel. A panel row is not a chip: it is neutral, and the type colour goes on
// a 3px bar down its left edge where it is a signal rather than something that
// has to be read.
//
// The rows were cut off mid-word. A row is a fixed-width cell holding
// arbitrary text, so it needs min-width: 0 (or the grid track sizes to the
// longest word), overflow-wrap: anywhere (or a long unbroken title pushes the
// panel wider than its column), and a clamp (or one long task makes a row six
// lines tall and the panel a scroll of one item).
//
// And the panel itself was clipped, because it lived in a flex row with a fixed
// width and no min-width: the grid beside it can always shrink, so the browser
// shrank the panel instead. It is a named grid track now, and scrolls
// internally with a sticky header so the heading survives the scroll.
import { computed, ref } from 'vue'
import DragHandle from '@/components/ui/DragHandle.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import { SOURCE_COLOR } from '@/utils/calendarEvents'
import type { Task, Todo } from '@/types'

const props = defineProps<{ tasks: Task[]; todos: Todo[] }>()
defineEmits<{ close: [] }>()

interface Row {
  key: string
  type: 'task' | 'todo'
  id: number
  title: string
}

const rows = computed<Row[]>(() => [
  ...props.tasks.map((t) => ({
    key: `task-${t.id}`,
    type: 'task' as const,
    id: t.id,
    title: t.title,
  })),
  ...props.todos.map((t) => ({
    key: `todo-${t.id}`,
    type: 'todo' as const,
    id: t.id,
    title: t.text,
  })),
])

const barColor = (type: 'task' | 'todo') => SOURCE_COLOR[type]

const root = ref<HTMLElement | null>(null)
// The calendar needs the element, not the component: FullCalendar's Draggable
// binds to a DOM node, and the drop test measures a bounding rect. A `ref` on a
// component hands back an instance, and both would fail silently — the drag
// would simply stop working, with nothing thrown.
defineExpose({ el: root })
</script>

<template>
  <aside ref="root" class="unsched" aria-label="Unscheduled">
    <header class="unsched__head">
      <h2 class="unsched__title">Unscheduled</h2>
      <span class="unsched__count ui-tabular">{{ rows.length }}</span>
      <IconButton label="Hide unscheduled" size="sm" @click="$emit('close')">
        <Icon name="x" size="xs" />
      </IconButton>
    </header>

    <div v-if="rows.length" class="unsched__list">
      <div
        v-for="row in rows"
        :key="row.key"
        class="unsched-item unsched__row"
        :style="{ '--row-bar': barColor(row.type) }"
        :data-type="row.type"
        :data-id="row.id"
        :data-title="row.title"
      >
        <!-- On hover, not always: a grip on every row at rest is eight more
             things to look at in a panel whose job is to be scanned. It keeps
             its keyboard affordance, so it is opacity rather than v-if. -->
        <DragHandle class="unsched__grip" label="Drag to schedule" />
        <span class="unsched__text">{{ row.title }}</span>
      </div>
    </div>

    <p v-else class="unsched__empty">Everything is scheduled.</p>
  </aside>
</template>

<style scoped>
.unsched {
  display: flex;
  flex-direction: column;
  /* The track is 260px; this stops the content from arguing with it. */
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--text-primary, currentColor) 5%, transparent);
}
.unsched__head {
  /* Sticky, so scrolling a long list does not scroll away the only label that
     says what the list is. */
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3) var(--sp-3) var(--sp-2);
  background: inherit;
  backdrop-filter: blur(8px);
}
.unsched__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
}
.unsched__count {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--text-muted, var(--theme-dim));
}
.unsched__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: 0 var(--sp-3) var(--sp-3);
}
/* Neutral fill, primary text, and the type colour confined to the bar. */
.unsched__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-control);
  border-left: 3px solid var(--row-bar);
  background: var(--bg-elevated, var(--glass-card));
  color: var(--text-primary, var(--theme-text));
  cursor: grab;
}
.unsched__row:active {
  cursor: grabbing;
}
.unsched__grip {
  color: var(--text-muted, var(--theme-dim));
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.unsched__row:hover .unsched__grip,
.unsched__row:focus-within .unsched__grip {
  opacity: 1;
}
.unsched__text {
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  /* Two lines, then an ellipsis — so every row is the same height and a long
     title neither widens the panel nor swallows it. `anywhere` is what handles
     a pasted URL with no break opportunity in it. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.unsched__empty {
  margin: 0;
  padding: 0 var(--sp-3) var(--sp-3);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-muted, var(--theme-dim));
}
</style>
