// What is coming up: every reminder's next occurrence, every deadline, and every
// idea with a deadline, soonest first with anything overdue ahead of them.
//
// One source for both places that show it — the reminder card in the left
// gutter (ReminderDock) and the NEXT pill in the top strip (ReminderPill) — so
// the card's first row and the pill can never name different things.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { occurrences } from '@/utils/reminders'
import { urg } from '@/utils/colors'
import type { Priority } from '@/types'

export interface Upcoming {
  key: string
  kind: 'deadline' | 'reminder'
  title: string
  /** Milliseconds from now; negative when overdue. */
  ms: number
  /** When it falls due, as epoch ms (end of day for a dated deadline). */
  at: number
  due?: string
  /** A reminder's own priority; deadlines have none. */
  priority?: Priority
}

/**
 * Whether the reminder card is on screen. The card sets it (it only appears
 * where the gutter beside the stage has room for it); the strip's pill reads
 * it and stands down, so the same news is not in two places at once.
 */
export const reminderDockShown = ref(false)

export function upcomingTime(ms: number): string {
  if (ms < 0) return 'overdue'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  if (days === 0 && hours === 0) return Math.max(1, Math.round(ms / 60000)) + 'm'
  return days + 'd ' + hours + 'h'
}

/**
 * How far off, in the words a person uses: "Today", "Tomorrow", "13 days", and
 * "2 days overdue". Counted in calendar days, not 24-hour blocks, so something
 * due at 9am tomorrow is "Tomorrow" at 11pm tonight.
 */
export function daysToGo(at: number, now: number): string {
  const day = (ms: number) => {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const days = Math.round((day(at) - day(now)) / 86400000)
  if (at < now) {
    const late = Math.max(0, -days)
    return late === 0 ? 'Overdue' : late === 1 ? '1 day overdue' : late + ' days overdue'
  }
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return days + ' days'
}

/** "Mon, 12 Oct · 9:00 AM" for a reminder; the date alone for a deadline. */
export function whenLabel(u: Upcoming): string {
  const d = new Date(u.at)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  if (u.kind !== 'reminder') return date
  return date + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function useUpcoming() {
  const { now } = storeToRefs(useUiStore())
  const { deadlines, reminders, ideas } = storeToRefs(useAppStore())
  const { dark } = useStyles()

  const deadlineItems = computed<Upcoming[]>(() => {
    const dated = [
      ...deadlines.value.map((t) => ({ key: 'deadline:' + t.id, title: t.title, due: t.due })),
      ...ideas.value
        // A finished or cleared idea no longer has anything coming up.
        .filter((i) => i.deadline && i.status !== 'done' && !i.archivedAt)
        .map((i) => ({ key: 'idea:' + i.id, title: i.title, due: i.deadline })),
    ]
    return dated.map((t) => {
      const at = new Date(t.due + 'T23:59:59').getTime()
      return { ...t, kind: 'deadline' as const, at, ms: at - now.value }
    })
  })
  const reminderItems = computed<Upcoming[]>(() =>
    reminders.value
      .map((r): Upcoming | null => {
        const next = occurrences(r, now.value).next
        return next
          ? {
              key: 'reminder:' + r.id,
              kind: 'reminder',
              title: r.title,
              at: next,
              ms: next - now.value,
              priority: r.priority,
            }
          : null
      })
      .filter((x): x is Upcoming => x !== null),
  )

  /** Overdue deadlines first (most overdue first), then everything by time. */
  const list = computed<Upcoming[]>(() => {
    const all = [...deadlineItems.value, ...reminderItems.value]
    const overdue = all.filter((u) => u.ms < 0).sort((a, b) => a.ms - b.ms)
    const ahead = all.filter((u) => u.ms >= 0).sort((a, b) => a.ms - b.ms)
    return [...overdue, ...ahead]
  })

  /**
   * The single next thing, by the rule the pill has always used: the nearest
   * deadline (an overdue one winning outright), unless a reminder comes sooner
   * than an upcoming deadline.
   */
  const next = computed<Upcoming | null>(() => {
    const ds = deadlineItems.value
    const overdue = ds.filter((t) => t.ms < 0).sort((a, b) => b.ms - a.ms)
    const ahead = ds.filter((t) => t.ms >= 0).sort((a, b) => a.ms - b.ms)
    const nextDeadline = overdue[0] || ahead[0] || null
    const nextReminder = [...reminderItems.value].sort((a, b) => a.ms - b.ms)[0]
    if (nextReminder && (!nextDeadline || nextDeadline.ms < 0 || nextReminder.ms < nextDeadline.ms))
      return nextReminder
    return nextDeadline
  })

  function colorOf(u: Upcoming): string {
    if (u.ms < 0) return 'var(--theme-danger)'
    // The theme's own colour rather than a status green: a reminder is not
    // good news, just the next thing.
    if (u.kind === 'reminder') return 'var(--theme-accent)'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = u.due
      ? Math.round((new Date(u.due + 'T00:00:00').getTime() - today.getTime()) / 86400000)
      : 0
    return urg(d, dark.value)
  }

  return { list, next, colorOf }
}
