import { describe, expect, it } from 'vitest'
import {
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  commitLine,
  finishedSince,
  percent,
  pickDeploy,
  pollInterval,
  runIdOf,
  statusMap,
  type MonitorItem,
  type Progress,
} from '@/control/deployProgress'

const item = (id: string, status: string, over: Partial<MonitorItem> = {}): MonitorItem => ({
  kind: id.startsWith('ci:') ? 'ci' : 'deploy',
  id,
  name: id.startsWith('ci:') ? 'CI' : 'deploy:backend',
  status,
  ...over,
})

const short = (s?: string | null) => (s ? s.slice(0, 7) : '—')

describe('deploy progress logic', () => {
  it('reads the run id only from deploy rows', () => {
    expect(runIdOf(item('deploy:42', 'running'))).toBe(42)
    expect(runIdOf(item('ci:42', 'running'))).toBeNull()
    expect(runIdOf({ kind: 'deploy', id: 'deploy:x' })).toBeNull()
  })

  it('selects the running deploy, but keeps the admin’s own pick', () => {
    const items = [
      item('ci:9', 'running'),
      item('deploy:8', 'running'),
      item('deploy:7', 'success'),
    ]
    expect(pickDeploy(items, null)).toBe('deploy:8') // a running CI run is not a deploy
    expect(pickDeploy(items, 'deploy:7')).toBe('deploy:7') // a previous deploy, chosen
    expect(pickDeploy(items, 'deploy:1')).toBe('deploy:8') // chosen one scrolled away
    expect(pickDeploy([item('deploy:7', 'success')], null)).toBeNull()
    // The deploy being followed stays on screen after it finished.
    expect(pickDeploy([item('deploy:7', 'success')], null, 'deploy:7')).toBe('deploy:7')
    // ...until another deploy starts.
    expect(
      pickDeploy([item('deploy:9', 'running'), item('deploy:7', 'success')], null, 'deploy:7'),
    ).toBe('deploy:9')
  })

  it('polls fast only while something deploys', () => {
    expect(pollInterval([item('deploy:1', 'running')], null)).toBe(POLL_ACTIVE_MS)
    expect(pollInterval([item('deploy:1', 'success')], null)).toBe(POLL_IDLE_MS)
    expect(POLL_ACTIVE_MS).toBeGreaterThanOrEqual(3000)
    expect(POLL_ACTIVE_MS).toBeLessThanOrEqual(5000)
    expect(pollInterval([item('deploy:1', 'success')], { outcome: 'running' } as Progress)).toBe(
      POLL_ACTIVE_MS,
    )
  })

  it('computes progress from the server’s stage counts only', () => {
    expect(percent({ stages_completed: 3, stages_total: 8 })).toBe(38)
    expect(percent({ stages_completed: 0, stages_total: 0 })).toBeNull()
    expect(percent({ stages_completed: 9, stages_total: 8 })).toBe(100)
  })

  it('says whether the running release is the expected commit', () => {
    const base = { expected_sha: 'a'.repeat(40), deployed_sha: 'a'.repeat(40) } as Progress
    expect(commitLine({ ...base, commit_verified: true }, short)).toContain('the expected commit')
    expect(
      commitLine({ ...base, deployed_sha: 'b'.repeat(40), commit_verified: false }, short),
    ).toBe('Deployed bbbbbbb, but aaaaaaa was expected.')
    expect(commitLine({ ...base, commit_verified: null }, short)).toContain('not verified yet')
  })

  it('notifies only for deploys that finished since the last poll', () => {
    const label = (i: MonitorItem) => `Deploy ${i.id}`
    const before = statusMap([
      item('deploy:1', 'running'),
      item('deploy:2', 'running'),
      item('deploy:3', 'running'),
      item('deploy:4', 'success'),
      item('ci:5', 'running'),
    ])
    const now = [
      item('deploy:1', 'success'),
      item('deploy:2', 'failure', { rolled_back: true }),
      item('deploy:3', 'failure', { error: 'migrate failed' }),
      item('deploy:4', 'success'), // already finished: quiet
      item('deploy:6', 'failure'), // first seen finished: quiet
      item('ci:5', 'failure'), // CI is not a deploy
    ]
    expect(finishedSince(before, now, label)).toEqual([
      {
        key: 'deploy:1',
        tone: 'success',
        text: 'Deploy deploy:1 deployed and passed its health check.',
      },
      { key: 'deploy:2', tone: 'danger', text: 'Deploy deploy:2 failed and was rolled back.' },
      { key: 'deploy:3', tone: 'danger', text: 'Deploy deploy:3 failed: migrate failed' },
    ])
    // Still running: nothing yet.
    expect(finishedSince(before, [item('deploy:1', 'running')], label)).toEqual([])
  })
})
