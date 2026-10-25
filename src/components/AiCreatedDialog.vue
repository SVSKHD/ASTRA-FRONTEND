<script setup lang="ts">
// The pop-up after a chat reply's "Create" card runs: what was made, each with
// an Open, and one Undo that takes the whole batch back.
import { computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app'
import type { AiCreated } from '@/composables/useAiChat'

const props = defineProps<{ open: boolean; created: AiCreated[] }>()
const emit = defineEmits<{ close: []; undo: [] }>()
const app = useAppStore()

const KIND: Record<AiCreated['kind'], { label: string; icon: IconName; sub: string }> = {
  todo: { label: 'Todo', icon: 'check-square', sub: 'sub-todo' },
  task: { label: 'Task', icon: 'list-checks', sub: 'subtask' },
  goal: { label: 'Goal', icon: 'target', sub: 'step' },
}

const title = computed(() => {
  const n = props.created.length
  return `Created ${n} item${n === 1 ? '' : 's'}`
})

function subLine(c: AiCreated): string {
  const n = c.childIds.length
  const parts: string[] = []
  if (c.due) parts.push(c.kind === 'goal' ? `target ${c.due}` : `due ${c.due}`)
  if (n) parts.push(`${n} ${KIND[c.kind].sub}${n === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function openItem(c: AiCreated) {
  emit('close')
  if (c.kind === 'task') app.openTaskDialog(c.id)
  else if (c.kind === 'goal') app.openGoalDialog(c.id)
  else app.openEdit('todo', c.id)
}
</script>

<template>
  <Modal :open="open" :title="title" size="sm" @close="emit('close')">
    <ul class="acd">
      <li v-for="c in created" :key="`${c.kind}:${c.id}`" class="acd__row">
        <span class="acd__icon" aria-hidden="true"><Icon :name="KIND[c.kind].icon" size="sm" /></span>
        <span class="acd__body">
          <span class="acd__kind">{{ KIND[c.kind].label }}</span>
          <span class="acd__title">{{ c.title }}</span>
          <span v-if="subLine(c)" class="acd__sub">{{ subLine(c) }}</span>
        </span>
        <Button variant="ghost" size="sm" @click="openItem(c)">Open</Button>
      </li>
    </ul>
    <template #footer>
      <Button variant="ghost" @click="emit('undo')">Undo</Button>
      <Button variant="primary" @click="emit('close')">Done</Button>
    </template>
  </Modal>
</template>

<style scoped>
.acd {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.acd__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
  animation: acdIn 260ms ease both;
}
.acd__row:nth-child(2) {
  animation-delay: 60ms;
}
.acd__row:nth-child(3) {
  animation-delay: 120ms;
}
.acd__icon {
  flex-shrink: 0;
  color: var(--theme-accent);
  display: inline-flex;
}
.acd__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.acd__kind {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.acd__title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.acd__sub {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@keyframes acdIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .acd__row {
    animation: none;
  }
}
</style>
