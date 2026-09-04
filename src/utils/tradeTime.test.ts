// Two clocks, one instant (section 31).
//
// Every test here is really the same test asked five ways: is the stored thing
// the MOMENT, or is it a string somebody adds hours to? The difference only
// shows up twice a year and at midnight, which is exactly why it is pinned
// here rather than left to be noticed in March.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SESSION_BOUNDS,
  IST,
  clocksFor,
  hasTime,
  hhmmOn,
  hourExtremes,
  hourlyStats,
  instantFromWall,
  isEstimated,
  minutesOfDay,
  offsetAt,
  offsetLabel,
  peakCount,
  sessionAt,
  timed,
  ymdOn,
  zoneOffsetMinutes,
  type Clock,
} from '@/utils/tradeTime'
import type { Trade } from '@/types'

/** A broker on a fixed GMT+3, which is what an unnamed MT5 server is. */
const FIXED: Clock = { zone: '', offsetMinutes: 180 }
/** A broker whose zone is known — the one that survives a DST change. */
const ATHENS: Clock = { zone: 'Europe/Athens', offsetMinutes: 180 }

function makeTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    userId: 'u1',
    istDate: '2026-09-01',
    ts: 1,
    entryAt: 0,
    exitAt: 0,
    istTime: '',
    brokerOffsetMinutes: 180,
    symbol: 'XAUUSD',
    session: 'London',
    side: 'buy',
    lot: 1,
    entry: 2400,
    exit: 2410,
    move: 10,
    pl: 1000,
    note: '',
    createdAt: 0,
    ...over,
  }
}

describe('the offset is read at the instant, not looked up once', () => {
  it('gives Kolkata its five and a half hours', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', Date.UTC(2026, 0, 15))).toBe(330)
    expect(zoneOffsetMinutes('Asia/Kolkata', Date.UTC(2026, 6, 15))).toBe(330)
  })

  it('gives Athens +02:00 in January and +03:00 in July', () => {
    // The single fact the whole module exists to respect. A hard-coded offset
    // is wrong for one half of every year of history, and it is wrong quietly.
    expect(zoneOffsetMinutes('Europe/Athens', Date.UTC(2026, 0, 15, 12))).toBe(120)
    expect(zoneOffsetMinutes('Europe/Athens', Date.UTC(2026, 6, 15, 12))).toBe(180)
  })

  it('falls back to the fixed offset when the zone name is nonsense', () => {
    // A typo in settings must not throw on every row of the table.
    expect(offsetAt({ zone: 'Europe/Atlantis', offsetMinutes: 180 }, Date.UTC(2026, 0, 1))).toBe(
      180,
    )
  })

  it('writes an offset the way a broker quotes one', () => {
    expect(offsetLabel(180)).toBe('+03:00')
    expect(offsetLabel(330)).toBe('+05:30')
    expect(offsetLabel(-240)).toBe('−04:00')
  })
})

describe('a wall clock and the instant it names', () => {
  it('round-trips an IST reading', () => {
    const at = instantFromWall(IST, '2026-09-01', '19:42')!
    expect(hhmmOn(IST, at)).toBe('19:42')
    expect(ymdOn(IST, at)).toBe('2026-09-01')
    // 19:42 IST is 14:12 UTC, which is 17:12 on a GMT+3 broker. This is the
    // pair the row displays.
    expect(hhmmOn({ zone: '', offsetMinutes: 0 }, at)).toBe('14:12')
    expect(hhmmOn(FIXED, at)).toBe('17:12')
  })

  it('lands on the right side of a spring-forward morning', () => {
    // Athens moves 03:00 → 04:00 on 29 March 2026. A naive "add the offset"
    // conversion puts 04:30 that morning an hour out; the second resolving
    // pass is what fixes it.
    const at = instantFromWall(ATHENS, '2026-03-29', '04:30')!
    expect(hhmmOn(ATHENS, at)).toBe('04:30')
    expect(zoneOffsetMinutes('Europe/Athens', at)).toBe(180)
  })

  it('reads the same broker clock differently in January and July, from the zone alone', () => {
    const winter = instantFromWall(IST, '2026-01-15', '19:42')!
    const summer = instantFromWall(IST, '2026-07-15', '19:42')!
    // Same IST reading, two different broker readings — because they are two
    // different instants and Athens was on two different offsets.
    expect(hhmmOn(ATHENS, winter)).toBe('16:12')
    expect(hhmmOn(ATHENS, summer)).toBe('17:12')
  })

  it('crosses midnight rather than wrapping inside the day', () => {
    // 03:00 IST is 21:30 the previous day on a GMT-3 clock. A string-based
    // conversion keeps the date and gets the day wrong.
    const at = instantFromWall(IST, '2026-09-02', '03:00')!
    const west: Clock = { zone: '', offsetMinutes: -180 }
    expect(hhmmOn(west, at)).toBe('18:30')
    expect(ymdOn(west, at)).toBe('2026-09-01')
  })

  it('refuses a reading that is not one', () => {
    expect(instantFromWall(IST, '2026-09-01', '25:00')).toBeNull()
    expect(instantFromWall(IST, 'today', '09:00')).toBeNull()
    expect(minutesOfDay('9:05')).toBe(545)
    expect(minutesOfDay('09:60')).toBeNull()
  })
})

describe('the session comes from the broker clock', () => {
  const at = (time: string) => instantFromWall(FIXED, '2026-09-01', time)!

  it('reads each boundary as an open interval on the right', () => {
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('03:00'))).toBe('Asia')
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('08:59'))).toBe('Asia')
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('09:00'))).toBe('London')
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('14:59'))).toBe('London')
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('15:00'))).toBe('NY')
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('21:59'))).toBe('NY')
  })

  it('says nothing rather than guessing between the close and the open', () => {
    // 22:00 to 03:00 is not a session, and naming it after the nearest one
    // would file trades under a market that was shut.
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('22:00'))).toBeNull()
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, at('01:30'))).toBeNull()
  })

  it('moves with the broker, not with the trader', () => {
    // 12:00 IST is 09:30 on a GMT+3 broker — London by five minutes. Read on
    // IST's own clock it would be London by three hours, and on a different
    // broker it could be Asia. Which clock the boundary is read on is the
    // whole question.
    const noonIst = instantFromWall(IST, '2026-09-01', '12:00')!
    expect(sessionAt(FIXED, DEFAULT_SESSION_BOUNDS, noonIst)).toBe('London')
    expect(sessionAt({ zone: '', offsetMinutes: 60 }, DEFAULT_SESSION_BOUNDS, noonIst)).toBe('Asia')
  })
})

describe('what a row says about its own time', () => {
  const at = Date.UTC(2026, 8, 1, 14, 12)

  it('reads a row through the offset it was stored with when no zone is named', () => {
    const trade = makeTrade({ entryAt: at, brokerOffsetMinutes: 120 })
    // Settings say +03:00 today; the row says it was taken on a +02:00 broker,
    // and the row wins. Otherwise a DST change silently moves a year of
    // history by an hour.
    expect(clocksFor(trade, FIXED)!.broker).toBe('16:12')
    expect(clocksFor(trade, FIXED)!.brokerOffset).toBe('+02:00')
  })

  it('prefers a named zone, because it resolves per date and a stored number cannot', () => {
    const trade = makeTrade({ entryAt: at, brokerOffsetMinutes: 999 })
    expect(clocksFor(trade, ATHENS)!.broker).toBe('17:12')
  })

  it('gives all three readings of the one instant', () => {
    const c = clocksFor(makeTrade({ entryAt: at }), FIXED)!
    expect(c).toMatchObject({ ist: '19:42', broker: '17:12', utc: '14:12' })
  })

  it('has nothing to say about a row with no instant', () => {
    expect(clocksFor(makeTrade(), FIXED)).toBeNull()
    expect(hasTime(makeTrade())).toBe(false)
    expect(isEstimated(makeTrade())).toBe(true)
    expect(isEstimated(makeTrade({ entryAt: at, timeEstimated: true }))).toBe(true)
    expect(isEstimated(makeTrade({ entryAt: at }))).toBe(false)
  })
})

describe('the hour of the day', () => {
  const REFERENCE = instantFromWall(IST, '2026-09-01', '00:00')!
  const hourAt = (h: number, over: Partial<Trade> = {}) =>
    makeTrade({
      id: `h${h}-${Math.random()}`,
      entryAt: instantFromWall(IST, '2026-09-02', `${String(h).padStart(2, '0')}:30`)!,
      ...over,
    })

  it('buckets by the trader’s own clock', () => {
    const cells = hourlyStats([hourAt(19), hourAt(19), hourAt(4)], FIXED, REFERENCE)
    expect(cells[19].count).toBe(2)
    expect(cells[4].count).toBe(1)
    expect(cells[0].count).toBe(0)
    // And carries the broker's reading of the same hour on the second axis.
    // Not a whole hour, because IST is not a whole number of hours from GMT+3
    // — which is the reason both readings are shown at all.
    expect(cells[19].broker).toBe('16:30')
  })

  it('leaves out the times nobody typed', () => {
    // A backfilled midnight counted as data is a spike of trades at 00:00 that
    // never happened, which is the entire reason the flag exists.
    const rows = [hourAt(0, { timeEstimated: true }), hourAt(9), makeTrade({ id: 'none' })]
    expect(timed(rows)).toHaveLength(1)
    const cells = hourlyStats(rows, FIXED, REFERENCE)
    expect(cells[0].count).toBe(0)
    expect(cells[9].count).toBe(1)
  })

  it('nets the move and rates the hour on decided trades only', () => {
    const cells = hourlyStats(
      [
        hourAt(9, { move: 10 }),
        hourAt(9, { move: -4 }),
        hourAt(9, { move: 6 }),
        hourAt(9, { move: 0 }),
      ],
      FIXED,
      REFERENCE,
    )
    expect(cells[9].move).toBe(12)
    expect(cells[9].wins).toBe(2)
    // A scratch is neither a win nor a loss: two of four is not the answer,
    // two of three is.
    expect(cells[9].hitRate).toBe(66.67)
  })

  it('mutes an hour that has not earned an opinion', () => {
    const cells = hourlyStats([hourAt(9, { move: 40 }), hourAt(9, { move: 40 })], FIXED, REFERENCE)
    expect(cells[9].thin).toBe(true)
    // And a thin hour is never named the best one, however big its number.
    expect(hourExtremes(cells).best).toBeNull()
  })

  it('names a best and a worst only where the sign agrees with the name', () => {
    const rows = [
      ...[1, 2, 3].map(() => hourAt(9, { move: 5 })),
      ...[1, 2, 3].map(() => hourAt(14, { move: -3 })),
    ]
    const cells = hourlyStats(rows, FIXED, REFERENCE)
    expect(hourExtremes(cells)).toEqual({ best: 9, worst: 14 })

    // Every solid hour up: there is a best and there is no worst. Calling the
    // least-good winning hour "worst" is a label that reads as a warning.
    const allUp = hourlyStats([...[1, 2, 3].map(() => hourAt(9, { move: 5 }))], FIXED, REFERENCE)
    expect(hourExtremes(allUp)).toEqual({ best: 9, worst: null })
  })

  it('scales the strip to its own busiest hour', () => {
    expect(peakCount(hourlyStats([hourAt(9), hourAt(9), hourAt(3)], FIXED, REFERENCE))).toBe(2)
    expect(peakCount(hourlyStats([], FIXED, REFERENCE))).toBe(0)
  })
})
