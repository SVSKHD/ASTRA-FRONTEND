// Section 27a — the devices list, acceptance 138/139.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DeviceRow from '@/components/security/DeviceRow.vue'
import type { DeviceSession } from '@/types'

const T = 1_700_000_000_000
const SOURCE = readFileSync(resolve(__dirname, 'DeviceRow.vue'), 'utf8')

function session(over: Partial<DeviceSession> = {}): DeviceSession {
  return {
    id: 's1',
    deviceLabel: 'Chrome on macOS',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    ipHash: 'abcd',
    city: 'Hyderabad',
    region: 'Telangana',
    country: 'India',
    approxLat: 17.4,
    approxLng: 78.5,
    createdAt: T - 86_400_000,
    lastActiveAt: T - 3_600_000,
    revokedAt: null,
    userAgent: '',
    ...over,
  }
}

const mountRow = (over: Partial<DeviceSession> = {}) =>
  mount(DeviceRow, { props: { session: session(over), now: T } })

describe('the row', () => {
  it('says what the device is, where it is and when it was last used', () => {
    const w = mountRow()
    expect(w.text()).toContain('Chrome on macOS')
    expect(w.text()).toContain('Chrome · macOS')
    expect(w.text()).toContain('Hyderabad, India')
    expect(w.text()).toContain('1h ago')
  })

  it('says "Unknown location" rather than a dangling comma', () => {
    expect(mountRow({ city: null, country: null }).text()).toContain('Unknown location')
  })

  it('marks the current device in words, not only in colour', () => {
    // A tint alone would be the only thing distinguishing this row, which is
    // the review checklist's first rule.
    expect(mountRow({ current: true }).text()).toContain('This device')
    expect(mountRow({ current: false }).text()).not.toContain('This device')
  })
})

describe('revoking', () => {
  it('offers Revoke on another device', async () => {
    const w = mountRow({ current: false })
    const button = w.findAll('button').find((b) => b.text() === 'Revoke')
    expect(button).toBeDefined()
    await button!.trigger('click')
    expect(w.emitted('revoke')?.[0]).toEqual(['s1'])
  })

  it('does not offer to sign you out of the page you are reading', () => {
    // A Revoke button on the current device logs the reader out of the devices
    // list mid-click. Signing yourself out is what the account menu is for.
    const w = mountRow({ current: true })
    expect(w.findAll('button').map((b) => b.text())).not.toContain('Revoke')
  })

  it('goes quiet while another revoke is in flight', () => {
    const w = mount(DeviceRow, { props: { session: session(), now: T, busy: true } })
    const button = w.findAll('button').find((b) => b.text() === 'Revoke')
    expect(button!.attributes('disabled')).toBeDefined()
  })
})

describe('the box', () => {
  it('gives every text cell a width it may not exceed (26d rule 3)', () => {
    // A Samsung model number or a long city name in a fixed-width drawer is the
    // unscheduled-panel bug again: the clamp works and the panel still gets
    // pushed off its own edge.
    for (const selector of ['.drow__text', '.drow__label', '.drow__meta', '.drow__cell']) {
      const at = SOURCE.indexOf(`${selector} {`)
      expect(at, `${selector} has no rule`).toBeGreaterThan(-1)
      expect(SOURCE.slice(at, SOURCE.indexOf('}', at))).toContain('min-width: 0')
    }
  })

  it('holds a uniform row height, so a row with no city is not shorter', () => {
    expect(SOURCE).toContain('min-height: 56px')
  })

  it('keeps the meaning-carrying line above muted', () => {
    // The browser and the city are what the row is FOR. Muting them to the
    // level used for timestamps is what made section 26's panel unreadable.
    const at = SOURCE.indexOf('.drow__meta {')
    expect(SOURCE.slice(at, SOURCE.indexOf('}', at))).toContain('--text-secondary')
  })
})
