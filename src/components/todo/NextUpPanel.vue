<script setup lang="ts">
// What the details column shows with nothing selected (Todo v2, 2c): the first
// open subtasks of every open todo, tickable in place. Half the tab used to be
// one line of "select a todo"; with dozens of open subtasks spread across a few
// todos, this is the list most worth having in front of you.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep, tagChip } from '@/styles'
import { buildIndex } from '@/utils/taskTree'
import { nextUpOf } from '@/utils/todoV2'
import Icon from '@/components/ui/Icon.vue'
import type { Todo } from '@/types'

const props = defineProps<{ roots: Todo[] }>()

const app = useAppStore()
const ui = useUiStore()
const { todos } = storeToRefs(app)
const { c, dark } = useStyles()

const index = computed(() => buildIndex(todos.value))
// Ticked from here this session: stays listed, struck through, rather than
// vanishing under the pointer.
const kept = ref(new Set<number>())
const rows = computed(() => nextUpOf(index.value, props.roots, kept.value))

const popping = ref<number | null>(null)
function tick(id: number) {
  kept.value = new Set(kept.value).add(id)
  popping.value = id
  setTimeout(() => popping.value === id && (popping.value = null), 180)
  app.toggleTodo(id)
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', minHeight: 0 })
const head = pxify({
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
})
const sub = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, opacity: 0.8 }))
const list = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  overflowY: 'auto',
})
const row = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-card)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
  }),
)
function text(done: boolean) {
  return pxify({
    ...typeStep('base'),
    flex: 1,
    minWidth: 0,
    color: done ? c.value.dim : c.value.text,
    textDecoration: done ? 'line-through' : 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  })
}
function tagStyle(tag: string) {
  return pxify({ ...tagChip(c.value, tag, dark.value), alignSelf: 'center', flexShrink: 0 })
}
const footer = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, opacity: 0.8 }))
const empty = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, padding: '12px 0' }))
</script>

<template>
  <div :style="wrap">
    <!-- The pane's own header says "Next up"; this says what that means. -->
    <div :style="head">
      <span :style="sub">First open subtasks of each todo</span>
    </div>
    <div :style="list">
      <div v-for="r in rows" :key="r.sub.id" :style="row">
        <button
          type="button"
          class="nu-box"
          :class="{ 'is-done': r.sub.status === 'done', 'is-pop': popping === r.sub.id }"
          :aria-label="r.sub.status === 'done' ? 'Mark not done' : 'Mark done'"
          :aria-pressed="r.sub.status === 'done'"
          @click="tick(r.sub.id)"
        >
          <Icon name="check" size="xs" class="nu-box__tick" />
        </button>
        <span :style="text(r.sub.status === 'done')" :title="r.sub.text">{{
          r.sub.text || '(untitled)'
        }}</span>
        <span v-if="r.parent.tag" :style="tagStyle(r.parent.tag)">{{ r.parent.tag }}</span>
        <button
          type="button"
          class="nu-focus"
          title="Focus on this"
          aria-label="Focus on this"
          :disabled="r.sub.status === 'done'"
          @click="ui.startFocus(r.sub.id)"
        >
          <Icon name="timer" size="sm" />
        </button>
      </div>
      <div v-if="!rows.length" :style="empty">
        No open subtasks. Add subtasks to a todo and the next ones show up here.
      </div>
    </div>
    <span :style="footer">Select a todo for its full details</span>
  </div>
</template>

<style scoped>
.nu-box {
  position: relative;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-control);
  border: 1.5px solid color-mix(in srgb, var(--theme-text) 45%, transparent);
  background: transparent;
  color: var(--theme-on-accent);
  cursor: pointer;
  transition:
    transform 0.35s cubic-bezier(0.3, 1.9, 0.5, 1),
    background 0.2s ease,
    border-color 0.2s ease;
}
.nu-box.is-done {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.nu-box.is-pop {
  transform: scale(1.25);
}
.nu-box__tick {
  opacity: 0;
}
.nu-box.is-done .nu-box__tick {
  opacity: 1;
}
.nu-focus {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.nu-focus:hover:not(:disabled) {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
}
.nu-focus:disabled {
  opacity: 0.35;
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .nu-box {
    transition: none;
  }
  .nu-box.is-pop {
    transform: none;
  }
}
</style>
