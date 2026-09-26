<script setup lang="ts">
// Natural-language quick add (Todo v2, 5a). It sits where the tag filter used
// to, at the top of the list column, and replaces the create dialog for the
// common case: type "Call vendor fri 5pm #CRM !high", press Enter, and the todo
// and its reminder are made together. The parse runs on every keystroke and
// shows what it understood as chips under the field, so nothing is inferred
// silently.
//
// DETAILS, on demand. The create dialog this replaced asked for a description
// and a tag, and a one-line field silently dropped both. The caret at the end
// of the line unfolds them under the field: the same TagPicker the dialog
// uses, and a description. "+ New todo" and /n open the field with the
// details already unfolded; a typed #tag still wins over the picked one.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { parseQuickAdd, quickAddReminderStart } from '@/utils/quickAdd'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Caret from '@/components/ui/Caret.vue'
import Icon from '@/components/ui/Icon.vue'
import Chip from '@/components/ui/Chip.vue'
import TagPicker from '@/components/TagPicker.vue'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ added: [id: number] }>()

const app = useAppStore()
const { todos } = storeToRefs(app)
const { c } = useStyles()

const text = ref('')
const parsed = computed(() => parseQuickAdd(text.value))
const field = ref<InstanceType<typeof TextInput> | null>(null)

const detailsOpen = ref(false)
const tag = ref('')
const description = ref('')
const hasDetails = computed(() => !!tag.value || !!description.value.trim())

function submit() {
  const q = parseQuickAdd(text.value)
  if (!q.title) return
  // New todos enter at the top of the list, where the reader is looking.
  const rootOrders = todos.value.filter((t) => t.parentId == null).map((t) => t.order)
  const order = rootOrders.length ? Math.min(...rootOrders) - 1 : 0
  const id = app.addTodo(q.title, q.tag || tag.value, description.value.trim(), { order })
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
  tag.value = ''
  description.value = ''
  emit('added', id)
}
function onEscape() {
  if (text.value) text.value = ''
  else detailsOpen.value = false
}

defineExpose({
  /** Focus the field; `withDetails` also unfolds the description and tag. */
  focus: (withDetails = false) => {
    if (withDetails) detailsOpen.value = true
    field.value?.focus()
  },
})

// --- styles -----------------------------------------------------------------
const box = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: '8px 12px',
    borderRadius: 14,
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
const inputStyle = pxify({ flex: 1, minWidth: 0 })
const details = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    paddingTop: 'var(--sp-2)',
    borderTop: '1px solid ' + c.value.border,
  }),
)
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
        @keydown.esc="onEscape"
      />
      <span v-if="!compact" :style="hint" aria-hidden="true">↵</span>
      <IconButton
        size="sm"
        tone="default"
        :label="detailsOpen ? 'Hide description and tag' : 'Add a description and a tag'"
        :active="detailsOpen || hasDetails"
        @click="detailsOpen = !detailsOpen"
      >
        <Caret :open="detailsOpen" size="sm" />
      </IconButton>
    </div>
    <div v-if="parsed.chips.length" :style="chips" aria-live="polite">
      <Chip
        v-for="ch in parsed.chips"
        :key="ch.kind"
        tone="accent"
        :icon="ch.icon"
        :label="ch.text"
      />
    </div>
    <div v-if="detailsOpen" :style="details">
      <!-- Both fields draw their own labels, the same ones the dialog shows. -->
      <TextArea
        v-model="description"
        label="Description"
        size="sm"
        :rows="2"
        placeholder="What this is about, for the details pane"
        @keydown.esc="onEscape"
      />
      <TagPicker v-model="tag" label="Tag" />
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
