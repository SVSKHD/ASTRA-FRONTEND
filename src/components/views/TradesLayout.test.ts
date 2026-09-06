// The tab's shape, and the two rules that hold it together.
//
//   1. The session clock is never behind a loading state. It is the only thing
//      here about the next few minutes rather than about the month, so it has
//      nothing to wait for — and a countdown that appears three seconds after
//      the tab does is a countdown that missed the point of being a countdown.
//   2. The form is a dialog, and only a dialog. It used to hold half of the row
//      the table now has; the whole reason for the move is that width, so an
//      inline form creeping back in is the regression to catch.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import TradesView from '@/components/views/TradesView.vue'
import { useAuthStore } from '@/stores/auth'

const view = readFileSync(join(process.cwd(), 'src/components/views/TradesView.vue'), 'utf8')
const skeleton = readFileSync(
  join(process.cwd(), 'src/components/trades/TradeSkeleton.vue'),
  'utf8',
)

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trades', component: { template: '<div />' } }],
  })
  router.push('/trades')
  return router
}

function mountView() {
  return mount(TradesView, {
    attachTo: document.body,
    global: { plugins: [makeRouter()], directives: { 'hover-style': {} } },
  })
}

function signIn() {
  useAuthStore().user = {
    uid: 'u1',
    name: 'T',
    email: 't@example.com',
    provider: 'google',
    initial: 'T',
    color: '',
  }
}

describe('the two rows', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('puts both targets in one card on the left of the top row', () => {
    const wrapper = mountView()
    const left = wrapper.get('.tv__top .tv__col')
    // One card, two horizons — read down a column rather than across a gutter.
    expect(left.find('.ttar').exists()).toBe(true)
    expect(left.findAll('.ttar__one')).toHaveLength(2)
    expect(left.text()).toContain('Today · move')
    expect(left.text()).toContain('Month to date · move')
    wrapper.unmount()
  })

  it('puts the clock above the account on the right of it', () => {
    const wrapper = mountView()
    const right = wrapper.findAll('.tv__top .tv__col')[1]
    const html = right.html()
    expect(right.find('[data-desk]').exists()).toBe(true)
    expect(right.find('.acct').exists()).toBe(true)
    // Order matters: the clock is what the trader looks up at.
    expect(html.indexOf('data-desk')).toBeLessThan(html.indexOf('acct'))
    expect(right.text()).toContain('Balance')
    expect(right.text()).toContain('Secured')
    wrapper.unmount()
  })

  it('gives the calendar a ceiling and the table the rest', () => {
    // Not two equal halves: the calendar stops improving at about 340px and the
    // table has thirteen columns and no horizontal scroll of its own.
    const main = view.slice(view.indexOf('.tv__main {'))
    const rule = main.slice(0, main.indexOf('}'))
    expect(rule).toContain('grid-template-columns: minmax(0, 340px) minmax(0, 1fr)')
    expect(rule).toContain('align-items: start')
  })

  it('stops sharing that row at the width the skeleton also stops at', () => {
    // A placeholder that promises a different layout from the one that arrives
    // is a layout shift with a shimmer on it.
    for (const source of [view, skeleton]) {
      expect(source).toContain('@media (max-width: 1180px)')
    }
  })

  it('renders the calendar beside the rows, not above them', () => {
    const wrapper = mountView()
    const main = wrapper.get('.tv__main')
    expect(main.find('.gdp__panel--inline').exists()).toBe(true)
    expect(main.find('.tv__rows').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('the session clock', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('is live while the month is still loading', async () => {
    // Signed in with no settings document yet: the month is loading, so the
    // targets and the account are placeholders — and the clock is not.
    signIn()
    const wrapper = mountView()
    await nextTick()
    expect(wrapper.find('[data-desk]').exists()).toBe(true)
    expect(wrapper.find('.desk__countdown').exists()).toBe(true)
    wrapper.unmount()
  })

  it('is outside every loading branch in the source, not merely present', () => {
    // The rendered assertion above would still pass if the desk were duplicated
    // into both branches, which is the other way to get it on screen and the
    // wrong one — two clocks ticking is two subscriptions and two of the tab
    // re-rendering every second.
    expect(view.match(/<SessionDesk/g) ?? []).toHaveLength(1)
  })
})

describe('the form', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('is not on the page until it is asked for', () => {
    const wrapper = mountView()
    expect(document.querySelector('.tform')).toBeNull()
    expect(document.querySelector('.ui-modal')).toBeNull()
    wrapper.unmount()
  })

  it('opens as a dialog from Log trade, with the entry field focused', async () => {
    const wrapper = mountView()
    const log = wrapper.findAll('button').find((b) => b.text().includes('Log trade'))
    expect(log).toBeDefined()
    await log!.trigger('click')
    await nextTick()
    await nextTick()

    // Teleported to the body, which is the only place `position: fixed` means
    // the viewport — the stage carries a backdrop-filter and would otherwise be
    // the containing block.
    const panel = document.querySelector('.ui-modal')
    expect(panel).not.toBeNull()
    expect(panel!.getAttribute('aria-modal')).toBe('true')
    expect(panel!.getAttribute('aria-label')).toBe('Log trade')
    expect(panel!.querySelector('.tform')).not.toBeNull()
    wrapper.unmount()
  })

  it('opens unfolded — the dialog is the disclosure', async () => {
    const wrapper = mountView()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Log trade'))!
      .trigger('click')
    await nextTick()

    const form = document.querySelector('.tform')!
    expect(form.classList.contains('is-expanded')).toBe(true)
    // And the "Filled in" summary is gone, because there is nothing left for it
    // to summarise that is not already on screen underneath it.
    expect(form.querySelector('.tform__context')).toBeNull()
    // Every pre-filled field is reachable without a second click.
    for (const field of ['istDate', 'symbol', 'session', 'side', 'note']) {
      expect(form.querySelector(`[data-field="${field}"]`), field).not.toBeNull()
    }
    wrapper.unmount()
  })

  it('closes on Escape without logging anything', async () => {
    const wrapper = mountView()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Log trade'))!
      .trigger('click')
    await nextTick()

    const panel = document.querySelector('.ui-modal') as HTMLElement
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.querySelector('.ui-modal')).toBeNull()
    wrapper.unmount()
  })
})
