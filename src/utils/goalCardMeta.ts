// What a goal card actually says (section 19b).
//
// Three rules, applied here rather than scattered through a template:
//
//   - A badge that repeats the default state carries no information. Every card
//     showing ACTIVE told the reader nothing, and cost the title the width it
//     needed. Badges are for the states worth noticing.
//   - A chip reading "0 tasks" is not a count, it is an absence. Absences are
//     said once, in one muted line, not four times in four outlined pills.
//   - The meta row is one line. What fits, fits; the rest becomes "+2" with the
//     full list in its tooltip, so nothing is silently dropped.
//
// Pure and view-free, so the ordering and the overflow are checkable directly.

import type { GoalStatus } from '@/types'
import type { DaysChip } from '@/utils/detailFields'

export interface GoalCounts {
  checklist: number
  tasks: number
  todos: number
}

export interface MetaChip {
  key: string
  text: string
  tone: 'plain' | 'overdue' | 'today'
}

export interface CardMeta {
  chips: MetaChip[]
  // Chips that did not fit, as "+N" with everything they said in `overflowTitle`.
  overflow: number
  overflowTitle: string
  // True when the goal holds nothing at all — one muted line instead of chips.
  empty: boolean
}

// How many chips a 300px card can show without the row wrapping. Deliberately
// small: the row is one line and truncating it is worse than summarising it.
export const MAX_META_CHIPS = 3

// The badge, or null when the status is the default and says nothing.
// `archived` is included because a card only appears archived when the reader
// filtered for it, and confirming that is worth a badge.
export function statusBadge(status: GoalStatus): string | null {
  switch (status) {
    case 'active':
      return null
    case 'paused':
      return 'Paused'
    case 'done':
      return 'Done'
    case 'archived':
      return 'Archived'
  }
}

const COUNT_LABELS: { key: keyof GoalCounts; singular: string; plural: string }[] = [
  { key: 'tasks', singular: 'task', plural: 'tasks' },
  { key: 'todos', singular: 'todo', plural: 'todos' },
  { key: 'checklist', singular: 'point', plural: 'points' },
]

// The meta row. `daysChip` leads when there is one — a deadline outranks a
// count — and the counts follow largest first, because the biggest pile is the
// one worth knowing about at a glance.
export function cardMeta(counts: GoalCounts, daysChip: DaysChip | null): CardMeta {
  const countChips: MetaChip[] = COUNT_LABELS.map(({ key, singular, plural }, rank) => ({
    key,
    rank,
    value: counts[key] ?? 0,
    singular,
    plural,
  }))
    .filter((c) => c.value > 0)
    // Largest first; ties fall back to the declared order above rather than to
    // the alphabet, so "1 task" beats "1 point" the way a reader would expect.
    .sort((a, b) => b.value - a.value || a.rank - b.rank)
    .map((c) => ({
      key: c.key,
      text: `${c.value} ${c.value === 1 ? c.singular : c.plural}`,
      tone: 'plain' as const,
    }))

  const empty = countChips.length === 0

  const all: MetaChip[] = daysChip
    ? [
        {
          key: 'days',
          text: daysChip.text,
          tone: daysChip.tone === 'ahead' ? 'plain' : daysChip.tone,
        },
      ]
    : []
  all.push(...countChips)

  const chips = all.slice(0, MAX_META_CHIPS)
  const hidden = all.slice(MAX_META_CHIPS)
  return {
    chips,
    overflow: hidden.length,
    overflowTitle: hidden.map((c) => c.text).join(' · '),
    empty,
  }
}

// The ring drawn at zero on every card was dead weight — a "0" repeated across
// the grid. Below this it renders as a flat track with no number.
export function showRing(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > 0
}

// The percentage that goes inside the ring, so no separate label is needed.
export function ringPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return ''
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
}
