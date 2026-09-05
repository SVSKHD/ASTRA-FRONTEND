// What the guided setup tells you to tick (section 44, item 9).
//
// These are the app's copy of two lists that are ALSO declared server-side, in
// `functions/src/githubPure.ts`. Two copies is normally the wrong answer and it
// is worth saying why it is the right one here: `githubPure` imports
// `node:crypto` for the webhook signature check, so the browser bundle cannot
// import it, and pulling a Node built-in into the app to share nine strings
// would be the tail wagging the dog.
//
// The copies cannot drift, because `ghSetupCopy.test.ts` reads the server file
// and asserts they are identical — the one place in the app that can see both,
// which is the test run. A setup page that lists a sixth event is a setup page
// telling somebody to configure a delivery nothing reads, and that failure is
// silent on both sides.

export interface RequiredScope {
  key: string
  label: string
  access: string
  why: string
}

/**
 * The three permissions a fine-grained token needs, and nothing else.
 *
 * Every one of them is READ. This integration mirrors; it does not push, does
 * not comment and does not merge, so a leak of a correctly-scoped token is a
 * read of data the holder could already see — which is the whole reason the
 * setup asks for a fine-grained token rather than a classic one with `repo`.
 */
export const REQUIRED_SCOPES: readonly RequiredScope[] = [
  {
    key: 'metadata',
    label: 'Metadata',
    access: 'Read-only',
    why: 'Lists the repositories the token can see. Without it the other two are unusable and every sweep fails.',
  },
  {
    key: 'pull_requests',
    label: 'Pull requests',
    access: 'Read-only',
    why: 'The pull requests, their reviews and their comments — everything the Code tab shows.',
  },
  {
    key: 'contents',
    label: 'Contents',
    access: 'Read-only',
    why: 'The default branch and the last push time on each repository row.',
  },
] as const

/** The five deliveries the webhook handler acts on. Anything else is dropped. */
export const WEBHOOK_EVENTS: readonly string[] = [
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'issue_comment',
  'push',
] as const
