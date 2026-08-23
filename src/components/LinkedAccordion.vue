<script setup lang="ts">
// One node of the linked-items tree, rendered recursively (it references itself
// by filename). A compact row — status checkbox, title, collection badge, due,
// unlink — plus, when it has linked children, a chevron and a height-animated
// body that nests each child as another <LinkedAccordion> one level deeper.
// Shared verbatim by the Todos/Tasks lists and the detail dialog (no branching);
// the parent card in the lists hosts these for its children.
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { pxify, typeStep } from '@/styles'
import { MAX_LINK_DEPTH } from '@/utils/links'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import type { LinkRef, Task, Todo } from '@/types'
import Icon from '@/components/ui/Icon.vue'

const props = withDefaults(
  defineProps<{
    itemRef: LinkRef
    depth?: number
    parentRef?: LinkRef | null
    isRoot?: boolean
    defaultExpanded?: boolean
  }>(),
  { depth: 0, parentRef: null, isRoot: false, defaultExpanded: false },
)

const app = useAppStore()
const { c } = useStyles()
const accordion = useAccordionState()

const item = computed<Todo | Task | undefined>(() => app.linkableById(props.itemRef))
const itemKey = computed(() => props.itemRef.collection + ':' + props.itemRef.id)
const type = computed<'todo' | 'task'>(() =>
  props.itemRef.collection === 'todos' ? 'todo' : 'task',
)
const title = computed(() => {
  const it = item.value
  if (!it) return '(missing)'
  return ('text' in it ? it.text : (it as Task).title) || '(untitled)'
})
const done = computed(() => item.value?.status === 'done')
const due = computed(() => {
  const it = item.value
  return it && 'deadline' in it ? (it as Task).deadline : ''
})
const pending = computed(() => app.isItemPending(type.value, props.itemRef.id))

// Direct children (only render within the depth limit — links can't exceed it).
const children = computed<LinkRef[]>(() =>
  props.depth < MAX_LINK_DEPTH ? (item.value?.linked ?? []) : [],
)
const hasChildren = computed(() => children.value.length > 0)
const progress = computed(() => app.linkProgressOf(props.itemRef))

const expanded = computed(() => accordion.isOpen(itemKey.value, props.defaultExpanded))
function toggleExpand() {
  accordion.toggle(itemKey.value, props.defaultExpanded)
}

// Breadcrumb for a top-level orphan: it has parents but is not nested under any
// of them here, so name them ("part of ‹…›") to keep the relationship visible.
const breadcrumb = computed(() => {
  if (!props.isRoot) return ''
  const parents = item.value?.parents ?? []
  const names = parents
    .map((p) => {
      const pi = app.linkableById(p)
      return pi ? ('text' in pi ? pi.text : (pi as Task).title) : ''
    })
    .filter(Boolean)
  return names.length ? names.join(', ') : ''
})

function toggleDone() {
  if (props.itemRef.collection === 'todos') app.toggleTodo(props.itemRef.id)
  else app.toggleTask(props.itemRef.id)
}
function openDetail() {
  app.openEdit(type.value, props.itemRef.id)
}
function unlink() {
  if (props.parentRef) app.unlinkItems(props.parentRef, props.itemRef)
}

// --- styles -----------------------------------------------------------------
const rowStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderRadius: 10,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    position: 'relative',
  }),
)
const chevronStyle = computed(() =>
  pxify({
    width: 18,
    height: 18,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    transform: expanded.value ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform .25s ease',
  }),
)
const chevronSpacer = pxify({ width: 18, flexShrink: 0 })
function boxStyle() {
  return pxify({
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 5,
    border: '1.5px solid ' + (done.value ? c.value.accent : c.value.border),
    background: done.value ? c.value.accent : 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  })
}
const titleStyle = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    ...typeStep('sm'),
    color: c.value.text,
    textDecoration: done.value ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }),
)
const badgeStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 6,
    background: c.value.input,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const dueStyle = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim, flexShrink: 0 }))
const countChip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    color: c.value.dim,
    padding: '1px 6px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    flexShrink: 0,
  }),
)
const unlinkBtn = computed(() =>
  pxify({
    border: 'none',
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    ...typeStep('base'),
    lineHeight: 1,
    flexShrink: 0,
  }),
)
const breadcrumbStyle = computed(() =>
  pxify({ ...typeStep('2xs'), color: c.value.dim, padding: '2px 0 0 26px' }),
)
const progressWrap = pxify({ padding: '4px 4px 0' })
// The children body: a 0fr→1fr grid so height animates with no jump; the inner
// wrapper carries the indent + a subtle left rail connecting the children.
const bodyOuter = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateRows: expanded.value ? '1fr' : '0fr',
    transition: 'grid-template-rows .3s cubic-bezier(.4,1,.4,1)',
  }),
)
const bodyClip = pxify({ overflow: 'hidden', minHeight: 0 })
const bodyInner = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 6,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeft: '1.5px solid ' + c.value.border,
  }),
)
const nodeWrap = pxify({ display: 'flex', flexDirection: 'column' })
</script>

<template>
  <div v-if="item" :style="nodeWrap">
    <div :style="rowStyle">
      <button
        v-if="hasChildren"
        type="button"
        :style="chevronStyle"
        :aria-label="expanded ? 'Collapse' : 'Expand'"
        :aria-expanded="expanded"
        @click="toggleExpand"
      >
        <Icon name="chevron-right" size="xs" :style="{ color: c.dim }" />
      </button>
      <span v-else :style="chevronSpacer"></span>

      <button type="button" :style="boxStyle()" aria-label="Toggle done" @click="toggleDone">
        <Icon v-if="done" name="check" size="xs" :style="{ color: c.onAccent }" />
      </button>

      <span :style="titleStyle" @click="openDetail">{{ title }}</span>
      <span v-if="due" :style="dueStyle">{{ due }}</span>
      <span v-if="hasChildren" :style="countChip">{{ progress.done }}/{{ progress.total }}</span>
      <OfflineChip :pending="pending" />
      <span :style="badgeStyle">{{ type === 'todo' ? 'Todo' : 'Task' }}</span>
      <button
        v-if="parentRef"
        type="button"
        :style="unlinkBtn"
        aria-label="Unlink"
        @click.stop="unlink"
      >
        ×
      </button>
    </div>

    <span v-if="breadcrumb" :style="breadcrumbStyle">part of ‹{{ breadcrumb }}›</span>

    <div v-if="hasChildren" :style="progressWrap">
      <ProgressBar :value="progress.done" :max="progress.total" size="sm" />
    </div>

    <div v-if="hasChildren" :style="bodyOuter">
      <div :style="bodyClip">
        <div :style="bodyInner">
          <LinkedAccordion
            v-for="child in children"
            :key="child.collection + ':' + child.id"
            :item-ref="child"
            :depth="depth + 1"
            :parent-ref="itemRef"
            :is-root="false"
            :default-expanded="defaultExpanded"
          />
        </div>
      </div>
    </div>
  </div>
</template>
