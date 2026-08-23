// The type scale, as data (section 24a).
//
// Eight steps, and nothing between them. Held here rather than only in CSS for
// three reasons: the /ui Typography page renders itself from this list so a new
// step cannot be added without appearing there; the lint rule that bans raw
// font-size reads the same list to know which token a stray px value should
// have been; and the tests can assert the CSS and this table agree.
//
// The rule the whole section rests on: a component picks a step by name. It
// never picks a number. "13px" in a component is a decision made twice — once
// here and once there — and the two drift.

export interface TypeStep {
  /** The custom property, without the leading `--`. */
  token: string
  px: number
  lineHeight: number
  /** What this step is for. Shown on the /ui page; the reason it exists. */
  use: string
  /** Set by the step itself rather than the caller (uppercase labels). */
  transform?: 'uppercase'
  tracking?: string
  weight?: number
}

export const TYPE_SCALE: TypeStep[] = [
  {
    token: 'text-2xs',
    px: 10,
    lineHeight: 1.4,
    use: 'Uppercase labels',
    transform: 'uppercase',
    tracking: '0.08em',
    weight: 600,
  },
  { token: 'text-xs', px: 11, lineHeight: 1.45, use: 'Meta, chips, calendar event text' },
  { token: 'text-sm', px: 13, lineHeight: 1.5, use: 'Secondary body, table cells, list meta' },
  { token: 'text-base', px: 14, lineHeight: 1.6, use: 'Body default, inputs, buttons' },
  { token: 'text-md', px: 16, lineHeight: 1.5, use: 'Dialog section titles, card titles' },
  { token: 'text-lg', px: 20, lineHeight: 1.35, use: 'Dialog titles, page section headings' },
  { token: 'text-xl', px: 24, lineHeight: 1.3, use: 'Page titles' },
  { token: 'text-2xl', px: 32, lineHeight: 1.2, use: 'Hero and empty-state headings' },
]

/** Three weights. 400 reads, 500 emphasises, 600 titles — nothing else. */
export const WEIGHTS = [
  { token: 'weight-normal', value: 400, use: 'Body' },
  { token: 'weight-medium', value: 500, use: 'Emphasis' },
  { token: 'weight-semibold', value: 600, use: 'Headings and labels' },
] as const

export const ALLOWED_WEIGHTS = WEIGHTS.map((w) => w.value)

/**
 * The step a raw pixel value should have been written as. Used by the lint rule
 * to say "12px → var(--text-xs)" instead of only "no raw font-size", and by the
 * sweep test to prove nothing in the app sits between two steps.
 *
 * A value exactly between two steps takes the smaller. The tie has no right
 * answer, so it has a stated one — otherwise the same stray value gets two
 * different suggestions depending on which end of the list it is read from.
 */
export function nearestStep(px: number): TypeStep {
  return TYPE_SCALE.reduce((best, step) =>
    Math.abs(step.px - px) < Math.abs(best.px - px) ? step : best,
  )
}

/** Every step's custom property name, e.g. `--text-sm`. */
export const TYPE_TOKENS = TYPE_SCALE.map((s) => `--${s.token}`)
