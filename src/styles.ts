import type { CSSProperties } from 'vue'
import type { Theme } from '@/themes'
import type { ItemStatus } from '@/types'
import { tagColor } from '@/utils/tags'

// ---------------------------------------------------------------------------
// pxify: the design's style objects use raw numbers for pixel values (React
// convention). Vue's :style does NOT auto-append "px", so we do it here,
// skipping the well-known unitless properties.
// ---------------------------------------------------------------------------
const UNITLESS = new Set([
  'animationIterationCount',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'gridArea',
  'gridRow',
  'gridColumn',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeOpacity',
  'strokeWidth',
])

export type Style = Record<string, string | number | undefined>

export function pxify(style: Style): CSSProperties {
  const out: Record<string, string | number> = {}
  for (const key in style) {
    const val = style[key]
    if (val === undefined) continue
    if (typeof val === 'number' && !UNITLESS.has(key)) out[key] = val + 'px'
    else out[key] = val
  }
  return out as CSSProperties
}

// Merge two raw styles then pxify (later wins).
export function merge(...styles: (Style | undefined)[]): CSSProperties {
  const combined: Style = {}
  for (const s of styles) if (s) Object.assign(combined, s)
  return pxify(combined)
}

// A gentle floating "bob" animation, parameterised like the design's bob().
export function bob(delay: number, dur: number): Style {
  return { animation: 'bob ' + dur + 's ease-in-out infinite', animationDelay: delay + 's' }
}

// ---------------------------------------------------------------------------
// buildStyles: the full `s` style map, ported from the design's renderVals().
// Only theme + viewport dependent styles live here; a handful of styles that
// also depend on component-local state (drawer open, dialog closing, dragging,
// the signed-in user's colour) are built inside the components that own them.
// ---------------------------------------------------------------------------
export function buildStyles(c: Theme, dark: boolean, isMobile: boolean) {
  const B = '1px solid ' + c.border

  const tickerBase: Style = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: c.glass,
    backdropFilter: 'blur(24px) saturate(1.5)',
    // iOS WebView (and older Safari) only honour the prefixed property, so a
    // fixed bar without it renders as a clear pane the content shows through.
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.5)',
    border: B,
    color: c.text,
    cursor: 'pointer',
    transition: 'transform .25s ease',
  }
  const ticker: Style = isMobile
    ? {
        ...tickerBase,
        position: 'fixed',
        // Sit below the notch: the frosted strip fills the status-bar area and
        // its content is padded down past the inset so nothing hides under it.
        top: 0,
        left: 0,
        right: 0,
        zIndex: 8,
        borderRadius: 0,
        justifyContent: 'flex-start',
        minHeight: 40,
        padding: 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px',
      }
    : {
        ...tickerBase,
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 8,
        borderRadius: 14,
        padding: '9px 14px',
        maxWidth: 'min(60vw,260px)',
        boxShadow: c.shadow,
        ...bob(2.4, 6.5),
      }

  const s: Record<string, Style> = {
    page: {
      position: 'relative',
      zIndex: 1,
      minHeight: '100vh',
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: 'center',
      // The single top bar is the first thing in the stack (sticky), so the
      // page only reserves the notch at the top and the home indicator at the
      // bottom — there is no separate bottom nav to clear anymore.
      padding: isMobile
        ? 'calc(14px + env(safe-area-inset-top, 0px)) 12px calc(18px + env(safe-area-inset-bottom, 0px))'
        : '40px 16px',
    },
    stack: {
      position: 'relative',
      isolation: 'isolate',
      width: isMobile ? '100%' : 'min(92vw, 720px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 22,
    },
    topRow: {
      position: 'relative',
      zIndex: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 4px',
    },
    brand: {
      fontSize: 15,
      letterSpacing: '0.42em',
      fontWeight: 600,
      color: c.text,
      textShadow: dark ? '0 0 16px rgba(255,255,255,0.15)' : 'none',
    },
    themeWrap: { position: 'relative', zIndex: 13, flexShrink: 0 },
    themeTrigger: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: c.pageBg,
      border: '2px solid ' + c.accent,
      boxShadow: '0 0 14px ' + c.accent,
      cursor: 'pointer',
      ...bob(1.6, 7),
    },
    // Header-mounted variant: no bob, because the header already bobs and the
    // two animations compound into a visible wobble. Sized to the user pill.
    themeTriggerInline: {
      width: isMobile ? 28 : 30,
      height: isMobile ? 28 : 30,
      borderRadius: '50%',
      background: c.pageBg,
      border: '2px solid ' + c.accent,
      // Same 14px glow as the greeting orb at the other end of the header.
      boxShadow: '0 0 14px ' + c.accent,
      cursor: 'pointer',
      transition: 'transform .2s ease, box-shadow .25s ease',
    },
    themeTriggerInlineHover: { transform: 'translateY(-1px)', boxShadow: '0 0 18px ' + c.accent },
    themePanel: {
      position: 'absolute',
      top: 'calc(100% + 12px)',
      right: 0,
      zIndex: 20,
      width: 220,
      background: c.glass,
      backdropFilter: 'blur(28px) saturate(1.6)',
      border: B,
      borderRadius: 24,
      padding: 10,
      boxShadow: c.shadow,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      animation: 'fadeUp .25s ease both',
    },
    themeGroupLabel: {
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: c.dim,
      padding: '6px 8px 2px',
    },
    themeRowHover: { background: c.card },
    greetingRow: {
      // On mobile the page scrolls, so the header sticks to the top (just below
      // the notch) and frosts whatever scrolls under it, rather than sliding
      // away and letting content collide with the status bar.
      position: isMobile ? 'sticky' : 'relative',
      top: isMobile ? 'env(safe-area-inset-top, 0px)' : 'auto',
      zIndex: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: isMobile ? '11px 11px 11px 18px' : '13px 13px 13px 20px',
      borderRadius: 26,
      background: c.glass,
      backdropFilter: 'blur(20px) saturate(1.5)',
      '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
      border: B,
      boxShadow: c.shadow + ', inset 0 1px 0 rgba(255,255,255,0.14)',
      // The bob's transform would fight the sticky offset on mobile, so it only
      // floats on desktop where the header is in normal flow.
      ...(isMobile ? {} : bob(1.2, 6.4)),
    },
    greetingText: {
      fontSize: isMobile ? 13 : 14,
      color: c.text,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    // The greeting yields first: the carousel in the middle of the header is
    // navigation, and it keeps its width before "Good afternoon" keeps its.
    greetingLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
      flexShrink: 1,
      // No overflow clip here: the greeting orb's glow spills outside its box by
      // design, and hiding the overflow squared it off against the header edge.
      // The text does its own ellipsis, which is all the shrinking needed.
    },
    // Theme trigger + account pill share the right end of the header.
    greetingRight: {
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? 7 : 10,
      flexShrink: 0,
    },
    userMenuWrap: { position: 'relative', zIndex: 13, flexShrink: 0 },
    userPill: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '5px 11px 5px 5px',
      borderRadius: 999,
      background: c.input,
      border: B,
      cursor: 'pointer',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
      transition: 'background .25s ease, transform .2s ease',
      maxWidth: isMobile ? '48vw' : 'none',
    },
    userPillHover: { transform: 'translateY(-1px)', background: c.card },
    userPillName: {
      fontSize: 12,
      fontWeight: 600,
      color: c.text,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    userPillChevron: { fontSize: 9, color: c.dim, marginLeft: -3 },
    // Fills whatever the fixed-height card has left and scrolls inside it, so
    // the card's size is set by the card, never by how much is in the list.
    dayGroups: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      margin: '0 -2px',
      padding: 2,
    },
    dayBodyInner: { overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 9 },
    // The accordion handle. A button, so it is reachable by keyboard, but
    // styled as the plain header row it replaced.
    dayGroupHead: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
      width: '100%',
      padding: 0,
      border: 'none',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      textAlign: 'left',
    },
    dayGroupLabel: { display: 'flex', alignItems: 'center', gap: 7 },
    // The per-day tally: one chip per status, so a group reads at a glance.
    dayStats: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    // The all/none control and the status filter that sit above the day cards.
    dayToolbar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
    },
    filterRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    tagPicker: { display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 },
    tagRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    // The one control that opens a create dialog, in place of the add-form each
    // tab used to carry.
    newBtn: {
      fontSize: 11,
      fontWeight: 700,
      padding: '6px 13px',
      borderRadius: 999,
      border: '1px solid ' + c.border,
      background: c.card,
      color: c.accent,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxShadow: dark ? '0 0 14px ' + c.accent : 'none',
      transition: 'transform .25s ease, box-shadow .25s ease',
    },
    foldBtn: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '5px 10px',
      borderRadius: 999,
      border: '1px solid ' + c.border,
      background: 'transparent',
      color: c.dim,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    dayGroupLabelBase: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: c.accent,
    },
    dayCount: { fontSize: 10, color: c.dim, fontWeight: 600 },
    dayDropHint: {
      fontSize: 11,
      color: c.dim,
      textAlign: 'center',
      padding: '12px 0',
      fontStyle: 'italic',
    },
    grip: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2,3px)',
      gridAutoRows: '3px',
      gap: 3,
      flexShrink: 0,
      cursor: 'grab',
      opacity: 0.45,
      alignContent: 'center',
    },
    gripDot: { width: 3, height: 3, borderRadius: '50%', background: c.dim },
    ghConnRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    prLink: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: c.accent,
      textDecoration: 'none',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    taskViewOverlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 18,
      background: 'rgba(5,5,15,0.45)',
      backdropFilter: 'blur(6px)',
    },
    taskViewPage: {
      position: 'fixed',
      inset: 0,
      zIndex: 19,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '70px 16px' : '80px 24px',
    },
    taskViewBack: {
      position: 'fixed',
      top: 18,
      left: 18,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
      padding: '9px 16px',
      borderRadius: 14,
      border: B,
      background: c.glass,
      backdropFilter: 'blur(20px) saturate(1.5)',
      color: c.text,
      cursor: 'pointer',
      boxShadow: c.shadow,
    },
    taskViewCard: {
      width: 'min(94vw,560px)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: c.glass,
      backdropFilter: 'blur(34px) saturate(1.7)',
      border: B,
      borderRadius: 34,
      padding: isMobile ? '28px 22px' : '40px 38px',
      boxShadow: c.shadow,
      color: c.text,
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      animation: 'springIn .45s cubic-bezier(.34,1.56,.64,1) both',
    },
    taskViewTitle: {
      fontSize: isMobile ? 26 : 34,
      fontWeight: 700,
      lineHeight: 1.15,
      letterSpacing: '-0.01em',
      color: c.text,
      textWrap: 'pretty',
    },
    taskViewMeta: { display: 'flex', flexWrap: 'wrap', gap: 10 },
    taskViewMetaItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      padding: '10px 14px',
      borderRadius: 16,
      background: c.input,
      border: B,
      minWidth: 110,
    },
    taskViewMetaLabel: {
      fontSize: 9,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: c.dim,
    },
    taskViewMetaVal: { fontSize: 13, color: c.text },
    taskViewNotes: {
      fontSize: 14,
      lineHeight: 1.6,
      color: c.text,
      padding: '16px 18px',
      borderRadius: 16,
      background: c.input,
      border: B,
      whiteSpace: 'pre-wrap',
    },
    // The tabs are the middle column of the single top bar on every viewport —
    // there is no separate bottom bar. It drops any glass shell of its own (a
    // second pane inside the header read as a box on a box) and just takes the
    // width the logo and the right cluster leave, centring in it.
    tabBar: {
      position: 'relative',
      zIndex: 4,
      flex: 1,
      minWidth: 0,
      display: 'flex',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      padding: 0,
    },
    // The carousel shell: arrows pinned either side, the strip centred between
    // them. On mobile the strip is one tab wide, so the arrows are the only way
    // to step through it besides swiping the card.
    tabCarousel: {
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? 2 : 2,
      width: isMobile ? '100%' : 'auto',
      maxWidth: '100%',
    },
    tabArrow: {
      flexShrink: 0,
      width: isMobile ? 38 : 24,
      height: isMobile ? 40 : 32,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 14,
      border: 'none',
      background: 'transparent',
      color: c.dim,
      fontSize: isMobile ? 17 : 15,
      lineHeight: 1,
      cursor: 'pointer',
      transition: 'background .25s ease, color .25s ease, transform .2s ease',
    },
    tabArrowHover: { background: c.card, color: c.accent, transform: 'scale(1.08)' },
    // Mobile only: the active tab rendered large in the middle of the carousel.
    tabStage: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      padding: '5px 0 4px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      overflow: 'hidden',
    },
    tabStageRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    tabStageLabel: {
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: '0.02em',
      color: c.text,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    tabDots: { display: 'flex', alignItems: 'center', gap: 5 },
    tabScroll: {
      position: 'relative',
      display: 'flex',
      gap: isMobile ? 4 : 3,
      width: isMobile ? '100%' : 'auto',
      maxWidth: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollSnapType: 'x mandatory',
      scrollbarWidth: 'none',
      '-webkit-overflow-scrolling': 'touch',
      maskImage:
        'linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%)',
      '-webkit-mask-image':
        'linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%)',
    },
    indicator: {
      position: 'absolute',
      zIndex: 1,
      top: 0,
      bottom: 0,
      left: 0,
      width: 0,
      opacity: 0,
      background: c.card,
      backdropFilter: 'blur(10px) saturate(1.5)',
      '-webkit-backdrop-filter': 'blur(10px) saturate(1.5)',
      borderRadius: 18,
      border: '1px solid ' + c.border,
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.38), inset 0 -2px 3px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.08)',
      pointerEvents: 'none',
      transition:
        'transform .45s cubic-bezier(.5,1.4,.35,1), width .45s cubic-bezier(.5,1.4,.35,1), opacity .3s ease',
    },
    container: {
      position: 'relative',
      zIndex: 1,
      width: '100%',
      maxWidth: isMobile ? '100%' : 720,
      // A fixed height, not a minimum: every tab is the same size whatever it
      // holds, so switching tabs never resizes the card under the pointer. The
      // list inside scrolls; the card does not grow. The safe-area insets are
      // subtracted so the card stays clear of the notch and the home indicator.
      height: isMobile
        ? 'min(600px, calc(100vh - 150px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)))'
        : 660,
      display: 'flex',
      flexDirection: 'column',
      background: c.glass,
      backdropFilter: 'blur(30px) saturate(1.6)',
      '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
      border: B,
      borderRadius: isMobile ? 28 : 34,
      padding: isMobile ? '18px' : 'clamp(24px,3.2vw,36px)',
      boxShadow: c.shadow,
      color: c.text,
      transition: 'background .8s ease, color .8s ease, border-color .8s ease, box-shadow .8s ease',
      ...bob(0.8, 6.6),
    },
    inputRow: { display: 'flex', gap: 9 },
    input: {
      flex: 1,
      minWidth: 0,
      padding: '13px 16px',
      borderRadius: 16,
      border: B,
      background: c.input,
      color: c.text,
      fontSize: 14,
      transition: 'background .4s ease, border-color .4s ease',
    },
    amountInput: {
      width: 120,
      flexShrink: 0,
      padding: '13px 16px',
      borderRadius: 16,
      border: B,
      background: c.input,
      color: c.text,
      fontSize: 14,
      transition: 'background .4s ease, border-color .4s ease',
    },
    select: {
      flex: 1,
      minWidth: 0,
      padding: '13px 14px',
      borderRadius: 16,
      border: B,
      background: c.input,
      color: c.text,
      fontSize: 14,
      cursor: 'pointer',
      transition: 'background .4s ease, border-color .4s ease',
    },
    addBtn: {
      flexShrink: 0,
      width: 48,
      borderRadius: 16,
      border: B,
      background: c.card,
      color: c.accent,
      fontSize: 21,
      cursor: 'pointer',
      boxShadow: dark ? '0 0 16px ' + c.accent : 'none',
      transition: 'transform .25s ease, box-shadow .25s ease',
    },
    addBtn2: {
      alignSelf: 'flex-start',
      fontSize: 12,
      padding: '8px 14px',
      borderRadius: 14,
      border: B,
      background: c.card,
      color: c.accent,
      cursor: 'pointer',
      fontWeight: 600,
    },
    addBtnHover: { transform: 'translateY(-2px)', boxShadow: '0 8px 18px rgba(0,0,0,0.25)' },
    empty: { textAlign: 'center', color: c.dim, fontSize: 13, padding: '18px 0' },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      margin: '0 -2px',
      padding: '2px 2px',
    },
    rowHover: { transform: 'translateY(-3px)', boxShadow: '0 14px 26px rgba(0,0,0,0.28)' },
    del: {
      flexShrink: 0,
      width: 27,
      height: 27,
      borderRadius: 11,
      border: 'none',
      background: 'transparent',
      color: c.dim,
      fontSize: 19,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'color .2s ease',
    },
    shareBtn: {
      flexShrink: 0,
      width: 27,
      height: 27,
      borderRadius: 11,
      border: 'none',
      background: 'transparent',
      color: c.dim,
      fontSize: 15,
      cursor: 'pointer',
      display: 'grid',
      placeItems: 'center',
      transition: 'color .2s ease',
    },
    editBtn: {
      flexShrink: 0,
      fontSize: 10,
      padding: '5px 10px',
      borderRadius: 11,
      border: B,
      background: 'transparent',
      color: c.dim,
      cursor: 'pointer',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    saveBtn: {
      flexShrink: 0,
      fontSize: 10,
      padding: '6px 12px',
      borderRadius: 11,
      border: '1px solid ' + c.accent,
      background: c.accent,
      color: c.onAccent,
      cursor: 'pointer',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      fontWeight: 600,
    },
    cancelBtn: {
      flexShrink: 0,
      fontSize: 10,
      padding: '6px 12px',
      borderRadius: 11,
      border: B,
      background: 'transparent',
      color: c.dim,
      cursor: 'pointer',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    editInput: {
      flex: 1,
      minWidth: 0,
      padding: '9px 12px',
      borderRadius: 14,
      border: '1px solid ' + c.accent,
      background: c.input,
      color: c.text,
      fontSize: 13,
    },
    editInputSmall: {
      width: 96,
      flexShrink: 0,
      padding: '9px 12px',
      borderRadius: 14,
      border: '1px solid ' + c.accent,
      background: c.input,
      color: c.text,
      fontSize: 13,
    },
    taskMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
    chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    chip: {
      alignSelf: 'flex-start',
      fontSize: 10,
      padding: '2px 8px',
      borderRadius: 10,
      background: c.input,
      border: B,
      color: c.dim,
      letterSpacing: '0.03em',
    },
    dlTitle: { fontSize: 14, color: c.text, lineHeight: 1.3, cursor: 'pointer' },
    dlDate: { fontSize: 10, color: c.dim, letterSpacing: '0.03em' },
    totalsRow: { display: 'flex', gap: 10 },
    totalCard: {
      flex: 1,
      background: c.card,
      border: B,
      borderRadius: 16,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    totalLabel: { fontSize: 10, color: c.dim, letterSpacing: '0.1em', textTransform: 'uppercase' },
    totalVal: { fontSize: 20, fontWeight: 600, color: c.text },
    finNote: { fontSize: 14, color: c.text, lineHeight: 1.3, cursor: 'pointer' },
    finMeta: { fontSize: 10, color: c.dim, letterSpacing: '0.03em' },
    amount: { fontSize: 14, fontWeight: 600, color: c.text, whiteSpace: 'nowrap' },
    ticker,
    tickerDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
    tickerLabel: { fontSize: 9, letterSpacing: '0.12em', color: c.dim, flexShrink: 0 },
    tickerTitle: {
      fontSize: 12,
      color: c.text,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      minWidth: 0,
      flex: 1,
    },
    tickerTime: { fontSize: 12, fontWeight: 600, color: c.accent, flexShrink: 0 },
    fab: {
      position: 'fixed',
      bottom: isMobile ? 88 : 24,
      right: isMobile ? 16 : 24,
      zIndex: 6,
      width: isMobile ? 48 : 52,
      height: isMobile ? 48 : 52,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      background: c.glass,
      backdropFilter: 'blur(24px) saturate(1.5)',
      border: B,
      boxShadow: c.shadow,
      cursor: 'pointer',
      transition: 'transform .25s ease',
      ...bob(3.2, 6.8),
    },
    fabHover: { transform: 'translateY(-3px) scale(1.05)' },
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 6,
      background: 'rgba(5,5,15,0.35)',
      backdropFilter: 'blur(2px)',
    },
    drawerHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    drawerTitle: {
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: c.text,
    },
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 5,
      padding: 7,
      borderRadius: 14,
      background: c.card,
      border: B,
    },
    toolGroup: {
      display: 'flex',
      gap: 3,
      paddingRight: 6,
      marginRight: 3,
      borderRight: '1px solid ' + c.border,
    },
    toolBtn: {
      minWidth: 28,
      fontSize: 11,
      padding: '6px 8px',
      borderRadius: 9,
      border: B,
      background: 'transparent',
      color: c.text,
      cursor: 'pointer',
      fontWeight: 600,
      transition: 'background .2s ease, color .2s ease, border-color .2s ease',
    },
    toolBtnHover: { background: c.input, borderColor: c.accent },
    editorArea: {
      flex: 1,
      minHeight: 160,
      overflowY: 'auto',
      padding: '12px 14px',
      borderRadius: 14,
      border: '1px solid ' + c.accent,
      background: c.input,
      color: c.text,
      fontSize: 13,
      lineHeight: 1.6,
      outline: 'none',
    },
    noteRendered: { fontSize: 13, lineHeight: 1.5, color: c.text },
    // --- note list cards + full view ----------------------------------------
    noteCard: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '12px 13px',
      borderRadius: 16,
      background: c.card,
      border: B,
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
      transition: 'transform .2s ease, box-shadow .25s ease, border-color .25s ease',
    },
    noteCardHover: {
      transform: 'translateY(-2px)',
      borderColor: c.accent,
      boxShadow: '0 12px 22px rgba(0,0,0,0.22)',
    },
    noteCardTitle: {
      fontSize: 13.5,
      fontWeight: 600,
      color: c.text,
      lineHeight: 1.35,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    // Two lines of body text, then a fade-free clamp — enough to recognise the
    // note without the row growing with its content.
    noteCardPreview: {
      fontSize: 11.5,
      lineHeight: 1.45,
      color: c.dim,
      display: '-webkit-box',
      '-webkit-line-clamp': '2',
      '-webkit-box-orient': 'vertical',
      overflow: 'hidden',
    },
    noteCardFoot: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    noteCardActions: { display: 'flex', gap: 4, marginLeft: 'auto' },
    noteViewOverlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 17,
      background: 'rgba(5,5,15,0.5)',
      backdropFilter: 'blur(3px)',
      '-webkit-backdrop-filter': 'blur(3px)',
    },
    noteViewBody: {
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      fontSize: 14,
      lineHeight: 1.7,
      color: c.text,
      padding: '4px 2px',
      wordBreak: 'break-word',
    },
    noteViewTitle: {
      fontSize: 16,
      fontWeight: 700,
      color: c.text,
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    noteViewFoot: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      paddingTop: 12,
      borderTop: B,
    },
    ghShimmer: {
      height: 70,
      borderRadius: 12,
      background:
        'linear-gradient(90deg,' + c.input + ' 25%, ' + c.card + ' 50%, ' + c.input + ' 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
    },
    ghGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
    ghItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      background: c.input,
      borderRadius: 10,
      padding: '8px 10px',
    },
    ghLabel: { fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.dim },
    ghVal: { fontSize: 12, color: c.text },
    dialogOverlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 15,
      background: 'rgba(5,5,15,0.4)',
      backdropFilter: 'blur(4px)',
    },
    dialogHeader: { display: 'flex', alignItems: 'center', gap: 10 },
    dialogHeading: { flex: 1, fontSize: 15, fontWeight: 700, color: c.text },
    dialogTitleInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: 600,
      padding: '8px 12px',
      borderRadius: 14,
      border: B,
      background: c.input,
      color: c.text,
    },
    dialogRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    dialogNotes: {
      minHeight: 70,
      padding: '12px 14px',
      borderRadius: 16,
      border: B,
      background: c.input,
      color: c.text,
      fontSize: 13,
      fontFamily: 'inherit',
      resize: 'vertical',
    },
    dialogGithub: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 6,
      borderTop: B,
    },
    dialogActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
    notifBanner: {
      position: 'fixed',
      top: isMobile ? 70 : 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 17,
      width: 'min(90vw,340px)',
      background: c.glass,
      backdropFilter: 'blur(28px) saturate(1.6)',
      border: '1px solid ' + c.accent,
      borderRadius: 24,
      padding: 16,
      boxShadow: '0 0 30px ' + c.accent + ', ' + c.shadow,
      color: c.text,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      animation: 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
    },
    weekdayRow: { display: 'flex', gap: 6 },
    shareCard: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      zIndex: 16,
      width: 'min(92vw,420px)',
      background: c.glass,
      backdropFilter: 'blur(30px) saturate(1.6)',
      border: B,
      borderRadius: 24,
      padding: 22,
      boxShadow: c.shadow,
      color: c.text,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
    },
    toast: {
      position: 'fixed',
      bottom: isMobile ? 90 : 90,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: c.glass,
      backdropFilter: 'blur(24px) saturate(1.5)',
      border: B,
      borderRadius: 18,
      padding: '10px 14px',
      boxShadow: c.shadow,
      color: c.text,
    },
    toastText: { fontSize: 12, color: c.text },
    brandWrap: {
      position: 'fixed',
      top: isMobile ? 52 : 18,
      left: isMobile ? 16 : 18,
      zIndex: 12,
      display: 'flex',
      alignItems: 'center',
    },
    menuHead: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '4px 8px 8px',
      borderBottom: B,
      marginBottom: 4,
    },
    menuItem: {
      textAlign: 'left',
      fontSize: 12,
      padding: '9px 8px',
      borderRadius: 12,
      border: 'none',
      background: 'transparent',
      color: c.text,
      cursor: 'pointer',
    },
    menuToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '9px 8px',
      borderRadius: 12,
      color: c.text,
      fontSize: 11,
      cursor: 'pointer',
    },
    avatarMenu: {
      position: 'absolute',
      top: 'calc(100% + 12px)',
      right: 0,
      zIndex: 30,
      width: isMobile ? 'min(82vw,222px)' : 222,
      background: c.glass,
      backdropFilter: 'blur(28px) saturate(1.6)',
      '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
      border: B,
      borderRadius: 20,
      padding: 10,
      boxShadow: c.shadow + ', inset 0 1px 0 rgba(255,255,255,0.14)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      animation: 'fadeUp .25s ease both',
    },
    ghFab: {
      position: 'fixed',
      display: isMobile ? 'none' : 'grid',
      bottom: 86,
      right: 24,
      zIndex: 6,
      width: 52,
      height: 52,
      borderRadius: '50%',
      placeItems: 'center',
      background: c.glass,
      backdropFilter: 'blur(24px) saturate(1.5)',
      border: B,
      boxShadow: c.shadow,
      cursor: 'pointer',
      transition: 'transform .25s ease',
      ...bob(3.8, 7),
    },
    ghPanel: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 16,
      width: 'min(94vw,520px)',
      maxHeight: '86vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: c.glass,
      backdropFilter: 'blur(30px) saturate(1.6)',
      border: B,
      borderRadius: 26,
      padding: 22,
      boxShadow: c.shadow,
      color: c.text,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
    },
    ghLinkCard: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      alignItems: 'flex-start',
      padding: 16,
      borderRadius: 16,
      background: c.card,
      border: B,
    },
    ghRepoCard: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '12px 14px',
      borderRadius: 16,
      background: c.card,
      border: B,
    },
    ghRepoMeta: { display: 'flex', gap: 14, fontSize: 10, color: c.dim, flexWrap: 'wrap' },
    ghProgressOuter: { height: 5, borderRadius: 3, background: c.input, overflow: 'hidden' },
    ghSection: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      paddingTop: 8,
      borderTop: B,
      animation: 'fadeUp .3s ease both',
    },
    ghIssueRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '6px 8px',
      borderRadius: 10,
      background: c.input,
    },
    ghIssueText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: c.text,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    importBtn: {
      flexShrink: 0,
      fontSize: 9,
      padding: '4px 9px',
      borderRadius: 10,
      border: '1px solid ' + c.accent,
      background: 'transparent',
      color: c.accent,
      cursor: 'pointer',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    authCard: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 16,
      width: 'min(92vw,360px)',
      background: c.glass,
      backdropFilter: 'blur(30px) saturate(1.6)',
      border: B,
      borderRadius: 26,
      padding: '30px 26px',
      boxShadow: c.shadow,
      color: c.text,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      textAlign: 'center',
      animation: 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
    },
    authLogo: {
      fontSize: 20,
      letterSpacing: '0.4em',
      fontWeight: 700,
      color: c.text,
      marginBottom: 2,
    },
    authRow: { display: 'flex', gap: 12, width: '100%' },
    authBtn: {
      flex: 1,
      padding: '15px',
      borderRadius: 14,
      border: B,
      background: c.card,
      color: c.text,
      cursor: 'pointer',
      transition: 'transform .2s ease',
      display: 'grid',
      placeItems: 'center',
    },
    authGuest: {
      marginTop: 2,
      padding: '10px',
      borderRadius: 12,
      border: 'none',
      background: 'transparent',
      color: c.dim,
      fontSize: 12,
      cursor: 'pointer',
    },
    authError: { fontSize: 11, color: '#f87171', lineHeight: 1.45 },
    loadingOrbit: {
      width: 24,
      height: 24,
      alignSelf: 'center',
      borderRadius: '50%',
      border: '2px solid ' + c.border,
      borderTopColor: c.accent,
      animation: 'spin 1s linear infinite',
    },
  }

  return { s, B }
}

// The shared row base used by list items across views.
// The floating card every dialog sits in. Was copy-pasted per dialog; now one
// definition, so a new dialog cannot drift from the others.
export function dialogCard(c: Theme, closing: boolean): Style {
  return {
    position: 'fixed',
    top: '50%',
    left: '50%',
    zIndex: 16,
    width: 'min(92vw,460px)',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: c.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.border,
    borderRadius: 26,
    padding: 22,
    boxShadow: c.shadow,
    color: c.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    animation: closing
      ? 'springOut .22s ease forwards'
      : 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
  }
}

// The folding part of a day card. Animating grid-template-rows from 0fr to 1fr
// is what gives the accordion a real height transition without anyone having to
// measure the content — the row stays in the DOM, so there is nothing to jump.
// Slow and eased on purpose: this is the motion you watch on every toggle.
export function dayBody(open: boolean): Style {
  return {
    display: 'grid',
    gridTemplateRows: open ? '1fr' : '0fr',
    opacity: open ? 1 : 0,
    // Cancels the card's gap while folded, so a closed day is exactly its header.
    marginTop: open ? 0 : -9,
    transition:
      'grid-template-rows .55s cubic-bezier(.22,1,.36,1), opacity .45s ease, margin-top .55s cubic-bezier(.22,1,.36,1)',
  }
}

// One position dot under the mobile tab carousel. The current tab's dot
// stretches into a pill so the position reads without counting.
export function tabDot(c: Theme, active: boolean): Style {
  return {
    width: active ? 14 : 5,
    height: 5,
    borderRadius: 3,
    background: active ? c.accent : c.border,
    transition: 'width .3s cubic-bezier(.5,1.4,.35,1), background .3s ease',
  }
}

// The note reader/editor. Deliberately bigger than dialogCard — a note is the
// content, not a form, and it stays up until it is closed.
export function noteViewCard(c: Theme, isMobile: boolean, closing: boolean): Style {
  return {
    position: 'fixed',
    top: '50%',
    left: '50%',
    zIndex: 18,
    width: isMobile ? 'calc(100vw - 24px)' : 'min(92vw,640px)',
    height: isMobile ? 'calc(100vh - 24px)' : 'min(80vh,720px)',
    background: c.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.border,
    borderRadius: isMobile ? 24 : 28,
    padding: isMobile ? 18 : 24,
    boxShadow: c.shadow,
    color: c.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    animation: closing
      ? 'springOut .22s ease forwards'
      : 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
  }
}

// A day card. `active` lights the dashed border up while a drag is in flight
// (tasks only — todo days are not drop targets, they just share the shell).
export function dayGroupCard(c: Theme, active: boolean): Style {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    padding: '10px 12px 12px',
    borderRadius: 18,
    border: '1.5px dashed ' + (active ? c.accent : c.border),
    background: active ? c.input : 'transparent',
    transition: 'border-color .25s ease, background .25s ease',
  }
}

// One colour per lifecycle state, shared by the row pills and the per-day
// tallies so "in progress" looks the same wherever it is counted or set.
// Done borrows the theme accent; the other two are fixed hues that read on
// every theme, like the CI dot does.
export function statusColor(c: Theme, status: ItemStatus): string {
  if (status === 'done') return c.accent
  if (status === 'progress') return 'oklch(0.75 0.16 75)'
  return c.dim
}

// The status pill on a todo/task row. Filled once the item is done, outlined
// while it is still moving.
export function statusPill(c: Theme, status: ItemStatus): Style {
  const col = statusColor(c, status)
  return {
    flexShrink: 0,
    fontSize: 10,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid ' + (status === 'pending' ? c.border : col),
    cursor: 'pointer',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    background: status === 'done' ? col : 'transparent',
    color: status === 'done' ? c.onAccent : col,
    transition: 'background .3s ease, color .3s ease, border-color .3s ease',
  }
}

// The tag chip on a todo/task row, tinted with the tag's own colour so the
// lists can be read by tag at a glance.
export function tagChip(c: Theme, tag: string, dark: boolean): Style {
  const col = tagColor(tag, dark)
  return {
    alignSelf: 'flex-start',
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 10,
    background: c.input,
    border: '1px solid ' + col,
    color: col,
    letterSpacing: '0.03em',
  }
}

// A tab in the status filter above the day cards. Selected tabs take their
// state's colour so the filter and the tallies below it agree.
export function filterTab(c: Theme, status: ItemStatus | 'all', selected: boolean): Style {
  const col = status === 'all' ? c.accent : statusColor(c, status)
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid ' + (selected ? col : c.border),
    background: selected ? c.input : 'transparent',
    color: selected ? col : c.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color .25s ease, border-color .25s ease, background .25s ease',
  }
}

// The compact "3 pending" chip in a day-group header.
export function statusStat(c: Theme, status: ItemStatus, active: boolean): Style {
  const col = statusColor(c, status)
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid ' + (active ? col : c.border),
    color: active ? col : c.dim,
    background: active ? c.input : 'transparent',
    opacity: active ? 1 : 0.55,
    whiteSpace: 'nowrap',
  }
}

export function rowBase(c: Theme): Style {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 16,
    background: c.card,
    border: '1px solid ' + c.border,
    transition: 'opacity .4s ease, background .4s ease, box-shadow .25s ease',
  }
}
