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
import { pxify, typeStep, tagChip, itemTitle } from '@/styles'
import { buildIndex } from '@/utils/taskTree'
import { nextUpOf } from '@/utils/todoV2'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SubCheck from '@/components/ui/SubCheck.vue'
import type { Todo, Task } from '@/types'
import { vScrollFade } from '@/directives/scrollFade'

const props = withDefaults(
  defineProps<{ roots: (Todo | Task)[]; collection?: 'todos' | 'tasks' }>(),
  { collection: 'todos' },
)
const emit = defineEmits<{ select: [id: number] }>()
const noun = computed(() => (props.collection === 'tasks' ? 'task' : 'todo'))
const title = (item: Todo | Task) => ('text' in item ? item.text : item.title)

const app = useAppStore()
const ui = useUiStore()
const { todos, tasks } = storeToRefs(app)
const { c, dark } = useStyles()

const index = computed(() =>
  buildIndex<Todo | Task>(props.collection === 'tasks' ? tasks.value : todos.value),
)
// Ticked from here this session: stays listed, struck through, rather than
// vanishing under the pointer.
const kept = ref(new Set<number>())
const rows = computed(() => nextUpOf(index.value, props.roots, kept.value))

function tick(id: number) {
  kept.value = new Set(kept.value).add(id)
  if (props.collection === 'tasks') app.toggleTask(id)
  else app.toggleTodo(id)
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', minHeight: 0 })
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
    ...itemTitle(),
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
  return pxify({
    ...tagChip(c.value, tag, dark.value),
    alignSelf: 'center',
    flexShrink: 0,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
  })
}
const footer = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, opacity: 0.8 }))
const empty = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, padding: '12px 0' }))
</script>

<template>
  <div :style="wrap">
    <!-- The pane's own header says "Next up" and what that means. -->
    <div v-scroll-fade :style="list">
      <div v-for="r in rows" :key="r.sub.id" :style="row">
        <SubCheck :done="r.sub.status === 'done'" @toggle="tick(r.sub.id)" />
        <span :style="text(r.sub.status === 'done')" :title="title(r.sub)">{{
          title(r.sub) || '(untitled)'
        }}</span>
        <span v-if="r.parent.tag" :style="tagStyle(r.parent.tag)">{{
          r.parent.tag.toLocaleUpperCase()
        }}</span>
        <IconButton
          v-if="collection === 'todos'"
          label="Focus on this"
          size="sm"
          :disabled="r.sub.status === 'done'"
          @click="ui.startFocus(r.sub.id)"
        >
          <Icon name="timer" size="md" />
        </IconButton>
        <IconButton v-else label="Open task details" size="sm" @click="emit('select', r.sub.id)"
          ><Icon name="arrow-right" size="md"
        /></IconButton>
      </div>
      <div v-if="!rows.length" :style="empty">
        No open subtasks. Add subtasks to a {{ noun }} and the next ones show up here.
      </div>
    </div>
    <span :style="footer">Select a {{ noun }} for its full details</span>
  </div>
</template>
