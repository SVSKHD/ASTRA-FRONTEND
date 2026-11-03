import { describe, expect, it } from 'vitest'
import { duration, monitorTone } from '@/control/monitor'

describe('monitor helpers', () => {
  it('maps the normalised statuses to badge tones', () => {
    expect(monitorTone('success')).toBe('success')
    expect(monitorTone('failure')).toBe('danger')
    expect(monitorTone('running')).toBe('info')
    expect(monitorTone('queued')).toBe('info')
    expect(monitorTone('cancelled')).toBe('neutral')
    expect(monitorTone('unknown')).toBe('neutral')
  })

  it('prints durations', () => {
    expect(duration(null)).toBe('—')
    expect(duration(undefined)).toBe('—')
    expect(duration(-1)).toBe('—')
    expect(duration(850)).toBe('850 ms')
    expect(duration(42_000)).toBe('42 s')
    expect(duration(185_000)).toBe('3 min 05 s')
    expect(duration(3_720_000)).toBe('1 h 02 min')
  })
})
