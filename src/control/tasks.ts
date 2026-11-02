// Spasta tasks for the issue ↔ task link picker.
//
// A task lives in the workspace document (`aureon-notes/{uid}`, field `tasks`),
// not in a backend table, so the link's `task_ref` is the workspace task id as
// a string (backend D-16-1). The picker reads the tasks the app store already
// holds; on /dev the workspace is usually not loaded, so it falls back to
// reading the document once through the documents API.

import { getActivePinia } from 'pinia'
import { aureon } from '@/api/client'
import { tradingSession } from '@/trading/session'

/** `AUREON_COLLECTION` in src/firebase.ts, which this chunk does not import. */
export const WORKSPACE_NAMESPACE = 'aureon-notes'

export interface TaskOption {
  ref: string
  title: string
  done: boolean
}

interface RawTask {
  id?: unknown
  title?: unknown
  status?: unknown
  done?: unknown
  archivedAt?: unknown
}

export function toOptions(raw: unknown): TaskOption[] {
  if (!Array.isArray(raw)) return []
  return (raw as RawTask[])
    .filter((t) => (typeof t.id === 'number' || typeof t.id === 'string') && !t.archivedAt)
    .map((t) => ({
      ref: String(t.id),
      title: typeof t.title === 'string' && t.title ? t.title : `Task ${String(t.id)}`,
      done: t.status === 'done' || t.done === true,
    }))
}

export async function loadTasks(): Promise<TaskOption[]> {
  // The workspace store, if this tab already loaded it (read through pinia's
  // state so this chunk does not pull the whole store in).
  const held = (getActivePinia()?.state.value.app as { tasks?: unknown[] } | undefined)?.tasks
  if (held?.length) return toOptions(held)
  const uid = tradingSession.user?.uid
  if (!uid) return []
  const { data } = await aureon.GET('/api/finance/documents/{namespace}/{doc_id}', {
    params: { path: { namespace: WORKSPACE_NAMESPACE, doc_id: uid } },
  })
  return toOptions((data?.data as { tasks?: unknown } | undefined)?.tasks)
}
