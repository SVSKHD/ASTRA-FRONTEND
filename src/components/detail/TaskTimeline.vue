<script setup lang="ts">
// A task's place on the Timeline: the entries it is linked to, a way to link
// one that already exists, and New entry — which opens the editor already
// linked to this task. Sits beside the task's Notes, in the right-hand pane
// (`as="pane"`) and in the detail dialog (`as="dialog"`), with the same rows.
//
// The link lives on the entry (utils/timeline.ts), so this reads entries by
// task id rather than reading anything off the task.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import {
  TIMELINE_STATUS_LABEL,
  sortTimeline,
  timelineDayLabel,
  timelineLabel,
} from '@/utils/timeline'
import Icon from '@/components/ui/Icon.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import DetailSection from '@/components/detail/DetailSection.vue'
import PaneButton from '@/components/detail/PaneButton.vue'

const props = withDefaults(
  defineProps<{ taskId: number; kind?: 'task' | 'todo'; as?: 'pane' | 'dialog' }>(),
  {
    as: 'pane',
    kind: 'task',
  },
)

const app = useAppStore()
const { timeline } = storeToRefs(app)

const linked = computed(() => {
  void timeline.value
  return props.kind === 'todo' ? app.timelineForTodoId(props.taskId) : app.timelineFor(props.taskId)
})
// Entries this task is not on yet, newest first — what Link offers.
const linkable = computed(() =>
  sortTimeline(
    timeline.value.filter(
      (e) => !(props.kind === 'todo' ? e.todoIds : e.taskIds).includes(props.taskId),
    ),
  ),
)

const picking = ref(false)
watch(
  () => props.taskId,
  () => (picking.value = false),
)

function link(entryId: number) {
  ;(props.kind === 'todo' ? app.linkTimelineTodo : app.linkTimelineTask)(
    entryId,
    props.taskId,
    true,
  )
  picking.value = false
  app.showToastMsg('Linked to the timeline entry')
}
function unlink(entryId: number) {
  ;(props.kind === 'todo' ? app.linkTimelineTodo : app.linkTimelineTask)(
    entryId,
    props.taskId,
    false,
  )
  app.showToastMsg('Unlinked — the entry is still on the timeline')
}

const wrapper = computed(() =>
  props.as === 'pane'
    ? {
        is: PaneSection,
        attrs: {
          title: 'Timeline',
          storageKey: props.kind + ':timeline',
          count: linked.value.length || undefined,
        },
      }
    : {
        is: DetailSection,
        attrs: {
          label: 'Timeline',
          collapsible: true,
          hint: linked.value.length ? String(linked.value.length) : '',
        },
      },
)
</script>

<template>
  <component :is="wrapper.is" v-bind="wrapper.attrs">
    <template #actions>
      <PaneButton
        v-if="timeline.length > linked.length"
        icon="paperclip"
        label="Link"
        show-label
        :active="picking"
        @click="picking = !picking"
      />
      <PaneButton
        icon="plus"
        label="New entry"
        show-label
        tone="accent"
        @click="
          app.newTimelineEntry(kind === 'todo' ? { todoIds: [taskId] } : { taskIds: [taskId] })
        "
      />
    </template>

    <!-- Link: the entries this task is not on, in the flow rather than a
         popover, since the section body clips. -->
    <div v-if="picking" class="ttl__pick" role="group" aria-label="Link a timeline entry">
      <div class="ttl__pick-head">
        <span>Link to an entry</span>
        <PaneButton icon="x" label="Close" @click="picking = false" />
      </div>
      <button
        v-for="e in linkable.slice(0, 12)"
        :key="e.id"
        type="button"
        class="ttl__row ttl__row--pick"
        :class="'is-' + e.status"
        @click="link(e.id)"
      >
        <span class="ttl__dot" aria-hidden="true" />
        <span class="ttl__date">{{ timelineDayLabel(e.date) }}</span>
        <span class="ttl__title">{{ timelineLabel(e) }}</span>
        <Icon name="plus" size="xs" class="ttl__go" />
      </button>
    </div>

    <div v-if="!linked.length && !picking" class="ttl__empty">
      <span class="ttl__empty-icon"><Icon name="clock" size="md" /></span>
      <span class="ttl__empty-text">
        <strong>Not on the timeline yet</strong>
        <span>Write up the feature this item builds, or link an entry you already have.</span>
      </span>
    </div>

    <ul v-if="linked.length" class="ttl__list">
      <li v-for="e in linked" :key="e.id" class="ttl__row" :class="'is-' + e.status">
        <button type="button" class="ttl__open" @click="app.openTimelineEntry(e.id)">
          <span class="ttl__dot" aria-hidden="true" />
          <span class="ttl__date">{{ timelineDayLabel(e.date) }}</span>
          <span class="ttl__title">{{ timelineLabel(e) }}</span>
          <span class="ttl__status">{{ TIMELINE_STATUS_LABEL[e.status] }}</span>
        </button>
        <PaneButton icon="x" label="Unlink from this item" @click="unlink(e.id)" />
      </li>
    </ul>
  </component>
</template>

<style scoped>
.ttl__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ttl__row {
  --ttl-dot: var(--theme-dim);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.ttl__row.is-progress {
  --ttl-dot: var(--theme-accent);
}
.ttl__row.is-shipped {
  --ttl-dot: var(--theme-success);
}
.ttl__open,
.ttl__row--pick {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-fast, 0.15s) ease;
}
.ttl__open:hover,
.ttl__row--pick:hover {
  border-color: var(--ttl-dot);
}
.ttl__open:focus-visible,
.ttl__row--pick:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.ttl__dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border: 2px solid var(--ttl-dot);
  border-radius: 50%;
}
.ttl__row.is-progress .ttl__dot,
.ttl__row.is-shipped .ttl__dot {
  background: var(--ttl-dot);
}
.ttl__date {
  flex-shrink: 0;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.ttl__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ttl__status {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--ttl-dot) 16%, transparent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.ttl__go {
  flex-shrink: 0;
  color: var(--theme-accent);
}
.ttl__pick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 40%, var(--glass-border));
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--theme-accent) 5%, transparent);
}
.ttl__pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ttl__empty {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-control);
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.ttl__empty-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}
.ttl__empty-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ttl__empty-text strong {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
</style>
