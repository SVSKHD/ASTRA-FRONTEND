<script setup lang="ts">
// The unsaved-changes question (section 43, item 4).
//
// IT NAMES THE FIELDS. "You have unsaved changes" is the version of this
// dialog everybody has met and nobody can answer: it asks you to choose
// between two irreversible things while withholding the one fact — WHAT is
// unsaved — that would let you choose. If the code knows enough to know
// something is unsaved, it knows enough to say which something.
//
// Two answers, in this order: Save changes, then Discard. Save is the accent
// button because saving is what somebody who has typed into a form almost
// always meant to do, and the destructive answer should never be the one the
// hand goes to.
//
// ESCAPE AND THE SCRIM BOTH MEAN "GO BACK TO THE FORM". They dismiss the
// question, not the work — nothing is saved and nothing is thrown away, and the
// editor is still there with everything in it. That is the only reading of
// those two gestures that cannot cost somebody their typing by accident, and it
// is why neither of them is a silent close: the sheet goes, the form stays, and
// the two irreversible answers are still the only way to leave.
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  open: boolean
  /** The field labels that are unsaved — the whole point of this sheet. */
  fields: string[]
  title?: string
}>()

const emit = defineEmits<{ save: []; discard: []; back: [] }>()

const panel = ref<HTMLElement | null>(null)
let restoreTo: HTMLElement | null = null

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('back')
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      restoreTo?.focus?.()
      restoreTo = null
      return
    }
    restoreTo = (document.activeElement as HTMLElement) ?? null
    // Focus lands on the sheet, not on a button: landing on Save would make
    // Enter save, and landing on Discard would make it discard.
    await new Promise((r) => requestAnimationFrame(r))
    panel.value?.focus()
  },
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  // Torn down while open — the dialog above it closed, a route changed. Focus
  // is on an element that is about to stop existing, so it goes back to
  // whatever had it, rather than falling to the document body.
  restoreTo?.focus?.()
  restoreTo = null
})
</script>

<template>
  <div v-if="open" class="usheet" @click.self="emit('back')">
    <div
      ref="panel"
      class="usheet__panel ui-glass-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="usheet-title"
      tabindex="-1"
    >
      <h2 id="usheet-title" class="usheet__title">{{ title ?? 'Unsaved changes' }}</h2>

      <p class="usheet__lead">These have been typed and not saved:</p>
      <!-- The list IS the message. A sentence saying "some fields" would be the
           same dialog everybody already ignores. -->
      <ul class="usheet__fields">
        <li v-for="field in fields" :key="field">{{ field }}</li>
      </ul>

      <div class="usheet__actions">
        <Button variant="primary" @click="emit('save')">Save changes</Button>
        <Button variant="ghost" @click="emit('discard')">Discard</Button>
      </div>
      <p class="usheet__note">Escape, or a click outside, takes you back to the form.</p>
    </div>
  </div>
</template>

<style scoped>
.usheet {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: var(--sp-4);
  /* The page's own ink, not black: on a warm ground a black scrim is a grey
     film over a brown room. */
  background: var(--scrim);
}
.usheet__panel {
  width: min(420px, 100%);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  animation: usheetIn 200ms var(--ease-out) both;
}
/* Scale from 0.96 rather than from 0.8: a sheet that grows a long way reads as
   an arrival, and this is an interruption — it should already be there. */
@keyframes usheetIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .usheet__panel {
    animation: none;
  }
}
.usheet__title {
  margin: 0;
  min-width: 0;
  font-size: var(--text-md);
  line-height: var(--lh-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.usheet__lead {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-secondary, var(--theme-dim));
}
/* The one place on a glass surface that gets a solid ground under it. Long-form
   text over a blur is text competing with whatever moved behind it; the answer
   is a scrim, never a weaker blur (item 3). */
.usheet__fields {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-5);
  border-radius: var(--radius-control);
  background: var(--scrim-inset);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
.usheet__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  flex-wrap: wrap;
}
.usheet__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>
