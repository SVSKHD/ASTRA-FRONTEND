// The pure rules behind the Todo v2 pieces that are not just layout: what focus
// mode works on next, what "Next up" lists, and what the weekly review asks
// about. Kept out of the components so each rule is stated — and tested — once.
import { childrenOf, type TreeIndex } from '@/utils/taskTree'
import type { Todo } from '@/types'

const open = (t: Todo) => t.status !== 'done'

/**
 * What a todo's timer button focuses on: its first open subtask, in list order,
 * or — for a todo with no subtasks — the todo itself while it is still open.
 */
export function focusTargetOf(index: TreeIndex<Todo>, todoId: number): number | null {
  const todo = index.byId.get(todoId)
  if (!todo) return null
  const kids = childrenOf(index, todoId)
  if (kids.length) return kids.find(open)?.id ?? null
  return open(todo) ? todo.id : null
}

/** "Done, next": the next open sibling after `todoId` under the same parent. */
export function nextFocusAfter(index: TreeIndex<Todo>, todoId: number): number | null {
  const cur = index.byId.get(todoId)
  if (!cur || cur.parentId == null) return null
  const siblings = childrenOf(index, cur.parentId)
  const at = siblings.findIndex((s) => s.id === todoId)
  const after = [...siblings.slice(at + 1), ...siblings.slice(0, Math.max(0, at))]
  return after.find(open)?.id ?? null
}

/**
 * "Next up" (2c): up to `perTodo` open subtasks of each open top-level todo, in
 * list order. `keep` holds ids ticked from the panel this session, so a row the
 * reader just ticked stays put, struck through, instead of vanishing under the
 * pointer and pulling the next row into its place.
 */
export function nextUpOf(
  index: TreeIndex<Todo>,
  roots: Todo[],
  keep: ReadonlySet<number>,
  perTodo = 2,
): { parent: Todo; sub: Todo }[] {
  const out: { parent: Todo; sub: Todo }[] = []
  for (const parent of roots) {
    if (!open(parent)) continue
    let openTaken = 0
    for (const sub of childrenOf(index, parent.id)) {
      if (keep.has(sub.id)) out.push({ parent, sub })
      else if (open(sub) && openTaken < perTodo) {
        out.push({ parent, sub })
        openTaken++
      }
    }
  }
  return out
}

/** Monday 00:00 local of the week `now` falls in. */
export function weekStart(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** The weekly review's list: open, live todos that rolled over more than twice. */
export function reviewCandidates(todos: Todo[]): Todo[] {
  return todos
    .filter((t) => open(t) && t.archivedAt == null && t.rolloverCount > 2)
    .sort((a, b) => b.rolloverCount - a.rolloverCount)
}

export function weekStats(todos: Todo[], now: Date) {
  const from = weekStart(now).getTime()
  const doneThisWeek = todos.filter((t) => t.completedAt != null && t.completedAt >= from)
  return {
    done: doneThisWeek.filter((t) => t.parentId == null).length,
    subtasksClosed: doneThisWeek.filter((t) => t.parentId != null).length,
  }
}
