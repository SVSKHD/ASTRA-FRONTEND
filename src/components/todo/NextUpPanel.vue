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
import IconButton from '@/components/ui/IconButton.vue'
import SubCheck from '@/components/ui/SubCheck.vue'
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

function tick(id: number) {
  kept.value = new Set(kept.value).add(id)
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
        <SubCheck :done="r.sub.status === 'done'" @toggle="tick(r.sub.id)" />
        <span :style="text(r.sub.status === 'done')" :title="r.sub.text">{{
          r.sub.text || '(untitled)'
        }}</span>
        <span v-if="r.parent.tag" :style="tagStyle(r.parent.tag)">{{ r.parent.tag }}</span>
        <IconButton
          label="Focus on this"
          size="sm"
          :disabled="r.sub.status === 'done'"
          @click="ui.startFocus(r.sub.id)"
        >
          <Icon name="timer" size="sm" />
        </IconButton>
      </div>
      <div v-if="!rows.length" :style="empty">
        No open subtasks. Add subtasks to a todo and the next ones show up here.
      </div>
    </div>
    <span :style="footer">Select a todo for its full details</span>
  </div>
</template>
