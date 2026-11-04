import { describe, expect, it } from 'vitest'
import { imageCard, newsCard, voiceCard } from './agentTrio'

const job = (over: Record<string, unknown> = {}) =>
  ({
    id: 'news-pull',
    agent_id: 'scheduler',
    task: 'news_pull',
    cron: '*/30 * * * *',
    paused: false,
    max_retries: 3,
    retry_backoff_seconds: 30,
    timeout_seconds: 60,
    attempt: 0,
    consecutive_failures: 0,
    next_run_at: null,
    last_run_at: '2026-11-04T06:00:00Z',
    last_status: 'succeeded',
    last_error: null,
    running: false,
    ...over,
  }) as never
const agent = (over: Record<string, unknown> = {}) =>
  ({
    id: 'imaging',
    name: 'SD',
    kind: 'imaging',
    state: 'idle',
    seconds_since_heartbeat: 4,
    last_activity_at: null,
    ...over,
  }) as never

describe('newsCard', () => {
  it('reads the news-pull job', () => {
    expect(newsCard([job()]).health).toBe('healthy')
    expect(
      newsCard([job({ last_status: 'failed', last_error: 'timeout', consecutive_failures: 2 })]),
    ).toMatchObject({
      health: 'down',
      lastError: 'timeout',
    })
    expect(newsCard([]).note).toMatch(/NEWS_FEED_URLS/)
    expect(newsCard(null).health).toBe('unknown')
  })
})

describe('imageCard', () => {
  it('reads the imaging agent and its last run', () => {
    expect(imageCard([agent()], null).health).toBe('healthy')
    expect(imageCard([agent({ state: 'stale' })], null).health).toBe('down')
    expect(
      imageCard([agent()], { status: 'failed', error: 'OOM', started_at: 'x' } as never),
    ).toMatchObject({
      health: 'degraded',
      lastError: 'OOM',
    })
    expect(imageCard([], null).note).toMatch(/never registered/)
  })
})

describe('voiceCard', () => {
  const v = {
    supported: true,
    secure: true,
    commands: 0,
    lastAt: 0,
    lastIntent: '',
    lastError: '',
    lastErrorAt: 0,
  }
  it('describes this browser', () => {
    expect(voiceCard(v).health).toBe('healthy')
    expect(voiceCard({ ...v, secure: false }).health).toBe('down')
    expect(voiceCard({ ...v, supported: false }).health).toBe('degraded')
    expect(
      voiceCard({ ...v, commands: 1, lastAt: 1, lastError: 'blocked', lastErrorAt: 2 }).lastError,
    ).toBe('blocked')
  })
})
