// Section 24b/24c/24d as they land on the calendar — acceptances 122 and 124.
//
// The chip's colours are decided in JavaScript rather than in a color-mix,
// because the decision needs a measurement and CSS cannot take one. That makes
// it testable, which is the point: "readable at a glance, including on the
// purple theme" is otherwise a claim nobody can check until it ships.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEMES, THEME_DESCRIPTORS } from '@/themes'
import { contrastRatio } from '@/themes/contrast'
import { AA_TEXT, surfacePair } from '@/themes/surfacePair'
import { SOURCE_COLOR } from '@/utils/calendarEvents'

const view = readFileSync(resolve(__dirname, 'CalendarView.vue'), 'utf8')

describe('every event chip, on every theme', () => {
  // The four source colours are the ones the grid actually paints with when an
  // item has no project colour of its own.
  const sources = Object.values(SOURCE_COLOR)

  for (const d of THEME_DESCRIPTORS) {
    it(`${d.id}: the title reads on the fill`, () => {
      const theme = THEMES[d.id]
      for (const source of sources) {
        const pair = surfacePair(source, theme)
        expect(
          contrastRatio(pair.foreground, pair.background),
          `${d.id} / ${source}`,
        ).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })
  }

  it('paints the chip from that measurement, not from a raw color-mix', () => {
    // The fallback in the stylesheet exists only for the first frame; the value
    // that actually lands is --chip-bg, computed per event.
    expect(view).toContain('chipBg: surfacePair(')
    expect(view).toContain("'--chip-bg': arg.event.extendedProps.chipBg")
  })

  it('puts the hue on the bar and the text on --text-primary', () => {
    const chip = view.slice(view.indexOf('.cal-event {'), view.indexOf('.cal-event:active'))
    expect(chip).toContain('border-left: 3px solid var(--bar)')
    expect(chip).toContain('color: var(--text-primary')
    // Never the source colour as the text — that is the failure the whole
    // section is about.
    expect(chip).not.toMatch(/color:\s*var\(--bar\)/)
  })
})

describe('the month cell (section 24c)', () => {
  it('gives today a ring rather than a filled block', () => {
    // A filled cell competes with the events inside it, so the one day whose
    // contents matter most was the one the highlight made hardest to read.
    expect(view).toContain('--fc-today-bg-color: transparent')
    expect(view).toMatch(/\.fc-day-today \{\s*box-shadow: inset 0 0 0 1px var\(--theme-accent\)/)
  })

  it('keeps the selection tint below the chips at 6%', () => {
    // It was 18%: stronger than the 12% chips, so dragging out a range hid what
    // was already in the cells being dragged over.
    expect(view).toMatch(/--fc-highlight-color:[^;]*var\(--theme-accent\) 6%/)
  })

  it('sets the day number small, muted and tabular', () => {
    const block = view.slice(view.indexOf('.fc-daygrid-day-number {'))
    expect(block).toContain('font-size: var(--text-xs)')
    expect(block).toContain('font-variant-numeric: tabular-nums')
    expect(block).toContain('color: var(--text-muted')
  })

  it('marks out-of-month days by the cell, not by fading the number further', () => {
    // Dimming the text was the old approach and it made those numbers
    // invisible: the distinction was riding on the one property that also has
    // to stay readable.
    expect(view).toMatch(/\.fc-day-other \{\s*background:/)
  })

  it('holds three events at 20px with a 2px gap, then a more-link', () => {
    expect(view).toContain('dayMaxEvents')
    expect(view).toMatch(/\.fc-daygrid-event-harness \{\s*margin-top: 2px/)
    expect(view).toMatch(/min-height: 20px/)
  })
})

describe('the shell (acceptance 124)', () => {
  it('is a grid with a named panel track, not a flex row', () => {
    // A flex row with a fixed-width panel and no min-width lets the grid — which
    // can always shrink — push the panel off the left edge instead of taking
    // the squeeze itself. Widened to 260px by section 26b.
    expect(view).toContain("gridTemplateColumns: withPanel ? '260px minmax(0, 1fr)'")
  })

  it('sets min-width: 0 on both tracks', () => {
    const grid = view.slice(view.indexOf('function bodyGrid'), view.indexOf('const panelStyleBox'))
    expect(grid).toContain('minWidth: 0')
    expect(grid).toContain('minmax(0, 1fr)')
  })

  it('hands the panel to a component that owns its own rows', () => {
    // The row treatment moved to UnscheduledPanel in section 26b, along with
    // the clamp and the colour rules; UnscheduledPanel.test.ts asserts them
    // where they now live rather than through this file.
    expect(view).toContain('<UnscheduledPanel')
    expect(view).not.toContain('const unschedRow')
  })
})

describe('the toolbar (section 24d)', () => {
  it('gives the filter chips one accent between them, not four hues', () => {
    // Four differently-coloured chips plus a purple active state plus coloured
    // events left the eye with nothing to land on.
    expect(view).not.toMatch(/chipBtn\(filters\.\w+, '/)
    expect(view).toContain('const chipBtn = segBtn')
  })

  it('caps the project select instead of letting it fill the row', () => {
    expect(view).toMatch(/maxWidth: 240/)
  })

  it('has no native select left in it', () => {
    expect(view).not.toContain('<select')
  })

  it('sizes the chips and the view switcher alike', () => {
    const seg = view.slice(view.indexOf('function segBtn'), view.indexOf('const chipBtn'))
    expect(seg).toContain("typeStep('sm')")
    expect(seg).toContain('height: 32')
    expect(seg).toContain("borderRadius: 'var(--radius-control)'")
  })
})
