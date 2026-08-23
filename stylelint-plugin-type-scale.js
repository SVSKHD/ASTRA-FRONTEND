// The rule that keeps the type scale a scale (section 24a, acceptance 120).
//
// A local plugin rather than a configuration of an existing rule, because what
// has to be banned is not a list of values — it is *any* value that is not a
// reference to the token file. `declaration-property-value-allowed-list` can
// enumerate what is permitted, but the permitted set is eight tokens that will
// grow, and a rule that has to be edited every time the scale changes is a rule
// that gets disabled the first time it is inconvenient.
//
// The message names the step the author should have used. "No raw font-size" is
// a rule you argue with; "12px → var(--text-xs)" is one you follow, and the
// difference in how often a lint rule gets a `-- disable` comment above it is
// almost entirely that.

import stylelint from 'stylelint'

const { createPlugin, utils } = stylelint

const SIZE_RULE = 'aureon/no-raw-font-size'
const WEIGHT_RULE = 'aureon/no-raw-font-weight'

// The scale, duplicated here as plain data because a Stylelint config is loaded
// outside Vite and cannot resolve the `@/` alias into ui/type.ts. The test in
// ui/type.test.ts asserts this file and the token file agree, so the copy
// cannot drift silently.
const STEPS = [
  { token: 'text-2xs', px: 10 },
  { token: 'text-xs', px: 11 },
  { token: 'text-sm', px: 13 },
  { token: 'text-base', px: 14 },
  { token: 'text-md', px: 16 },
  { token: 'text-lg', px: 20 },
  { token: 'text-xl', px: 24 },
  { token: 'text-2xl', px: 32 },
]

const WEIGHT_TOKENS = ['--weight-normal', '--weight-medium', '--weight-semibold']

/** The step a raw value should have been. Ties go to the smaller — see type.ts. */
function nearest(px) {
  return STEPS.reduce((best, step) =>
    Math.abs(step.px - px) < Math.abs(best.px - px) ? step : best,
  )
}

function toPx(value) {
  const m = /^([\d.]+)(px|rem|em)?$/.exec(value.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return null
  if (m[2] === 'rem' || m[2] === 'em') return n * 16
  return n
}

/**
 * The token file is where the scale is *defined*, so it is the one place a raw
 * value is not a mistake. Matched on the path rather than by a disable comment,
 * because a disable comment in the token file would be the first thing anybody
 * copied out of it.
 */
function isTokenFile(root) {
  const file = root.source?.input?.file ?? ''
  return file.endsWith('tokens.css')
}

const sizeRule = createPlugin(SIZE_RULE, (enabled) => (root, result) => {
  if (!enabled || isTokenFile(root)) return
  root.walkDecls(/^font-size$/, (decl) => {
    const value = decl.value.trim()
    // A reference to the scale, or a refusal to pick a size at all. Both are
    // the component doing the right thing.
    if (value.includes('var(--')) return
    if (value === 'inherit' || value === 'initial' || value === 'unset') return
    const px = toPx(value)
    const advice = px === null ? '' : ` — use var(--${nearest(px).token})`
    utils.report({
      result,
      ruleName: SIZE_RULE,
      node: decl,
      message: `Raw font-size "${value}"${advice}. The scale lives in ui/tokens.css; a size chosen here is a decision made twice.`,
    })
  })
})
sizeRule.ruleName = SIZE_RULE

const weightRule = createPlugin(WEIGHT_RULE, (enabled) => (root, result) => {
  if (!enabled || isTokenFile(root)) return
  root.walkDecls(/^font-weight$/, (decl) => {
    const value = decl.value.trim()
    if (WEIGHT_TOKENS.some((t) => value.includes(t))) return
    if (value === 'inherit' || value === 'initial' || value === 'unset') return
    utils.report({
      result,
      ruleName: WEIGHT_RULE,
      node: decl,
      message: `Raw font-weight "${value}". Three weights exist: ${WEIGHT_TOKENS.join(', ')}. A heavier one is a different typeface, not more emphasis.`,
    })
  })
})
weightRule.ruleName = WEIGHT_RULE

export default [sizeRule, weightRule]
