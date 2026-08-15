// Pure metric + occurrence-history maths for recurring goals (task 11). Given a
// goal's metric config and its occurrence records, compute the outcome of a single
// capture, and the rolling streak / average / completion stats the detail header
// and dashboard show. Skipped days are neutral (excluded from streak, average and
// completion rate); missed days count against completion and break the streak.

export type MetricDirection = 'at_least' | 'at_most' | 'exact'
export type MetricUnit = 'USD' | 'INR' | 'count' | 'mins' | 'kg' | string

export interface Metric {
  enabled: boolean
  label: string
  unit: MetricUnit
  target: number
  direction: MetricDirection
  allowPartial: boolean
}

export type OccurrenceStatus = 'pending' | 'done' | 'missed' | 'skipped'

export interface Occurrence {
  date: string // yyyy-mm-dd, doubles as the doc id
  status: OccurrenceStatus
  target: number // snapshotted at generation time
  actual: number | null
  note: string | null
}

// Whether an actual meets the target for the metric's direction.
export function meetsTarget(direction: MetricDirection, target: number, actual: number): boolean {
  switch (direction) {
    case 'at_least':
      return actual >= target
    case 'at_most':
      return actual <= target
    case 'exact':
      return actual === target
  }
}

export interface CaptureOutcome {
  hit: boolean
  pct: number // actual vs target, 0..100+ (clamped display is the caller's job)
  // Whether the shortfall should be offered as "mark as missed instead" — only
  // when partials are disallowed and the target was not met.
  offerMissed: boolean
}

// Compute the outcome of entering `actual`. The actual is always stored as
// entered; this only decides colour/label and whether to offer "mark as missed".
export function captureOutcome(metric: Metric, actual: number): CaptureOutcome {
  const hit = meetsTarget(metric.direction, metric.target, actual)
  const pct = metric.target > 0 ? Math.round((actual / metric.target) * 100) : hit ? 100 : 0
  return { hit, pct, offerMissed: !hit && !metric.allowPartial }
}

// Sort a copy of occurrences ascending by date.
function byDate(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Current streak: consecutive completed occurrences ending at the most recent
// non-skipped day (skipped days are transparent — they neither add nor break).
// A missed or still-pending day breaks the run.
export function currentStreak(occurrences: Occurrence[]): number {
  const asc = byDate(occurrences)
  let streak = 0
  for (let i = asc.length - 1; i >= 0; i--) {
    const o = asc[i]
    if (o.status === 'skipped') continue
    if (o.status === 'done') streak++
    else break
  }
  return streak
}

// Best streak ever: the longest run of completed days, skipped days transparent.
export function bestStreak(occurrences: Occurrence[]): number {
  const asc = byDate(occurrences)
  let best = 0
  let run = 0
  for (const o of asc) {
    if (o.status === 'skipped') continue
    if (o.status === 'done') {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

// Completion rate over decided days: done / (done + missed). Skipped and pending
// days are excluded. Returns 0 when there are no decided days.
export function completionRate(occurrences: Occurrence[]): number {
  let done = 0
  let decided = 0
  for (const o of occurrences) {
    if (o.status === 'done') {
      done++
      decided++
    } else if (o.status === 'missed') {
      decided++
    }
  }
  return decided ? done / decided : 0
}

export interface RollingStats {
  windowDays: number
  totalActual: number
  avgActual: number // over days with a recorded actual (done)
  daysHit: number // done days whose actual met target
  daysDone: number
  cumulativeActual: number
  cumulativeTarget: number // target summed over decided (done+missed) days
}

// Rolling stats over the last `windowDays` ending at (and including) `todayStr`.
// Averages/totals use recorded actuals (done days); cumulative target spans every
// decided day so "actual vs target" is comparable. Skipped days are excluded.
export function rollingStats(
  occurrences: Occurrence[],
  windowDays: number,
  todayStr: string,
  metric: Pick<Metric, 'direction'>,
): RollingStats {
  const fromExclusive = shiftDays(todayStr, -(windowDays - 1))
  let totalActual = 0
  let daysWithActual = 0
  let daysHit = 0
  let daysDone = 0
  let cumulativeTarget = 0
  for (const o of occurrences) {
    if (o.date < fromExclusive || o.date > todayStr) continue
    if (o.status === 'skipped' || o.status === 'pending') continue
    if (o.status === 'missed') {
      cumulativeTarget += o.target
      continue
    }
    // done
    daysDone++
    cumulativeTarget += o.target
    if (o.actual != null) {
      totalActual += o.actual
      daysWithActual++
      if (meetsTarget(metric.direction, o.target, o.actual)) daysHit++
    }
  }
  return {
    windowDays,
    totalActual,
    avgActual: daysWithActual ? totalActual / daysWithActual : 0,
    daysHit,
    daysDone,
    cumulativeActual: totalActual,
    cumulativeTarget,
  }
}

// Local, dependency-free day shift on a yyyy-mm-dd string (UTC math, DST-safe).
function shiftDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}
