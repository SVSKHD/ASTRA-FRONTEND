<script lang="ts">
import { h, defineComponent, type PropType } from 'vue'
import type { TabKey } from '@/types'

type Attrs = Record<string, string | number>

function stroke(col: string, w?: number): Attrs {
  return {
    fill: 'none',
    stroke: col,
    'stroke-width': w || 1.9,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }
}
const P = (d: string, a: Attrs) => h('path', { d, ...a })
const CI = (cx: number, cy: number, r: number, a: Attrs) => h('circle', { cx, cy, r, ...a })
const RC = (x: number, y: number, w: number, hh: number, rx: number, a: Attrs) =>
  h('rect', { x, y, width: w, height: hh, rx, ...a })

// Port of the design's tabGlyph(name, filled, col, ko).
function glyph(name: TabKey, filled: boolean, col: string, ko?: string) {
  let ch: ReturnType<typeof h>[]
  if (name === 'todo') {
    ch = filled
      ? [
          RC(3, 3, 18, 18, 5.5, { fill: col }),
          P('M8 12.4 L11 15.2 L16.4 9.1', stroke(ko || col, 2.1)),
        ]
      : [RC(3, 3, 18, 18, 5.5, stroke(col)), P('M8 12.4 L11 15.2 L16.4 9.1', stroke(col, 2))]
  } else if (name === 'tasks') {
    const lines = ['M9 6.6 H20', 'M9 12 H20', 'M9 17.4 H20'].map((d) =>
      P(d, stroke(col, filled ? 2.2 : 1.9)),
    )
    const dots = [6.6, 12, 17.4].map((cy) =>
      CI(5, cy, 1.5, filled ? { fill: col } : stroke(col, 1.7)),
    )
    ch = [...lines, ...dots]
  } else if (name === 'deadlines') {
    ch = filled
      ? [CI(12, 12, 9, { fill: col }), P('M12 7.4 V12 L15.2 14.1', stroke(ko || col, 2))]
      : [CI(12, 12, 9, stroke(col)), P('M12 7.4 V12 L15.2 14.1', stroke(col, 1.9))]
  } else if (name === 'reminders') {
    const bell = 'M18 8.5a6 6 0 0 0-12 0c0 6.5-2.6 8.5-2.6 8.5h17.2s-2.6-2-2.6-8.5'
    const clap = 'M10.3 20.2a2 2 0 0 0 3.4 0'
    ch = filled
      ? [
          P(bell + ' Z', { fill: col, stroke: col, 'stroke-width': 1, 'stroke-linejoin': 'round' }),
          P('M10.3 20.2a2 2 0 0 0 3.4 0 Z', { fill: col }),
        ]
      : [P(bell, stroke(col)), P(clap, stroke(col))]
  } else if (name === 'finances') {
    ch = filled
      ? [
          RC(3, 5, 18, 14, 3.5, { fill: col }),
          P('M3.4 9.6 H20.6', stroke(ko || col, 1.7)),
          P('M6.6 15 H11', stroke(ko || col, 1.7)),
        ]
      : [
          RC(3, 5, 18, 14, 3.5, stroke(col)),
          P('M3.4 9.6 H20.6', stroke(col, 1.9)),
          P('M6.6 15 H11', stroke(col, 1.9)),
        ]
  } else if (name === 'ideas') {
    // A lightbulb: bulb glass + base filament lines.
    const bulb =
      'M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1 1.1 1.9v.3h5v-.3c0-.9.4-1.4 1.1-1.9A6 6 0 0 0 12 3Z'
    ch = filled
      ? [
          P(bulb, { fill: col }),
          P('M9.5 19 H14.5', stroke(ko || col, 1.8)),
          P('M10.2 21 H13.8', stroke(ko || col, 1.8)),
        ]
      : [
          P(bulb, stroke(col)),
          P('M9.5 19 H14.5', stroke(col, 1.8)),
          P('M10.2 21 H13.8', stroke(col, 1.8)),
        ]
  } else if (name === 'overview') {
    // A 2x2 dashboard grid.
    const cells = [
      [4, 4],
      [13, 4],
      [4, 13],
      [13, 13],
    ]
    ch = cells.map(([x, y]) => RC(x, y, 7, 7, 2, filled ? { fill: col } : stroke(col)))
  } else if (name === 'stocks') {
    // A rising trend line with an arrow head over a baseline.
    const line = 'M4 15 L9.5 10.5 L13 13 L20 6'
    const arrow = 'M15.5 6 H20 V10.5'
    ch = filled
      ? [
          P(line, stroke(col, 2.4)),
          P(arrow, stroke(col, 2.4)),
          CI(9.5, 10.5, 1.4, { fill: col }),
          CI(13, 13, 1.4, { fill: col }),
        ]
      : [P(line, stroke(col)), P(arrow, stroke(col))]
  } else if (name === 'ai') {
    // A four-point sparkle with a small companion star — the "AI" glyph.
    const star = 'M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z'
    const spark = 'M18.5 4 L19.2 6.3 L21.5 7 L19.2 7.7 L18.5 10 L17.8 7.7 L15.5 7 L17.8 6.3 Z'
    ch = filled
      ? [P(star, { fill: col }), P(spark, { fill: col })]
      : [P(star, stroke(col, 1.7)), P(spark, stroke(col, 1.3))]
  } else if (name === 'goals') {
    // A football (soccer ball): the outer circle, the central pentagon panel, and
    // five seams radiating to the edge. Distinct from Trips' pin.
    const pent = 'M12 8.8 L15 11 L13.9 14.6 L10.1 14.6 L9 11 Z'
    const seams = [
      'M12 8.8 L12 3.2',
      'M15 11 L20.4 9.2',
      'M13.9 14.6 L17.2 19.2',
      'M10.1 14.6 L6.8 19.2',
      'M9 11 L3.6 9.2',
    ]
    ch = filled
      ? [
          CI(12, 12, 9, { fill: col }),
          P(pent, stroke(ko || col, 1.4)),
          ...seams.map((d) => P(d, stroke(ko || col, 1.4))),
        ]
      : [
          CI(12, 12, 9, stroke(col)),
          P(pent, stroke(col, 1.5)),
          ...seams.map((d) => P(d, stroke(col, 1.4))),
        ]
  } else if (name === 'trips') {
    // The location pin belongs to Trips (places visited) — given its own branch so
    // it no longer shares the generic fallback with any other tab.
    const pin = 'M12 21s6-5.35 6-11a6 6 0 1 0-12 0c0 5.65 6 11 6 11Z'
    ch = filled
      ? [P(pin, { fill: col }), CI(12, 10, 2.15, { fill: ko || col })]
      : [P(pin, stroke(col)), CI(12, 10, 2.15, stroke(col, 1.8))]
  } else if (name === 'planning') {
    // A small node graph: two linked nodes above a child, edges connecting them.
    const edges = [P('M8 7.5 L8 13', stroke(col, 1.7)), P('M8 7.5 L16 15', stroke(col, 1.7))]
    const nodes = [
      RC(4.5, 3.5, 7, 4.5, 1.5, filled ? { fill: col } : stroke(col, 1.7)),
      RC(3.5, 13, 7, 4.5, 1.5, filled ? { fill: col } : stroke(col, 1.7)),
      RC(13, 15, 7, 4.5, 1.5, filled ? { fill: col } : stroke(col, 1.7)),
    ]
    ch = [...edges, ...nodes]
  } else if (name === 'trades') {
    // Two candlesticks with their wicks: the trade log's own glyph, and
    // deliberately not the Stocks trend line — one tab is a watchlist, the
    // other is a record of what was actually traded.
    const wicks = [P('M8.5 3.6 V20.4', stroke(col, 1.6)), P('M15.5 3.6 V20.4', stroke(col, 1.6))]
    const bodies = filled
      ? [RC(6, 6.5, 5, 7, 1.2, { fill: col }), RC(13, 10.5, 5, 7, 1.2, { fill: col })]
      : [RC(6, 6.5, 5, 7, 1.2, stroke(col, 1.8)), RC(13, 10.5, 5, 7, 1.2, stroke(col, 1.8))]
    ch = [...wicks, ...bodies]
  } else if (name === 'bots') {
    // A robot head: rounded case, two eyes, and an antenna.
    const antenna = [
      P('M12 3 V5.4', stroke(col, filled ? 2.2 : 1.9)),
      CI(12, 2.4, 1.1, filled ? { fill: col } : stroke(col, 1.7)),
    ]
    const head = filled
      ? [
          RC(4.5, 6.5, 15, 12.5, 4, { fill: col }),
          CI(9, 12.6, 1.5, { fill: ko || col }),
          CI(15, 12.6, 1.5, { fill: ko || col }),
        ]
      : [
          RC(4.5, 6.5, 15, 12.5, 4, stroke(col)),
          CI(9, 12.6, 1.4, stroke(col, 1.7)),
          CI(15, 12.6, 1.4, stroke(col, 1.7)),
        ]
    ch = [...antenna, ...head]
  } else {
    const pin = 'M12 21s6-5.35 6-11a6 6 0 1 0-12 0c0 5.65 6 11 6 11Z'
    ch = filled
      ? [P(pin, { fill: col }), CI(12, 10, 2.15, { fill: ko || col })]
      : [P(pin, stroke(col)), CI(12, 10, 2.15, stroke(col, 1.8))]
  }
  return h(
    'svg',
    {
      width: 22,
      height: 22,
      viewBox: '0 0 24 24',
      style: { display: 'block', position: 'absolute', inset: 0 },
    },
    ch,
  )
}

export default defineComponent({
  name: 'TabGlyph',
  props: {
    name: { type: String as PropType<TabKey>, required: true },
    filled: { type: Boolean, default: false },
    col: { type: String, required: true },
    ko: { type: String, default: undefined },
  },
  setup(props) {
    return () => glyph(props.name, props.filled, props.col, props.ko)
  },
})
</script>
