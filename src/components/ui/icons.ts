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
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.hasOwn(ICONS, value)
}
