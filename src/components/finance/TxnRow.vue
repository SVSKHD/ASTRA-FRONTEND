<script setup lang="ts">
// One transaction (section 27b).
//
// The colour rule from 26c holds without exception: the amount is coloured by
// its SIGN — an outflow is negative and therefore danger-toned, an inflow is
// positive — and the category's colour lands on a 3px bar and a dot, never on
// text. That is what stops a row from being red because it is an expense, which
// is colour used as a label rather than as meaning.
//
// Every text cell sets min-width: 0 and says what it does when it overflows,
// because a note is arbitrary text and a pasted URL has no break opportunity in
// it at all.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { formatMinor, valueColor } from '@/utils/money'
import { categoryColor, categoryIcon } from '@/utils/txnCategories'
import { signedMinor } from '@/utils/txnList'
import type { Txn, TxnCategory } from '@/types'

const props = defineProps<{
  txn: Txn
  categories: TxnCategory[]
  /** Balance after this row. Omitted hides the column. */
  balanceMinor?: number
  showScope?: boolean
}>()
defineEmits<{ edit: [id: number]; remove: [id: number]; tag: [name: string] }>()

const signed = computed(() => signedMinor(props.txn))
const bar = computed(() => categoryColor(props.categories, props.txn.category))
const icon = computed(() => categoryIcon(props.categories, props.txn.category))
// The note is what the row is; the category is the fallback when there is none.
// A row that says only "Food" is a row nobody can identify a month later, which
// is why the quick-add row keeps the leftovers.
const title = computed(() => props.txn.note || props.txn.category || 'Transaction')
</script>

<template>
  <li class="txr" :style="{ '--row-bar': bar }">
    <span class="txr__icon" aria-hidden="true"><Icon :name="icon" size="sm" /></span>

    <div class="txr__text">
      <p class="txr__title">{{ title }}</p>
      <p class="txr__meta">
        <span class="txr__cell">{{ txn.category }}</span>
        <template v-if="txn.party">
          <span class="txr__dot" aria-hidden="true">·</span>
          <span class="txr__cell">{{ txn.party }}</span>
        </template>
        <span v-if="txn.method" class="txr__method">{{ txn.method.toUpperCase() }}</span>
        <button
          v-for="tag in txn.tags"
          :key="tag"
          type="button"
          class="txr__tag"
          @click="$emit('tag', tag)"
        >
          #{{ tag }}
        </button>
        <span v-if="showScope" class="txr__method">{{ txn.scope }}</span>
      </p>
    </div>

    <span class="txr__amount ui-tabular" :style="{ color: valueColor(signed) }">
      {{ formatMinor(signed, { signed: true }) }}
    </span>

    <span v-if="balanceMinor !== undefined" class="txr__balance ui-tabular">
      {{ formatMinor(balanceMinor) }}
    </span>

    <span class="txr__actions">
      <IconButton label="Edit" size="sm" @click="$emit('edit', txn.id)">
        <Icon name="notebook" size="xs" />
      </IconButton>
      <IconButton label="Delete" size="sm" @click="$emit('remove', txn.id)">
        <Icon name="trash" size="xs" />
      </IconButton>
    </span>
  </li>
</template>

<style scoped>
.txr {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  min-height: 48px;
  padding: var(--sp-2) var(--sp-3);
  /* The category's colour, on a bar. Never on the text — a hue on body text is
     a hue that fails on some theme nobody opened. */
  border-left: 3px solid var(--row-bar);
  border-radius: var(--radius-control, 6px);
  background: var(--bg-elevated, var(--glass-card));
  color: var(--text-primary, var(--theme-text));
}
.txr__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: var(--row-bar);
}
.txr__text {
  min-width: 0;
}
.txr__title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txr__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.txr__cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txr__dot {
  flex-shrink: 0;
}
.txr__method {
  flex-shrink: 0;
  padding: 0 var(--sp-1);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-control, 6px);
  font-size: var(--text-2xs);
  line-height: 1.6;
  letter-spacing: 0.06em;
}
.txr__tag {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.txr__tag:hover {
  color: var(--theme-accent);
}
.txr__amount {
  flex-shrink: 0;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-weight: var(--weight-semibold);
}
/* The balance is context, not the figure being read: one step down and neutral,
   so a column of them does not compete with the amounts beside it. */
.txr__balance {
  flex-shrink: 0;
  min-width: 88px;
  text-align: right;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.txr__actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--sp-1);
  opacity: 0;
  transition: opacity 120ms ease;
}
.txr:hover .txr__actions,
.txr:focus-within .txr__actions {
  opacity: 1;
}
/* On a touch device there is no hover, so the actions are always there rather
   than permanently unreachable. */
@media (hover: none) {
  .txr__actions {
    opacity: 1;
  }
}
@media (max-width: 640px) {
  .txr {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  /* The balance column is the first thing to go: it is derived context, and the
     amount is what the row is for. */
  .txr__balance {
    display: none;
  }
  .txr__actions {
    grid-column: 3;
    grid-row: 2;
  }
}
</style>
