// Acceptance 73, enforced rather than asserted once: no native date input may
// exist anywhere in the app. GlassDatePicker is the single date/time control, and
// a stray `type="date"` reintroduces a second keyboard model, a second mobile
// experience and a second set of accessibility bugs — so this fails the build
// instead of waiting to be noticed in review.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const NATIVE_DATE_INPUT = /type\s*=\s*["'](date|datetime-local|time|month|week)["']/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(vue|ts)$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : []
  })
}

describe('no native date inputs remain', () => {
  const offenders = sourceFiles(SRC)
    .map((file) => ({ file, matches: readFileSync(file, 'utf8').match(NATIVE_DATE_INPUT) }))
    .filter((r) => r.matches)

  it('every date field goes through GlassDatePicker', () => {
    expect(offenders.map((o) => `${o.file.replace(SRC, 'src')}: ${o.matches?.join(', ')}`)).toEqual(
      [],
    )
  })

  it('the picker is imported wherever dates are edited', () => {
    // A spot-check that the migration actually landed rather than the inputs
    // simply being deleted: the dialogs that own a date still have a picker.
    for (const file of [
      'components/TaskDialog.vue',
      'components/ReminderDialog.vue',
      'components/GoalDetail.vue',
      'components/ItemDialog.vue',
    ]) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toContain('GlassDatePicker')
    }
  })
})
