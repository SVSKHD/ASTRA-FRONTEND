<script setup lang="ts">
// Natural-language quick add (Todo v2, 5a). It sits at the top of the list
// column and replaces the create dialog for the common case: type "Call vendor
// fri 5pm #CRM !high", press Enter (or Add), and the item and its reminder are
// made together. The parse runs on every keystroke and shows what it understood
// as chips under the field, so nothing is inferred silently.
//
// THE LOOK is one calm card: a tinted "+" tile on the left, the field with no
// box of its own, and an "Add ↵" pill on the right. The focus ring belongs to
// the card, not to the field inside it.
//
// DETAILS, on demand. The "+" tile unfolds a description and the TagPicker
// under the field (it turns to × while they are open). "+ New todo" and /n open
// the field with the details already unfolded; a typed #tag still wins over the
// picked one.
//
// One box for three lists (`collection`): todos, tasks and ideas. The parse,
// the tag and the reminder work the same; only the list it adds to differs.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { parseQuickAdd, quickAddReminderStart } from '@/utils/quickAdd'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Icon from '@/components/ui/Icon.vue'
import Chip from '@/components/ui/Chip.vue'
import TagPicker from '@/components/TagPicker.vue'
import CollapseTransition from '@/components/ui/CollapseTransition.vue'

type QuickCollection = 'todos' | 'tasks' | 'ideas'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    collection?: QuickCollection
    /**
     * Add SUBTASKS of this todo rather than top-level todos (the details
     * pane). The new one goes to the end of the parent's subtasks — the order
     * they were thought of — and the card drops the list's scrollbar gutter,
     * which only exists to line it up with the list.
     */
    parentId?: number | null
  }>(),
  { compact: false, collection: 'todos', parentId: null },
)
const isSub = computed(() => props.parentId != null && props.collection === 'todos')
const emit = defineEmits<{ added: [id: number] }>()

const app = useAppStore()
const { todos, tasks, ideas } = storeToRefs(app)
const NOUN: Record<QuickCollection, string> = { todos: 'todo', tasks: 'task', ideas: 'idea' }
const EXAMPLE: Record<QuickCollection, string> = {
  todos: 'Call vendor fri 5pm #CRM !high',
  tasks: 'Ship invoice export fri #Billing',
  ideas: 'Referral rewards #Growth',
}
const noun = computed(() => (isSub.value ? 'subtask' : NOUN[props.collection]))
// "an idea", "a todo", "a task".
const aNoun = computed(() => (/^[aeiou]/.test(noun.value) ? 'an ' : 'a ') + noun.value)
const example = computed(() =>
  isSub.value ? 'Book the venue fri 5pm !high' : EXAMPLE[props.collection],
)

const text = ref('')
const parsed = computed(() => parseQuickAdd(text.value))
const field = ref<InstanceType<typeof TextInput> | null>(null)

const detailsOpen = ref(false)
const tag = ref('')
const description = ref('')
const hasDetails = computed(() => !!tag.value || !!description.value.trim())
const canAdd = computed(() => !!parsed.value.title)

function submit() {
  const q = parseQuickAdd(text.value)
  if (!q.title) return
  // New items enter at the top of the list, where the reader is looking.
  const list =
    props.collection === 'ideas'
      ? ideas.value
      : props.collection === 'tasks'
        ? tasks.value
        : todos.value
  const rootOrders = list.filter((t) => t.parentId == null).map((t) => t.order)
  const order = rootOrders.length ? Math.min(...rootOrders) - 1 : 0
  const pickedTag = q.tag || tag.value
  const desc = description.value.trim()
  // A subtask: made, then moved under its parent at the end of its subtasks.
  if (isSub.value && props.parentId != null) {
    const parentId = props.parentId
    const at = todos.value.filter((t) => t.parentId === parentId).length
    const subId = app.addTodo(q.title, pickedTag, desc)
    if (subId == null) return
    app.moveTodo(subId, parentId, at)
    finish(q, subId)
    return
  }
  const id =
    props.collection === 'ideas'
      ? app.addIdea(q.title, pickedTag, { description: desc, order })
      : props.collection === 'tasks'
        ? app.addTask(q.title, pickedTag, {
            notes: desc,
            order,
            ...(q.priority ? { priority: q.priority } : {}),
          })
        : app.addTodo(q.title, pickedTag, desc, { order })
  if (id == null) return
  finish(q, id)
}
// What every add ends with: the reminder the text asked for, a cleared field
// ready for the next one, and the id to whoever is listening.
function finish(q: ReturnType<typeof parseQuickAdd>, id: number) {
  const start = quickAddReminderStart(q)
  if (start) {
    app.createReminderFromItem(props.collection, id, {
      start,
      repeat: q.repeat ? { type: q.repeat, n: 1 } : { type: 'none' },
      priority: q.priority ?? 'normal',
    })
  }
  text.value = ''
  tag.value = ''
  description.value = ''
  emit('added', id)
  field.value?.focus()
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
</script>

<template>
  <!-- The frame keeps the same scrollbar gutter as the list below it, so the
       card ends exactly where the rows end. -->
  <div class="qa-frame" :class="{ 'is-plain': isSub }">
    <div class="qa" :class="{ 'is-typing': !!text, 'is-open': detailsOpen }">
      <div class="qa__line">
        <!-- The "+" tile: the add mark, and the way to the description and tag. -->
        <button
          type="button"
          class="qa__plus"
          :class="{ 'has-details': hasDetails }"
          :aria-expanded="detailsOpen"
          :aria-label="detailsOpen ? 'Hide description and tag' : 'Add a description and a tag'"
          :title="detailsOpen ? 'Hide details' : 'Description and tag'"
          @click="detailsOpen = !detailsOpen"
        >
          <Icon name="plus" size="md" />
        </button>
        <TextInput
          ref="field"
          v-model="text"
          class="qa__field"
          :aria-label="'Add ' + aNoun"
          :placeholder="compact ? `Add ${aNoun}…` : `Add ${aNoun}… try “${example}”`"
          @keydown.enter.prevent="submit"
          @keydown.esc="onEscape"
        />
        <button
          type="button"
          class="qa__add"
          :disabled="!canAdd"
          :aria-label="'Add ' + noun"
          @click="submit"
        >
          <span v-if="!compact">Add</span>
          <Icon name="corner-down-left" size="sm" class="qa__enter" aria-hidden="true" />
        </button>
      </div>

      <div v-if="parsed.chips.length" class="qa__chips" aria-live="polite">
        <Chip
          v-for="ch in parsed.chips"
          :key="ch.kind"
          tone="accent"
          :icon="ch.icon"
          :label="ch.text"
        />
      </div>

      <CollapseTransition>
        <div v-if="detailsOpen" class="qa__details">
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
      </CollapseTransition>
    </div>
  </div>
</template>

<style scoped>
/* The lists under this card scroll with `scrollbar-gutter: stable`, which takes
   the scrollbar's width off their right edge. The frame reserves the same
   gutter (it has to be a clipping box for that), and its padding, cancelled by
   the negative margin, is the room the card's focus ring and shadow need. */
.qa-frame {
  overflow: hidden;
  scrollbar-gutter: stable;
  padding: 6px 6px 10px;
  margin: -6px -6px -10px;
}
/* In a details pane there is no list beside it to line up with. */
.qa-frame.is-plain {
  overflow: visible;
  scrollbar-gutter: auto;
  padding: 0;
  margin: 0;
}
/* The card: a near-white surface with a hairline edge and a soft shadow,
   generous padding and a large radius, so it reads as one calm control. */
.qa {
  /* The surface: the theme's card colour made OPAQUE (below). The card token
     is a see-through white on the light themes, which over a warm page read as
     beige; dropping its alpha gives the clean white card — and on a dark theme,
     that theme's own card, solid. This line is the fallback. */
  --qa-surface: var(--theme-card);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: 9px 10px 9px 18px;
  border-radius: 22px;
  background: var(--qa-surface);
  /* A light rim and the faintest lift: the edge does the work, not a shadow. */
  border: 1.5px solid color-mix(in oklch, var(--theme-text) 6%, transparent);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink) 4%, transparent),
    0 8px 24px -14px color-mix(in srgb, var(--shadow-ink) 16%, transparent);
  transition:
    border-color var(--dur-med) ease,
    box-shadow var(--dur-med) ease;
}
/* A custom property is never rejected at parse time, so a second declaration
   would win even where relative colour is unsupported (and paint nothing); the
   opaque surface is applied only where the browser can compute it. */
@supports (color: rgb(from red r g b / 1)) {
  .qa {
    --qa-surface: rgb(from var(--theme-card) r g b / 1);
  }
}
.qa:focus-within {
  border-color: color-mix(in oklch, var(--theme-accent) 40%, transparent);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink) 4%, transparent),
    0 8px 24px -14px color-mix(in srgb, var(--shadow-ink) 16%, transparent),
    0 0 0 4px color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
.qa__line {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* The tile: a solid peach square holding a fine "+". It turns to × with the
   details open, and keeps a dot when details are filled but folded away. */
.qa__plus {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: none;
  border-radius: 11px;
  background: color-mix(in oklch, var(--theme-accent) 30%, var(--qa-surface));
  color: color-mix(in oklch, var(--theme-accent) 88%, var(--theme-text));
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    transform 0.25s var(--spring);
}
.qa__plus:hover {
  background: color-mix(in oklch, var(--theme-accent) 42%, var(--qa-surface));
}
.qa__plus:active {
  transform: scale(0.92);
}
.qa__plus:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.qa__plus > :deep(svg) {
  transition: transform 0.3s var(--spring);
}
.qa.is-open .qa__plus > :deep(svg) {
  transform: rotate(45deg);
}
.qa__plus.has-details::after {
  content: '';
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-accent);
}

/* The field has no frame of its own: the card is the frame. No border at all
   (not a transparent one), so the shared control's hover border-colour, whose
   selector outranks this one, has nothing to paint. */
.qa__field {
  flex: 1;
  min-width: 0;
}
.qa__field :deep(.ui-control),
.qa__field :deep(.ui-control:hover),
.qa__field :deep(.ui-control:focus-within) {
  background: transparent;
  border: 0;
  box-shadow: none;
  outline: none;
  padding-left: 0;
}
.qa__field :deep(input) {
  font-size: var(--text-md);
  line-height: var(--lh-md);
}
.qa__field :deep(input)::placeholder {
  color: color-mix(in oklch, var(--theme-dim) 85%, var(--theme-accent));
}

/* "Add ↵": a solid warm pill, always fully drawn — empty, a press simply does
   nothing — and a shade deeper under the pointer. */
.qa__add {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px 0 18px;
  border: none;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 14%, var(--qa-surface));
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    transform 0.2s var(--spring);
}
.qa__add:hover:not(:disabled) {
  background: color-mix(in oklch, var(--theme-accent) 24%, var(--qa-surface));
}
.qa__add:active:not(:disabled) {
  transform: scale(0.95);
}
.qa__add:disabled {
  cursor: default;
}
.qa__add:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.qa__enter {
  flex-shrink: 0;
}

.qa__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-left: 54px;
}
.qa__details {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 2px 4px 4px;
  padding-top: var(--sp-3);
  border-top: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
}
/* The details speak the title's language: no frame on any field. Each one is a
   soft well instead — a faint wash of the accent that deepens while it has
   focus — so it still reads as somewhere to type. The base rule takes the
   border away outright (not just its colour), so the shared control's hover
   border, whose selector outranks this one, has nothing to paint. */
.qa__details :deep(.ui-control),
.qa__details :deep(.ui-control:hover),
.qa__details :deep(.ui-control:focus-within) {
  border: 0;
  outline: none;
  box-shadow: none;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 7%, transparent);
  transition: background var(--dur-fast) ease;
}
.qa__details :deep(.ui-control:focus-within) {
  background: color-mix(in oklch, var(--theme-accent) 13%, transparent);
}
.qa__details :deep(.ui-ta__box) {
  padding: 10px 14px;
}
.qa__details :deep(.ui-control:not(.ui-ta__box)) {
  padding-inline: 14px;
}
.qa__details :deep(.ui-control__input) {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: var(--lh-md);
}
.qa__details :deep(.ui-control__input)::placeholder {
  font-weight: var(--weight-normal);
}
/* Labels: a size you can read at a glance, and a weight that holds. */
.qa__details :deep(.ui-ta__label),
.qa__details :deep(.tagpicker__label) {
  margin-bottom: 6px;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  color: color-mix(in oklch, var(--theme-text) 72%, transparent);
}
.qa__details :deep(.tagpicker__label) {
  margin-bottom: 0;
}
.qa__details :deep(.tagpicker__none),
.qa__details :deep(.tagpicker__count) {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
/* Manage: a soft filled pill rather than a dashed outline. */
.qa__details :deep(.tagpicker__manage) {
  height: 32px;
  border: 0;
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
  color: var(--theme-text);
  font-size: var(--text-sm);
}
.qa__details :deep(.tagpicker__manage:hover) {
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
}

@media (prefers-reduced-motion: reduce) {
  .qa,
  .qa__plus,
  .qa__plus > :deep(svg),
  .qa__add {
    transition: none;
  }
}
</style>
