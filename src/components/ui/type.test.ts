// Section 24a. The scale is stated twice — once as CSS custom properties, once
// as the table ui/type.ts exports for the Typography page and the lint rule.
// Two statements of one fact drift, so this is where they are held together.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALLOWED_WEIGHTS, TYPE_SCALE, WEIGHTS, nearestStep } from '@/components/ui/type'

const tokensCss = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

describe('the scale', () => {
  it('is the eight steps section 24a names, in order', () => {
    expect(TYPE_SCALE.map((s) => s.token)).toEqual([
      'text-2xs',
      'text-xs',
      'text-sm',
      'text-base',
      'text-md',
      'text-lg',
      'text-xl',
      'text-2xl',
    ])
    expect(TYPE_SCALE.map((s) => s.px)).toEqual([10, 11, 13, 14, 16, 20, 24, 32])
  })

  it('declares every step in the token file at the size the table claims', () => {
    for (const step of TYPE_SCALE) {
      expect(tokensCss, step.token).toContain(`--${step.token}: ${step.px}px;`)
    }
  })

  it('gives every step its own line-height, so leading travels with size', () => {
    for (const step of TYPE_SCALE) {
      const suffix = step.token.replace('text-', '')
      expect(tokensCss, step.token).toContain(`--lh-${suffix}: ${step.lineHeight};`)
    }
  })

  it('rises monotonically — a scale with a flat step is two names for one size', () => {
    for (let i = 1; i < TYPE_SCALE.length; i++) {
      expect(TYPE_SCALE[i].px).toBeGreaterThan(TYPE_SCALE[i - 1].px)
    }
  })

  it('says what each step is for, so a picker has something to pick on', () => {
    for (const step of TYPE_SCALE) expect(step.use.length, step.token).toBeGreaterThan(4)
  })
})

describe('weights', () => {
  it('are the three section 24a allows and no others', () => {
    expect(ALLOWED_WEIGHTS).toEqual([400, 500, 600])
  })

  it('are declared in the token file', () => {
    for (const w of WEIGHTS) expect(tokensCss).toContain(`--${w.token}: ${w.value};`)
  })

  it('excludes the hairline and the black — 300 fails on a low-DPI screen', () => {
    expect(ALLOWED_WEIGHTS).not.toContain(300)
    expect(ALLOWED_WEIGHTS).not.toContain(700)
    expect(ALLOWED_WEIGHTS).not.toContain(800)
  })
})

describe('families', () => {
  it('declares exactly two, sans for the interface and mono for data', () => {
    expect(tokensCss).toMatch(/--font-sans:\s*\n?\s*'Inter'/)
    expect(tokensCss).toContain("--font-mono: 'JetBrains Mono'")
  })

  it('ships the tabular-numeral helper the aligned columns need', () => {
    expect(tokensCss).toContain('font-variant-numeric: tabular-nums')
  })
})

// The lint rule runs outside Vite and cannot resolve the `@/` alias, so it
// carries its own copy of the scale. This is what stops the copy drifting: the
// rule that enforces the scale being wrong about what the scale is would be the
// worst of the available failures, because it would enforce the old one.
describe('the lint rule agrees with the token file', () => {
  const plugin = readFileSync(resolve(__dirname, '../../../stylelint-plugin-type-scale.js'), 'utf8')

  it('lists the same eight steps at the same sizes', () => {
    for (const step of TYPE_SCALE) {
      expect(plugin, step.token).toContain(`{ token: '${step.token}', px: ${step.px} }`)
    }
  })

  it('lists no step the scale does not have', () => {
    const declared = [...plugin.matchAll(/\{ token: '([^']+)', px: (\d+) \}/g)].map((m) => m[1])
    expect(declared).toEqual(TYPE_SCALE.map((s) => s.token))
  })

  it('knows the same three weights', () => {
    for (const w of WEIGHTS) expect(plugin).toContain(`--${w.token}`)
  })

  it('exempts the token file, where a raw value is the definition', () => {
    expect(plugin).toContain("file.endsWith('tokens.css')")
  })
})

describe('nearestStep', () => {
  it('maps a raw value to the step it should have been written as', () => {
    expect(nearestStep(12).token).toBe('text-xs')
    expect(nearestStep(13).token).toBe('text-sm')
    expect(nearestStep(19).token).toBe('text-lg')
  })

  it('breaks a tie downwards, and says so, rather than answering twice', () => {
    // 15 sits exactly between base (14) and md (16); 12 between xs (11) and
    // sm (13). Both take the smaller, every time they are asked.
    expect(nearestStep(15).token).toBe('text-base')
    expect(nearestStep(12).token).toBe('text-xs')
  })

  it('never returns nothing, however far out the value is', () => {
    expect(nearestStep(4).token).toBe('text-2xs')
    expect(nearestStep(200).token).toBe('text-2xl')
  })
})
