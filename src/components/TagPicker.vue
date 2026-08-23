<script setup lang="ts">
// Pick a tag from the shared vocabulary, or type one and create it. A created
// tag joins the vocabulary immediately, so it is offered everywhere afterwards.
// One tag per item for now — the field it feeds is a single string — but the
// vocabulary is stored separately so tags can become the axis we slice by.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { normalizeTag, hasTag, sameTag, tagColor } from '@/utils/tags'

const props = defineProps<{ modelValue: string; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const app = useAppStore()
const { c, dark, s } = useStyles()
const { tags } = storeToRefs(app)

const creating = ref('')

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
const dropStyle = computed(() =>
  pxify({
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    ...typeStep('xs'),
    lineHeight: 1,
    cursor: 'pointer',
    opacity: 0.6,
  }),
)
const labelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const newInput = computed(() => pxify({ ...rawInput.value, flex: 'unset', width: 150 }))
const rawInput = computed(() => ({
  minWidth: 0,
  padding: '7px 12px',
  borderRadius: 'var(--radius-pill)',
  border: '1px solid ' + c.value.border,
  background: c.value.input,
  color: c.value.text,
  ...typeStep('xs'),
}))
</script>

<template>
  <div :style="s.tagPicker">
    <span class="field-label" :style="labelStyle">{{ label ?? 'Tag' }}</span>
    <div :style="s.tagRow">
      <span v-for="t in tags" :key="t" :style="chipStyle(t)" @click="pick(t)">
        {{ t }}
        <button :style="dropStyle" :title="'Remove ' + t + ' from your tags'" @click.stop="drop(t)">
          ×
        </button>
      </span>
      <input :style="newInput" placeholder="New tag…" v-model="creating" @keydown="onKey" />
      <button v-if="isNew" :style="s.addBtn2" @click="create">Create</button>
    </div>
  </div>
</template>
