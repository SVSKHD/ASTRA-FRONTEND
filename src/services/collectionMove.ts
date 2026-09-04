// Renaming a collection (section 32).
//
// A collection name in this app is a pointer, and renaming it moves the
// pointer, not the data. That is the whole hazard: the tab comes back empty and
// looks like data loss, when in fact every row is exactly where it was under
// the old name. So a rename is never a bare edit — it is copy, verify, switch,
// in that order, and:
//
//   THE OLD COLLECTION IS NEVER DELETED. Not after a successful copy, not after
//   a successful verify, not ever from here. A rename that deletes is a rename
//   that can lose a year of trades to one mistyped name, and the cost of
//   leaving it behind is some bytes nobody is charged much for.
//
// Verify means reading the destination back and comparing ids, not trusting the
// writes that were just issued: with a local cache a write resolves against the
// cache, and "it did not throw" is not the same claim as "it is there".

import { ownedSet, type OwnedRef } from '@/services/owned'

export interface MoveProgress {
  copied: number
  total: number
}

export interface MoveResult {
  ok: boolean
  copied: number
  /** Ids that did not come back from the destination on the verify pass. */
  missing: string[]
  message: string
}

/**
 * Copy every row this uid owns from one collection to another, then read the
 * destination back and prove they are all there.
 *
 * Sequential rather than batched on purpose: a batch is atomic but caps at 500,
 * and the failure this needs to survive is a network that drops halfway — after
 * which a re-run simply overwrites the ids that already landed, because every
 * write is a `setDoc` at a known id and therefore idempotent.
 */
export async function copyVerifySwitch(
  from: OwnedRef,
  toCollection: string,
  onProgress?: (p: MoveProgress) => void,
): Promise<MoveResult> {
  const { db, fs, uid } = from
  const to: OwnedRef = { db, fs, collection: toCollection, uid }

  const source = await fs.getDocs(
    fs.query(fs.collection(db, from.collection), fs.where('userId', '==', uid)),
  )
  const rows = source.docs.map((d) => ({ id: d.id, data: d.data() }))
  if (!rows.length) {
    return {
      ok: true,
      copied: 0,
      missing: [],
      message: `${from.collection} holds nothing to copy. Switched to ${toCollection}.`,
    }
  }

  let copied = 0
  for (const row of rows) {
    // `userId` is restamped by ownedSet rather than carried from the source, so
    // a row written before the owner field existed becomes reachable rather
    // than being copied into the same unreachable state.
    await ownedSet(to, row.id, row.data)
    copied += 1
    onProgress?.({ copied, total: rows.length })
  }

  const check = await fs.getDocs(
    fs.query(fs.collection(db, toCollection), fs.where('userId', '==', uid)),
  )
  const landed = new Set(check.docs.map((d) => d.id))
  const missing = rows.map((r) => r.id).filter((id) => !landed.has(id))

  return {
    ok: missing.length === 0,
    copied,
    missing,
    message: missing.length
      ? `${missing.length} of ${rows.length} rows did not arrive in ${toCollection}. Nothing was switched, and ${from.collection} is untouched — try again.`
      : `Copied ${rows.length} rows to ${toCollection} and verified every one. ${from.collection} has been left exactly as it was.`,
  }
}

/**
 * The warning shown BEFORE any of the above runs.
 *
 * Stated as what will and will not happen, in that order, because the thing
 * people assume — that the data moves with the name — is the thing that is not
 * true.
 */
export function renameWarning(from: string, to: string): string {
  return (
    `The app will start querying ${to}. The rows in ${from} do not move on their own — ` +
    `they will be copied across and checked, and ${from} will be left exactly as it is. ` +
    `A new collection also needs its own composite indexes before the month query will serve.`
  )
}
