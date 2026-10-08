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
// has to be read — and on the small tile that says which kind of thing it is.
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
//
// With fifty-odd items it also needs finding things in: a search, and a
// Tasks / Todos switch, both above the list and inside the sticky header.
import { computed, ref } from 'vue'
import DragHandle from '@/components/ui/DragHandle.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/ui/SearchField.vue'
import { SOURCE_COLOR, SOURCE_ICON } from '@/utils/calendarEvents'
import type { Task, Todo } from '@/types'

const props = defineProps<{ tasks: Task[]; todos: Todo[] }>()
defineEmits<{ close: [] }>()

interface Row {
  key: string
  type: 'task' | 'todo'
  id: number
  title: string
  tag: string
}

const rows = computed<Row[]>(() => [
  ...props.tasks.map((t) => ({
    key: `task-${t.id}`,
    type: 'task' as const,
    id: t.id,
    title: t.title,
    tag: t.tag ?? '',
  })),
  ...props.todos.map((t) => ({
    key: `todo-${t.id}`,
    type: 'todo' as const,
    id: t.id,
    title: t.text,
    tag: t.tag ?? '',
  })),
])

const kind = ref<'all' | 'task' | 'todo'>('all')
const query = ref('')
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return rows.value.filter(
    (r) =>
      (kind.value === 'all' || r.type === kind.value) &&
      (!q || r.title.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q)),
  )
})
const kinds = computed(() => [
  { value: 'all' as const, label: 'All', n: rows.value.length },
  { value: 'task' as const, label: 'Tasks', n: props.tasks.length },
  { value: 'todo' as const, label: 'Todos', n: props.todos.length },
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
      <div class="unsched__top">
        <span class="unsched__mark" aria-hidden="true"
          ><Icon name="calendar-down" size="sm"
        /></span>
        <h2 class="unsched__title" title="Drag a row onto the calendar to schedule it">
          Unscheduled
        </h2>
        <span class="unsched__count ui-tabular">{{ rows.length }}</span>
        <IconButton label="Hide unscheduled" size="sm" @click="$emit('close')">
          <Icon name="x" size="xs" />
        </IconButton>
      </div>
      <template v-if="rows.length">
        <SearchField v-model="query" size="sm" placeholder="Find…" label="Find unscheduled" />
        <div class="unsched__kinds" role="tablist" aria-label="Kind">
          <button
            v-for="k in kinds"
            :key="k.value"
            type="button"
            role="tab"
            class="unsched__kind"
            :class="{ 'is-on': kind === k.value }"
            :aria-selected="kind === k.value"
            @click="kind = k.value"
          >
            {{ k.label }} <span class="unsched__kind-n">{{ k.n }}</span>
          </button>
        </div>
      </template>
    </header>

    <div v-if="shown.length" class="unsched__list">
      <div
        v-for="row in shown"
        :key="row.key"
        class="unsched-item unsched__row"
        :style="{ '--row-bar': barColor(row.type) }"
        :data-type="row.type"
        :data-id="row.id"
        :data-title="row.title"
      >
        <span class="unsched__tile" aria-hidden="true">
          <Icon :name="SOURCE_ICON[row.type]" size="xs" />
        </span>
        <span class="unsched__body">
          <span class="unsched__text">{{ row.title }}</span>
          <span class="unsched__meta">
            {{ row.type === 'task' ? 'Task' : 'Todo' }}
            <template v-if="row.tag"> · {{ row.tag }}</template>
          </span>
        </span>
        <!-- On hover, not always: a grip on every row at rest is eight more
             things to look at in a panel whose job is to be scanned. It keeps
             its keyboard affordance, so it is opacity rather than v-if. -->
        <DragHandle class="unsched__grip" label="Drag to schedule" />
      </div>
    </div>

    <p v-else-if="rows.length" class="unsched__empty">Nothing matches.</p>
    <p v-else class="unsched__empty">Everything is scheduled.</p>
  </aside>
</template>

<style scoped>
.unsched {
  display: flex;
  flex-direction: column;
  /* The track is 260px; this stops the content from arguing with it. */
  min-width: 0;
  /* As tall as the calendar beside it and no taller: height 0 means sixty
     rows add nothing to the row's height, and min-height 100% then fills the
     height the calendar gave it. The list scrolls inside that. */
  height: 0;
  min-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* It scrolls without drawing a bar: a second scrollbar beside the page's is
     the clutter this panel was being called out for. */
  scrollbar-width: none;
  border: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
  border-radius: 20px;
  background: color-mix(in oklch, var(--theme-card) 70%, transparent);
}
.unsched::-webkit-scrollbar {
  display: none;
}
.unsched__head {
  /* Sticky, so scrolling a long list does not scroll away the only label that
     says what the list is — nor the search that filters it. */
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px 12px 10px;
  border-bottom: 1px solid color-mix(in oklch, var(--theme-text) 7%, transparent);
  background: var(--glass-solid, var(--theme-surface));
}
.unsched__top {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.unsched__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.unsched__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
}
.unsched__count {
  flex-shrink: 0;
  min-width: 24px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-align: center;
}
.unsched__kinds {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 10px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
.unsched__kind {
  flex: 1;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted, var(--theme-dim));
  font: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.unsched__kind.is-on {
  background: var(--glass-solid, var(--theme-card));
  color: var(--text-primary, var(--theme-text));
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 16%, transparent);
}
.unsched__kind:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.unsched__kind-n {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.unsched__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: 10px 10px 12px;
}
/* Neutral fill, primary text, and the type colour confined to the bar. */
.unsched__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 8px 9px 9px;
  border-radius: 12px;
  border-left: 3px solid var(--row-bar);
  background: var(--bg-elevated, var(--glass-card));
  color: var(--text-primary, var(--theme-text));
  cursor: grab;
  transition:
    transform 0.15s var(--ease-out, ease),
    box-shadow 0.15s var(--ease-out, ease);
}
.unsched__row:hover {
  transform: translateX(2px);
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--row-bar) 45%, transparent),
    0 8px 16px -10px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}
.unsched__row:active {
  cursor: grabbing;
}
.unsched__tile {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: color-mix(in oklch, var(--row-bar) 20%, transparent);
  color: var(--row-bar);
}
.unsched__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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
  font-weight: var(--weight-medium);
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
.unsched__meta {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-2xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.unsched__empty {
  margin: 0;
  padding: 16px 14px;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-muted, var(--theme-dim));
}
@media (prefers-reduced-motion: reduce) {
  .unsched__row,
  .unsched__row:hover {
    transition: none;
    transform: none;
  }
}
</style>
