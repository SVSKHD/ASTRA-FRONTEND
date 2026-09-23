// Where a detail opens, and the one rule about it that is easy to lose: the
// drawers that are NOT detail panes must not be able to move the detail panes.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

describe('the detail pane mode', () => {
  let app: ReturnType<typeof useAppStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    app = useAppStore()
  })

  it('opens in the tab, not over it', () => {
    // The default is the column in the layout. A first-time reader should meet
    // the list and its detail side by side, not a panel floating over the tab.
    expect(app.paneMode).toBe('inline')
  })

  it('steps out of the tab and back, one press at a time', () => {
    app.cyclePaneMode()
    expect(app.paneMode).toBe('compact')
    app.cyclePaneMode()
    expect(app.paneMode).toBe('large')
    app.cyclePaneMode()
    expect(app.paneMode).toBe('inline')
  })

  it('is not moved by the form and reference drawers', () => {
    // The goal form, the help reference and the security panel are drawers with
    // no column of a tab to sit in. They share a width of their own, and this
    // is the assertion that keeps it that way: pressing "wider" on a form used
    // to write a drawer mode here, and every list in the app silently left the
    // split view its reader had chosen.
    expect(app.drawerWide).toBe(true)
    app.toggleDrawerWide()
    expect(app.drawerWide).toBe(false)
    expect(app.paneMode).toBe('inline')

    app.setPaneMode('large')
    app.toggleDrawerWide()
    expect(app.drawerWide).toBe(true)
    expect(app.paneMode).toBe('large')
  })

  it('and does not move them either', () => {
    app.cyclePaneMode()
    app.cyclePaneMode()
    expect(app.paneMode).toBe('large')
    expect(app.drawerWide).toBe(true)
  })
})
