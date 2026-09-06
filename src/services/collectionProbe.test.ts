// The probe has one job: given what the database answered, say which of the
// five causes it is — and name a fix, not a symptom. So these tests are about
// the SENTENCE, because a diagnostic that reaches the right conclusion and
// reports it vaguely has not helped anybody.
import { describe, expect, it } from 'vitest'
import { candidateNames, explain, indexUrlOf, type ProbeReport } from '@/services/collectionProbe'

function report(patch: Partial<ProbeReport> = {}): ProbeReport {
  return {
    collection: 'astra-trades',
    uid: 'u1',
    from: '2026-09-01',
    to: '2026-09-31',
    monthCount: 0,
    ownedCount: 0,
    ownedCapped: false,
    months: [],
    undatedCount: 0,
    undatedSamples: [],
    alternates: [],
    errorCode: '',
    indexUrl: '',
    findings: [],
    ...patch,
  }
}

describe('the index URL', () => {
  it('is lifted out of the error Firestore actually throws', () => {
    const err = new Error(
      'The query requires an index. You can create it here: ' +
        'https://console.firebase.google.com/v1/r/project/astra/firestore/indexes?create_composite=Ck1w',
    )
    expect(indexUrlOf(err)).toBe(
      'https://console.firebase.google.com/v1/r/project/astra/firestore/indexes?create_composite=Ck1w',
    )
  })

  it('drops the trailing punctuation a sentence leaves on it', () => {
    expect(
      indexUrlOf(new Error('See https://console.firebase.google.com/project/x/firestore).')),
    ).toBe('https://console.firebase.google.com/project/x/firestore')
  })

  it('is empty when there is no URL to find, rather than a broken link', () => {
    expect(indexUrlOf(new Error('Missing or insufficient permissions.'))).toBe('')
    expect(indexUrlOf(undefined)).toBe('')
  })
})

describe('the names worth trying', () => {
  it('swaps the separator first — the mistake that actually happens', () => {
    // `astra-trades` and `astra_trades` are both valid collection names, and
    // one of them holds nothing.
    expect(candidateNames('astra-trades', 'tradesCollection')).toContain('astra_trades')
  })

  it('includes the default, for a settings document naming something empty', () => {
    expect(candidateNames('my-old-trades', 'tradesCollection')).toContain('astra-trades')
  })

  it('never re-tries the name that just came back empty', () => {
    expect(candidateNames('astra-trades', 'tradesCollection')).not.toContain('astra-trades')
  })
})

describe('what an empty month means', () => {
  it('says an index is missing, and that reloading will not fix it', () => {
    const [f] = explain(report({ errorCode: 'failed-precondition', indexUrl: 'https://x' }), false)
    expect(f.level).toBe('error')
    expect(f.title).toContain('failed-precondition')
    expect(f.detail).toContain('index')
  })

  it('names the collection the rows are really in', () => {
    const [f] = explain(
      report({ alternates: [{ name: 'astra_trades', error: '', found: true }] }),
      false,
    )
    expect(f.level).toBe('error')
    expect(f.title).toContain('astra_trades')
    // And what to change, by name, so the fix is not left as an exercise.
    expect(f.detail).toContain('tradesCollection')
  })

  it('distinguishes "documents that are not yours" from "no documents"', () => {
    const unowned = explain(report(), true)[0]
    expect(unowned.level).toBe('error')
    expect(unowned.title).toContain('none of them are stamped')
    expect(unowned.detail).toContain('userId')

    const empty = explain(report(), false)[0]
    expect(empty.level).toBe('warn')
    expect(empty.title).toContain('no documents for this account')
  })

  it('calls out rows that no month can ever show', () => {
    // A range over `istDate` excludes any document missing the field, so these
    // rows are invisible everywhere rather than merely elsewhere — which is a
    // different problem with a different fix.
    const [f] = explain(
      report({ ownedCount: 12, undatedCount: 12, undatedSamples: ['(missing)'] }),
      false,
    )
    expect(f.level).toBe('error')
    expect(f.title).toContain('no usable istDate')
    expect(f.detail).toContain('YYYY-MM-DD')
  })

  it('reports a partial dating problem without hiding the rest', () => {
    const findings = explain(
      report({
        ownedCount: 12,
        undatedCount: 3,
        undatedSamples: ['(missing)'],
        months: ['2025-11'],
      }),
      false,
    )
    expect(findings.map((f) => f.title)).toEqual([
      expect.stringContaining('3 of 12'),
      expect.stringContaining('2025-11'),
    ])
  })

  it('says the rows are simply in another month', () => {
    const [f] = explain(report({ ownedCount: 40, months: ['2026-02', '2025-11'] }), false)
    expect(f.level).toBe('warn')
    expect(f.title).toContain('2026-02')
    expect(f.title).toContain('not 2026-09')
    expect(f.detail).toContain('calendar')
  })

  it('stops looking when the month is not empty at all', () => {
    const [f] = explain(report({ monthCount: 7 }), false)
    expect(f.level).toBe('ok')
    expect(f.title).toContain('7 rows')
    // The fetch is exonerated, and the reader is pointed past it.
    expect(f.detail).toContain('downstream')
  })
})
