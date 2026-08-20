<script setup lang="ts">
// One goal in the grid (section 19a).
//
// The card used to be a flex row of seven siblings with a title that had no
// truncation on it. A title long enough to wrap therefore grew the row and
// squeezed everything to its right — which is what the overlapping badge and
// the text running under the actions button actually were. (Nothing here was
// ever absolutely positioned; the app's only `position: absolute` rules are
// anchored panels. The cause was a flex child that could not shrink.)
//
// So the header is a grid with four declared columns — handle, ring, title
// block, actions — and the title block carries `min-width: 0`. Without that a
// grid child refuses to shrink below its content and pushes into its
// neighbour, which is the same bug in a different layout mode.
//
// The card itself is a full-height flex column with the meta row pinned to the
// bottom by `margin-top: auto`, so meta rows line up across a row of cards
// whatever the description does.
import { computed } from 'vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import GoalCardTick from '@/components/GoalCardTick.vue'
import Dropdown, { type MenuItem } from '@/components/ui/Dropdown.vue'
import type { Goal, GoalStatus } from '@/types'

const props = defineProps<{
  goal: Goal
  ratio: number
  counts: { checklist: number; tasks: number; todos: number }
  daysChip: { text: string; tone: 'overdue' | 'today' | 'ahead' } | null
  statusLabel: string
  menu: MenuItem[]
  draggable?: boolean
}>()
const emit = defineEmits<{ menu: [string] }>()

const dotColor = computed(() => props.goal.color || 'var(--theme-accent)')
const badgeTone = computed<GoalStatus>(() => props.goal.status)
</script>

<template>
  <article class="gcard">
    <header class="gcard__head">
      <span
        v-if="draggable"
        class="gcard__grip"
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        @click.stop
      >
        <span v-for="d in 6" :key="d" class="gcard__gripdot"></span>
      </span>
      <span v-else class="gcard__grip gcard__grip--empty" aria-hidden="true"></span>

      <!-- The ring reports progress; it is not a way into the goal, so a click
           on it does nothing rather than opening the dialog (section 18b). -->
      <span class="gcard__ring goalcard__ring" @click.stop>
        <ProgressRing :ratio="ratio" :size="40" :color="goal.color || undefined" />
      </span>

      <div class="gcard__titleblock">
        <span class="gcard__dot" :style="{ background: dotColor }" aria-hidden="true"></span>
        <h3 class="gcard__title">{{ goal.title || 'Untitled goal' }}</h3>
      </div>

      <div class="gcard__actions">
        <GoalCardTick :goal-id="goal.id" />
        <span @click.stop>
          <Dropdown label="Goal actions" :items="menu" @select="emit('menu', $event)" />
        </span>
      </div>
    </header>

    <p v-if="goal.description" class="gcard__desc">{{ goal.description }}</p>

    <div class="gcard__meta">
      <span :class="['gcard__badge', `gcard__badge--${badgeTone}`]">{{ statusLabel }}</span>
      <span v-if="daysChip" :class="['gcard__chip', `gcard__chip--${daysChip.tone}`]">
        {{ daysChip.text }}
      </span>
      <span class="gcard__chip">{{ counts.checklist }} checklist</span>
      <span class="gcard__chip">{{ counts.tasks }} tasks</span>
      <span class="gcard__chip">{{ counts.todos }} todos</span>
    </div>
  </article>
</template>

<style scoped>
.gcard {
  /* Full height so a row of cards is uniform; the grid supplies the height. */
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--theme-text);
  cursor: pointer;
}
.gcard:hover {
  border-color: color-mix(in oklch, var(--theme-accent) 45%, var(--glass-border));
}

/* handle | ring | title block | actions. Four declared tracks, so nothing has
   to guess how much room is left. */
.gcard__head {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: start;
  gap: var(--sp-2);
}
.gcard__grip {
  display: grid;
  grid-template-columns: repeat(2, 3px);
  grid-auto-rows: 3px;
  gap: 3px;
  align-content: start;
  /* Aligned with the title's first line rather than the card's centre. */
  margin-top: 6px;
  cursor: grab;
  opacity: 0.5;
}
.gcard__grip--empty {
  width: 9px;
}
.gcard__gripdot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--theme-dim);
}
.gcard__ring {
  display: inline-flex;
  flex-shrink: 0;
}
.gcard__titleblock {
  /* The line that stops the overlap: without it a grid child refuses to shrink
     below its content width and pushes into the actions column. */
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  padding-top: 2px;
}
.gcard__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.gcard__title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Fixed right column: the actions never wrap and never sit in the title flow. */
.gcard__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: nowrap;
  white-space: nowrap;
}
.gcard__desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--theme-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
.gcard__meta {
  /* Pinned to the bottom, so meta rows align across cards of a row. */
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.gcard__chip,
.gcard__badge {
  flex-shrink: 0;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}
.gcard__chip {
  color: var(--theme-dim);
  font-weight: 500;
}
.gcard__chip--overdue {
  color: oklch(0.64 0.22 25);
}
.gcard__chip--today {
  color: oklch(0.72 0.16 55);
}
.gcard__badge--active {
  color: oklch(0.7 0.15 155);
}
.gcard__badge--paused {
  color: oklch(0.75 0.13 80);
}
.gcard__badge--done {
  color: oklch(0.7 0.13 250);
}
.gcard__badge--archived {
  color: var(--theme-dim);
}
</style>
