<script setup lang="ts">
// The month as a picture (section 28).
//
// This is the app's own GlassDatePicker rendered inline, not a second calendar:
// the grid, the keyboard model, the weekday labels and the theming are the ones
// every date field in the app already uses. What this file adds is the two
// things the picker cannot know — what a day means, and what clicking it does.
//
// Colour is the day's P/L sign and the tint's strength is the day's move
// against the day target. Neither is left to carry the meaning alone: the day
// number is followed by a sign mark, the picker draws its own edge (under a
// gain, over a loss), and every painted day has a title naming the figures.
import { computed } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Button from '@/components/ui/Button.vue'
import { dayTotals, signOf, signed2 } from '@/utils/tradeMath'
import type { DayMeta } from '@/components/ui/GlassDatePicker.vue'
import type { Trade } from '@/types'

const props = defineProps<{
  trades: Trade[]
  dayMeta: Record<string, DayMeta>
  /** '' means the whole month; a date filters the table to that day. */
  selected: string
}>()
const emit = defineEmits<{ 'update:selected': [string]; month: [string] }>()

const summary = computed(() => (props.selected ? dayTotals(props.trades, props.selected) : null))

// Clicking the selected day again clears the filter. Without it the only way
// back to the whole month is a button, and the obvious gesture does nothing.
function onPick(value: unknown) {
  const ymd = typeof value === 'string' ? value : ''
  emit('update:selected', ymd === props.selected ? '' : ymd)
}

const MARK: Record<string, string> = { pos: '▲', neg: '▼', flat: '·' }
</script>

<template>
  <section class="tcal">
    <GlassDatePicker
      :model-value="selected"
      inline
      mode="date"
      :quick-entry="false"
      :day-meta="dayMeta"
      label="Trading month"
      @update:model-value="onPick"
      @month="emit('month', $event)"
    >
      <template #day="{ cell, meta }">
        <span class="tcal__day">
          <span class="tcal__num">{{ cell.day }}</span>
          <!-- The redundant half of the signal, for a mono theme, a colour-blind
               reader, and a printout. -->
          <span v-if="meta?.tone" class="tcal__mark" aria-hidden="true">
            {{ MARK[meta.tone] }}
          </span>
        </span>
      </template>
    </GlassDatePicker>

    <div class="tcal__foot">
      <template v-if="summary">
        <dl class="tcal__summary ui-tabular">
          <div class="tcal__cell">
            <dt class="ui-label">{{ selected }}</dt>
            <dd class="tcal__value">
              {{ summary.count }} trade{{ summary.count === 1 ? '' : 's' }}
            </dd>
          </div>
          <div class="tcal__cell">
            <dt class="ui-label">Net move</dt>
            <dd class="tcal__value" :class="`is-${signOf(summary.move)}`">
              {{ signed2(summary.move) }}
            </dd>
          </div>
          <div class="tcal__cell">
            <dt class="ui-label">Net P/L</dt>
            <dd class="tcal__value" :class="`is-${signOf(summary.pl)}`">
              {{ signed2(summary.pl) }}
            </dd>
          </div>
        </dl>
        <Button variant="ghost" size="sm" @click="emit('update:selected', '')">
          Show whole month
        </Button>
      </template>
      <p v-else class="tcal__hint">
        Pick a day to filter the log to it. Green days ended in profit, red in loss; the stronger
        the tint, the further the day moved against the target.
      </p>
    </div>
  </section>
</template>

<style scoped>
.tcal {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.tcal__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
  line-height: 1;
}
.tcal__num {
  font-variant-numeric: tabular-nums;
}
.tcal__mark {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  opacity: 0.85;
}
.tcal__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.tcal__summary {
  display: flex;
  gap: var(--sp-5);
  margin: 0;
  min-width: 0;
}
.tcal__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tcal__value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  color: var(--text-primary, var(--theme-text));
}
.tcal__value.is-pos {
  color: var(--theme-success);
}
.tcal__value.is-neg {
  color: var(--theme-danger);
}
.tcal__hint {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
