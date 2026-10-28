<script setup lang="ts">
// A quick look at what the AI chat made — todos, tasks, goals, reminders,
// notes — without leaving the chat: each item's kind, title, state, date,
// description and sub-items, read live from the store, with Open for the full
// view. After a "New items" card it also offers Undo for the whole batch.
import { computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app'
import { buildIndex, childrenOf } from '@/utils/taskTree'
import { richPlain } from '@/utils/richText'
import { noteLabel } from '@/utils/notes'
import type { AiItemRef } from '@/types'

const props = defineProps<{ open: boolean; items: AiItemRef[]; undoable?: boolean }>()
const emit = defineEmits<{ close: []; undo: [] }>()
const app = useAppStore()

interface Look {
  key: string
  ref: AiItemRef
  kind: string
  icon: IconName
  title: string
  done: boolean
  when: string
  body: string
  subLabel: string
  subs: { title: string; done: boolean }[]
}

const KIND: Record<AiItemRef['kind'], { label: string; icon: IconName; sub: string }> = {
  todo: { label: 'Todo', icon: 'check-square', sub: 'Sub-todos' },
  task: { label: 'Task', icon: 'list-checks', sub: 'Subtasks' },
  goal: { label: 'Milestone', icon: 'target', sub: 'Steps' },
  reminder: { label: 'Reminder', icon: 'bell', sub: '' },
  note: { label: 'Note', icon: 'notebook', sub: '' },
}

function look(ref: AiItemRef): Look | null {
  const base = {
    key: `${ref.kind}:${ref.id}`,
    ref,
    kind: KIND[ref.kind].label,
    icon: KIND[ref.kind].icon,
  }
  switch (ref.kind) {
    case 'todo': {
      const t = app.todos.find((x) => x.id === ref.id)
      if (!t) return null
      const subs = childrenOf(buildIndex(app.todos), t.id)
      return {
        ...base,
        title: t.text,
        done: t.done,
        when: '',
        body: richPlain(t.description),
        subLabel: KIND.todo.sub,
        subs: subs.map((s) => ({ title: s.text, done: s.done })),
      }
    }
    case 'task': {
      const t = app.tasks.find((x) => x.id === ref.id)
      if (!t) return null
      const subs = childrenOf(buildIndex(app.tasks), t.id)
      const start = t.startAt ? new Date(t.startAt).toLocaleString() : ''
      return {
        ...base,
        title: t.title,
        done: t.done,
        when: start || (t.deadline ? `Due ${t.deadline}` : ''),
        body: richPlain(t.notes),
        subLabel: KIND.task.sub,
        subs: subs.map((s) => ({ title: s.title, done: s.done })),
      }
    }
    case 'goal': {
      const g = app.goals.find((x) => x.id === ref.id)
      if (!g) return null
      const steps = app.goalChecklist
        .filter((c) => c.goalId === g.id)
        .sort((a, b) => a.order - b.order)
      return {
        ...base,
        title: g.title,
        done: g.status === 'done',
        when: g.targetDate ? `Target ${g.targetDate}` : '',
        body: richPlain(g.description),
        subLabel: KIND.goal.sub,
        subs: steps.map((s) => ({ title: s.text, done: s.done })),
      }
    }
    case 'reminder': {
      const r = app.reminders.find((x) => x.id === ref.id)
      if (!r) return null
      return {
        ...base,
        title: r.title,
        done: false,
        when: r.start ? new Date(r.start).toLocaleString() : '',
        body: r.note,
        subLabel: '',
        subs: [],
      }
    }
    case 'note': {
      const n = app.notes.find((x) => x.id === ref.id)
      if (!n) return null
      return {
        ...base,
        title: noteLabel(n),
        done: false,
        when: '',
        body: richPlain(n.text),
        subLabel: '',
        subs: [],
      }
    }
  }
}

const looks = computed(() => props.items.map(look).filter((l): l is Look => !!l))
const gone = computed(() => props.items.length - looks.value.length)
const title = computed(() => {
  const n = looks.value.length
  return n === 1 ? `${looks.value[0].kind}: quick look` : `Made from this chat · ${n}`
})

function openFull(r: AiItemRef) {
  emit('close')
  if (r.kind === 'task') app.openTaskDialog(r.id)
  else if (r.kind === 'goal') app.openGoalDialog(r.id)
  else if (r.kind === 'reminder') app.openReminderDialog(r.id)
  else if (r.kind === 'note') app.openNoteView(r.id)
  else app.openEdit('todo', r.id)
}
</script>

<template>
  <Modal :open="open" :title="title" size="md" @close="emit('close')">
    <div class="aql">
      <article v-for="l in looks" :key="l.key" class="aql__card">
        <header class="aql__head">
          <span class="aql__icon" aria-hidden="true"><Icon :name="l.icon" size="sm" /></span>
          <span class="aql__titles">
            <span class="aql__kind">{{ l.kind }}<template v-if="l.done"> · done</template></span>
            <span class="aql__title" :class="{ 'is-done': l.done }">{{ l.title }}</span>
            <span v-if="l.when" class="aql__when"
              ><Icon name="calendar" size="xs" />{{ l.when }}</span
            >
          </span>
          <Button variant="ghost" size="sm" @click="openFull(l.ref)">Open</Button>
        </header>
        <p v-if="l.body" class="aql__body">{{ l.body }}</p>
        <div v-if="l.subs.length" class="aql__subs">
          <span class="aql__subhead">{{ l.subLabel }} · {{ l.subs.length }}</span>
          <ul>
            <li v-for="(s, i) in l.subs" :key="i" :class="{ 'is-done': s.done }">
              <Icon :name="s.done ? 'check' : 'corner-down-right'" size="xs" />
              <span>{{ s.title }}</span>
            </li>
          </ul>
        </div>
      </article>
      <p v-if="gone" class="aql__gone">
        {{ gone }} item{{ gone === 1 ? ' was' : 's were' }} deleted since.
      </p>
      <p v-if="!looks.length" class="aql__gone">Nothing left to show.</p>
    </div>
    <template #footer>
      <Button v-if="undoable && looks.length" variant="ghost" @click="emit('undo')">Undo</Button>
      <Button variant="primary" @click="emit('close')">Done</Button>
    </template>
  </Modal>
</template>

<style scoped>
.aql {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-height: 65vh;
  overflow-y: auto;
  min-width: 0;
}
.aql__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 7%, transparent);
  animation: aqlIn 240ms ease both;
}
.aql__head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  min-width: 0;
}
.aql__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.aql__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.aql__kind {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.aql__title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.aql__title.is-done {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.aql__when {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.aql__body {
  margin: 0;
  min-width: 0;
  max-height: 9em;
  overflow-y: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.aql__subs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.aql__subhead {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.aql__subs ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.aql__subs li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
}
.aql__subs li :deep(svg) {
  flex-shrink: 0;
  color: var(--theme-dim);
}
.aql__subs li.is-done span {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.aql__gone {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@keyframes aqlIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .aql__card {
    animation: none;
  }
}
</style>
