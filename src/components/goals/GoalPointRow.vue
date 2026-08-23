<script setup lang="ts">
// One point on a goal (section 20b).
//
// It used to be a fixed-height single-line input, so a point like "truthiness,
// == vs ===, and the coercion table" was cut off mid-sentence with no way to
// read the rest but clicking in and scrolling sideways. The text field is now an
// auto-growing textarea: three lines of text render as three lines.
//
// The row is a three-track grid — checkbox, text, controls — with the checkbox
// and the controls aligned to the TOP rather than the centre, so on a three-line
// point the checkbox still sits beside the first line where it belongs.
//
// The controls stay out of the way until they are wanted: the estimate reads as
// plain muted text and only becomes a field when clicked, and due/timer/delete
// appear on hover. A touch device has no hover, so there they collapse into a
// single ⋯ rather than three permanently visible buttons.
import { computed, nextTick, ref } from 'vue'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import { formatMinutes } from '@/utils/detailFields'
import type { GoalChecklistItem } from '@/types'

const props = defineProps<{ point: GoalChecklistItem; spent: number; mobile?: boolean }>()
const emit = defineEmits<{
  toggle: []
  'update:text': [string]
  commit: []
  'update:estimate': [number | null]
  'update:due': [string]
  'toggle-timer': []
  remove: []
}>()

// --- the text -----------------------------------------------------------------
// Escape puts back what was there when the row was focused, so a mistyped edit
// costs nothing.
const before = ref('')
function onFocus() {
  before.value = props.point.text
}
function onRevert() {
  emit('update:text', before.value)
}

// --- the estimate ---------------------------------------------------------------
// Plain text until clicked. "180m" reads as information; a bordered number field
// on every row reads as ten things to fill in.
const editingEstimate = ref(false)
const estimateField = ref<HTMLInputElement | null>(null)
async function editEstimate() {
  editingEstimate.value = true
  await nextTick()
  estimateField.value?.focus()
  estimateField.value?.select()
}
function commitEstimate(event: Event) {
  editingEstimate.value = false
  const raw = (event.target as HTMLInputElement).value.trim()
  if (!raw) {
    emit('update:estimate', null)
    return
  }
  const minutes = parseInt(raw, 10)
  // Anything unreadable leaves the stored value alone rather than zeroing it.
  if (Number.isFinite(minutes)) emit('update:estimate', Math.max(0, minutes))
}

const running = computed(() => props.point.timerStartedAt != null)
const estimateLabel = computed(() =>
  props.point.estimateMins == null ? '' : formatMinutes(props.point.estimateMins),
)

// On touch the extra controls hide behind one button rather than crowding the
// row; on a pointer device they appear on hover.
const expanded = ref(false)
const showExtras = computed(() => !props.mobile || expanded.value)
</script>

<template>
  <div class="gpr" :class="mobile && 'gpr--touch'">
    <button
      type="button"
      class="gpr__box"
      :class="point.done && 'gpr__box--on'"
      :aria-label="point.done ? 'Mark not done' : 'Mark done'"
      @click="emit('toggle')"
    >
      <span v-if="point.done" aria-hidden="true">✓</span>
    </button>

    <AutoTextarea
      class="gpr__text"
      label="Point"
      placeholder="Untitled point"
      :model-value="point.text"
      :done="point.done"
      @update:model-value="emit('update:text', $event)"
      @commit="emit('commit')"
      @revert="onRevert"
      @focus="onFocus"
    />

    <div class="gpr__controls">
      <!-- Estimate: text at rest, field on click. -->
      <input
        v-if="editingEstimate"
        ref="estimateField"
        class="gpr__mins"
        type="number"
        min="0"
        inputmode="numeric"
        aria-label="Estimate in minutes"
        :value="point.estimateMins ?? ''"
        @blur="commitEstimate"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      />
      <button
        v-else
        type="button"
        class="gpr__estimate"
        :class="!estimateLabel && 'gpr__estimate--empty'"
        :title="estimateLabel ? 'Estimated time' : 'Add an estimate'"
        @click="editEstimate"
      >
        {{ estimateLabel || 'est' }}
      </button>

      <!-- Touch: one button instead of three. -->
      <button
        v-if="mobile"
        type="button"
        class="gpr__more"
        :aria-label="expanded ? 'Hide point actions' : 'Point actions'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        ⋯
      </button>

      <div v-show="showExtras" class="gpr__extras">
        <GlassDatePicker
          size="sm"
          clearable
          placeholder="due"
          :model-value="point.dueAt"
          @update:model-value="emit('update:due', String($event ?? ''))"
        />
        <button
          type="button"
          class="gpr__mini"
          :title="running ? 'Stop the timer' : 'Start the timer'"
          @click="emit('toggle-timer')"
        >
          {{ running ? '■' : '▶' }} {{ formatMinutes(spent) }}
        </button>
        <button type="button" class="gpr__mini" aria-label="Delete point" @click="emit('remove')">
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gpr {
  display: grid;
  grid-template-columns: auto 1fr auto;
  /* Top, not centre: on a three-line point the checkbox belongs beside the
     first line, not floating halfway down it. */
  align-items: start;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  /* A hairline between rows rather than a box around each one. */
  border-bottom: 1px solid color-mix(in oklch, var(--theme-dim) 14%, transparent);
}
.gpr:last-child {
  border-bottom: none;
}
.gpr__box {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  /* Nudged down to sit on the first line's baseline rather than its box top. */
  margin-top: 3px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--glass-border);
  background: transparent;
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  cursor: pointer;
}
.gpr__box--on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.gpr__text {
  min-width: 0;
}
/* Fixed column, top-aligned, never wrapping into the text. */
.gpr__controls {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: nowrap;
  white-space: nowrap;
  margin-top: 1px;
}
.gpr__estimate {
  padding: 2px var(--sp-1);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-family: inherit;
  cursor: pointer;
}
.gpr__estimate:hover {
  border-color: var(--glass-border);
}
/* With no estimate set the placeholder stays out of the way until the row is. */
.gpr__estimate--empty {
  opacity: 0;
}
.gpr:hover .gpr__estimate--empty,
.gpr__estimate--empty:focus-visible {
  opacity: 0.7;
}
.gpr__mins {
  width: 56px;
  padding: 2px var(--sp-1);
  border-radius: var(--radius-sm);
  border: 1px solid var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-family: inherit;
}
.gpr__more {
  padding: 0 var(--sp-1);
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
}
/* Quiet until the row is hovered. Kept in the layout rather than removed, so
   nothing shifts sideways when it appears. */
.gpr__extras {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.gpr:hover .gpr__extras,
.gpr:focus-within .gpr__extras {
  opacity: 1;
}
/* A touch device has no hover, so what is shown there is shown properly. */
.gpr--touch .gpr__extras {
  opacity: 1;
}
.gpr--touch .gpr__estimate--empty {
  opacity: 0.7;
}
.gpr__mini {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  cursor: pointer;
  white-space: nowrap;
}
.gpr__mini:hover {
  color: var(--theme-text);
}
</style>
