<script setup lang="ts">
// Natural-language quick add (Todo v2, 5a). It sits where the tag filter used
// to, at the top of the list column, and replaces the create dialog for the
// common case: type "Call vendor fri 5pm #CRM !high", press Enter, and the todo
// and its reminder are made together. The parse runs on every keystroke and
// shows what it understood as chips under the field, so nothing is inferred
// silently.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { parseQuickAdd, quickAddReminderStart } from '@/utils/quickAdd'
import TextInput from '@/components/ui/TextInput.vue'
import Icon from '@/components/ui/Icon.vue'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ added: [id: number] }>()

const app = useAppStore()
const { todos } = storeToRefs(app)
const { c } = useStyles()

const text = ref('')
const parsed = computed(() => parseQuickAdd(text.value))
const field = ref<InstanceType<typeof TextInput> | null>(null)

function submit() {
  const q = parseQuickAdd(text.value)
  if (!q.title) return
  // New todos enter at the top of the list, where the reader is looking.
  const rootOrders = todos.value.filter((t) => t.parentId == null).map((t) => t.order)
  const order = rootOrders.length ? Math.min(...rootOrders) - 1 : 0
  const id = app.addTodo(q.title, q.tag, '', { order })
  if (id == null) return
  const start = quickAddReminderStart(q)
  if (start) {
    app.createReminderFromItem('todos', id, {
      start,
      repeat: q.repeat ? { type: q.repeat, n: 1 } : { type: 'none' },
      priority: q.priority ?? 'normal',
    })
  }
  text.value = ''
  emit('added', id)
}

defineExpose({ focus: () => field.value?.focus() })

// --- styles -----------------------------------------------------------------
const box = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-card)',
    background: c.value.input,
    border:
      '1px solid ' +
      (text.value ? 'color-mix(in srgb, ' + c.value.accent + ' 50%, transparent)' : c.value.border),
    transition: 'border-color .2s ease',
  }),
)
const line = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
const hint = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, fontFamily: 'var(--font-mono)', flexShrink: 0 }),
)
const chips = pxify({ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 26 })
const chip = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 'var(--radius-pill)',
    background: 'color-mix(in srgb, ' + c.value.accent + ' 12%, transparent)',
    border: '1px solid color-mix(in srgb, ' + c.value.accent + ' 32%, transparent)',
    color: c.value.text,
    ...typeStep('xs'),
  }),
)
const inputStyle = pxify({ flex: 1, minWidth: 0 })
</script>

<template>
  <div :style="box" class="quick-add">
    <div :style="line">
      <Icon name="plus" size="sm" :style="{ color: c.accent }" />
      <TextInput
        ref="field"
        v-model="text"
        class="quick-add__field"
        size="sm"
        :style="inputStyle"
        aria-label="Add a todo"
        :placeholder="compact ? 'Add a todo…' : 'Add a todo… try “Call vendor fri 5pm #CRM !high”'"
        @keydown.enter.prevent="submit"
        @keydown.esc="text = ''"
      />
      <span v-if="!compact" :style="hint" aria-hidden="true">↵</span>
    </div>
    <div v-if="parsed.chips.length" :style="chips" aria-live="polite">
      <span v-for="ch in parsed.chips" :key="ch.kind" :style="chip">
        <Icon :name="ch.icon" size="xs" :style="{ color: c.accent }" />{{ ch.text }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* The field is the box: TextInput's own frame would be a box inside a box. Its
   focus ring moves out to the box instead. */
.quick-add__field :deep(.ui-control),
.quick-add__field :deep(.ui-control:focus-within) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  outline: none;
}
.quick-add:focus-within {
  border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent) !important;
}
</style>
