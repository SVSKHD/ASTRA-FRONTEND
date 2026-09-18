// The import parser (the Import tab).
//
// The cases here are the ones a real file fails on: a letterhead above the
// header, a column order nobody agreed on, an accounting negative, a totals row
// at the foot, and a date that two continents read differently.
import { describe, expect, it } from 'vitest'
import {
  MAX_IMPORT_BYTES,
  importRejectReason,
  overallStats,
  parseTradeCsv,
  splitCsvLine,
  summariseByMonth,
  toDate,
  toNumber,
} from '@/utils/tradeImport'

describe('cells', () => {
  it('splits on quotes the way a spreadsheet writes them', () => {
    expect(splitCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c'])
    expect(splitCsvLine('"a,1",b', ',')).toEqual(['a,1', 'b'])
    expect(splitCsvLine('"say ""hi""",b', ',')).toEqual(['say "hi"', 'b'])
    expect(splitCsvLine('a;b', ';')).toEqual(['a', 'b'])
  })

  it('reads numbers as brokers write them', () => {
    expect(toNumber('1234.5')).toBe(1234.5)
    expect(toNumber('1,234.50')).toBe(1234.5)
    expect(toNumber('+35835.00')).toBe(35835)
    expect(toNumber('-12.30')).toBe(-12.3)
    expect(toNumber('$1,000')).toBe(1000)
    // An accounting export puts the minus in brackets.
    expect(toNumber('(450.25)')).toBe(-450.25)
    expect(toNumber('')).toBeNaN()
    expect(toNumber('n/a')).toBeNaN()
  })

  it('takes the year-first forms without guessing', () => {
    expect(toDate('2026-09-04')).toEqual({ date: '2026-09-04', guessed: false })
    expect(toDate('2026.09.04 13:45:00')).toEqual({ date: '2026-09-04', guessed: false })
    expect(toDate('2026/9/4')).toEqual({ date: '2026-09-04', guessed: false })
  })

  it('settles a slashed date on whichever half cannot be a month', () => {
    // 25 is not a month, so this is day-first and certain.
    expect(toDate('25/09/2026')).toEqual({ date: '2026-09-25', guessed: false })
    // 31 is not a month either, so this one is month-first and certain.
    expect(toDate('09/31/2026')).toEqual({ date: '2026-09-31', guessed: false })
    // Neither half settles it: day-first, and it says so.
    expect(toDate('04/09/2026')).toEqual({ date: '2026-09-04', guessed: true })
  })

  it('refuses a date that is not one', () => {
    expect(toDate('').date).toBe('')
    expect(toDate('last tuesday').date).toBe('')
    expect(toDate('2026-13-04').date).toBe('')
  })
})

describe('parseTradeCsv', () => {
  it('reads the app’s own export back', () => {
    const csv = [
      'date,symbol,session,side,lot,entry,exit,move,pl',
      '2026-09-04,XAUUSD,London,buy,5.00,4475.00,4479.00,4.00,2000.00',
      '2026-09-04,XAUUSD,NY,buy,5.00,4474.61,4484.87,10.26,5130.00',
      '2026-10-07,XAUUSD,Asia,sell,5.00,4403.21,4401.54,1.67,-835.00',
    ].join('\r\n')
    const out = parseTradeCsv(csv)
    expect(out.error).toBe('')
    expect(out.rows).toHaveLength(3)
    expect(out.rows[0]).toMatchObject({
      date: '2026-09-04',
      month: '2026-09',
      symbol: 'XAUUSD',
      side: 'buy',
      lot: 5,
      entry: 4475,
      exit: 4479,
      pl: 2000,
    })
    expect(out.rows[2].pl).toBe(-835)
    expect(out.assumedDayFirst).toBe(false)
  })

  it('finds the header under a broker’s letterhead', () => {
    const csv = [
      'Trade History Report',
      'Account: 5104882 (USD)',
      '',
      'Open Time;Symbol;Type;Volume;Open Price;Close Price;Profit',
      '2026.09.04 08:00:11;XAUUSD;buy;5.00;4475.00;4479.00;2 000.00',
      '2026.09.07 09:54:02;XAUUSD;sell;5.00;4403.21;4401.54;835.00',
    ].join('\n')
    const out = parseTradeCsv(csv)
    expect(out.error).toBe('')
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].symbol).toBe('XAUUSD')
    expect(out.rows[0].pl).toBe(2000)
    expect(out.rows[1].side).toBe('sell')
  })

  it('drops the rows it cannot read and counts them', () => {
    const csv = [
      'date,symbol,profit',
      '2026-09-04,XAUUSD,100',
      'not a date,XAUUSD,100',
      '2026-09-05,XAUUSD,not a number',
      '',
      'Total,,100',
      '2026-09-06,XAUUSD,-40',
    ].join('\n')
    const out = parseTradeCsv(csv)
    expect(out.rows).toHaveLength(2)
    // The bad date, the bad number and the totals line — the blank is not a row.
    expect(out.skipped).toBe(3)
  })

  it('says what is missing rather than drawing an empty chart', () => {
    const out = parseTradeCsv('name,quantity\nwidget,4')
    expect(out.rows).toEqual([])
    expect(out.error).toContain('No date and profit columns')
    expect(out.headers).toEqual(['name', 'quantity'])
  })

  it('reports an empty file as one', () => {
    expect(parseTradeCsv('   ').error).toBe('That file is empty.')
  })

  it('reports the day-first guess so the reader can check it', () => {
    const out = parseTradeCsv('date,profit\n04/09/2026,100')
    expect(out.rows[0].date).toBe('2026-09-04')
    expect(out.assumedDayFirst).toBe(true)
  })

  it('does not let one column be two fields', () => {
    // 'Close Time' matches a date alias and 'close' matches an exit alias; the
    // date claims it first and exit is simply absent rather than a timestamp.
    const out = parseTradeCsv('Close Time,Profit\n2026-09-04,100')
    expect(out.rows[0].date).toBe('2026-09-04')
    expect(out.rows[0].exit).toBe(0)
  })
})

describe('summariseByMonth', () => {
  const rows = parseTradeCsv(
    [
      'date,symbol,side,profit',
      '2026-09-04,XAUUSD,buy,2000',
      '2026-09-07,XAUUSD,sell,-835',
      '2026-09-09,XAUUSD,buy,0',
      '2026-11-02,US30,buy,500',
    ].join('\n'),
  ).rows

  it('groups by month, oldest first, with the running total on each', () => {
    const months = summariseByMonth(rows)
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-11'])
    expect(months[0]).toMatchObject({ trades: 3, wins: 1, losses: 1, pl: 1165 })
    expect(months[0].cumulative).toBe(1165)
    expect(months[1].cumulative).toBe(1665)
  })

  it('leaves an untraded month out rather than drawing it as flat', () => {
    // October is missing from the data, so it is missing from the chart.
    expect(summariseByMonth(rows).some((m) => m.month === '2026-10')).toBe(false)
  })

  it('keeps the cumulative figure from drifting', () => {
    const cents = parseTradeCsv(
      ['date,profit', '2026-01-01,0.1', '2026-01-02,0.2', '2026-02-01,0.1'].join('\n'),
    ).rows
    const months = summariseByMonth(cents)
    expect(months[0].pl).toBe(0.3)
    expect(months[1].cumulative).toBe(0.4)
  })
})

describe('overallStats', () => {
  it('counts a scratch as neither a win nor a loss', () => {
    const rows = parseTradeCsv(
      ['date,profit', '2026-09-01,100', '2026-09-02,-50', '2026-09-03,0'].join('\n'),
    ).rows
    const stats = overallStats(rows, summariseByMonth(rows))
    expect(stats.trades).toBe(3)
    expect(stats.wins).toBe(1)
    expect(stats.losses).toBe(1)
    // One win out of two decided trades, not out of three.
    expect(stats.winRate).toBe(0.5)
  })

  it('reports the span, the best and the worst month', () => {
    const rows = parseTradeCsv(
      ['date,symbol,profit', '2026-09-01,XAUUSD,100', '2026-11-02,US30,-500'].join('\n'),
    ).rows
    const stats = overallStats(rows, summariseByMonth(rows))
    expect(stats.from).toBe('2026-09-01')
    expect(stats.to).toBe('2026-11-02')
    expect(stats.best?.month).toBe('2026-09')
    expect(stats.worst?.month).toBe('2026-11')
    expect(stats.pl).toBe(-400)
    expect(stats.symbols).toBe(2)
  })

  it('has no opinion about an empty file', () => {
    const stats = overallStats([], [])
    expect(stats).toMatchObject({ trades: 0, winRate: 0, pl: 0, best: null, worst: null })
  })
})

describe('importRejectReason', () => {
  it('lets an ordinary file through', () => {
    expect(importRejectReason({ name: 'trades.csv', size: 2 * 1024 * 1024 })).toBeNull()
  })

  it('names the size when it is over the limit', () => {
    const reason = importRejectReason({ name: 'big.csv', size: MAX_IMPORT_BYTES + 1 })
    expect(reason).toContain('30 MB')
  })

  it('refuses an empty file', () => {
    expect(importRejectReason({ name: 'empty.csv', size: 0 })).toBe('That file is empty.')
  })
})
