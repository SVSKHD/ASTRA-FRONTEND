// Every editor's value round trip: what it sends is exactly the string the backend
// parses (PUT /api/v1/settings/{key} {value}), and a stored value reads back the same.
import { describe, expect, it } from 'vitest'
import {
  budgetsError,
  budgetsTotal,
  draftError,
  editorFor,
  parseBudgets,
  parseCsv,
  parsePrices,
  pricesError,
  serializeBudgets,
  serializeCsv,
  serializePrices,
  valueError,
} from './settingEditors'
import { cronError, cronToWords } from './cron'

const ed = (key: string, kind: string, managed = false) => editorFor({ key, kind, managed })

describe('editorFor', () => {
  it('gives each key the editor that fits it', () => {
    expect(ed('AGENT_IMAGE_ENABLED', 'bool')).toBe('switch')
    expect(ed('ANTHROPIC_API_KEY', 'secret')).toBe('secret')
    expect(ed('AI_EFFORT', 'str')).toBe('effort')
    expect(ed('AI_AGENT_BUDGETS_USD', 'json_object')).toBe('budgets')
    expect(ed('AI_MODEL_PRICES', 'json_object')).toBe('prices')
    expect(ed('AI_DAILY_REPORT_CRON', 'str')).toBe('cron')
    expect(ed('AI_MONTHLY_BUDGET_USD', 'decimal')).toBe('number')
    expect(ed('DHAN_BASE_URL', 'url')).toBe('url')
    expect(ed('DHAN_FEED_INSTRUMENTS', 'csv')).toBe('csv')
    expect(ed('SOMETHING', 'json_list')).toBe('json')
    expect(ed('AI_MODEL_MAIN', 'str')).toBe('model')
    expect(ed('AI_MODEL_ROUTER', 'str')).toBe('model')
    expect(ed('SOME_NAME', 'str')).toBe('text')
    expect(ed('DHAN_SESSION_TOKEN', 'secret', true)).toBe('managed')
  })
})

describe('simple values', () => {
  it('checks numbers, URLs and JSON by kind', () => {
    expect(valueError('int', '8')).toBeNull()
    expect(valueError('int', '8.5')).toContain('whole number')
    expect(valueError('decimal', '100.50')).toBeNull()
    expect(valueError('decimal', '-1')).toContain('0 or more')
    expect(valueError('url', 'https://api.dhan.co')).toBeNull()
    expect(valueError('url', 'wss://feed.dhan.co')).toBeNull()
    expect(valueError('url', 'ftp://x')).toContain('http')
    expect(valueError('url', 'not a url')).toContain('https://')
    expect(valueError('json_object', '{"a":1}')).toBeNull()
    expect(valueError('json_object', '[1]')).toContain('object')
    expect(valueError('json_list', '{}')).toContain('list')
    expect(valueError('json_list', '{')).toContain('not valid JSON')
  })

  it('round-trips a csv exactly as the backend stores it', () => {
    const v = serializeCsv([' NSE_EQ', 'BSE_EQ ', '', 'NSE_EQ'])
    expect(v).toBe('NSE_EQ,BSE_EQ')
    expect(parseCsv(v)).toEqual(['NSE_EQ', 'BSE_EQ'])
    expect(serializeCsv([])).toBe('')
  })

  it('checks a draft with its own editor', () => {
    expect(draftError({ key: 'AI_EFFORT', kind: 'str' }, 'xhigh')).toBeNull()
    expect(draftError({ key: 'AI_EFFORT', kind: 'str' }, 'turbo')).toContain('effort')
    expect(draftError({ key: 'AI_DAILY_REPORT_CRON', kind: 'str' }, '30 8 * *')).toContain('five')
    expect(draftError({ key: 'AI_MAX_STEPS', kind: 'int' }, '8')).toBeNull()
    expect(draftError({ key: 'AI_MODEL_MAIN', kind: 'str' }, 'claude-sonnet-5-5')).toBeNull()
    expect(draftError({ key: 'AI_MODEL_MAIN', kind: 'str' }, 'gpt-4')).toContain('listed models')
  })
})

describe('AI_AGENT_BUDGETS_USD', () => {
  const d = { investments: '40', business: '30.50', chat: '20', reserve: '10' }

  it('writes each amount as the JSON number it was typed as, never re-rounded', () => {
    expect(serializeBudgets(d)).toBe('{"investments":40,"business":30.50,"chat":20,"reserve":10}')
    // Still valid JSON the backend's json.loads reads.
    expect(JSON.parse(serializeBudgets(d))).toEqual({
      investments: 40,
      business: 30.5,
      chat: 20,
      reserve: 10,
    })
    expect(parseBudgets(serializeBudgets(d))).toEqual({
      investments: '40',
      business: '30.5',
      chat: '20',
      reserve: '10',
    })
  })

  it('totals the split and refuses a blank or negative cap', () => {
    expect(budgetsTotal(d)).toBe(100.5)
    expect(budgetsError(d)).toBeNull()
    expect(budgetsError({ ...d, chat: '' })).toContain('chat')
    expect(budgetsError({ ...d, chat: '-1' })).toContain('chat')
  })
})

describe('AI_MODEL_PRICES', () => {
  it('writes the backend shape: strings, models sorted, cache read only when given', () => {
    const v = serializePrices([
      { model: ' claude-opus-5-5 ', input: '4', output: '20', cacheRead: '0.20' },
      { model: 'claude-haiku-5-5', input: '0.10', output: '0.50', cacheRead: '' },
      { model: '', input: '', output: '', cacheRead: '' },
    ])
    expect(v).toBe(
      '{"claude-haiku-5-5":{"input":"0.10","output":"0.50"},"claude-opus-5-5":{"input":"4","output":"20","cache_read":"0.20"}}',
    )
    expect(parsePrices(v)).toEqual([
      { model: 'claude-haiku-5-5', input: '0.10', output: '0.50', cacheRead: '' },
      { model: 'claude-opus-5-5', input: '4', output: '20', cacheRead: '0.20' },
    ])
  })

  it('says why a table cannot be saved', () => {
    const r = (model: string, input = '1', output = '2', cacheRead = '') => ({
      model,
      input,
      output,
      cacheRead,
    })
    expect(pricesError([r('', '', '')])).toContain('at least one')
    expect(pricesError([r('', '1')])).toContain('model id')
    expect(pricesError([r('m'), r('m')])).toContain('twice')
    expect(pricesError([r('m', 'x')])).toContain('numbers of 0 or more')
    expect(pricesError([r('m', '1', '2', 'x')])).toContain('cache read')
    expect(pricesError([r('m')])).toBeNull()
  })
})

describe('cron', () => {
  it('puts the backend schedules into words, in IST', () => {
    expect(cronToWords('30 8 * * *')).toBe('Every day at 08:30 IST')
    expect(cronToWords('0 10 * * 0')).toBe('Sundays at 10:00 IST')
    expect(cronToWords('15 9 * * 1-5')).toBe('Weekdays at 09:15 IST')
    expect(cronToWords('*/15 * * * *')).toBe('Every 15 minutes')
    expect(cronToWords('5 * * * *')).toBe('Every hour at :05')
    expect(cronToWords('0 6 1 * *')).toBe('Day 1 of each month at 06:00 IST')
    expect(cronToWords('')).toBe('Off')
  })

  it('refuses what is not a five-field cron', () => {
    expect(cronError('30 8 * *')).toContain('five parts')
    expect(cronError('61 8 * * *')).toContain('between 0 and 59')
    expect(cronError('30 8 * * mon')).toContain('not a cron field')
    expect(cronError('')).toBeNull()
  })
})
