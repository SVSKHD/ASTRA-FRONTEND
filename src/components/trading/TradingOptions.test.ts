// Futures & Options against a stubbed API: futures for the underlying, expiries,
// the CE | strike | PE chain with absent fields as "—", change in OI only when
// both OI values are present, lot size from the legs' instrument rows, a leg's
// chart, and the phone's CE/PE toggle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.setConfig({ testTimeout: 20_000 })

import TradingOptions from './TradingOptions.vue'
import InstrumentPicker from './InstrumentPicker.vue'
import { forgetInstruments } from '@/trading/resolve'
import { resetWatchlistStore } from '@/trading/watchlists'
import { useUiStore } from '@/stores/ui'

function inst(id: number, ref: string, symbol: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    broker: 'dhan',
    broker_instrument_id: ref,
    symbol,
    exchange: 'NSE',
    segment: ref.split(':')[0],
    instrument_type: 'EQUITY',
    underlying: null,
    expiry: null,
    strike: null,
    option_type: null,
    lot_size: '1',
    tick_size: '0.05',
    currency: 'INR',
    ...extra,
  }
}
const NIFTY = inst(13, 'IDX_I:13', 'NIFTY', { instrument_type: 'INDEX' })
const FUTURES = [
  inst(401, 'NSE_FNO:4001', 'NIFTY NOV FUT', {
    instrument_type: 'FUTIDX',
    underlying: 'NIFTY',
    expiry: '2099-11-27',
    lot_size: '75',
  }),
  inst(402, 'NSE_FNO:4002', 'BANKNIFTY NOV FUT', {
    instrument_type: 'FUTIDX',
    underlying: 'BANKNIFTY',
    expiry: '2099-11-27',
    lot_size: '35',
  }),
]
const OPTIONS = [
  inst(501, 'NSE_FNO:5001', 'NIFTY 27 NOV 24000 CALL', {
    instrument_type: 'OPTIDX',
    underlying: 'NIFTY',
    expiry: '2099-11-27',
    strike: '24000',
    option_type: 'CE',
    lot_size: '75',
  }),
  inst(502, 'NSE_FNO:5002', 'NIFTY 27 NOV 24000 PUT', {
    instrument_type: 'OPTIDX',
    underlying: 'NIFTY',
    expiry: '2099-11-27',
    strike: '24000',
    option_type: 'PE',
    lot_size: '75',
  }),
]
const LEG = {
  last_price: null,
  bid: null,
  ask: null,
  oi: null,
  previous_oi: null,
  previous_close: null,
  volume: null,
  implied_volatility: null,
  delta: null,
  gamma: null,
  theta: null,
  vega: null,
  broker_instrument_id: null,
}
const CHAIN = {
  underlying: 'IDX_I:13',
  expiry: '2099-11-27',
  underlying_price: '24010',
  as_of: new Date().toISOString(),
  source: 'broker',
  strikes: [
    {
      strike: '23900',
      call: { ...LEG, last_price: '180', oi: '500', broker_instrument_id: 'NSE_FNO:5003' },
      put: null,
    },
    {
      strike: '24000',
      call: {
        ...LEG,
        last_price: '120.5',
        bid: '120.4',
        ask: '120.6',
        oi: '1000',
        previous_oi: '800',
        volume: '5000',
        implied_volatility: '13.2',
        delta: '0.52',
        gamma: '0.0012',
        theta: '-8.1',
        vega: '12.3',
        broker_instrument_id: 'NSE_FNO:5001',
      },
      // Only OI and LTP: no previous OI, no IV, no Greeks.
      put: { ...LEG, last_price: '99.75', oi: '900', broker_instrument_id: 'NSE_FNO:5002' },
    },
    { strike: '24100', call: { ...LEG, last_price: '70' }, put: { ...LEG, last_price: '160' } },
  ],
}

const calls: URL[] = []
function answer(url: URL): [number, unknown] {
  const p = url.pathname
  const qp = url.searchParams
  if (p === '/api/trading/instruments') {
    const type = qp.get('instrument_type')
    const q = (qp.get('q') ?? '').toUpperCase()
    const rows = [...FUTURES, ...OPTIONS, NIFTY].filter(
      (i) => (!type || i.instrument_type === type) && i.symbol.includes(q),
    )
    const limit = Number(qp.get('limit') ?? 50)
    const offset = Number(qp.get('offset') ?? 0)
    return [200, { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset }]
  }
  if (p === '/api/trading/option-chain/expiries')
    return [200, ['2020-01-30', '2099-11-27', '2099-12-25']]
  if (p === '/api/trading/option-chain') return [200, CHAIN]
  return [404, { detail: 'not found' }]
}

beforeEach(() => {
  calls.length = 0
  localStorage.clear()
  resetWatchlistStore()
  forgetInstruments()
  vi.stubGlobal('fetch', async (req: Request) => {
    const url = new URL(req.url)
    calls.push(url)
    const [status, body] = answer(url)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  setActivePinia(createPinia())
})
const mounted: { unmount(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
})

async function mountWithNifty() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trading/:section?', component: { template: '<div />' } }],
  })
  await router.push('/trading/options')
  const w = mount(TradingOptions, { global: { plugins: [router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  w.findComponent(InstrumentPicker).vm.$emit('pick', NIFTY)
  await vi.waitFor(() => expect(w.text()).toContain('Lot size 75'), { timeout: 5000 })
  return { w, router }
}
const callTo = (path: string) => calls.filter((u) => u.pathname === path)
const panel = () => document.body.querySelector('.ui-drawer') as HTMLElement
const body = () => panel()?.textContent ?? ''

describe('Futures & Options', () => {
  it('asks for an underlying first', async () => {
    const w = mount(TradingOptions, {
      global: {
        plugins: [
          createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }),
        ],
      },
    })
    mounted.push(w)
    await flushPromises()
    expect(w.text()).toContain('Pick an underlying')
    expect(calls).toEqual([])
  })

  it('lists the underlying’s futures and loads the nearest future expiry’s chain', async () => {
    const { w } = await mountWithNifty()
    const fut = callTo('/api/trading/instruments').find(
      (u) => u.searchParams.get('instrument_type') === 'FUTIDX',
    )!
    expect(fut.searchParams.get('q')).toBe('NIFTY')
    // Only the contract whose underlying is NIFTY, not BANKNIFTY's.
    expect(w.text()).toContain('NIFTY NOV FUT')
    expect(w.text()).not.toContain('BANKNIFTY NOV FUT')
    expect(w.text()).toContain('security id 4001')

    expect(callTo('/api/trading/option-chain/expiries')[0].searchParams.get('underlying')).toBe(
      'IDX_I:13',
    )
    const chain = callTo('/api/trading/option-chain')[0].searchParams
    expect(chain.get('underlying')).toBe('IDX_I:13')
    expect(chain.get('expiry')).toBe('2099-11-27')
  })

  it('renders CE | strike | PE with absent fields as — and ΔOI only when both OI values exist', async () => {
    const { w } = await mountWithNifty()
    const row = w.findAll('tbody tr').find((r) => r.find('th').text() === '24,000')!
    expect(row.classes()).toContain('is-atm')
    const cells = row.findAll('td')
    // Call side (OI, ΔOI, Vol, IV, Bid/ask, LTP), strike, then put side mirrored.
    expect(cells.map((c) => c.text()).slice(0, 6)).toEqual([
      '1,000',
      '+200',
      '5,000',
      '13.2',
      '120.4 / 120.6',
      '120.5',
    ])
    const put = cells.slice(6).map((c) => c.text())
    expect(put).toEqual(['99.75', '— / —', '—', '—', '—', '900'])
    // ΔOI on the put is "—" because previous OI is missing — and says why.
    expect(cells[6 + 4].attributes('title')).toContain('both OI and previous OI')
    // A strike with no put at all.
    const lower = w.findAll('tbody tr').find((r) => r.find('th').text() === '23,900')!
    expect(lower.findAll('td').at(-1)!.attributes('title')).toContain('No contract')
  })

  it('shows the Greeks only when asked, as — where the broker sent none', async () => {
    const { w } = await mountWithNifty()
    expect(w.find('thead').text()).not.toContain('Γ')
    await w.find('[role="switch"]').trigger('click')
    await flushPromises()
    expect(w.find('thead').text()).toContain('Γ')
    const row = w.findAll('tbody tr').find((r) => r.find('th').text() === '24,000')!
    const texts = row.findAll('td').map((c) => c.text())
    expect(texts.slice(4, 8)).toEqual(['0.52', '0.0012', '-8.1', '12.3'])
    // The put side has no Greeks: four dashes, mirrored.
    expect(texts.slice(-8, -4)).toEqual(['—', '—', '—', '—'])
  })

  it('takes the lot size from the legs’ instrument rows and opens a leg’s chart', async () => {
    const { w, router } = await mountWithNifty()
    expect(w.find('[data-testid="lot-size"]').text()).toContain('from 2 contract rows')
    expect(w.find('[data-testid="lot-size"]').text()).toContain('some legs were not found')
    const opt = callTo('/api/trading/instruments').find(
      (u) => u.searchParams.get('instrument_type') === 'OPTIDX',
    )!
    expect(opt.searchParams.get('q')).toBe('NIFTY')

    await w.find('button[aria-label="24,000 CE details"]').trigger('click')
    await flushPromises()
    expect(body()).toContain('NSE_FNO:5001')
    expect(body()).toContain('Security id')
    expect(body()).toContain('5001')
    ;[...panel().querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Open chart')!
      .click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trading/charts?instrument=501')
  })

  it('says a leg that is not in the master has no chart', async () => {
    const { w } = await mountWithNifty()
    await w.find('button[aria-label="23,900 CE details"]').trigger('click')
    await flushPromises()
    expect(body()).toContain('not found in the instrument master')
    expect(
      [...panel().querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Open chart'),
    ).toBe(false)
  })

  it('shows one side at a time on a phone', async () => {
    const { w } = await mountWithNifty()
    useUiStore().vw = 375
    await flushPromises()
    expect(w.text()).toContain('Calls (CE)')
    let row = w.findAll('tbody tr').find((r) => r.find('th').text() === '24,000')!
    expect(row.findAll('td').map((c) => c.text())).toEqual(['120.5', '1,000', '+200', '13.2'])
    await w
      .findAll('[role="radio"]')
      .find((b) => b.text() === 'Puts (PE)')!
      .trigger('click')
    await flushPromises()
    row = w.findAll('tbody tr').find((r) => r.find('th').text() === '24,000')!
    expect(row.findAll('td').map((c) => c.text())).toEqual(['99.75', '900', '—', '—'])
  })
})
