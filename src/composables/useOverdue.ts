// Everything that is late, in one list, for the Overdue card in the left gutter:
//   • tasks past their due date and not done,
//   • deadlines (and dated ideas) whose day has gone,
//   • top-level todos still open from an earlier day — the ones the Todo tab
//     shows as "carried over".
// Latest first. Overdue deadlines used to head the Reminders card; they live
// here now, so that card is only what is coming up.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { ymd } from '@/utils/dayGroups'
import { isOverdueTodo, todayKey } from '@/utils/rollover'
import type { TabKey } from '@/types'

export interface Overdue {
  key: string
  kind: 'Task' | 'Todo' | 'Deadline' | 'Idea'
  title: string
  /** Whole days late (0 = due earlier today). */
  days: number
  tab: TabKey
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + 'T00:00:00').getTime()
  const b = new Date(toYmd + 'T00:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function lateLabel(days: number): string {
  return days === 0 ? 'Due today' : days === 1 ? '1 day late' : days + ' days late'
}

export function useOverdue() {
  const { now } = storeToRefs(useUiStore())
  const { tasks, todos, deadlines, ideas } = storeToRefs(useAppStore())

  const list = computed<Overdue[]>(() => {
    const today = todayKey(new Date(now.value))
    const out: Overdue[] = []
    for (const t of tasks.value) {
      if (!t.deadline || t.status === 'done' || t.archivedAt || t.deadline >= today) continue
      out.push({
        key: 'task:' + t.id,
        kind: 'Task',
        title: t.title,
        days: daysBetween(t.deadline, today),
        tab: 'tasks',
      })
    }
    for (const d of deadlines.value) {
      if (!d.due || d.due >= today) continue
      out.push({
        key: 'deadline:' + d.id,
        kind: 'Deadline',
        title: d.title,
        days: daysBetween(d.due, today),
        tab: 'deadlines',
      })
    }
    for (const i of ideas.value) {
      if (!i.deadline || i.deadline >= today || i.status === 'done' || i.archivedAt) continue
      out.push({
        key: 'idea:' + i.id,
        kind: 'Idea',
        title: i.title,
        days: daysBetween(i.deadline, today),
        tab: 'ideas',
      })
    }
    for (const t of todos.value) {
      if (t.parentId != null || t.archivedAt || !isOverdueTodo(t, today)) continue
      out.push({
        key: 'todo:' + t.id,
        kind: 'Todo',
        title: t.text,
        days: daysBetween(ymd(new Date(t.createdAt)), today),
        tab: 'todo',
      })
    }
    return out.sort((a, b) => b.days - a.days)
  })

  return { list }
}
