<script setup lang="ts">
// The calendar's unscheduled list (section 26b).
//
// Three separate failures met in these rows, and they are worth naming apart
// because the fix for each is different.
//
// The text was dark blue-grey on dark navy. The rows took their colour from the
// item's *type* — the same value the event chips use for their tint — so the
// row was drawing a hue meant for a 12% fill as full-strength text on a dark
// panel. A panel row is not a chip: it is a neutral card, and the type colour
// goes only on the small tile that says which kind of thing it is, where it is
// a signal rather than something that has to be read.
//
// The rows were cut off mid-word. A row is a fixed-width cell holding
// arbitrary text, so it needs min-width: 0 (or the grid track sizes to the
// longest word), overflow-wrap: anywhere (or a long unbroken title pushes the
// panel wider than its column), and a clamp (or one long task makes a row six
// lines tall and the panel a scroll of one item).
//
// And the panel itself was clipped, because it lived in a flex row with a fixed
// width and no min-width: the grid beside it can always shrink, so the browser
// shrank the panel instead. It sits in a named grid track now, and scrolls
// internally with a sticky header so the heading survives the scroll.
//
// With fifty-odd items it also needs finding things in: a search, and a
// Tasks / Todos switch, both inside the sticky header once the list is long.
import { computed, ref } from 'vue'
import DragHandle from '@/components/ui/DragHandle.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/ui/SearchField.vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip } from '@/styles'
import { SOURCE_COLOR, SOURCE_ICON } from '@/utils/calendarEvents'
import type { Task, Todo } from '@/types'

const props = defineProps<{ tasks: Task[]; todos: Todo[] }>()
const { c, dark } = useStyles()

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
// A handful of rows is scanned, not searched: the finding tools only appear
// once the list is long enough to need them.
const FIND_FROM = 7
const findable = computed(() => rows.value.length >= FIND_FROM)

const barColor = (type: 'task' | 'todo') => SOURCE_COLOR[type]
// The project as the same coloured pill it is everywhere else.
const tagStyle = (tag: string) => pxify({ ...tagChip(c.value, tag, dark.value), border: 0 })

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
        <Icon name="calendar-down" size="sm" class="unsched__mark" />
        <h2 class="unsched__title">Unscheduled</h2>
        <span class="unsched__count ui-tabular">{{ rows.length }}</span>
      </div>
      <p v-if="rows.length" class="unsched__hint">Drag a row onto the week to give it a time.</p>
      <template v-if="findable">
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
        <DragHandle class="unsched__grip" label="Drag to schedule" />
        <span class="unsched__tile" aria-hidden="true">
          <Icon :name="SOURCE_ICON[row.type]" size="xs" />
        </span>
        <span class="unsched__body">
          <span class="unsched__text">{{ row.title }}</span>
          <span v-if="row.tag" class="unsched__tag" :style="tagStyle(row.tag)">{{ row.tag }}</span>
          <span v-else class="unsched__meta">{{ row.type === 'task' ? 'Task' : 'Todo' }}</span>
        </span>
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
  /* The track is narrow; this stops the content from arguing with it. */
  min-width: 0;
  /* Takes whatever the side column has left under the selection card, and
     scrolls inside it: sixty rows never make the column taller. */
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* It scrolls without drawing a bar: a second scrollbar beside the page's is
     clutter. */
  scrollbar-width: none;
  border-radius: 24px;
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
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
  gap: 8px;
  min-width: 0;
  padding: 16px 16px 6px;
  background: inherit;
  backdrop-filter: blur(12px);
}
.unsched__top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.unsched__mark {
  flex-shrink: 0;
  color: var(--theme-text);
}
.unsched__title {
  min-width: 0;
  margin: 0;
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
}
.unsched__count {
  flex-shrink: 0;
  min-width: 22px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-align: center;
}
.unsched__hint {
  margin: 0;
  color: var(--text-muted, var(--theme-dim));
  font-size: var(--text-2xs);
  line-height: 1.4;
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
  padding: 8px 12px 14px;
}
/* A white card, primary text, and the type colour confined to the tile. */
.unsched__row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px 10px 4px;
  border-radius: 14px;
  background: var(--theme-card);
  color: var(--text-primary, var(--theme-text));
  cursor: grab;
  box-shadow: 0 6px 16px -14px color-mix(in srgb, var(--shadow-ink, #000) 50%, transparent);
  transition:
    transform 0.15s var(--ease-out, ease),
    box-shadow 0.15s var(--ease-out, ease);
}
.unsched__row:hover {
  transform: translateY(-1px);
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
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: color-mix(in oklch, var(--row-bar) 20%, transparent);
  color: color-mix(in oklch, var(--row-bar) 70%, var(--theme-text));
}
.unsched__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
/* Always there, but quiet: it says "this moves" without being a ninth thing
   to read in every row. */
.unsched__grip {
  color: var(--text-muted, var(--theme-dim));
  opacity: 0.55;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.unsched__row:hover .unsched__grip,
.unsched__row:focus-within .unsched__grip {
  opacity: 1;
}
.unsched__text {
  min-width: 0;
  max-width: 100%;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  /* Two lines, then an ellipsis — so a long title neither widens the panel
     nor swallows it. `anywhere` handles a pasted URL with no break in it. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.unsched__tag {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: var(--weight-semibold);
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
  padding: 4px 16px 16px;
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
