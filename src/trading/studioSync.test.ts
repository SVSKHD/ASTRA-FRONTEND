// The chart's indicators follow the account: saved studies arrive from the
// settings document, and a change on this device is saved back, debounced.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const settings = ref({ chartStudies: '', chartPresets: '' })
const ready = ref(false)
const save = vi.fn(async (patch: Record<string, string>) => {
  settings.value = { ...settings.value, ...patch }
  return true
})
vi.mock('@/composables/useSettings', () => ({
  MAX_STUDIO_CHARS: 64_000,
  useSettings: () => ({ settings, ready, save }),
}))

import { createStudio } from '@/trading/studies'
import { SAVE_DELAY_MS, syncStudio } from '@/trading/studioSync'

beforeEach(() => {
  localStorage.clear()
  settings.value = { chartStudies: '', chartPresets: '' }
  ready.value = false
  save.mockClear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('syncStudio', () => {
  it('switches to the studies saved on the account when the settings arrive', async () => {
    const other = createStudio({ persist: false })
    other.add('ema', [50])
    other.add('rsi', [14])
    other.savePreset('Swing')

    const studio = createStudio()
    studio.add('sma', [20]) // what this device had
    const stop = syncStudio(studio)

    settings.value = {
      chartStudies: other.exportState().studies,
      chartPresets: other.exportState().presets,
    }
    ready.value = true
    await nextTick()

    expect(studio.state.studies.map((s) => [s.kind, s.params[0]])).toEqual([
      ['ema', 50],
      ['rsi', 14],
    ])
    expect(studio.state.presets.map((p) => p.name)).toEqual(['Swing'])
    expect(save).not.toHaveBeenCalled() // arriving state is not written back
    stop()
  })

  it('saves a change to the account once, after the edits settle', async () => {
    ready.value = true
    const studio = createStudio()
    const stop = syncStudio(studio)
    studio.add('ema', [9])
    studio.add('ema', [21])
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0]
    expect(saved.chartStudies).toContain('"ema"')
    expect(saved.chartStudies).toContain('21')
    stop()
  })

  it('still saves a pending change when the chart closes', () => {
    ready.value = true
    const studio = createStudio()
    const stop = syncStudio(studio)
    studio.add('vwap')
    stop()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed saved studies', async () => {
    const studio = createStudio()
    studio.add('ema', [9])
    const stop = syncStudio(studio)
    settings.value = { chartStudies: '{not json', chartPresets: 'nope' }
    ready.value = true
    await nextTick()
    expect(studio.state.studies.map((s) => s.kind)).toEqual(['ema'])
    stop()
  })
})
