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

// Longer than the store's 600ms save debounce. A burst of ticks waits longer
// still (the store writes once the ticking stops), and whenSaved below covers
// that wait.
const MIN_VISIBLE_MS = 700
// Matches the row's exit transition in TreeList / TodoView.
export const LEAVE_MS = 240
const TOAST_MS = 8000

function createState() {
  return {
    held: ref<Set<number>>(new Set()),
    leaving: ref<Set<number>>(new Set()),
    settleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    waitToken: 0,
    batch: [] as number[],
    batchToast: null as unknown,
  }
}
const states = new WeakMap<
  ReturnType<typeof useAppStore>,
  { todos: ReturnType<typeof createState>; tasks: ReturnType<typeof createState> }
>()

function without(set: Set<number>, ids: number[]): Set<number> {
  const next = new Set(set)
  for (const id of ids) next.delete(id)
  return next
}

export function useTodoCompletion(collection: 'todos' | 'tasks' = 'todos') {
  const app = useAppStore()
  let storeState = states.get(app)
  if (!storeState) {
    storeState = { todos: createState(), tasks: createState() }
    states.set(app, storeState)
  }
  const state = storeState[collection]
  const setStatus = (id: number, status: 'pending' | 'done') =>
    collection === 'tasks' ? app.setTaskStatus(id, status) : app.setTodoStatus(id, status)

  const find = (id: number) => app[collection].find((t) => t.id === id)

  function isHeld(id: number) {
    return state.held.value.has(id) || state.leaving.value.has(id)
  }
  function isLeaving(id: number) {
    return state.leaving.value.has(id)
  }

  // The checkbox. Ticking queues the todo; unticking (a held row, or one in
  // Completed) reopens it immediately.
  function toggle(id: number) {
    const todo = find(id)
    if (!todo) return
    if (todo.status === 'done') {
      state.held.value = without(state.held.value, [id])
      state.leaving.value = without(state.leaving.value, [id])
      setStatus(id, 'pending')
      return
    }
    state.held.value = new Set(state.held.value).add(id)
    setStatus(id, 'done')
    scheduleSettle()
  }

  function scheduleSettle() {
    const token = ++state.waitToken
    clearTimeout(state.settleTimer)
    state.settleTimer = setTimeout(async () => {
      // Let the store's watcher schedule the save before asking after it.
      await nextTick()
      await app.whenSaved()
      // A later tick restarted the wait; its own settle takes these along.
      if (token === state.waitToken) settle()
    }, MIN_VISIBLE_MS)
  }

  function settle() {
    const ids = [...state.held.value].filter((id) => find(id)?.status === 'done')
    state.held.value = new Set()
    if (!ids.length) return
    state.leaving.value = new Set([...state.leaving.value, ...ids])
    setTimeout(() => {
      state.leaving.value = without(state.leaving.value, ids)
      announce(ids.filter((id) => find(id)?.status === 'done'))
    }, LEAVE_MS)
  }

  function announce(ids: number[]) {
    if (!ids.length) return
    if (app.toast == null || app.toast !== state.batchToast) state.batch = []
    state.batch = [...state.batch.filter((id) => find(id)?.status === 'done'), ...ids]
    const undoIds = state.batch.slice()
    const first = find(undoIds[0])
    const text = first ? ('text' in first ? first.text : first.title) : ''
    const short = text.length > 40 ? text.slice(0, 40) + '…' : text
    const message =
      undoIds.length === 1
        ? 'Completed "' + short + '"'
        : 'Completed ' + undoIds.length + ' ' + collection
    app.showToastWithUndo(
      message,
      () => {
        state.batch = []
        for (const id of undoIds) if (find(id)) setStatus(id, 'pending')
      },
      TOAST_MS,
    )
    state.batchToast = app.toast
  }

  return { toggle, isHeld, isLeaving }
}
