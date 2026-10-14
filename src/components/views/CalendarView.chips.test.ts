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
    expect(view).toContain('chipBg: surfacePair(SOURCE_COLOR[event.source]')
    expect(view).toContain("'--chip-bg': arg.event.extendedProps.chipBg")
  })

  it('tints the chip by its source and keeps the text on --text-primary', () => {
    // The fill is the source's hue — the same as its dot in the legend — so the
    // grid reads the way the legend says it will.
    const chip = view.slice(view.indexOf('.cal-event {'), view.indexOf('.cal-event:active'))
    expect(chip).toContain('background: var(--chip-bg')
    expect(chip).toContain('color: var(--text-primary')
    // Never the source colour as the text — that is the failure the whole
    // section is about.
    expect(chip).not.toMatch(/(^|[^-])color:\s*var\(--src\)/)
  })

  it('rings the selected chip, the one the side card describes', () => {
    expect(view).toContain("'is-selected': arg.event.id === selectedId")
    expect(view).toMatch(/\.cal-event\.is-selected \{\s*border-color: var\(--theme-text\)/)
  })
})

describe('the month cell (section 24c)', () => {
  it('marks today on its number, keeping the cell itself nearly clear', () => {
    // A filled cell competes with the events inside it, so the one day whose
    // contents matter most was the one the highlight made hardest to read. The
    // redesign puts the accent on the day number — a filled circle — and keeps
    // the cell to a 6% tint, the same weight as a selection.
    expect(view).toContain('--fc-today-bg-color: transparent')
    expect(view).toMatch(
      /\.fc-day-today \{\s*background: color-mix\(in oklch, var\(--theme-accent\) 6%/,
    )
    expect(view).toMatch(
      /\.fc-day-today \.fc-daygrid-day-number \{\s*background: var\(--theme-accent\)/,
    )
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

  it('holds event cards with a gap between them, then a more-link', () => {
    expect(view).toContain('dayMaxEvents')
    expect(view).toMatch(/\.fc-daygrid-event-harness \{\s*margin-top: \d+px/)
    expect(view).toMatch(/\.fc-daygrid-event \.cal-event \{\s*min-height: \d+px/)
  })
})

describe('the shell (acceptance 124)', () => {
  it('is a grid with a fixed side track, not a flex row', () => {
    // A flex row with a fixed-width panel and no min-width lets the grid — which
    // can always shrink — push the panel off the edge instead of taking the
    // squeeze itself. The side column holds the selection and Unscheduled.
    expect(view).toContain("gridTemplateColumns: 'minmax(0, 1fr) 288px'")
  })

  it('sets min-width: 0 on both tracks', () => {
    const grid = view.slice(view.indexOf('const bodyGrid'), view.indexOf('const hintStyle'))
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
  it('makes the filters the legend, with the hue on the dot and nowhere else', () => {
    // Four differently-coloured chips plus a purple active state plus coloured
    // events left the eye with nothing to land on. The filters are now the
    // legend: each wears a dot in the hue its events are tinted with, the
    // source's colour lives on that dot only, and the chip itself takes no
    // accent fill or ring — on is the dot filling in.
    expect(view).toMatch(/\.calv__chip\.is-on \.calv__chip-dot \{[^}]*var\(--src\)/)
    expect(view).not.toMatch(/\.calv__chip\.is-on \{[^}]*var\(--theme-accent\)/)
    expect(view).toContain("'--src': SOURCE_COLOR[f.source]")
    expect(view).not.toMatch(/\.calv__chip\[data-/)
  })

  it('caps the project select instead of letting it fill the row', () => {
    expect(view).toMatch(/maxWidth: 180/)
  })

  it('has no native select left in it', () => {
    expect(view).not.toContain('<select')
  })

  it('sizes the filters and the view switcher alike', () => {
    // 36px pills beside a 36px track: 28px targets with 4px of padding.
    const chip = view.slice(view.indexOf('.calv__chip {'), view.indexOf('.calv__chip.is-on'))
    const track = view.slice(view.indexOf('.calv__views {'), view.indexOf('.calv__view {'))
    const viewBtn = view.slice(view.indexOf('.calv__view {'), view.indexOf('.calv__view:hover'))
    expect(chip).toContain('height: 36px')
    expect(viewBtn).toContain('height: 28px')
    expect(track).toContain('padding: 4px')
    expect(chip).toContain('font-size: var(--text-xs)')
    expect(viewBtn).toContain('font-size: var(--text-xs)')
  })
})
