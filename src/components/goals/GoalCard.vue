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
//
// THE LOOK is the todo and task row's (rowBase): the theme's card, a hairline
// border, an 18px corner, and nothing else. The goal's own colour is only the
// dot and the ring. Selected looks exactly like a selected todo or task —
// accent border, a faint accent wash and a 3px accent bar down the left edge —
// so "which one is open" reads the same on every tab. The actions menu is a
// quiet "more" button rather than a worded one on every card.
import { computed } from 'vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Icon from '@/components/ui/Icon.vue'
import GoalCardTick from '@/components/GoalCardTick.vue'
import Dropdown, { type MenuItem } from '@/components/ui/Dropdown.vue'
import { cardMeta, ringPercent, showRing, statusBadge } from '@/utils/goalCardMeta'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip } from '@/styles'
import type { DaysChip } from '@/utils/detailFields'
import type { Goal } from '@/types'

const props = defineProps<{
  goal: Goal
  ratio: number
  counts: { checklist: number; tasks: number; todos: number }
  daysChip: DaysChip | null
  menu: MenuItem[]
  draggable?: boolean
  /** The goal open in the details pane; drawn like a selected todo or task. */
  selected?: boolean
}>()
const emit = defineEmits<{ menu: [string] }>()

const goalColor = computed(() => props.goal.color || 'var(--theme-accent)')
// Section 19b: only the states worth noticing wear a badge, only counts above
// zero become chips, and the ring is drawn only once there is progress in it.
const badge = computed(() => statusBadge(props.goal.status))
const meta = computed(() => cardMeta(props.counts, props.daysChip))
const hasProgress = computed(() => showRing(props.ratio))
const percent = computed(() => ringPercent(props.ratio))
const isDone = computed(() => props.goal.status === 'done')

// A glyph per meta chip, so each says what it counts before it is read.
const CHIP_ICON: Record<string, 'clock' | 'list' | 'check-square' | 'flag'> = {
  days: 'clock',
  tasks: 'list',
  todos: 'check-square',
  checklist: 'flag',
}

// The tag wears the same chip a todo or task row does, so a tag reads as one
// thing across the three lists.
const { c, dark } = useStyles()
const tagStyle = computed(() => pxify(tagChip(c.value, props.goal.tag, dark.value)))
</script>

<template>
  <article
    class="gcard"
    :class="{ 'is-done': isDone, 'is-selected': selected }"
    :style="{ '--goal': goalColor }"
    :aria-current="selected || undefined"
  >
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
           on it does nothing rather than opening the dialog (section 18b). At
           zero it is a flat track: a "0" repeated down the grid said nothing. -->
      <span class="gcard__ring goalcard__ring" @click.stop>
        <template v-if="hasProgress">
          <!-- The card prints its own "7%" in the middle; the ring's own figure
               would sit on top of it. -->
          <ProgressRing :ratio="ratio" :size="40" :color="goal.color || undefined" hide-value />
          <span class="gcard__pct">{{ percent }}</span>
        </template>
        <span v-else class="gcard__track" aria-hidden="true"></span>
      </span>

      <div class="gcard__titleblock">
        <span class="gcard__dot" aria-hidden="true"></span>
        <h3 class="gcard__title">{{ goal.title || 'Untitled goal' }}</h3>
      </div>

      <div class="gcard__actions">
        <GoalCardTick :goal-id="goal.id" />
        <span @click.stop>
          <Dropdown
            label="Goal actions"
            variant="icon"
            :items="menu"
            @select="emit('menu', $event)"
          />
        </span>
      </div>
    </header>

    <p v-if="goal.description" class="gcard__desc">{{ goal.description }}</p>

    <div class="gcard__meta">
      <span v-if="goal.tag" class="gcard__tag" :style="tagStyle">{{ goal.tag }}</span>
      <span v-if="badge" :class="['gcard__badge', `gcard__badge--${goal.status}`]">
        {{ badge }}
      </span>
      <span
        v-for="chip in meta.chips"
        :key="chip.key"
        :class="['gcard__chip', `gcard__chip--${chip.tone}`]"
      >
        <Icon v-if="CHIP_ICON[chip.key]" :name="CHIP_ICON[chip.key]" size="xs" />
        {{ chip.text }}
      </span>
      <span v-if="meta.overflow" class="gcard__chip" :title="meta.overflowTitle">
        +{{ meta.overflow }}
      </span>
      <span v-if="meta.empty && !meta.chips.length" class="gcard__none">No items yet</span>
    </div>
  </article>
</template>

<style scoped>
.gcard {
  /* Full height so a row of cards is uniform; the grid supplies the height. */
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* The todo / task row's card (rowBase), so the three lists look alike. */
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  color: var(--theme-text);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
/* Hover: the rows' own — a hint of accent on the edge and the soft shadow. */
.gcard:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border));
  box-shadow: var(--shadow-soft);
}
/* Selected: exactly a selected todo or task row — accent edge, a faint wash
   and the 3px bar down the left. */
.gcard.is-selected {
  border-color: var(--theme-accent);
  background-color: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-card));
  box-shadow: inset 3px 0 0 var(--theme-accent);
}
.gcard.is-done {
  opacity: 0.6;
}

/* handle | ring | title block | actions. Four declared tracks, so nothing has
   to guess how much room is left. */
.gcard__head {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
}
.gcard__grip {
  display: grid;
  grid-template-columns: repeat(2, 3px);
  grid-auto-rows: 3px;
  gap: 3px;
  align-content: center;
  cursor: grab;
  /* Quiet until wanted: the handle fades in on hover, and its column is
     reserved either way so nothing shifts when it appears. */
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.gcard:hover .gcard__grip,
.gcard__grip:focus-visible {
  opacity: 0.5;
}
/* A touch device has no hover, so hiding it there would hide it for good. */
@media (hover: none) {
  .gcard__grip {
    opacity: 0.5;
  }
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
  /* A one-cell grid rather than relative/absolute: the percentage and the ring
     are stacked in the same declared cell, so the label has reserved space and
     nothing is positioned out of flow (section 19e). */
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}
.gcard__ring > * {
  grid-area: 1 / 1;
}
/* The percentage sits inside the ring, so no second label is needed. */
.gcard__pct {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
/* Zero progress: a thin track, no number. */
.gcard__track {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid color-mix(in oklch, var(--theme-dim) 22%, transparent);
}
.gcard__titleblock {
  /* The line that stops the overlap: without it a grid child refuses to shrink
     below its content width and pushes into the actions column. */
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
}
.gcard__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--goal);
}
.gcard__title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 1.3;
  /* Two lines, then an ellipsis. A title used to run to four lines and drag
     the rest of the header along with it. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
.gcard.is-done .gcard__title {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 40%, transparent);
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
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--theme-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
.gcard__meta {
  /* Pinned to the bottom, so meta rows align across cards of a row. One line:
     what does not fit becomes "+N" rather than wrapping the card taller. */
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  overflow: hidden;
  min-width: 0;
}
/* First in the meta row and never squeezed: it is what the list is filtered by. */
.gcard__tag {
  flex-shrink: 0;
  white-space: nowrap;
}
.gcard__none {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  opacity: 0.75;
  white-space: nowrap;
}
/* Quiet meta, like a todo row's second line: a glyph and a few words, muted.
   Only the dates that need attention — overdue, today — take a colour. */
.gcard__chip,
.gcard__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}
.gcard__chip {
  color: var(--theme-dim);
}
.gcard__chip--overdue {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.gcard__chip--today {
  color: var(--theme-warning);
  font-weight: var(--weight-semibold);
}
.gcard__badge {
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-weight: var(--weight-semibold);
}
.gcard__badge--active {
  color: var(--theme-success);
}
.gcard__badge--paused {
  background: color-mix(in oklch, var(--theme-warning) 14%, transparent);
  color: var(--theme-warning);
}
.gcard__badge--done {
  background: color-mix(in oklch, var(--accent, var(--theme-accent)) 14%, transparent);
  color: var(--accent, var(--theme-accent));
}
.gcard__badge--archived {
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .gcard {
    transition: none;
  }
}
</style>
