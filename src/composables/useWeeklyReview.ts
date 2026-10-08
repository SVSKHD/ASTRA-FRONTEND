// The weekly review's data (Todo v2, 5c), shared by the drawer and the badge on
// the Todo tab's "Weekly review" button so the two can never disagree.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { reviewCandidates, weekStart, weekStats } from '@/utils/todoV2'
import type { Todo } from '@/types'

export function useWeeklyReview() {
  const app = useAppStore()
  const ui = useUiStore()
  const { todos } = storeToRefs(app)
  const { reviewDecisions, now } = storeToRefs(ui)

  // A decided todo stays listed for the rest of the session — a dropped one is
  // archived and would otherwise disappear, taking its undo with it.
  const items = computed<Todo[]>(() => {
    const decided = new Set(Object.keys(reviewDecisions.value).map(Number))
    const base = reviewCandidates(todos.value)
    const seen = new Set(base.map((t) => t.id))
    const extra = todos.value.filter((t) => decided.has(t.id) && !seen.has(t.id))
    return [...base, ...extra]
  })
  const undecided = computed(() => items.value.filter((t) => !reviewDecisions.value[t.id]).length)
  const stats = computed(() => weekStats(todos.value, new Date(now.value)))
  const weekLabel = computed(() =>
    weekStart(new Date(now.value)).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    }),
  )

  function decide(t: Todo, kind: 'keep' | 'drop') {
    const cur = reviewDecisions.value[t.id]
    // Take back whatever was done first; a second click on the same choice is
    // an undo, a click on the other choice is a switch.
    if (cur)
      app.updateTodo(t.id, { createdAt: cur.prior.createdAt, archivedAt: cur.prior.archivedAt })
    if (cur?.kind === kind) {
      ui.setReviewDecision(t.id, null)
      return
    }
    const prior = {
      createdAt: cur?.prior.createdAt ?? t.createdAt,
      archivedAt: cur?.prior.archivedAt ?? t.archivedAt ?? null,
    }
    if (kind === 'keep') app.updateTodo(t.id, { createdAt: Date.now() })
    else app.updateTodo(t.id, { archivedAt: Date.now() })
    ui.setReviewDecision(t.id, { kind, prior })
  }

  // The bulk bar's choice for many todos at once. Unlike `decide` it never
  // toggles: a todo already decided that way is left alone, so applying "Drop"
  // to a mixed selection drops every one rather than undoing some.
  function decideMany(ts: Todo[], kind: 'keep' | 'drop') {
    for (const t of ts) if (reviewDecisions.value[t.id]?.kind !== kind) decide(t, kind)
  }
  // Take back whatever was decided on each, leaving undecided ones as they are.
  function undoMany(ts: Todo[]) {
    for (const t of ts) {
      const cur = reviewDecisions.value[t.id]
      if (cur) decide(t, cur.kind)
    }
  }

  return {
    items,
    undecided,
    stats,
    weekLabel,
    decide,
    decideMany,
    undoMany,
    decisions: reviewDecisions,
  }
}
