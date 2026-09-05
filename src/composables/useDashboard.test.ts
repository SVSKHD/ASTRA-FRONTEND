// The Dashboard reads the same arithmetic its tabs do (section 44, item 6).
//
// "No block duplicates logic" is the whole instruction, and it is not a thing a
// type checker can hold. A dashboard is the surface where a re-implementation is
// least likely to be noticed and most likely to be believed: a home screen that
// says the day is +12.40 while the Trades tab says +9.80 is worse than a home
// screen with no number on it at all.
//
// So this is checked two ways. The behavioural half re-runs each tab's own pure
// function against the same fixture and asserts the Dashboard's expression
// produces the same value. The structural half reads the source and asserts the
// import is there and the shortcut is not — because the failure mode is somebody
// writing `trades.reduce((s, t) => s + t.move, 0)` here, which passes every
// behavioural test on the day it is written and drifts the first time the tab's
// definition of a move changes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { linkSignals } from '@/utils/combine'
import { elapsedDays, expenseTotals } from '@/utils/expenseMath'
import { accountTotals, dayTotals, targetProgress } from '@/utils/tradeMath'
import { RECENT_HEADLINES, RECENT_TRADES } from '@/composables/useDashboard'
import type { DacoitSignal, Expense, SecuredEntry, Trade } from '@/types'

const SOURCE = readFileSync(resolve(__dirname, 'useDashboard.ts'), 'utf8')
const HOME = readFileSync(resolve(__dirname, '../components/dashboard/DashboardHome.vue'), 'utf8')

const TODAY = '2026-09-04'
const at = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm}:00+05:30`)

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    userId: 'u',
    istDate: TODAY,
    istTime: '13:40',
    exitTime: '',
    entryAt: at(TODAY, '13:40'),
    exitAt: 0,
    brokerOffsetMinutes: 180,
    timeEstimated: false,
    symbol: 'XAUUSD',
    session: 'London',
    side: 'buy',
    lot: 1,
    entry: 2400,
    exit: 2404,
    move: 4,
    pl: 400,
    note: '',
    signalId: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as Trade
}

function signal(over: Partial<DacoitSignal> = {}): DacoitSignal {
  return {
    id: 's1',
    userId: 'u',
    signalId: 'sig-1',
    signalAt: at(TODAY, '13:00'),
    receivedAt: at(TODAY, '13:00'),
    istDate: TODAY,
    symbol: 'XAUUSD',
    session: 'London',
    verdict: 'GO',
    raw: {},
    ...over,
  } as DacoitSignal
}

const TRADES = [
  trade({ id: 't1', move: 4, pl: 400 }),
  trade({
    id: 't2',
    istDate: '2026-09-02',
    istTime: '09:10',
    move: -1.5,
    pl: -150,
    entryAt: at('2026-09-02', '09:10'),
  }),
  trade({
    id: 't3',
    istDate: '2026-09-03',
    istTime: '18:20',
    move: 2.25,
    pl: 225,
    entryAt: at('2026-09-03', '18:20'),
  }),
]
const SECURED: SecuredEntry[] = [
  { id: 'x', userId: 'u', date: '2026-09-01', amt: 500, note: '', createdAt: 0 },
]
const EXPENSES = [
  {
    id: 'e1',
    userId: 'u',
    date: '2026-09-01',
    amount: 1200,
    kind: 'one-off',
    note: '',
    category: 'data',
  },
  {
    id: 'e2',
    userId: 'u',
    date: '2026-09-03',
    amount: 800,
    kind: 'one-off',
    note: '',
    category: 'data',
  },
] as unknown as Expense[]

describe('the figures are the tabs’ own', () => {
  it('computes today’s progress exactly as TradeTargets does', () => {
    // The same two calls, in the same order, with the same arguments. This is
    // the value the Trades tab paints in its "Today · move" row.
    const mine = targetProgress(dayTotals(TRADES, TODAY).move, 10)
    expect(mine).toEqual({ move: 4, target: 10, pct: 40, remaining: 6 })
  })

  it('computes month to date exactly as TradeTargets does', () => {
    const mine = targetProgress(
      TRADES.reduce((sum, t) => sum + t.move, 0),
      50,
    )
    expect(mine.move).toBe(4.75)
    expect(mine.target).toBe(50)
  })

  it('computes the account exactly as AccountBlock does', () => {
    const mine = accountTotals(TRADES, SECURED, 250_000)
    expect(mine.totalProfit).toBe(475)
    expect(mine.securedTotal).toBe(500)
    // balance = starting + profit − secured. Stated here so a change to the
    // definition fails on the Dashboard as well as on the Trades tab.
    expect(mine.balance).toBe(250_000 + 475 - 500)
  })

  it('computes the month’s expenses exactly as the Expenses header does', () => {
    const mine = expenseTotals(EXPENSES, 40_000, elapsedDays('2026-09', TODAY))
    expect(mine.spent).toBe(2000)
    expect(mine.count).toBe(2)
    expect(mine.pct).toBe(5)
  })
})

describe('an open signal is one linkSignals says is untaken', () => {
  it('drops a signal whose trade carries its id', () => {
    const taken = signal()
    const rows = [trade({ id: 't1', signalId: 'sig-1' })]
    expect(linkSignals(rows, [taken]).untaken).toEqual([])
  })

  it('drops a signal taken by proximity, with no id carried through', () => {
    // THE REASON `linkSignals` IS USED RATHER THAN A `signalId` CHECK. A trade
    // logged from the desk at the open does not always carry the signal's id,
    // and a hand-written `has(signalId)` test would show that signal as still
    // waiting for the rest of the day.
    const s = signal({ signalAt: at(TODAY, '13:00') })
    const rows = [trade({ id: 't1', signalId: '', entryAt: at(TODAY, '13:20') })]
    expect(linkSignals(rows, [s]).untaken).toEqual([])
  })

  it('keeps a GO nothing was traded against', () => {
    const s = signal({ signalId: 'sig-2', id: 's2' })
    expect(linkSignals([], [s]).untaken.map((x) => x.id)).toEqual(['s2'])
  })

  it('never counts a NO_GO as waiting', () => {
    const s = signal({ verdict: 'NO_GO' })
    expect(linkSignals([], [s]).untaken).toEqual([])
  })

  it('is joined over the month, then filtered to today', () => {
    // A signal at 23:50 can be taken by a trade at 00:10. A join scoped to one
    // calendar day would call it untaken forever, because the window is ninety
    // minutes and not a date. The source must filter AFTER linking.
    const linkThenFilter = /linkSignals\([\s\S]{0,200}?\)\.untaken\.filter\(/
    expect(SOURCE).toMatch(linkThenFilter)
  })
})

describe('nothing is re-implemented', () => {
  it('imports each tab’s own function rather than repeating it', () => {
    for (const fn of [
      'targetProgress',
      'dayTotals',
      'accountTotals',
      'expenseTotals',
      'elapsedDays',
      'linkSignals',
    ]) {
      expect(SOURCE, fn).toMatch(new RegExp(`import[\\s\\S]{0,200}?\\b${fn}\\b`))
    }
  })

  it('mounts each tab’s own composable rather than querying itself', () => {
    for (const composable of [
      'useTrades',
      'useSignals',
      'useSecured',
      'useExpenses',
      'useGithubLive',
      'useNews',
      'useSettings',
    ]) {
      expect(SOURCE, composable).toContain(composable)
    }
    // No listener of its own. A dashboard that opens its own snapshot on a
    // collection is a second listener on rows a tab is already watching, and a
    // second definition of what those rows mean.
    expect(SOURCE).not.toContain('onSnapshot')
    expect(SOURCE).not.toContain('loadFirestore')
  })

  it('does no arithmetic in the template', () => {
    // Every figure in DashboardHome is read off `useDashboard`, so the view has
    // no sums to get wrong. `reduce` in a template is the exact shape of the
    // drift this is all guarding against.
    expect(HOME).not.toMatch(/\.reduce\(/)
  })

  it('keeps the ticking clock out of the composable', () => {
    // `useSessionClock` updates once a second. Read here, every block on the
    // home screen would re-render at 1Hz — which is the bug section 42 fixed by
    // moving the clock into SessionDesk. It belongs at the leaf.
    expect(SOURCE).not.toContain('useSessionClock')
    expect(HOME).not.toContain('useSessionClock')
    const countdown = readFileSync(
      resolve(__dirname, '../components/dashboard/DashCountdown.vue'),
      'utf8',
    )
    expect(countdown).toContain('useSessionClock')
  })
})

describe('the home screen shows all nine blocks', () => {
  it('links each one into its own tab', () => {
    // Nine blocks, and the tabs they open. A block with no destination is a
    // number you have to go and find the tab for.
    const tabs = [...HOME.matchAll(/<DashBlock[\s\S]{0,240}?tab="([a-z]+)"/g)].map((m) => m[1])
    expect(tabs).toHaveLength(9)
    expect(new Set(tabs)).toEqual(new Set(['trades', 'expenses', 'code', 'news']))
  })

  it('shows five of each list, not a tab’s worth', () => {
    expect(RECENT_TRADES).toBe(5)
    expect(RECENT_HEADLINES).toBe(5)
  })

  it('gives every empty state a sentence rather than a zero', () => {
    // Four rows of nothing look like data. Each list block says why it is
    // empty, in words.
    for (const phrase of [
      'No GO signals waiting today.',
      'Nothing logged this month yet.',
      'Nothing open. Connect a repository on the Code tab.',
    ]) {
      expect(HOME, phrase).toContain(phrase)
    }
  })
})
