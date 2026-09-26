// The icon set (section 21e). One set, one weight, one size scale.
//
// Before this the app drew thirty-four inline `<svg>` elements across nineteen
// components, at stroke widths of 1.5, 1.6, 1.7, 1.8, 1.9, 2.5 and 3, at sizes
// of 10, 11, 12, 15, 16 and whatever the call site felt like. Every one was
// defensible on its own and together they read as a UI assembled from parts.
//
// So the geometry lives here — Lucide, at 24×24, drawn once — and the weight
// and the box are decided here too. A call site picks a name and a size step;
// it cannot pick a stroke width, a viewBox or a colour rule, because those are
// what made the old set look like several sets.

// Lucide's own grid. Everything below is drawn on it.
export const ICON_VIEWBOX = '0 0 24 24'

// One weight. 2.25 is Lucide's bold-ish step: heavy enough to hold up at 14px
// against a glass surface, light enough not to blob at 32px.
export const ICON_STROKE = 2.25

// The size scale. A step, never a number: an icon sized by the call site is how
// a set ends up with a 15px icon next to a 16px one.
export const ICON_SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const
export type IconSize = keyof typeof ICON_SIZES

// Each entry is the inner geometry only. Stroke, fill, cap and join are set
// once on the symbol in IconSprite, so nothing here carries presentation.
export const ICONS = {
  check: '<polyline points="20 6 9 17 4 12" />',
  // The failure half of a save's three states (section 41). A circle with a
  // bar, not a triangle: the triangle is a warning about something that might
  // happen, and this is a report of something that already did not.
  'alert-circle':
    '<circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><path d="M12 16.5h.01" />',
  'check-square':
    '<rect x="3" y="3" width="18" height="18" rx="5" /><polyline points="8 12.4 11 15.2 16.4 9.1" />',
  'chevron-right': '<polyline points="9 6 15 12 9 18" />',
  'chevron-down': '<polyline points="6 9 12 15 18 9" />',
  'chevron-left': '<polyline points="15 6 9 12 15 18" />',
  x: '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
  plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
  'arrow-up': '<line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />',
  'arrow-down': '<line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />',
  bot: '<rect x="4.5" y="6.5" width="15" height="12.5" rx="4" /><path d="M12 3v3.5" /><circle cx="9" cy="12.6" r="1.3" /><circle cx="15" cy="12.6" r="1.3" />',
  calendar:
    '<rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />',
  'calendar-down':
    '<rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="12" y1="12" x2="12" y2="17" /><polyline points="9 14 12 17 15 14" />',
  'cloud-off':
    '<path d="M17.5 19H6a4 4 0 0 1-.9-7.9A5 5 0 0 1 15 9" /><line x1="3" y1="3" x2="21" y2="21" />',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />',
  'external-link':
    '<path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />',
  football:
    '<circle cx="12" cy="12" r="9" /><path d="M12 8.8 15 11 13.9 14.6 10.1 14.6 9 11Z" /><path d="M12 8.8V3.2" /><path d="M15 11 20.4 9.2" /><path d="M13.9 14.6 17.2 19.2" /><path d="M10.1 14.6 6.8 19.2" /><path d="M9 11 3.6 9.2" />',
  help: '<circle cx="12" cy="12" r="9.25" /><path d="M9.4 9.3a2.7 2.7 0 0 1 5.25.9c0 1.8-2.65 2.7-2.65 2.7" /><path d="M12 17.1h.01" />',
  globe:
    '<circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><ellipse cx="12" cy="12" rx="4" ry="9" />',
  'globe-off': '<circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" />',
  list: '<line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" />',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />',
  notebook:
    '<rect x="4" y="3" width="16" height="18" rx="2" /><line x1="7.5" y1="8" x2="16.5" y2="8" /><line x1="7.5" y1="12" x2="16.5" y2="12" /><line x1="7.5" y1="16" x2="13" y2="16" />',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-3.9-4-6.6-9-6.6z" /><circle cx="7.5" cy="11.5" r="1.1" /><circle cx="12" cy="8" r="1.1" /><circle cx="16.5" cy="11.5" r="1.1" />',
  // Edit. The nib-and-baseline pencil rather than the diagonal-only one: at 14px
  // a bare diagonal reads as a slash, and this is the glyph that has to say
  // "change this" beside a bin that says "remove it".
  pencil: '<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />',
  // The rupee sign, drawn on the same grid as the rest so it sits in a row of
  // icons rather than beside them as a piece of type.
  rupee: '<path d="M6 5h9a4 4 0 0 1 0 8H7l6 6" /><line x1="6" y1="9" x2="16" y2="9" />',
  'refresh-cw':
    '<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" /><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" /><polyline points="21 3 21 9 15 9" /><polyline points="3 21 3 15 9 15" />',
  share:
    '<circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="8" r="2.4" /><path d="M18 10.4v1.6a3 3 0 0 1-3 3H9" /><line x1="6" y1="8.4" x2="6" y2="15.6" /><line x1="6" y1="9" x2="16" y2="9" />',
  star: '<path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z" />',
  sun: '<circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" />',
  trash:
    '<polyline points="4 6 20 6" /><path d="M9 6V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5V6" /><path d="M6.5 6l.8 13a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-13" />',

  // ---- section 27: devices, security, money movement --------------------
  // Same Lucide grid, same weight. Added as a block rather than sprinkled in
  // alphabetically so it is obvious at a glance which feature brought them and
  // which can go if it ever leaves.
  monitor:
    '<rect x="2.5" y="3.5" width="19" height="13" rx="2" /><line x1="8" y1="20.5" x2="16" y2="20.5" /><line x1="12" y1="16.5" x2="12" y2="20.5" />',
  smartphone:
    '<rect x="6" y="2.5" width="12" height="19" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" />',
  tablet:
    '<rect x="4" y="2.5" width="16" height="19" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" />',
  'map-pin':
    '<path d="M19.5 10.5c0 5-5.2 9.6-7 11a0.9 0.9 0 0 1-1 0c-1.8-1.4-7-6-7-11a7.5 7.5 0 0 1 15 0z" /><circle cx="12" cy="10.4" r="2.6" />',
  shield:
    '<path d="M12 2.6c2 1.5 4.4 2.6 6.4 2.6a0.9 0.9 0 0 1 0.9 0.9V13c0 4.8-3.4 7.2-7 8.4a0.9 0.9 0 0 1-0.6 0C8.1 20.2 4.7 17.8 4.7 13V6.1a0.9 0.9 0 0 1 0.9-0.9c2 0 4.4-1.1 6.4-2.6z" />',
  'log-out':
    '<path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 16.5 20.5 12 16 7.5" /><line x1="20.5" y1="12" x2="9.5" y2="12" />',
  repeat:
    '<polyline points="16.5 2.5 20.5 6.5 16.5 10.5" /><path d="M3.5 11.5v-1a4 4 0 0 1 4-4h13" /><polyline points="7.5 21.5 3.5 17.5 7.5 13.5" /><path d="M20.5 12.5v1a4 4 0 0 1-4 4h-13" />',
  filter: '<polygon points="21 4 3 4 10.2 12.5 10.2 19.5 13.8 21 13.8 12.5 21 4" />',
  download:
    '<path d="M20.5 15.5v3.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-3.5" /><polyline points="7.5 10.5 12 15 16.5 10.5" /><line x1="12" y1="15" x2="12" y2="3.5" />',
  paperclip:
    '<path d="M20 11.5l-7.9 7.9a5 5 0 0 1-7.1-7.1l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6" />',
  tag: '<path d="M20.5 12.9l-7.6 7.6a1.8 1.8 0 0 1-2.5 0l-7-7A1.8 1.8 0 0 1 3 12.2V4.6A1.6 1.6 0 0 1 4.6 3h7.6a1.8 1.8 0 0 1 1.3 0.5l7 7a1.8 1.8 0 0 1 0 2.5z" /><circle cx="8" cy="8" r="1.4" />',

  // ---- section 29: the espresso switch ------------------------------------
  // A cup with steam, and only ever that. The sun and the moon already mean
  // "the light family" and "the dark family" in the same cluster of controls,
  // so the roast could not borrow either without the header saying two
  // different things with one picture.
  coffee:
    '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v2.5M12 2.5v3" />',

  // The search field drew its magnifier as the text character "⌕", which is
  // not an icon: it takes the font's size and weight rather than the set's, so
  // it landed small and thin beside every real 16px stroked glyph next to it.
  search: '<circle cx="10.5" cy="10.5" r="6.5" /><line x1="15.4" y1="15.4" x2="20.5" y2="20.5" />',

  // ---- the detail pane's three modes --------------------------------------
  // `columns` is the pane back in the layout — a panel split in two, which is
  // literally what the tab becomes. The other two are arrows rather than the
  // framed-rectangle pair a window manager uses: this does not maximise
  // anything to the screen, it widens a floating pane from a column to half the
  // window and back. The diagonal says which way the edge is going.
  columns:
    '<rect x="3" y="4" width="18" height="16" rx="2" /><line x1="12" y1="4" x2="12" y2="20" />',
  maximize:
    '<polyline points="14.5 3.5 20.5 3.5 20.5 9.5" /><polyline points="9.5 20.5 3.5 20.5 3.5 14.5" /><line x1="20.5" y1="3.5" x2="13.5" y2="10.5" /><line x1="3.5" y1="20.5" x2="10.5" y2="13.5" />',
  minimize:
    '<polyline points="3.5 14.5 9.5 14.5 9.5 20.5" /><polyline points="20.5 9.5 14.5 9.5 14.5 3.5" /><line x1="14.5" y1="9.5" x2="20.5" y2="3.5" /><line x1="3.5" y1="20.5" x2="9.5" y2="14.5" />',

  // ---- Todo v2: focus mode, weekly review, the bottom pill, the tab bar ----
  timer:
    '<line x1="10" y1="2.5" x2="14" y2="2.5" /><line x1="12" y1="14" x2="15" y2="11" /><circle cx="12" cy="14" r="7.5" />',
  'calendar-check':
    '<rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><polyline points="9 15 11.2 17.2 15.5 12.8" />',
  'user-circle':
    '<circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.7 18.4a6 6 0 0 1 10.6 0" />',
  github:
    '<path d="M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-6.9a5.4 5.4 0 0 0-1.5-3.7 5 5 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C5.3.7 4.1 1.1 4.1 1.1A5 5 0 0 0 4 4.9a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.5 6.4 6.9a3.4 3.4 0 0 0-.9 2.6V22" /><path d="M9 18c-4.5 2-5-2-7-2" />',
  'more-horizontal':
    '<circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" />',
  flag: '<path d="M4.5 21V4" /><path d="M4.5 4.5h12l-2.5 4 2.5 4h-12" />',
  clock: '<circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />',
  play: '<polygon points="7 4.5 19 12 7 19.5 7 4.5" />',
  pause:
    '<rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" />',
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.hasOwn(ICONS, value)
}
