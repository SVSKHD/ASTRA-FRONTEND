// Ticking a todo off from the list. The store marks it done at once, so its
// save starts straight away, but the row stays where it is — ticked, struck
// through — until that save has landed and the tick has been on screen long
// enough to read. Then it slides out to Completed and a toast offers Undo.
//
// Ticks made in a burst queue up rather than each row jumping away under the
// pointer: every new tick restarts the wait, so the whole burst stays put
// until the last one is saved, they leave together, and one toast counts them
// all and undoes them all.
//
// Module-level state: the carried-over rows (TodoView) and today's rows
// (TreeList) are different components, and a burst can span both.
import { nextTick, ref } from 'vue'
import { useAppStore } from '@/stores/app'

// Longer than the store's 600ms save debounce, so the save has started by the
// time the wait for it begins.
const MIN_VISIBLE_MS = 700
// Matches the row's exit transition in TreeList / TodoView.
export const LEAVE_MS = 240
const TOAST_MS = 8000

// Ticked and still shown in its open list.
const held = ref<Set<number>>(new Set())
// Playing the exit, on the way to Completed.
const leaving = ref<Set<number>>(new Set())
let settleTimer: ReturnType<typeof setTimeout> | undefined
let waitToken = 0
// The ids the visible "Completed …" toast covers, so a second burst while it
// is still up adds to it instead of taking Undo away from the first.
let batch: number[] = []
let batchToast: unknown = null

function without(set: Set<number>, ids: number[]): Set<number> {
  const next = new Set(set)
  for (const id of ids) next.delete(id)
  return next
}

export function useTodoCompletion() {
  const app = useAppStore()

  const find = (id: number) => app.todos.find((t) => t.id === id)

  function isHeld(id: number) {
    return held.value.has(id) || leaving.value.has(id)
  }
  function isLeaving(id: number) {
    return leaving.value.has(id)
  }

  // The checkbox. Ticking queues the todo; unticking (a held row, or one in
  // Completed) reopens it immediately.
  function toggle(id: number) {
    const todo = find(id)
    if (!todo) return
    if (todo.status === 'done') {
      held.value = without(held.value, [id])
      leaving.value = without(leaving.value, [id])
      app.setTodoStatus(id, 'pending')
      return
    }
    held.value = new Set(held.value).add(id)
    app.setTodoStatus(id, 'done')
    scheduleSettle()
  }

  function scheduleSettle() {
    const token = ++waitToken
    clearTimeout(settleTimer)
    settleTimer = setTimeout(async () => {
      // Let the store's watcher schedule the save before asking after it.
      await nextTick()
      await app.whenSaved()
      // A later tick restarted the wait; its own settle takes these along.
      if (token === waitToken) settle()
    }, MIN_VISIBLE_MS)
  }

  function settle() {
    const ids = [...held.value].filter((id) => find(id)?.status === 'done')
    held.value = new Set()
    if (!ids.length) return
    leaving.value = new Set([...leaving.value, ...ids])
    setTimeout(() => {
      leaving.value = without(leaving.value, ids)
      announce(ids.filter((id) => find(id)?.status === 'done'))
    }, LEAVE_MS)
  }

  function announce(ids: number[]) {
    if (!ids.length) return
    if (app.toast == null || app.toast !== batchToast) batch = []
    batch = [...batch.filter((id) => find(id)?.status === 'done'), ...ids]
    const undoIds = batch.slice()
    const first = find(undoIds[0])
    const text = first?.text ?? ''
    const short = text.length > 40 ? text.slice(0, 40) + '…' : text
    const message =
      undoIds.length === 1 ? 'Completed "' + short + '"' : 'Completed ' + undoIds.length + ' todos'
    app.showToastWithUndo(
      message,
      () => {
        batch = []
        for (const id of undoIds) if (find(id)) app.setTodoStatus(id, 'pending')
      },
      TOAST_MS,
    )
    batchToast = app.toast
  }

  return { toggle, isHeld, isLeaving }
}
