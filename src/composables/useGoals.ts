// The Goals CRUD surface (task 10b). A thin composable over the app store that
// gives every goal/point/attachment operation a single, consistent shape:
// optimistic by default (the store mutates its arrays synchronously, so the UI
// updates immediately), and — for the discrete committing operations — a forced
// save that rolls the store back to its pre-op snapshot if the write fails.
//
// High-frequency inline edits (typing a point's text) stay on the store's
// debounced autosave and the sync guard; the rollback wrapper is for the discrete
// actions where a failed write should visibly revert (create, remove, duplicate,
// archive, reorder, attach/detach, bulk add).

import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { Goal, GoalChecklistItem, GoalStatus, Task, Todo } from '@/types'
import type { GoalDoc } from '@/utils/goals'

export function useGoals() {
  const app = useAppStore()
  const { goals, goalChecklist, tasks, todos } = storeToRefs(app)

  // Snapshot the four arrays a goal op can touch, so a failed write restores the
  // exact pre-op state (arrays are replaced wholesale on every store mutation, so
  // a shallow copy of the array references is a sufficient checkpoint).
  function snapshot() {
    return {
      goals: goals.value,
      goalChecklist: goalChecklist.value,
      tasks: tasks.value,
      todos: todos.value,
    }
  }
  function restore(snap: ReturnType<typeof snapshot>) {
    goals.value = snap.goals
    goalChecklist.value = snap.goalChecklist
    tasks.value = snap.tasks
    todos.value = snap.todos
  }
  // Run an optimistic mutation, then force the write. On failure, roll the store
  // back to the snapshot and surface a toast. Returns the mutation's result so
  // callers can use the new id. A mid-op remote snapshot is handled by the sync
  // guard exactly as for any other write, so the op "survives a sync tick".
  async function commit<T>(mutate: () => T): Promise<T> {
    const snap = snapshot()
    const result = mutate()
    try {
      await app.saveCloudNow()
    } catch {
      restore(snap)
      app.showToastMsg('Change reverted — could not save')
    }
    return result
  }

  // ---- goals --------------------------------------------------------------
  const create = (fields: Partial<Goal> = {}) => commit(() => app.addGoal(fields))
  // Field-level patch, optimistic on the store's debounced autosave (never a
  // full-doc overwrite — updateGoal patches and bumps updatedAt/localRev).
  const update = (id: number, patch: Partial<Goal>) => app.updateGoal(id, patch)
  const duplicate = (id: number) => commit(() => app.duplicateGoal(id))
  const archive = (id: number) => commit(() => app.archiveGoal(id))
  const unarchive = (id: number) => commit(() => app.unarchiveGoal(id))
  // Delete + 8s undo toast holding the payload (handled in the store).
  const remove = (id: number) => commit(() => app.removeGoalWithUndo(id))
  const reorder = (id: number, beforeId: number | null, afterId: number | null) =>
    commit(() => app.reorderGoal(id, beforeId, afterId))
  const setStatus = (id: number, status: GoalStatus) => app.setGoalStatus(id, status)
  const setTimeline = (id: number, tl: { start?: string; target?: string }) =>
    app.setGoalTimeline(id, tl)
  const setColor = (id: number, color: string) => app.setGoalColor(id, color)

  // ---- points (checklist) -------------------------------------------------
  const addPoint = (
    gid: number,
    text: string,
    extra: Partial<Pick<GoalChecklistItem, 'estimateMins' | 'dueAt' | 'startAt' | 'tags'>> = {},
  ) => app.addChecklistItem(gid, text, extra)
  const updatePoint = (id: number, patch: Partial<GoalChecklistItem>) =>
    app.updateChecklistItem(id, patch)
  const togglePoint = (id: number) => app.toggleChecklistItem(id)
  const removePoint = (id: number) => app.deleteChecklistItem(id)
  const reorderPoints = (id: number, toIndex: number) => app.moveChecklistItem(id, toIndex)
  const bulkAddPoints = (gid: number, texts: string[]) =>
    commit(() => app.bulkAddChecklist(gid, texts))
  const startTimer = (id: number) => app.startChecklistTimer(id)
  const stopTimer = (id: number) => app.stopChecklistTimer(id)

  // ---- attachments (by reference, both sides written together) ------------
  const attachTask = (taskId: number, gid: number) =>
    commit(() => app.attachToGoal('tasks', taskId, gid))
  const detachTask = (taskId: number, gid: number) =>
    commit(() => app.detachFromGoal('tasks', taskId, gid))
  const attachTodo = (todoId: number, gid: number) =>
    commit(() => app.attachToGoal('todos', todoId, gid))
  const detachTodo = (todoId: number, gid: number) =>
    commit(() => app.detachFromGoal('todos', todoId, gid))

  // ---- JSON import / export ----------------------------------------------
  const importDocument = (doc: { goals: GoalDoc[] }, opts?: { sourceUrl?: string }) =>
    commit(() => app.importGoalsDocument(doc, opts))
  const exportGoal = (id: number, exportedAt: string): string | null =>
    app.exportGoal(id, exportedAt)

  // ---- reads (convenience passthroughs) -----------------------------------
  const progress = (id: number) => app.goalProgress(id)
  const counts = (id: number) => app.goalCounts(id)
  const time = (id: number) => app.goalTime(id)
  const checklistOf = (id: number) => app.checklistOf(id)
  const tasksOf = (id: number): Task[] => app.tasksOfGoal(id)
  const todosOf = (id: number): Todo[] => app.todosOfGoal(id)

  return {
    goals,
    create,
    update,
    duplicate,
    archive,
    unarchive,
    remove,
    reorder,
    setStatus,
    setTimeline,
    setColor,
    addPoint,
    updatePoint,
    togglePoint,
    removePoint,
    reorderPoints,
    bulkAddPoints,
    startTimer,
    stopTimer,
    attachTask,
    detachTask,
    attachTodo,
    detachTodo,
    importDocument,
    exportGoal,
    progress,
    counts,
    time,
    checklistOf,
    tasksOf,
    todosOf,
  }
}
