// The single "what's next" computation behind the top-bar ticker. Draws from
// deadlines, dated ideas and reminder occurrences, and picks the soonest —
// overdue deadlines first, then whichever upcoming item lands next.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { occurrences } from '@/utils/reminders'
import { urg } from '@/utils/colors'
import type { TabKey } from '@/types'

export interface NextDeadline {
  title: string
  ms: number
  kind: 'deadline' | 'reminder'
  due?: string
  tab: TabKey
}

export function useNextDeadline() {
  const app = useAppStore()
  const ui = useUiStore()
  const { deadlines, reminders, ideas } = storeToRefs(app)
  const { now, dark } = storeToRefs(ui)

  const next = computed<NextDeadline | null>(() => {
    // Dated ideas share the deadline pool, so a dated idea can be "next" too.
    const dated = [
      ...deadlines.value.map((t) => ({ title: t.title, due: t.due, tab: 'deadlines' as TabKey })),
      ...ideas.value
        .filter((i) => i.deadline)
        .map((i) => ({ title: i.title, due: i.deadline, tab: 'ideas' as TabKey })),
    ].map((t) => ({
      ...t,
      ms: new Date(t.due + 'T23:59:59').getTime() - now.value,
      kind: 'deadline' as const,
    }))
    const overdue = dated.filter((t) => t.ms < 0).sort((a, b) => b.ms - a.ms)
    const upcoming = dated.filter((t) => t.ms >= 0).sort((a, b) => a.ms - b.ms)
    const nextDeadline = overdue[0] || upcoming[0] || null

    const remNext = reminders.value
      .map((r) => {
        const occ = occurrences(r, now.value)
        return occ.next
          ? {
              title: r.title,
              ms: occ.next - now.value,
              kind: 'reminder' as const,
              tab: 'reminders' as TabKey,
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.ms - b.ms)[0]

    let result: NextDeadline | null = nextDeadline
    if (remNext && (!nextDeadline || nextDeadline.ms < 0 || remNext.ms < nextDeadline.ms)) {
      result = remNext
    }
    return result
  })

  const has = computed(() => !!next.value)

  const title = computed(() => {
    const n = next.value
    if (!n) return ''
    return (n.kind === 'reminder' ? 'Reminder: ' : '') + n.title
  })

  const timeLabel = computed(() => {
    const n = next.value
    if (!n) return ''
    if (n.ms < 0) return 'overdue'
    const days = Math.floor(n.ms / 86400000)
    const hours = Math.floor((n.ms % 86400000) / 3600000)
    return days > 0 ? days + 'd ' + hours + 'h' : hours + 'h'
  })

  const soon = computed(() => {
    const n = next.value
    return !!n && (n.ms < 0 || n.ms < 24 * 3600000)
  })

  const dotColor = computed(() => {
    const n = next.value
    if (!n) return ''
    if (n.ms < 0) return dark.value ? 'oklch(0.68 0.2 25)' : 'oklch(0.58 0.2 25)'
    if (n.kind === 'reminder') return 'oklch(0.75 0.14 145)'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = n.due
      ? Math.round((new Date(n.due + 'T00:00:00').getTime() - today.getTime()) / 86400000)
      : 0
    return urg(d, dark.value)
  })

  return { next, has, title, timeLabel, soon, dotColor }
}
