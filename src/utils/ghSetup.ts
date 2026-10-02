// The client half of the guided GitHub setup (section 44, item 9).
//
// NO TOKEN IS EVER HELD HERE. `connectGithub` takes the pasted string, hands it
// straight to the Cloud Function, and returns what the function says about it —
// a login, a rate limit, a timestamp. The string is not written to a ref, not
// put in `localStorage`, not kept in a closure, and not returned. The component
// that collects it clears its own field on the answer.
//
// That is the entire security argument for pasting a PAT into a web page, so it
// is worth being exact about what it does and does not buy:
//
//   It does buy: the token is not in browser storage, so a stolen laptop or an
//   XSS payload that reads `localStorage` gets nothing; and it is not in any
//   Firestore document a client can read, because the rules deny `gh-secrets`
//   to everybody including its owner.
//
//   It does not buy: safety from a page that is already compromised AT THE
//   MOMENT OF PASTING. Nothing can — the token is in the DOM for as long as it
//   takes to submit the form. This is the same exposure as typing a password,
//   and it is why the setup asks for a fine-grained token with three read
//   permissions rather than a classic one that can push.

import { loadFunctions, supabaseEnabled } from '@/firebase'

export interface GhRateLimit {
  limit: number
  remaining: number
  resetAt: number
}

export interface GhConnection {
  login: string
  connectedAt: number
  lastSyncAt: number
  rateLimit: GhRateLimit
  /** The quota is inside a tenth of the window — a sweep is about to fail. */
  low: boolean
}

export type GhStatus =
  | { connected: false; revoked?: boolean; login?: string }
  | ({ connected: true; own: boolean } & GhConnection)

export interface GhRepoOption {
  fullName: string
  private: boolean
  pushedAt: number
}

export interface GhTestResult {
  ok: boolean
  status: number
  detail: string
}

/**
 * Whether the GitHub mirror can be reached from this build.
 *
 * The mirror — the setup functions here, and the gh-repos / gh-pulls
 * collections the Code tab watches — still runs on Firebase Functions. A
 * Supabase build has no Firebase sign-in, so those functions refuse it (in
 * production the browser blocks the call outright) and the collections cannot
 * be read. Until the functions move to Supabase (phase 4) the Code tab says so
 * once, instead of calling out and waiting on answers that never come.
 */
export const githubMirrorAvailable = !supabaseEnabled

// A call that has not answered by now is not going to; the panel says so
// rather than sitting on its loading state for good.
const CALL_TIMEOUT_MS = 15_000

async function call<Req extends object, Res>(name: string, payload: Req): Promise<Res> {
  if (!githubMirrorAvailable) {
    throw new Error('GitHub is not connected in this build yet — it moves to Supabase next.')
  }
  const handle = await loadFunctions()
  if (!handle) throw new Error('Firebase is not configured in this build.')
  const fn = handle.fx.httpsCallable<Req, Res>(handle.functions, name)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('GitHub did not answer in time. Try again in a moment.')),
      CALL_TIMEOUT_MS,
    )
  })
  try {
    const res = await Promise.race([fn(payload), timeout])
    return res.data
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Step 2: the token, posted once.
 *
 * The parameter is not stored anywhere in this module — see the header. The
 * caller is expected to clear its field on the answer, and `GithubSetup.vue`
 * does.
 */
export function connectGithub(pat: string): Promise<GhConnection> {
  return call<{ pat: string }, GhConnection>('githubConnect', { pat })
}

export function githubStatus(): Promise<GhStatus> {
  return call<Record<string, never>, GhStatus>('githubStatus', {})
}

export function githubRepoOptions(): Promise<{ repos: GhRepoOption[] }> {
  return call<Record<string, never>, { repos: GhRepoOption[] }>('githubRepos', {})
}

export function disconnectGithub(): Promise<{ ok: true }> {
  return call<Record<string, never>, { ok: true }>('githubDisconnect', {})
}

export function sendTestEvent(url: string): Promise<GhTestResult> {
  return call<{ url: string }, GhTestResult>('githubTestEvent', { url })
}

/**
 * The webhook URL for this deployment.
 *
 * Derived from where the app is actually being served rather than typed into a
 * config, because a URL somebody has to keep in step with their hosting is a
 * URL that is wrong the first time the hosting changes — and the failure is
 * silent, since GitHub reports a dead hook only in its own deliveries page.
 * `firebase.json` rewrites `/api/github/event` to the `githubEvent` function,
 * so this is that path against the current origin.
 */
export function webhookUrl(origin = globalThis.location?.origin ?? ''): string {
  return origin ? `${origin.replace(/\/$/, '')}/api/github/event` : ''
}

/**
 * The URL that opens GitHub's fine-grained token page with the right form.
 *
 * GitHub does not accept the permissions as query parameters — there is no
 * pre-filled fine-grained token link — so this opens the page and the steps
 * beside it say which three to tick. Stated rather than pretended: a link that
 * claimed to pre-fill and did not would be worse than one that does not claim.
 */
export const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/** `4,873 of 5,000 · resets in 42m`, or the plain truth when it is unknown. */
export function rateLimitText(rl: GhRateLimit, now = Date.now()): string {
  if (!rl.limit) return 'not reported yet'
  const mins = Math.max(0, Math.round((rl.resetAt - now) / 60_000))
  const resets = rl.resetAt ? ` · resets in ${mins}m` : ''
  return `${rl.remaining.toLocaleString('en-IN')} of ${rl.limit.toLocaleString('en-IN')}${resets}`
}
