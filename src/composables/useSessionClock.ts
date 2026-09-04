// The countdown to the next session open (section 34).
//
// This is the only always-visible element on the Trades tab, and it is there
// because of what happens at the open: a signal lands, and the difference
// between logging the trade and not logging it is how much typing stands
// between the two. So at T-5 the form is pre-armed — date, IST time, session
// and last symbol filled, cursor in entry — and logging a signalled trade is
// one number and Enter.
//
// The boundary is read on the BROKER's clock, because that is the frame the
// sessions are quoted in, and shown in both because that is the frame the
// trader is sitting in. Neither is stored: both are readings of the same
// instant, taken again every tick.

import { computed, onUnmounted, ref } from 'vue'
import { IST, hhmmOn, minutesOfDay, minutesOfDayOn, type Clock } from '@/utils/tradeTime'
import type { SessionBounds, TradeSession } from '@/types'

/** How long before the open the form is armed. */
export const ARM_MINUTES = 5
/** The tick. A second, because the last minute of a countdown is read closely. */
const TICK_MS = 1_000

export interface NextOpen {
  session: TradeSession
  /** The instant it opens. */
  at: number
  /** Whole minutes until then, floored — what the label counts down. */
  minutes: number
  /** Seconds within that minute, so the display can tick. */
  seconds: number
  broker: string
  ist: string
  /** Inside the arming window: the form should already be filled. */
  armed: boolean
}

const ORDER: { session: TradeSession; key: keyof SessionBounds }[] = [
  { session: 'Asia', key: 'asia' },
  { session: 'London', key: 'london' },
  { session: 'NY', key: 'ny' },
]

/**
 * The next open at or after `now`, on the broker's clock.
 *
 * Pure and exported so the arithmetic can be tested at a fixed instant rather
 * than waited for. Wraps to tomorrow's first open when the day's are all past,
 * which is the case for most of the evening.
 */
export function nextOpenAt(clock: Clock, bounds: SessionBounds, now: number): NextOpen | null {
  const nowMins = minutesOfDayOn(clock, now)
  const opens = ORDER.map((o) => ({ ...o, mins: minutesOfDay(bounds[o.key]) })).filter(
    (o): o is { session: TradeSession; key: keyof SessionBounds; mins: number } => o.mins != null,
  )
  if (!opens.length) return null
  const ahead = opens.find((o) => o.mins > nowMins)
  const target = ahead ?? opens[0]
  // Minutes to the boundary, wrapping a whole day when the next one is
  // tomorrow's. Computed in minutes-of-day rather than by building a date, so a
  // DST shift on the broker's clock cannot make it negative.
  const delta = ((target.mins - nowMins + 1440) % 1440 || 1440) * 60_000
  // Aligned to the start of the current minute so the seconds part is the
  // remainder rather than an accumulating drift.
  const at = now - (now % 60_000) + delta
  const totalSeconds = Math.max(0, Math.round((at - now) / 1000))
  return {
    session: target.session,
    at,
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
    broker: hhmmOn(clock, at),
    ist: hhmmOn(IST, at),
    armed: totalSeconds <= ARM_MINUTES * 60,
  }
}

export function useSessionClock(broker: () => Clock, bounds: () => SessionBounds) {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), TICK_MS)
  onUnmounted(() => clearInterval(timer))

  const next = computed(() => nextOpenAt(broker(), bounds(), now.value))
  const armed = computed(() => next.value?.armed === true)

  /** 'H:MM:SS' when there is an hour left, 'M:SS' when there is not. */
  const countdown = computed(() => {
    const n = next.value
    if (!n) return '—'
    const h = Math.floor(n.minutes / 60)
    const m = n.minutes % 60
    const s = String(n.seconds).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
  })

  return { now, next, armed, countdown }
}
