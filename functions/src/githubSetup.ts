// Linking GitHub, as a guided setup rather than a config file (section 44, item 9).
//
// WHAT WAS THERE. The live integration read from a fine-grained PAT held in
// Secret Manager under `GITHUB_PAT`, set once with
// `firebase functions:secrets:set` and bound at deploy. That is a correct place
// for a credential and a hopeless place for a setup step: connecting GitHub
// meant having the Firebase CLI, the project's IAM, and somebody's memory of
// which four scopes to tick. There was no way to do it from the app, and no way
// to find out from the app whether it had been done.
//
// THE TRUST BOUNDARY IS UNCHANGED, and that is the point of doing it this way.
// The token is posted once, straight to this function, over the callable
// channel authenticated with the caller's Firebase ID token. It is never
// written to app state, never put in `localStorage`, never returned by any
// function here, and never stored anywhere a client can read: the rules deny
// `gh-secrets` to every caller, and only the Admin SDK — which bypasses rules —
// can see it. What the app gets back is the authenticated login, the rate limit
// and the last sync, which are facts ABOUT the token rather than the token.
//
// WHY FIRESTORE AND NOT SECRET MANAGER. Secret Manager is the better vault, and
// writing a new secret version from a function needs that function to hold
// `secretmanager.admin` on the project — a role that can read and rewrite every
// other secret the project has, including the webhook signing key. Trading a
// per-user read token for a function that can rewrite all secrets is a bad
// trade. A locked collection the rules refuse to every client, written and read
// only by the Admin SDK, is the smaller blast radius.
//
// A PER-USER TOKEN IS ALSO MORE CORRECT than the single deploy-time one. The
// sweep used one PAT for every account, so one person's repositories were read
// with another person's credential and the rate limit was shared by everybody.
// `tokenFor` prefers the caller's own and falls back to the deploy-time secret,
// so an existing deployment keeps working while nobody has connected.

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { createHmac } from 'node:crypto'
import { REQUIRED_SCOPES, WEBHOOK_EVENTS, describeConnection } from './githubPure'

const GITHUB_PAT = defineSecret('GITHUB_PAT')
const GITHUB_WEBHOOK_SECRET = defineSecret('GITHUB_WEBHOOK_SECRET')

const API = 'https://api.github.com'
/** Locked to every client by the rules. Only the Admin SDK reads this. */
const SECRETS = 'gh-secrets'
const REGION = 'asia-south1'

const db = () => getFirestore()

function uidOf(req: { auth?: { uid?: string } }): string {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  return uid
}

/**
 * A fine-grained PAT looks like `github_pat_…`; a classic one like `ghp_…`.
 *
 * Both are accepted — the guided steps ask for a fine-grained one because it can
 * be scoped to three read permissions on chosen repositories, but refusing a
 * classic token would refuse somebody whose organisation has not enabled
 * fine-grained tokens yet, which is a policy this function does not get to set.
 */
function requirePat(raw: unknown): string {
  const pat = typeof raw === 'string' ? raw.trim() : ''
  if (!pat) throw new HttpsError('invalid-argument', 'Paste a token first.')
  if (pat.length > 255) throw new HttpsError('invalid-argument', 'That is not a GitHub token.')
  if (!/^(github_pat_|ghp_|gho_|ghs_)/.test(pat)) {
    throw new HttpsError(
      'invalid-argument',
      'That does not look like a GitHub token. A fine-grained one starts with github_pat_.',
    )
  }
  return pat
}

async function gh(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AstraSetup/1.0',
      ...(init.headers ?? {}),
    },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body, headers: res.headers }
}

/**
 * The token this user's syncs run with.
 *
 * Their own if they have connected one, and the deploy-time secret otherwise so
 * an existing deployment keeps working. Exported because the sweep needs it.
 */
export async function tokenFor(userId: string): Promise<string> {
  const snap = await db().collection(SECRETS).doc(userId).get()
  const own = String(snap.data()?.pat ?? '')
  if (own) return own
  try {
    return GITHUB_PAT.value()
  } catch {
    return ''
  }
}

/** Note that a sync happened, for the setup panel's "last successful sync". */
export async function noteSync(userId: string, remaining: number): Promise<void> {
  await db()
    .collection(SECRETS)
    .doc(userId)
    .set({ lastSyncAt: Timestamp.now(), rateLimitRemaining: remaining }, { merge: true })
}

// ---- connect ---------------------------------------------------------------

/**
 * Step 2 of the guided setup: the token, posted once.
 *
 * It is VALIDATED BEFORE IT IS STORED, and that is the difference between a
 * setup step and a text field. A token with the wrong permissions stores
 * perfectly and then fails silently in a scheduled function fifteen minutes
 * later, where nobody sees it. Asking GitHub who the token belongs to, and
 * whether it can list repositories, turns that into an answer on the button.
 */
export const githubConnect = onCall({ region: REGION, secrets: [GITHUB_PAT] }, async (req) => {
  const uid = uidOf(req)
  const pat = requirePat((req.data ?? {}).pat)

  const me = await gh('/user', pat)
  if (me.status === 401) {
    throw new HttpsError('permission-denied', 'GitHub rejected that token. Check it and re-paste.')
  }
  if (me.status !== 200) {
    throw new HttpsError('unavailable', `GitHub answered ${me.status} to /user.`)
  }
  const login = String((me.body as { login?: string })?.login ?? '')

  // Can it actually list repositories? `metadata: read` is what makes this
  // 200, and it is the permission people most often forget to tick — the
  // other two are unusable without it, so a token missing it would fail every
  // sweep from now on with nothing said at setup time.
  const repos = await gh('/user/repos?per_page=1', pat)
  if (repos.status !== 200) {
    throw new HttpsError(
      'permission-denied',
      `The token cannot list repositories (GitHub answered ${repos.status}). It needs the metadata: read permission.`,
    )
  }

  const limit = await gh('/rate_limit', pat)
  const core = (limit.body as { resources?: { core?: Record<string, number> } })?.resources?.core

  await db()
    .collection(SECRETS)
    .doc(uid)
    .set(
      {
        // The one field nothing ever reads back to a client.
        pat,
        login,
        connectedAt: Timestamp.now(),
        rateLimitRemaining: core?.remaining ?? -1,
      },
      { merge: true },
    )

  // The login, not the token. Nothing token-shaped is in this response and
  // nothing token-shaped is in the log line either.
  logger.info('githubConnect', { uid, login })
  return describeConnection({
    login,
    connectedAtMs: Date.now(),
    lastSyncAtMs: 0,
    limit: core?.limit ?? 0,
    remaining: core?.remaining ?? 0,
    resetAtMs: (core?.reset ?? 0) * 1000,
  })
})

/** Step 3's list: the repositories this token can actually see. */
export const githubRepos = onCall({ region: REGION, secrets: [GITHUB_PAT] }, async (req) => {
  const uid = uidOf(req)
  const token = await tokenFor(uid)
  if (!token) throw new HttpsError('failed-precondition', 'Connect a token first.')

  const res = await gh(
    '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
    token,
  )
  if (res.status !== 200) {
    throw new HttpsError('unavailable', `GitHub answered ${res.status}.`)
  }
  const rows = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : []
  // Name, privacy and last push, and nothing else. The picker needs three
  // fields and shipping the other ninety is shipping a repository's whole
  // metadata to a browser for no reason.
  return {
    repos: rows.map((r) => ({
      fullName: String(r.full_name ?? ''),
      private: r.private === true,
      pushedAt: Date.parse(String(r.pushed_at ?? '')) || 0,
    })),
  }
})

/** The live connection status the panel shows: who, how much quota, when last. */
export const githubStatus = onCall({ region: REGION, secrets: [GITHUB_PAT] }, async (req) => {
  const uid = uidOf(req)
  const snap = await db().collection(SECRETS).doc(uid).get()
  const data = snap.data() ?? {}
  const token = await tokenFor(uid)
  if (!token) return { connected: false as const }

  // Asked live rather than read from the stored copy: a rate limit written at
  // connect time is a rate limit from whenever that was, and the number is only
  // useful if it is now.
  const limit = await gh('/rate_limit', token)
  if (limit.status === 401) {
    return { connected: false as const, revoked: true as const, login: String(data.login ?? '') }
  }
  const core = (limit.body as { resources?: { core?: Record<string, number> } })?.resources?.core

  return {
    connected: true as const,
    // True when this account is running on its own token rather than on the
    // deploy-time one — worth saying, because disconnecting does different
    // things in the two cases.
    own: Boolean(data.pat),
    ...describeConnection({
      login: String(data.login ?? ''),
      connectedAtMs: (data.connectedAt as Timestamp | undefined)?.toMillis?.() ?? 0,
      lastSyncAtMs: (data.lastSyncAt as Timestamp | undefined)?.toMillis?.() ?? 0,
      limit: core?.limit ?? 0,
      remaining: core?.remaining ?? 0,
      resetAtMs: (core?.reset ?? 0) * 1000,
    }),
  }
})

/** Forget the token. The mirrored rows stay; they are not secret. */
export const githubDisconnect = onCall({ region: REGION }, async (req) => {
  const uid = uidOf(req)
  await db().collection(SECRETS).doc(uid).set({ pat: '', login: '' }, { merge: true })
  return { ok: true as const }
})

// ---- the webhook check -----------------------------------------------------

/**
 * "Send test event": a signed `ping` posted to our own webhook endpoint.
 *
 * WHAT IT ACTUALLY PROVES, which is the reason it is worth having: that the URL
 * is reachable, that the deployed function is the one answering, and that the
 * secret this project signs with is the secret that endpoint verifies with. A
 * mismatched secret is the single most common way this integration is set up
 * wrong, it produces a 401 GitHub reports only in its own deliveries page, and
 * from the app the symptom is "nothing ever arrives".
 *
 * WHAT IT CANNOT PROVE: that GitHub's copy of the secret matches. Nothing can,
 * from here — a fine-grained PAT with three read permissions cannot read or
 * manage a repository's hooks, by design. So the panel says which half was
 * checked rather than claiming the whole thing is wired up.
 */
export const githubTestEvent = onCall(
  { region: REGION, secrets: [GITHUB_WEBHOOK_SECRET] },
  async (req) => {
    uidOf(req)
    const url = String((req.data ?? {}).url ?? '').trim()
    if (!/^https:\/\/[^\s]+$/.test(url)) {
      throw new HttpsError('invalid-argument', 'Give the https webhook URL to test.')
    }

    const payload = JSON.stringify({ zen: 'Astra setup check', hook_id: 0 })
    let secret = ''
    try {
      secret = GITHUB_WEBHOOK_SECRET.value()
    } catch {
      secret = ''
    }
    if (!secret) {
      throw new HttpsError(
        'failed-precondition',
        'No webhook secret is set on the server. Set GITHUB_WEBHOOK_SECRET first.',
      )
    }
    const signature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-Hub-Signature-256': signature,
          'User-Agent': 'AstraSetup/1.0',
        },
        body: payload,
      })
      const ok = res.status === 200
      return {
        ok,
        status: res.status,
        // Named rather than inferred, so the panel can say what to change.
        detail: ok
          ? 'The endpoint accepted a signed ping. The URL and the server-side secret agree.'
          : res.status === 401
            ? 'The endpoint refused the signature. The secret in Secret Manager is not the one this endpoint verifies with.'
            : res.status === 404
              ? 'Nothing is deployed at that URL. Check the hosting rewrite and that the functions are deployed.'
              : `The endpoint answered ${res.status}.`,
      }
    } catch (err) {
      throw new HttpsError(
        'unavailable',
        `Could not reach that URL: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown'}`,
      )
    }
  },
)

export { REQUIRED_SCOPES, WEBHOOK_EVENTS }
