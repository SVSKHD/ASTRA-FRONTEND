// Section 20b, enforced rather than asserted once.
//
// The bug was a stored line of text living in a single-line `<input>`: it gets
// cut off mid-sentence and there is no way to read the rest without clicking in
// and scrolling sideways. Every surface where a point, a title or a preview row
// is edited now uses AutoTextarea, and this fails the build if one of them goes
// back to an input.
//
// It is deliberately a named list rather than a pattern over every file. Plenty
// of inputs in the app are correctly single-line — a search box, a date, a
// number of minutes — and a rule broad enough to catch those would be turned off
// within a week.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const read = (file: string) => readFileSync(join(SRC, file), 'utf8')

// Each surface, and the field on it that holds a line of somebody's writing.
const SURFACES: { file: string; what: string }[] = [
  { file: 'components/goals/GoalPointRow.vue', what: 'a point on a goal' },
  { file: 'components/detail/DetailHost.vue', what: "the dialog's title" },
  { file: 'views/GoalsImportView.vue', what: 'an import preview row' },
  { file: 'components/GoalCreateSlideOver.vue', what: 'the new-point field' },
]

describe('no long line lives in a single-line input (acceptance 101)', () => {
  for (const { file, what } of SURFACES) {
    it(`${what} grows to fit its text`, () => {
      expect(read(file), file).toContain('AutoTextarea')
    })
  }
})

describe('the shared field keeps its contract', () => {
  const source = read('components/ui/AutoTextarea.vue')
  const rules = source.slice(
    source.indexOf('.atx {'),
    source.indexOf('}', source.indexOf('.atx {')),
  )

  it('never scrolls inside itself (acceptance 102)', () => {
    // A scrollbar inside the row is the truncation wearing a different hat.
    expect(rules).toContain('overflow: hidden')
  })

  it('cannot be hand-resized into hiding its text', () => {
    expect(rules).toContain('resize: none')
  })

  it('wraps rather than running off the edge', () => {
    expect(rules).toContain('white-space: pre-wrap')
    expect(rules).toContain('word-break: break-word')
  })

  it('shows no chrome until it is focused (acceptance 103)', () => {
    expect(rules).toContain('border: 1px solid transparent')
    expect(rules).toContain('background: transparent')
    const focus = source.slice(source.indexOf('.atx:focus {'))
    expect(focus.slice(0, focus.indexOf('}'))).toContain('border-color: var(--theme-accent)')
  })

  it('measures through the one composable, so every field agrees', () => {
    expect(source).toContain('useAutoResizeTextarea')
  })
})

describe('a card is still a summary', () => {
  it('the goals list card keeps clamping its description', () => {
    // The exception the section names: inside a dialog nothing truncates, but a
    // card is a summary and a four-line description would break the grid.
    const card = read('components/goals/GoalCard.vue')
    expect(card).toContain('-webkit-line-clamp: 2')
  })
})
