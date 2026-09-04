// Where the data lives, and who is allowed to say so (section 32).
//
// Two rules from the deployed security rules drive everything in this file, and
// neither of them is negotiable from the client:
//
//   1. THE CATCH-ALL MATCHES TOP-LEVEL COLLECTIONS ONLY. `match /{collection}/
//      {document}` binds exactly one collection segment and one document
//      segment, so `astra-trades/abc` is covered and `users/{uid}/trades/abc`
//      is not — a nested path falls through to the default deny. Every
//      collection this app writes is therefore flat.
//   2. THE OWNER FIELD IS THE ONLY OWNERSHIP THERE IS. Under the catch-all,
//      create requires `userId == request.auth.uid` on the incoming document
//      and update requires it on both the old and the new one. A document
//      written without `userId` is not merely private — it is unreachable
//      forever, by its author included, because every read of it fails the same
//      check. So `userId` is stamped by the one write path in `writes.ts` and
//      never by a caller who might forget.
//
// The names themselves are the user's, held in `Astra-users/{uid}`. That means
// no query path in this app may contain a string literal for a collection: the
// name is read once at init and every path is built from it.

/** A Firestore collection id we are willing to write to. */
export const COLLECTION_NAME_RE = /^[a-z0-9][a-z0-9-_]{2,63}$/

/**
 * Names that already mean something else in this project. Pointing the trade
 * log at one of them would not fail — it would quietly interleave trades with
 * notes, or with another user's forex documents, under rules written for the
 * other thing.
 */
export const RESERVED_COLLECTIONS: readonly string[] = [
  'aureon-notes',
  'Astra-users',
  'forex',
  'astra_notes',
  'astra-trading-journal',
] as const

export type CollectionKey =
  'tradesCollection' | 'dacoitCollection' | 'expensesCollection' | 'securedCollection'

/**
 * The defaults, used until the user names their own.
 *
 * `securedCollection` is here although the brief named three: the secured
 * ledger is a shipped feature with its own rows, and leaving it unnamed would
 * either delete it or leave one hard-coded path in a file whose whole point is
 * that there are none.
 */
export const DEFAULT_COLLECTIONS: Record<CollectionKey, string> = {
  tradesCollection: 'astra-trades',
  dacoitCollection: 'astra-dacoit-signals',
  expensesCollection: 'astra-expenses',
  securedCollection: 'astra-secured',
}

export const COLLECTION_LABEL: Record<CollectionKey, string> = {
  tradesCollection: 'Trades',
  dacoitCollection: 'Dacoit signals',
  expensesCollection: 'Expenses',
  securedCollection: 'Secured ledger',
}

/**
 * Why a name is not allowed, or '' if it is.
 *
 * Returns the sentence rather than a boolean: every caller here is about to put
 * the reason in front of somebody, and a shared `false` gives them nothing to
 * say.
 */
export function collectionNameError(name: string): string {
  const value = name.trim()
  if (!value) return 'Enter a collection name.'
  if (RESERVED_COLLECTIONS.some((r) => r.toLowerCase() === value.toLowerCase())) {
    return `${value} already holds something else in this project. Pick another name.`
  }
  if (!COLLECTION_NAME_RE.test(value)) {
    return 'Use 3–64 characters: lower-case letters, digits, - and _, starting with a letter or digit.'
  }
  return ''
}

export function isValidCollectionName(name: string): boolean {
  return collectionNameError(name) === ''
}

/**
 * The name to actually query with.
 *
 * A stored name that no longer validates — hand-edited in the console, or
 * written by an older build — falls back to the default rather than throwing at
 * the point of query. A tab that renders the default collection is recoverable;
 * a tab that throws inside `collection()` is a white screen.
 */
export function resolveCollection(
  names: Partial<Record<CollectionKey, string>> | null | undefined,
  key: CollectionKey,
): string {
  const stored = names?.[key]?.trim()
  return stored && isValidCollectionName(stored) ? stored : DEFAULT_COLLECTIONS[key]
}

/**
 * The rest of `Astra-users/{uid}` (sections 39–40).
 *
 * Beside the collection names rather than beside the logger's numbers, because
 * these describe what the app WATCHES rather than how it computes: which
 * repositories send it webhooks, and which news categories it shows. Nothing
 * tracked and every category on is the honest starting state for both — a new
 * account has no repositories and no reason to have a category hidden.
 */
export const DEFAULT_WATCH_SETTINGS = {
  trackedRepos: [] as string[],
  newsCategories: ['forex', 'ai', 'code'] as ('forex' | 'ai' | 'code')[],
}
