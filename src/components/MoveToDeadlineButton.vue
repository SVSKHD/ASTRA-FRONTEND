<script setup lang="ts">
// "Move to Deadlines" for a todo, task, idea or reminder.
//
// A small calendar button that opens a popover with a date picker (pre-filled
// from the item's own date when it has one — a task's due date, an idea's
// deadline, a reminder's start — otherwise today) and a Move action. The store
// does the move (app.moveToDeadline): the deadline is created, the original is
// archived (todos, tasks) or removed (ideas, reminders), and the toast's Undo
// reverses the whole thing.
//
// The picker is rendered INLINE on purpose: its default popup is teleported to
// <body>, and a click inside it would count as "outside" this popover and close
// it before the date landed.
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { todayKey } from '@/utils/rollover'
import Popover from '@/components/ui/Popover.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Icon from '@/components/ui/Icon.vue'

export type DeadlineMovable = 'todo' | 'task' | 'idea' | 'reminder'

const props = withDefaults(
  defineProps<{
    type: DeadlineMovable
    itemId: number
    /** A YYYY-MM-DD (or a datetime starting with one) to pre-fill. */
    defaultDue?: string
  }>(),
  { defaultDue: '' },
)
const emit = defineEmits<{ moved: [deadlineId: number] }>()

const app = useAppStore()
const open = ref(false)
const due = ref('')

const NOUN: Record<DeadlineMovable, string> = {
  todo: 'todo',
  task: 'task',
  idea: 'idea',
  reminder: 'reminder',
}

function toggle() {
  if (!open.value) {
    const d = props.defaultDue || ''
    due.value = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : todayKey()
  }
  open.value = !open.value
}
function onPick(value: unknown) {
  due.value = typeof value === 'string' ? value : ''
}
function move() {
  if (!due.value) return
  const deadlineId = app.moveToDeadline(props.type, props.itemId, due.value)
  open.value = false
  if (deadlineId != null) emit('moved', deadlineId)
}
</script>

<template>
  <Popover :open="open" align="end" @close="open = false">
    <template #trigger>
      <button
        type="button"
        class="mtd__trigger"
        :class="{ 'is-open': open }"
        title="Move to Deadlines"
        aria-label="Move to Deadlines"
        :aria-expanded="open"
        @pointerdown.stop
        @click.stop="toggle"
      >
        <Icon name="calendar" size="sm" />
      </button>
    </template>

    <div class="mtd__panel" @pointerdown.stop @click.stop>
      <div class="mtd__title">Move to Deadlines</div>
      <p class="mtd__hint">
        This {{ NOUN[type] }} becomes a deadline on the date you pick.
        <template v-if="type === 'todo' || type === 'task'"
          >The original is archived, not deleted.</template
        >
      </p>
      <GlassDatePicker :model-value="due" inline :clearable="false" @update:model-value="onPick" />
      <div class="mtd__actions">
        <button type="button" class="mtd__btn" @click="open = false">Cancel</button>
        <button type="button" class="mtd__btn is-primary" :disabled="!due" @click="move">
          Move{{ due ? ' · ' + due : '' }}
        </button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.mtd__trigger {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    color var(--dur-fast) ease,
    background-color var(--dur-fast) ease;
}
.mtd__trigger:hover,
.mtd__trigger.is-open {
  color: var(--theme-text);
  background: var(--theme-card);
}
.mtd__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 300px;
  max-width: 86vw;
  padding: var(--sp-1);
  cursor: default;
}
.mtd__title {
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.mtd__hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
.mtd__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
.mtd__btn {
  padding: 6px 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.mtd__btn.is-primary {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.mtd__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
