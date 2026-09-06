// Why a month came back empty (section 32).
//
// An empty month has five different causes and, on screen, exactly one
// appearance: nothing. The listener does not error — a query that matches no
// documents is a successful query — so "the trades are not loading" and "there
// are no trades in September" are indistinguishable, and both look like a bug.
//
// The five, in the order this file rules them out:
//
//   1. THE WRONG COLLECTION. Every path is built from a name held in
//      `Astra-users/{uid}`, so a hyphen where the data has an underscore is a
//      query against a collection that does not exist — which Firestore answers
//      with an empty result, not an error.
//   2. NO OWNER FIELD. The catch-all rule reads ownership off `userId`. A
//      document written without one is unreachable by the account that wrote
//      it, and `where('userId','==',uid)` will never return it.
//   3. NO USABLE DAY. The month is a RANGE over `istDate`, and Firestore
//      excludes any document that lacks the field or holds another type in it.
//      Rows written by an older importer, or with a Timestamp instead of a
//      `YYYY-MM-DD` string, are invisible to every month at once.
//   4. ANOTHER MONTH. The tab opens on the current month. Rows from last
//      November are not missing; they are somewhere else.
//   5. NO INDEX. An equality plus a range needs a composite index, and the
//      error that says so carries the URL that creates it — a URL the app was
//      throwing away behind a generic "live updates stopped".
//
// Every read here is `limit`ed and only runs when the reader asks. It is a
// diagnostic, not a second data path: nothing it returns is ever rendered as
// trades.

import type { OwnedRef } from '@/services/owned'
import { errorCode } from '@/services/owned'
import { DEFAULT_COLLECTIONS, type CollectionKey } from '@/utils/collections'

/** Enough rows to characterise a collection; far short of a month's data. */
export const PROBE_LIMIT = 300

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export type Level = 'ok' | 'warn' | 'error'

export interface Finding {
  level: Level
  title: string
  detail: string
}

export interface AltHit {
  name: string
  /** '' when it answered, otherwise the code it refused with. */
  error: string
  found: boolean
}

export interface ProbeReport {
  collection: string
  uid: string
  from: string
  to: string
  /** Rows the live listener's exact query returns. */
  monthCount: number
  /** Rows owned by this uid anywhere in the collection, up to PROBE_LIMIT. */
  ownedCount: number
  ownedCapped: boolean
  /** Distinct `YYYY-MM` values seen on those rows, newest first. */
  months: string[]
  /** Owned rows whose `istDate` is missing or not a `YYYY-MM-DD` string. */
  undatedCount: number
  /** A couple of the offending values, so the shape is visible rather than described. */
  undatedSamples: string[]
  /** Other collection names that hold rows for this uid. */
  alternates: AltHit[]
  /** The code the month query refused with, if it did. */
  errorCode: string
  /** The console URL out of a `failed-precondition`, when Firestore supplies one. */
  indexUrl: string
  findings: Finding[]
}

/** Firestore puts the index-creation URL in the message; it is the whole fix. */
export function indexUrlOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return (
    message.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0]?.replace(/[).,]+$/, '') ??
    ''
  )
}

/** What `istDate` holds, as a short string a human can compare against a date. */
function describeDay(value: unknown): string {
  if (value == null) return '(missing)'
  if (typeof value === 'string') return value === '' ? '(empty string)' : value
  if (typeof value === 'object' && 'toMillis' in value) return '(a Timestamp, not a string)'
  return `(a ${typeof value})`
}

/**
 * The names worth trying when the configured one is empty.
 *
 * The separator swap is first because it is the mistake that actually happens:
 * `astra-trades` and `astra_trades` are both valid names, both plausible, and
 * one of them holds nothing.
 */
export function candidateNames(configured: string, key: CollectionKey): string[] {
  const out = [
    configured.replace(/-/g, '_'),
    configured.replace(/_/g, '-'),
    DEFAULT_COLLECTIONS[key],
    DEFAULT_COLLECTIONS[key].replace(/-/g, '_'),
  ]
  return [...new Set(out)].filter((name) => name && name !== configured)
}

interface ProbeInput {
  ref: OwnedRef
  key: CollectionKey
  field: string
  from: string
  to: string
}

/**
 * Ask the database the four questions, then say what the answers mean.
 *
 * Deliberately sequential rather than parallel: each step is only worth running
 * because the one before it came back empty, and a reader watching this is
 * waiting on an explanation, not on throughput.
 */
export async function probeCollection({
  ref,
  key,
  field,
  from,
  to,
}: ProbeInput): Promise<ProbeReport> {
  const { db, fs, collection, uid } = ref
  const report: ProbeReport = {
    collection,
    uid,
    from,
    to,
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
  }

  // 1. The live listener's query, run once, so its failure is catchable and its
  //    count is a number rather than an absence.
  try {
    const snap = await fs.getDocs(
      fs.query(
        fs.collection(db, collection),
        fs.where('userId', '==', uid),
        fs.where(field, '>=', from),
        fs.where(field, '<=', to),
        fs.orderBy(field, 'asc'),
      ),
    )
    report.monthCount = snap.size
  } catch (err) {
    report.errorCode = errorCode(err)
    report.indexUrl = indexUrlOf(err)
  }

  // 2. Everything this uid owns in the collection, with NO order and NO range.
  //    Both matter: an `orderBy` would silently drop the very rows this step
  //    exists to find, and a range would drop them for the same reason.
  const seenMonths = new Set<string>()
  try {
    const snap = await fs.getDocs(
      fs.query(fs.collection(db, collection), fs.where('userId', '==', uid), fs.limit(PROBE_LIMIT)),
    )
    report.ownedCount = snap.size
    report.ownedCapped = snap.size >= PROBE_LIMIT
    for (const d of snap.docs) {
      const raw = d.data()[field]
      if (typeof raw === 'string' && DAY_RE.test(raw)) {
        seenMonths.add(raw.slice(0, 7))
        continue
      }
      report.undatedCount++
      if (report.undatedSamples.length < 3) report.undatedSamples.push(describeDay(raw))
    }
    report.months = [...seenMonths].sort().reverse()
  } catch (err) {
    if (!report.errorCode) report.errorCode = errorCode(err)
  }

  // 3. Nothing owned here. Either the collection is empty, or it holds rows
  //    that are not stamped with this uid — and those two are told apart by
  //    whether an unfiltered read is refused.
  let unowned = false
  if (report.ownedCount === 0 && !report.errorCode) {
    try {
      const snap = await fs.getDocs(fs.query(fs.collection(db, collection), fs.limit(1)))
      unowned = false
      if (snap.size > 0) unowned = true
    } catch {
      // The catch-all evaluates the read against every document it would
      // return, so one row without a matching `userId` refuses the whole query.
      unowned = true
    }
  }

  // 4. Somewhere else entirely? Only asked when the configured name came back
  //    with nothing at all, because otherwise it is four reads for no reason.
  if (report.ownedCount === 0) {
    for (const name of candidateNames(collection, key)) {
      try {
        const snap = await fs.getDocs(
          fs.query(fs.collection(db, name), fs.where('userId', '==', uid), fs.limit(1)),
        )
        report.alternates.push({ name, error: '', found: snap.size > 0 })
      } catch (err) {
        report.alternates.push({ name, error: errorCode(err), found: false })
      }
    }
  }

  report.findings = explain(report, unowned)
  return report
}

/** The report, turned into sentences that name the fix. */
export function explain(report: ProbeReport, unowned: boolean): Finding[] {
  const out: Finding[] = []
  const month = report.from.slice(0, 7)

  if (report.errorCode) {
    out.push({
      level: 'error',
      title: `The month query was refused (${report.errorCode}).`,
      detail:
        report.errorCode === 'failed-precondition'
          ? report.indexUrl
            ? `This query needs a composite index on userId + ${'istDate'}. Firestore has given the URL that creates it — open it, click Create, and wait for the index to finish building.`
            : 'This query needs a composite index. Deploy firestore.indexes.json, or open the URL in the browser console error.'
          : report.errorCode === 'permission-denied'
            ? 'The security rules refused the read. Under the catch-all rule a document is only readable if its own userId matches the signed-in account.'
            : 'Check the browser console for the full error.',
    })
    return out
  }

  if (report.monthCount > 0) {
    out.push({
      level: 'ok',
      title: `${report.monthCount} row${report.monthCount === 1 ? '' : 's'} matched ${month}.`,
      detail:
        'The query is fine. If the table is still empty, the problem is downstream of the fetch — say so and it is a different hunt.',
    })
    return out
  }

  const hit = report.alternates.find((a) => a.found)
  if (hit) {
    out.push({
      level: 'error',
      title: `Your rows are in "${hit.name}", not "${report.collection}".`,
      detail:
        `The app builds every path from the name in Astra-users/${report.uid}. Set tradesCollection to "${hit.name}" ` +
        '— either in the Account panel on this tab, or straight on that document in the Firebase console.',
    })
    return out
  }

  if (unowned) {
    out.push({
      level: 'error',
      title: `"${report.collection}" holds documents, but none of them are stamped with your userId.`,
      detail:
        `Every row needs userId == "${report.uid}". Rows written without it are unreachable by the account that ` +
        'wrote them — the rules check that field on read, update and delete alike, so they cannot be repaired from ' +
        'the app. Add the field from the Firebase console or a script using the Admin SDK, which bypasses the rules.',
    })
    return out
  }

  if (report.ownedCount === 0) {
    out.push({
      level: 'warn',
      title: `"${report.collection}" has no documents for this account.`,
      detail:
        'The query and the rules are both working — there is simply nothing here yet. If you expected rows, they ' +
        'are under another collection name or another account.',
    })
    return out
  }

  if (report.undatedCount === report.ownedCount) {
    out.push({
      level: 'error',
      title: `All ${report.ownedCount} of your rows have no usable istDate.`,
      detail:
        `The month is a range over istDate, and Firestore excludes any document whose field is missing or holds ` +
        `another type — so these rows are invisible in every month, not just this one. Found: ${report.undatedSamples.join(', ')}. ` +
        'It must be a "YYYY-MM-DD" string.',
    })
    return out
  }

  if (report.undatedCount > 0) {
    out.push({
      level: 'warn',
      title: `${report.undatedCount} of ${report.ownedCount} rows have no usable istDate.`,
      detail: `Those rows cannot appear in any month. Found: ${report.undatedSamples.join(', ')} — it must be a "YYYY-MM-DD" string.`,
    })
  }

  if (report.months.length) {
    out.push({
      level: 'warn',
      title: `Your rows are in ${report.months.slice(0, 6).join(', ')}${report.months.length > 6 ? '…' : ''} — not ${month}.`,
      detail:
        'This tab shows one month at a time and opens on the current one. Use the calendar to move to a month that ' +
        `has rows${report.ownedCapped ? `, or note that only the first ${PROBE_LIMIT} rows were sampled` : ''}.`,
    })
  }
  return out
}
