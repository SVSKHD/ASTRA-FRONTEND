<script lang="ts">
import { h, defineComponent, type PropType } from 'vue'
import type { TabKey } from '@/types'

type Attrs = Record<string, string | number>

function stroke(col: string, w?: number): Attrs {
  return { fill: 'none', stroke: col, 'stroke-width': w || 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
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
      ? [RC(3, 3, 18, 18, 5.5, { fill: col }), P('M8 12.4 L11 15.2 L16.4 9.1', stroke(ko || col, 2.1))]
      : [RC(3, 3, 18, 18, 5.5, stroke(col)), P('M8 12.4 L11 15.2 L16.4 9.1', stroke(col, 2))]
  } else if (name === 'tasks') {
    const lines = ['M9 6.6 H20', 'M9 12 H20', 'M9 17.4 H20'].map((d) => P(d, stroke(col, filled ? 2.2 : 1.9)))
    const dots = [6.6, 12, 17.4].map((cy) => CI(5, cy, 1.5, filled ? { fill: col } : stroke(col, 1.7)))
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
      ? [RC(3, 5, 18, 14, 3.5, { fill: col }), P('M3.4 9.6 H20.6', stroke(ko || col, 1.7)), P('M6.6 15 H11', stroke(ko || col, 1.7))]
      : [RC(3, 5, 18, 14, 3.5, stroke(col)), P('M3.4 9.6 H20.6', stroke(col, 1.9)), P('M6.6 15 H11', stroke(col, 1.9))]
  } else {
    const pin = 'M12 21s6-5.35 6-11a6 6 0 1 0-12 0c0 5.65 6 11 6 11Z'
    ch = filled
      ? [P(pin, { fill: col }), CI(12, 10, 2.15, { fill: ko || col })]
      : [P(pin, stroke(col)), CI(12, 10, 2.15, stroke(col, 1.8))]
  }
  return h(
    'svg',
    { width: 22, height: 22, viewBox: '0 0 24 24', style: { display: 'block', position: 'absolute', inset: 0 } },
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
