<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
import Icon from '@/components/ui/Icon.vue'
// Pick a tag from the shared vocabulary, or type one and create it. A created
// tag joins the vocabulary immediately, so it is offered everywhere afterwards.
// One tag per item for now — the field it feeds is a single string — but the
// vocabulary is stored separately so tags can become the axis we slice by.
import { computed, ref, useId } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import Caret from '@/components/ui/Caret.vue'
import { pxify, typeStep } from '@/styles'
import { normalizeTag, hasTag, sameTag, tagColor } from '@/utils/tags'

const props = defineProps<{ modelValue: string; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const app = useAppStore()
const { c, dark, s } = useStyles()
const { tags } = storeToRefs(app)

const creating = ref('')

// The full list folds away behind one line — the label, the tag this item has
// and how many there are — so a long vocabulary does not push the rest of the
// form down. Open or closed is remembered, and shared by every picker.
const ACC_KEY = 'tagpicker'
const accordion = useAccordionState()
const open = computed(() => accordion.isOpen(ACC_KEY))
const bodyId = useId()

const selected = computed(() => props.modelValue)
function isSelected(tag: string) {
  return !!selected.value && sameTag(selected.value, tag)
}
// Clicking the selected tag clears it — the tag is optional, so there has to be
// a way back to none.
function pick(tag: string) {
  emit('update:modelValue', isSelected(tag) ? '' : tag)
}
function create() {
  const tag = normalizeTag(creating.value)
  if (!tag) return
  emit('update:modelValue', app.addTag(tag))
  creating.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // This input creates a tag; it must not also submit the row being added.
    e.preventDefault()
    e.stopPropagation()
    create()
  }
}
function drop(tag: string) {
  if (isSelected(tag)) emit('update:modelValue', '')
  app.removeTag(tag)
}

const isNew = computed(() => {
  const tag = normalizeTag(creating.value)
  return !!tag && !hasTag(tags.value, tag)
})

function chipStyle(tag: string) {
  const col = tagColor(tag, dark.value, c.value.mono)
  const on = isSelected(tag)
  return pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + (on ? col : c.value.border),
    background: on ? c.value.input : 'transparent',
    color: on ? col : c.value.dim,
    cursor: 'pointer',
    transition: 'color .25s ease, border-color .25s ease, background .25s ease',
  })
}
const labelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
</script>

<template>
  <div :style="s.tagPicker">
    <button
      type="button"
      class="tagpicker__head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="accordion.toggle(ACC_KEY)"
    >
      <span class="field-label" :style="labelStyle">{{ label ?? 'Tag' }}</span>
      <span v-if="selected" :style="chipStyle(selected)">{{ selected }}</span>
      <span v-else class="tagpicker__none">None</span>
      <span class="tagpicker__count"
        >{{ tags.length }} {{ tags.length === 1 ? 'tag' : 'tags' }}</span
      >
      <Caret :open="open" />
    </button>
    <div v-if="open" :id="bodyId" :style="s.tagRow">
      <span v-for="t in tags" :key="t" :style="chipStyle(t)" @click="pick(t)">
        {{ t }}
        <button
          type="button"
          class="x-round"
          :aria-label="'Remove ' + t + ' from your tags'"
          :title="'Remove ' + t + ' from your tags'"
          @click.stop="drop(t)"
        >
          <Icon name="x" size="xs" />
        </button>
      </span>
      <TextInput placeholder="New tag…" v-model="creating" @keydown="onKey" />
      <button v-if="isNew" :style="s.addBtn2" @click="create">Create</button>
    </div>
  </div>
</template>

<style scoped>
.tagpicker__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tagpicker__none {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.tagpicker__count {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.tagpicker__head:hover .tagpicker__count {
  color: var(--theme-text);
}
</style>
