import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import {
  DANGER,
  WARNING,
  checkHalo,
  checkHaloDone,
  checkRing,
  doneText,
  pxify,
  tagChip,
  typeStep,
} from '@/styles'
import type { DaysChip } from '@/utils/detailFields'

// Long, readable timestamp for the detail panes ("Mon, Sep 13, 4:05 PM").
export function fmtDate(ms: number | null | undefined, withTime = true): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

// A YYYY-MM-DD string rendered the same way (no time).
export function fmtDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return ''
  return fmtDate(new Date(ymd + 'T00:00:00').getTime(), false)
}

// The shared look of the right-hand detail panes (todos, tasks, goals): cards,
// stat tiles, a key/value grid and pills. The inline editors themselves are the
// library's controls (TextInput, TextArea, Select, GlassDatePicker), so they
// carry no styles here beyond their width.
export function useDetailStyles() {
  const { c, dark, s } = useStyles()

  const pane = pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-4)',
    minHeight: 0,
    overflowY: 'auto',
    padding: '2px 4px 12px 2px',
  })
  const card = computed(() =>
    pxify({
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      padding: '14px 16px',
      borderRadius: 'var(--radius-card)',
      border: '1px solid ' + c.value.border,
      background: c.value.card,
    }),
  )
  const row = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' })
  const spacer = pxify({ flex: 1 })
  // Pane header: status / tag chips on the left, actions on the right, on ONE
  // centre line. The actions sit in a fixed-height bar because they are not the
  // same size (bell 26px, share globe 30px with its caret, delete 27px) — in a
  // plain wrapping row each centred on its own box and the icons stepped.
  const headerRow = pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 'var(--sp-3)',
    rowGap: 'var(--sp-2)',
    flexWrap: 'wrap',
    minHeight: 32,
  })
  const metaGroup = pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    flexWrap: 'wrap',
    minWidth: 0,
  })
  const actionBar = pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: 32,
    flexShrink: 0,
    marginLeft: 'auto',
  })
  const grow = pxify({ flex: 1, minWidth: 0 })
  const crumbBtn = computed(() =>
    pxify({
      border: 'none',
      background: 'transparent',
      color: c.value.accent,
      cursor: 'pointer',
      padding: 0,
      ...typeStep('2xs'),
    }),
  )
  const dimSmall = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim }))
  function titleStyle(done: boolean) {
    return pxify({
      ...typeStep('xl'),
      fontWeight: 'var(--weight-semibold)',
      color: c.value.text,
      cursor: 'text',
      wordBreak: 'break-word',
      ...doneText(done),
    })
  }
  const sectionLabel = computed(() =>
    pxify({
      ...typeStep('2xs'),
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: c.value.dim,
    }),
  )
  const bodyText = computed(() =>
    pxify({
      ...typeStep('sm'),
      color: c.value.text,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      cursor: 'text',
      minHeight: 22,
    }),
  )
  const placeholder = computed(() =>
    pxify({ ...typeStep('sm'), color: c.value.dim, fontStyle: 'italic', cursor: 'text' }),
  )
  const statGrid = pxify({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 'var(--sp-2)',
  })
  const statTile = computed(() =>
    pxify({
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '10px 12px',
      borderRadius: 'var(--radius-control)',
      background: c.value.input,
      border: '1px solid ' + c.value.border,
    }),
  )
  const statValue = computed(() =>
    pxify({ ...typeStep('lg'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
  )
  const statAccent = computed(() =>
    pxify({ ...typeStep('xl'), fontWeight: 'var(--weight-semibold)', color: c.value.accent }),
  )
  const infoGrid = pxify({
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    columnGap: 'var(--sp-4)',
    rowGap: 'var(--sp-2)',
    alignItems: 'center',
  })
  const infoKey = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
  const infoVal = computed(() =>
    pxify({ ...typeStep('sm'), color: c.value.text, wordBreak: 'break-word', minHeight: 20 }),
  )
  const editableVal = computed(() => pxify({ ...infoVal.value, cursor: 'text' }))
  const pill = computed(() =>
    pxify({
      ...typeStep('2xs'),
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid ' + c.value.border,
      color: c.value.dim,
      background: 'transparent',
      whiteSpace: 'nowrap',
    }),
  )
  const accentPill = computed(() =>
    pxify({
      ...pill.value,
      color: c.value.accent,
      borderColor: c.value.accent,
      cursor: 'pointer',
    }),
  )
  function toneStyle(chip: DaysChip | null) {
    const color = chip?.tone === 'overdue' ? DANGER : chip?.tone === 'today' ? WARNING : c.value.dim
    return pxify({ ...pill.value, color, borderColor: color })
  }
  const subRow = computed(() =>
    pxify({
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-2)',
      padding: '8px 10px',
      borderRadius: 'var(--radius-control)',
      border: '1px solid ' + c.value.border,
      background: c.value.input,
    }),
  )
  function boxStyle(done: boolean) {
    return pxify({
      position: 'relative',
      width: 20,
      height: 20,
      flexShrink: 0,
      borderRadius: 'var(--radius-control)',
      border: '1.5px solid ' + (done ? c.value.accent : checkRing(c.value)),
      boxShadow: done ? checkHaloDone(c.value.accent) : checkHalo(c.value),
      background: done ? c.value.accent : 'transparent',
      transition: 'background-color .2s ease, border-color .2s ease, box-shadow .2s ease',
      padding: 0,
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
    })
  }
  function subText(done: boolean) {
    return pxify({
      flex: 1,
      minWidth: 0,
      ...typeStep('sm'),
      color: c.value.text,
      cursor: 'text',
      wordBreak: 'break-word',
      ...doneText(done),
    })
  }
  const iconBtn = computed(() =>
    pxify({
      width: 26,
      height: 26,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      borderRadius: 'var(--radius-control)',
      background: 'transparent',
      color: c.value.dim,
      cursor: 'pointer',
    }),
  )
  const addBtn = computed(() =>
    pxify({
      flexShrink: 0,
      padding: '0 14px',
      borderRadius: 'var(--radius-control)',
      border: '1px solid ' + c.value.accent,
      background: 'transparent',
      color: c.value.accent,
      cursor: 'pointer',
      ...typeStep('sm'),
    }),
  )
  // tagChip() anchors itself to the top of its row (alignSelf: flex-start) for
  // the list rows' stacked layout; in a pane header it has to sit on the same
  // centre line as the status pill and the action icons beside it.
  function chipStyle(tag: string) {
    // Padding matched to the status pill (5px/10px + border) so the two chips
    // that sit side by side in the header are the same height.
    return pxify({ ...tagChip(c.value, tag, dark.value), alignSelf: 'center', padding: '4px 10px' })
  }

  return {
    c,
    s,
    pane,
    card,
    row,
    spacer,
    headerRow,
    metaGroup,
    actionBar,
    grow,
    crumbBtn,
    dimSmall,
    titleStyle,
    sectionLabel,
    bodyText,
    placeholder,
    statGrid,
    statTile,
    statValue,
    statAccent,
    infoGrid,
    infoKey,
    infoVal,
    editableVal,
    pill,
    accentPill,
    toneStyle,
    subRow,
    boxStyle,
    subText,
    iconBtn,
    addBtn,
    chipStyle,
  }
}
