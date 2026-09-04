<script setup lang="ts">
// One pull request (section 40).
//
// The state is a glyph AND a word, never a colour alone: six states is more than
// hue can carry, three of them are shades of "not finished", and the palette
// goes achromatic on some themes. So `merged` says merged.
//
// The row rings for a moment when the snapshot changes it — see `useRowFlash`.
// It does not move, nothing reflows, and the list is not re-animated because one
// row updated.
import { computed } from 'vue'
import IconPrOpen from '@/components/feedicons/IconPrOpen.vue'
import IconPrDraft from '@/components/feedicons/IconPrDraft.vue'
import IconPrMerged from '@/components/feedicons/IconPrMerged.vue'
import IconPrClosed from '@/components/feedicons/IconPrClosed.vue'
import IconReviewApproved from '@/components/feedicons/IconReviewApproved.vue'
import IconReviewChanges from '@/components/feedicons/IconReviewChanges.vue'
import { countOf } from '@/utils/format'
import type { GhPull, PullState } from '@/types'

const props = defineProps<{ pull: GhPull; expanded: boolean; flashing: boolean }>()
defineEmits<{ toggle: [] }>()

const STATE_ICON = {
  open: IconPrOpen,
  draft: IconPrDraft,
  merged: IconPrMerged,
  closed: IconPrClosed,
} satisfies Record<PullState, unknown>

const STATE_LABEL: Record<PullState, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
}

/**
 * The review, when there is one.
 *
 * '' means "not reported here" rather than "nobody has reviewed it" — the REST
 * list does not carry a decision, so the sweep leaves it empty and only a
 * `pull_request_review` webhook fills it in. Drawing "no reviews" from an empty
 * field would be inventing a fact.
 */
const review = computed(() => {
  const decision = props.pull.reviewDecision.toLowerCase()
  if (decision.includes('approve')) return { icon: IconReviewApproved, label: 'Approved' }
  if (decision.includes('change')) return { icon: IconReviewChanges, label: 'Changes requested' }
  return null
})
</script>

<template>
  <div
    class="prow"
    :class="[`is-${pull.state}`, { 'is-flashing': flashing, 'is-expanded': expanded }]"
  >
    <button type="button" class="prow__main" :aria-expanded="expanded" @click="$emit('toggle')">
      <span class="prow__state">
        <component :is="STATE_ICON[pull.state]" :size="16" />
        <span class="prow__stateLabel">{{ STATE_LABEL[pull.state] }}</span>
      </span>
      <span class="prow__num ui-mono">#{{ pull.number }}</span>
      <span class="prow__title">{{ pull.title }}</span>
      <span v-if="review" class="prow__review">
        <component :is="review.icon" :size="14" />
        {{ review.label }}
      </span>
      <span class="prow__diff ui-mono">
        <span class="is-add">+{{ pull.additions }}</span>
        <span class="is-del">−{{ pull.deletions }}</span>
      </span>
      <span class="prow__comments ui-mono">{{ countOf(pull.commentCount, 'comment') }}</span>
    </button>
    <!-- The link out sits beside the disclosure rather than wrapping it: a row
         that both expands and navigates does neither predictably. -->
    <a class="prow__link" :href="pull.url" target="_blank" rel="noopener noreferrer">
      {{ pull.headRef || 'GitHub' }}
    </a>
  </div>
</template>

<style scoped>
.prow {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
}
.prow:hover {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 5%, transparent);
}
/* The ring. A border that was already there, coloured — so nothing resizes and
   nothing below it moves when a row changes. */
.prow.is-flashing {
  border-color: var(--accent, var(--theme-accent));
}
@media (prefers-reduced-motion: no-preference) {
  .prow {
    transition: border-color var(--dur-med) var(--ease-out);
  }
}
.prow__main {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--sp-3);
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.prow__state {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.prow.is-open .prow__state {
  color: var(--theme-success);
}
.prow.is-merged .prow__state {
  color: var(--accent, var(--theme-accent));
}
.prow.is-closed .prow__state,
.prow.is-draft .prow__state {
  color: var(--text-muted, var(--theme-dim));
}
.prow__stateLabel {
  min-width: 6ch;
}
.prow__num,
.prow__comments,
.prow__diff {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
  font-variant-numeric: tabular-nums;
}
.prow__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
}
.prow__review {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.prow__diff .is-add {
  color: var(--theme-success);
}
.prow__diff .is-del {
  margin-left: var(--sp-1);
  color: var(--theme-danger);
}
.prow__link {
  min-width: 0;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-muted, var(--theme-dim));
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 18ch;
}
.prow__link:hover,
.prow__link:focus-visible {
  text-decoration: underline;
}

/* On a phone the grid becomes a wrap.
   
   The title is the only thing on this row worth reading first, and in three
   columns it was the one thing being truncated — "A news fee…" beside a full
   diff count and a full comment count. So it takes a line of its own and wraps,
   and the state, the number and the counts flow around it. */
@media (max-width: 700px) {
  .prow__main {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
  }
  .prow__title {
    flex: 1 1 100%;
    white-space: normal;
    overflow: visible;
  }
}
</style>
