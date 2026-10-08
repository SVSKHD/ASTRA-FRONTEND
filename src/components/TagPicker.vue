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
import TagManagerDialog from '@/components/TagManagerDialog.vue'
import { vScrollFade } from '@/directives/scrollFade'
import { pxify, tagChip, typeStep } from '@/styles'
import { normalizeTag, hasTag, sameTag, tagColor } from '@/utils/tags'
import CollapseTransition from '@/components/ui/CollapseTransition.vue'

const props = defineProps<{ modelValue: string; label?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const app = useAppStore()
const { c, dark, s } = useStyles()
const { tags } = storeToRefs(app)

const creating = ref('')
const managing = ref(false)

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
// One box at the top of the list does both jobs: typing narrows the chips, and
// Enter picks the tag it names — or creates it when there is no such tag.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // This input creates a tag; it must not also submit the row being added.
    e.preventDefault()
    e.stopPropagation()
    const typed = normalizeTag(creating.value)
    const match = typed ? tags.value.find((t) => sameTag(t, typed)) : undefined
    if (match) {
      emit('update:modelValue', match)
      creating.value = ''
    } else create()
  }
}
const shown = computed(() => {
  const q = creating.value.trim().toLowerCase()
  return q ? tags.value.filter((t) => t.toLowerCase().includes(q)) : tags.value
})
// A tag some item still wears stays: say so, and by how many, instead.
function drop(tag: string) {
  const n = app.tagUsage(tag)
  if (n > 0) {
    app.showToastMsg(`"${tag}" is in use by ${n} item${n === 1 ? '' : 's'} — it can't be deleted`)
    return
  }
  if (isSelected(tag)) emit('update:modelValue', '')
  app.removeTag(tag)
}

const isNew = computed(() => {
  const tag = normalizeTag(creating.value)
  return !!tag && !hasTag(tags.value, tag)
})

// The same chip a tag wears on a row (TitleTagPill): its own colour, filled,
// uppercase and bold — so a tag looks like itself here too. The one picked
// gets a ring of its colour; the rest sit back a little until hovered.
function chipStyle(tag: string) {
  const col = tagColor(tag, dark.value, c.value.mono)
  return pxify({
    ...tagChip(c.value, tag, dark.value),
    alignSelf: undefined,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: '3px 10px',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    boxShadow: isSelected(tag) ? '0 0 0 1.5px ' + col : 'none',
  })
}
function tagText(tag: string) {
  return tag.trim().toLocaleUpperCase()
}
</script>

<template>
  <div :style="s.tagPicker">
    <!-- The line that is always there: what this item has, how many tags exist,
         and Manage — reachable without opening, or scrolling, the list. -->
    <div class="tagpicker__head">
      <button
        type="button"
        class="tagpicker__toggle rx-head"
        :aria-expanded="open"
        :aria-controls="bodyId"
        @click="accordion.toggle(ACC_KEY)"
      >
        <span class="field-label tagpicker__label">{{ label ?? 'Tag' }}</span>
        <span v-if="selected" :style="chipStyle(selected)">{{ tagText(selected) }}</span>
        <span v-else class="tagpicker__none">None</span>
        <span class="tagpicker__count"
          >{{ tags.length }} {{ tags.length === 1 ? 'tag' : 'tags' }}</span
        >
        <Caret :open="open" />
      </button>
      <!-- Add, and delete several at once, in one dialog. -->
      <button type="button" class="tagpicker__manage" @click="managing = true">
        <Icon name="tag" size="xs" />Manage
      </button>
    </div>

    <CollapseTransition>
      <div v-if="open" :id="bodyId" class="tagpicker__body">
        <!-- First, not last: with a long list the box is where the eye lands. -->
        <div class="tagpicker__find">
          <TextInput
            v-model="creating"
            placeholder="Find or create a tag…"
            aria-label="Find or create a tag"
            @keydown="onKey"
          />
          <button v-if="isNew" :style="s.addBtn2" @click="create">
            Create “{{ creating.trim() }}”
          </button>
        </div>
        <div v-scroll-fade class="tagpicker__chips" :style="s.tagRow">
          <span
            v-for="t in shown"
            :key="t"
            class="tagpicker__chip"
            :class="{ 'is-off': !isSelected(t) }"
            :style="chipStyle(t)"
            @click="pick(t)"
          >
            {{ tagText(t) }}
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
          <span v-if="!shown.length" class="tagpicker__none">
            No tag matches — press Enter to create it.
          </span>
        </div>
      </div>
    </CollapseTransition>
    <TagManagerDialog :open="managing" @close="managing = false" />
  </div>
</template>

<style scoped>
.tagpicker__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.tagpicker__toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tagpicker__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.tagpicker__chip {
  transition:
    opacity var(--dur-fast) ease,
    box-shadow var(--dur-fast) ease;
}
.tagpicker__chip.is-off {
  opacity: 0.62;
}
.tagpicker__chip.is-off:hover {
  opacity: 1;
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
.tagpicker__manage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px dashed var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.tagpicker__manage:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
.tagpicker__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.tagpicker__find {
  display: flex;
  gap: var(--sp-2);
}
.tagpicker__find > :first-child {
  flex: 1;
  min-width: 0;
}
/* A long vocabulary scrolls in its own box instead of stretching the form. */
.tagpicker__chips {
  max-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
  align-content: flex-start;
}
.tagpicker__toggle:hover .tagpicker__count {
  color: var(--theme-text);
}
</style>
