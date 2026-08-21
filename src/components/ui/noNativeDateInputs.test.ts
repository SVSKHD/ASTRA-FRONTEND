// Acceptance 73, enforced rather than asserted once: no native date input may
// exist anywhere in the app. GlassDatePicker is the single date/time control, and
// a stray `type="date"` reintroduces a second keyboard model, a second mobile
// experience and a second set of accessibility bugs — so this fails the build
// instead of waiting to be noticed in review.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const KINDS = 'date|datetime-local|time|month|week'
// The literal attribute, and the bound form that gets past a plain string
// search: `:type="'date'"` renders exactly the same input.
const NATIVE_DATE_INPUT = new RegExp(
  `type\\s*=\\s*["'](?:${KINDS})["']|:type\\s*=\\s*["']\\s*['\`](?:${KINDS})['\`]`,
  'g',
)
// A text field wearing a date format as its placeholder is the same problem in
// a different costume — it is a date field that simply does not say so, which
// is what the screenshot in section 21c actually showed.
const DATE_SHAPED_PLACEHOLDER =
  /placeholder\s*=\s*["'][^"']*(?:YYYY-MM-DD|DD\/MM\/YYYY|MM\/DD\/YYYY|yyyy-mm-dd|dd\/mm\/yyyy|mm\/dd\/yyyy)[^"']*["']/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(vue|ts)$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : []
  })
}

describe('no native date inputs remain', () => {
  const files = sourceFiles(SRC).map((file) => ({ file, source: readFileSync(file, 'utf8') }))
  const offending = (pattern: RegExp) =>
    files
      .map(({ file, source }) => ({ file, matches: source.match(pattern) }))
      .filter((r) => r.matches)
      .map((o) => `${o.file.replace(SRC, 'src')}: ${o.matches?.join(', ')}`)

  it('every date field goes through GlassDatePicker', () => {
    expect(offending(NATIVE_DATE_INPUT)).toEqual([])
  })

  it('and none of them is a text box impersonating one', () => {
    // Section 21c: a plain input asking for YYYY-MM-DD is a date field with the
    // picker missing, not a text field.
    expect(offending(DATE_SHAPED_PLACEHOLDER)).toEqual([])
  })

  it('the picker is imported wherever dates are edited', () => {
    // A spot-check that the migration actually landed rather than the inputs
    // simply being deleted: the dialogs that own a date still have a picker.
    for (const file of [
      'components/detail/TaskDetailBody.vue',
      // Both goal surfaces, named by section 21c: the wide page and the
      // dialog body each own a Starts/Target pair.
      'components/detail/GoalDetailBody.vue',
      'components/GoalDetail.vue',
      'components/ReminderDialog.vue',
      'components/ItemDialog.vue',
    ]) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toContain('GlassDatePicker')
    }
  })

  it('the goal timeline in particular is the picker, not a plain field', () => {
    // The one section 21c calls out by name. Asserting on the binding rather
    // than on the import: importing the picker and rendering something else
    // beside it would pass the check above.
    for (const file of ['components/GoalDetail.vue', 'components/detail/GoalDetailBody.vue']) {
      const source = readFileSync(join(SRC, file), 'utf8')
      for (const field of ['startDate', 'targetDate']) {
        const binding = new RegExp(`<GlassDatePicker[^>]*goal\\.${field}`, 's')
        expect(binding.test(source), `${file}: ${field}`).toBe(true)
      }
    }
  })
})
