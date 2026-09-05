// GitHub, live (section 40).
//
// TWO PATHS, AND BOTH ARE NEEDED.
//
//   The WEBHOOK is the fast one. GitHub posts within a second of the event, so a
//   comment appears while the person who wrote it is still looking at the page.
//   It is also unreliable in exactly the way a push notification always is:
//   deliveries are dropped, the endpoint is occasionally down, and nothing at
//   all arrives for anything that happened during a deploy.
//
//   The SWEEP is the correct one. Every fifteen minutes it lists the open pull
//   requests for each tracked repo with an `If-None-Match` conditional request, and a repo where nothing changed answers 304 — which costs no rate
//   limit at all. Webhooks for speed, the sweep for correctness; neither is
//   sufficient and the pair is.
//
// THE CLIENT NEVER CALLS GITHUB. Everything here runs with a fine-grained PAT
// held in Secret Manager, and the app reads Firestore. That is what makes 5,000
// requests an hour ample: there is exactly one caller, not one per open tab.

import { createHash } from 'node:crypto'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import {
  bodyPreview,
  commentDocId,
  isHandled,
  millisOf,
  pullDocId,
  repoDocId,
  toPullDoc,
  driftRepairs,
  verifySignature,
  type CommentKind,
  type PullState,
} from './githubPure'
import { noteSync, tokenFor } from './githubSetup'

/** The webhook's shared secret, set on the GitHub side and here. */
const GITHUB_WEBHOOK_SECRET = defineSecret('GITHUB_WEBHOOK_SECRET')
/**
 * A fine-grained PAT with `metadata: read`, `pull_requests: read` and
 * `contents: read` — nothing else. It can list what this desk tracks and write
 * nothing at all, so a leak of it is a read of public-shaped data rather than a
 * push to a branch.
 */
const GITHUB_PAT = defineSecret('GITHUB_PAT')

const REPOS = 'gh-repos'
const PULLS = 'gh-pulls'
const COMMENTS = 'gh-comments'
const SETTINGS = 'Astra-users'
const API = 'https://api.github.com'

const db = () => getFirestore()

/**
 * Who is tracking this repository.
 *
 * The list lives in each user's own settings document, so adding a repo is a
 * click in the app rather than a redeploy. A repo nobody tracks resolves to an
 * empty list, and its events are acknowledged and dropped — GitHub must get a
 * 200 for a delivery it correctly sent, or it will retry it and eventually
 * disable the hook.
 */
async function trackersOf(fullName: string): Promise<string[]> {
  const snap = await db()
    .collection(SETTINGS)
    .where('trackedRepos', 'array-contains', fullName.toLowerCase())
    .get()
  return snap.docs.map((d) => d.id)
}

async function writeRepo(userId: string, repo: Record<string, unknown>): Promise<void> {
  const repoId = Number(repo.id ?? 0)
  if (!repoId) return
  await db()
    .collection(REPOS)
    .doc(`${repoDocId(repoId)}-${userId}`)
    .set(
      {
        // Stamped by the function. The Admin SDK bypasses rules, so nothing
        // downstream would catch a missing owner — and a document without one
        // is unreachable by the account it belongs to (section 32).
        userId,
        repoId,
        fullName: String(repo.full_name ?? ''),
        defaultBranch: String(repo.default_branch ?? 'main'),
        pushedAt: millisOf(repo.pushed_at),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
}

async function writePull(
  userId: string,
  repoId: number,
  pr: Record<string, unknown>,
): Promise<void> {
  const doc = toPullDoc(pr, userId, repoId)
  if (!doc.number) return
  await db()
    .collection(PULLS)
    .doc(`${pullDocId(repoId, doc.number)}-${userId}`)
    .set(doc, { merge: true })
}

async function writeComment(
  userId: string,
  repoId: number,
  pullNumber: number,
  kind: CommentKind,
  comment: Record<string, unknown>,
): Promise<void> {
  const commentId = Number(comment.id ?? 0)
  if (!commentId || !pullNumber) return
  const user = (comment.user ?? {}) as Record<string, unknown>
  await db()
    .collection(COMMENTS)
    .doc(`${commentDocId(kind, commentId)}-${userId}`)
    .set(
      {
        userId,
        repoId,
        pullNumber,
        commentId,
        kind,
        author: String(user.login ?? ''),
        // A preview and a link, never the comment. Same rule as the news.
        bodyPreview: bodyPreview(comment.body),
        path: String(comment.path ?? ''),
        line: Number(comment.line ?? comment.original_line ?? 0),
        createdAt: millisOf(comment.created_at),
        url: String(comment.html_url ?? ''),
      },
      { merge: true },
    )
}

/** The open-PR count a repo row shows, recounted from what we actually hold. */
async function refreshOpenCount(userId: string, repoId: number): Promise<void> {
  const open = await db()
    .collection(PULLS)
    .where('userId', '==', userId)
    .where('repoId', '==', repoId)
    .where('state', 'in', ['open', 'draft'])
    .get()
  await db()
    .collection(REPOS)
    .doc(`${repoDocId(repoId)}-${userId}`)
    .set({ openPRCount: open.size, updatedAt: Timestamp.now() }, { merge: true })
}

export const githubEvent = onRequest(
  {
    region: 'asia-south1',
    secrets: [GITHUB_WEBHOOK_SECRET],
    cors: false,
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only.' })
      return
    }

    // THE SIGNATURE IS CHECKED BEFORE THE BODY IS USED. An unsigned request is
    // refused here, having had nothing but its headers looked at — no parsing,
    // no lookups, no writes, and no work an attacker could make us do by
    // sending something large.
    const signature = String(req.get('X-Hub-Signature-256') ?? '')
    if (!signature) {
      res.status(401).json({ error: 'Unsigned.' })
      return
    }
    const raw: Buffer = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from('')
    if (!verifySignature(raw, signature, GITHUB_WEBHOOK_SECRET.value())) {
      res.status(401).json({ error: 'Bad signature.' })
      return
    }

    const event = String(req.get('X-GitHub-Event') ?? '')
    if (event === 'ping') {
      res.status(200).json({ ok: true, pong: true })
      return
    }
    if (!isHandled(event)) {
      // Acknowledged, not errored: GitHub retries a non-2xx and disables a hook
      // that keeps failing, and an event we do not handle is not a failure.
      res.status(200).json({ ok: true, ignored: event })
      return
    }

    const body = req.body as Record<string, unknown>
    const repo = (body.repository ?? {}) as Record<string, unknown>
    const fullName = String(repo.full_name ?? '')
    const repoId = Number(repo.id ?? 0)
    const users = fullName ? await trackersOf(fullName) : []
    if (!users.length) {
      // An untracked repo. Acknowledged and dropped — exactly as specified,
      // and for the same reason as above.
      res.status(200).json({ ok: true, untracked: fullName })
      return
    }

    try {
      for (const userId of users) {
        await writeRepo(userId, repo)
        await applyEvent(userId, repoId, event, body)
        if (event !== 'push') await refreshOpenCount(userId, repoId)
      }
    } catch (err) {
      logger.error('githubEvent failed', { event, fullName, err: String(err) })
      // A 500 asks GitHub to retry, which is what we want for a transient
      // Firestore error — the writes are all idempotent, so a retry is safe.
      res.status(500).json({ error: 'Storage failed; retry.' })
      return
    }

    res.status(200).json({ ok: true, event, users: users.length })
  },
)

/** One delivery, applied. Every write is keyed on GitHub's own ids. */
async function applyEvent(
  userId: string,
  repoId: number,
  event: string,
  body: Record<string, unknown>,
): Promise<void> {
  const pr = (body.pull_request ?? {}) as Record<string, unknown>

  if (event === 'pull_request') {
    await writePull(userId, repoId, pr)
    return
  }

  if (event === 'pull_request_review') {
    const review = (body.review ?? {}) as Record<string, unknown>
    await writePull(userId, repoId, pr)
    // A review's state IS the review decision as far as this view is concerned,
    // and it is the field the Code tab colours the row by.
    const state = String(review.state ?? '').toLowerCase()
    if (state) {
      await db()
        .collection(PULLS)
        .doc(`${pullDocId(repoId, Number(pr.number ?? 0))}-${userId}`)
        .set({ reviewDecision: state }, { merge: true })
    }
    if (review.body) {
      await writeComment(userId, repoId, Number(pr.number ?? 0), 'review', review)
    }
    return
  }

  if (event === 'pull_request_review_comment') {
    const comment = (body.comment ?? {}) as Record<string, unknown>
    await writeComment(userId, repoId, Number(pr.number ?? 0), 'review_comment', comment)
    return
  }

  if (event === 'issue_comment') {
    const issue = (body.issue ?? {}) as Record<string, unknown>
    // An issue comment on something that is not a pull request is an issue
    // comment, and this view is about pull requests.
    if (!issue.pull_request) return
    const comment = (body.comment ?? {}) as Record<string, unknown>
    await writeComment(userId, repoId, Number(issue.number ?? 0), 'issue', comment)
    return
  }

  if (event === 'push') {
    const repo = (body.repository ?? {}) as Record<string, unknown>
    await db()
      .collection(REPOS)
      .doc(`${repoDocId(repoId)}-${userId}`)
      .set({ pushedAt: millisOf(repo.pushed_at) || Date.now() }, { merge: true })
  }
}

// ---- the sweep --------------------------------------------------------------

interface Etag {
  etag: string
  at: number
}

const etagId = (fullName: string) =>
  `etag-${createHash('sha1').update(fullName).digest('hex').slice(0, 24)}`

/**
 * Every tracked repo, reconciled.
 *
 * `If-None-Match` with the stored ETag is the whole economy of this: a repo
 * where nothing changed answers 304, which GitHub does not count against the
 * rate limit — so sweeping fifty repos every fifteen minutes costs fifty
 * requests an hour in the quiet case rather than two hundred.
 */
export const githubSweep = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'asia-south1',
    secrets: [GITHUB_PAT],
    timeoutSeconds: 300,
  },
  async () => {
    const settings = await db().collection(SETTINGS).get()
    const byRepo = new Map<string, string[]>()
    for (const doc of settings.docs) {
      const repos = doc.get('trackedRepos')
      if (!Array.isArray(repos)) continue
      for (const name of repos) {
        const key = String(name).toLowerCase()
        byRepo.set(key, [...(byRepo.get(key) ?? []), doc.id])
      }
    }

    let notModified = 0
    let repaired = 0
    let remaining = -1

    for (const [fullName, users] of byRepo) {
      try {
        // THE TOKEN IS THE TRACKER'S OWN (section 44, item 9). It used to be
        // one deploy-time PAT for every account, which meant one person's
        // repositories were read with another person's credential and the
        // 5,000-an-hour quota was shared by everybody on the deployment.
        // `tokenFor` falls back to the deploy-time secret, so a deployment
        // where nobody has connected yet keeps working exactly as before.
        const token = await tokenFor(users[0])
        if (!token) {
          logger.warn('sweep: no token for tracker', { fullName })
          continue
        }
        const etagRef = db().collection(REPOS).doc(etagId(fullName))
        const stored = (await etagRef.get()).data() as Etag | undefined
        const res = await fetch(
          `${API}/repos/${fullName}/pulls?state=open&per_page=100&sort=updated&direction=desc`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'AstraSweep/1.0',
              ...(stored?.etag ? { 'If-None-Match': stored.etag } : {}),
            },
          },
        )
        remaining = Number(res.headers.get('x-ratelimit-remaining') ?? remaining)

        if (res.status === 304) {
          notModified += 1
          continue
        }
        if (!res.ok) {
          logger.warn('sweep: repo failed', { fullName, status: res.status })
          continue
        }

        const pulls = (await res.json()) as Record<string, unknown>[]
        const etag = res.headers.get('etag')
        if (etag) await etagRef.set({ etag, at: Date.now(), kind: 'etag' })

        for (const userId of users) {
          const repoField = (pulls[0]?.base as Record<string, unknown>)?.repo as
            Record<string, unknown> | undefined
          const repoId = Number(repoField?.id ?? 0)
          if (repoId) await writeRepo(userId, repoField as Record<string, unknown>)
          for (const pr of pulls) await writePull(userId, repoId, pr)

          // Drift repair: anything we still hold as open that GitHub no longer
          // lists was merged or closed while we were not listening. This is the
          // half a webhook cannot do — a missed `closed` delivery leaves a row
          // open forever, and nothing else would ever correct it.
          const held = await db()
            .collection(PULLS)
            .where('userId', '==', userId)
            .where('repoId', '==', repoId)
            .where('state', 'in', ['open', 'draft'])
            .get()
          const stale = new Set(
            driftRepairs(
              held.docs.map((d) => ({
                id: d.id,
                number: Number(d.get('number') ?? 0),
                state: d.get('state') as PullState,
              })),
              pulls.map((p) => Number(p.number ?? 0)),
            ),
          )
          for (const doc of held.docs) {
            if (!stale.has(doc.id)) continue
            await doc.ref.set({ state: 'closed', updatedAt: Date.now() }, { merge: true })
            repaired += 1
          }
          if (repoId) await refreshOpenCount(userId, repoId)
        }
      } catch (err) {
        // One repo's failure is one repo's failure.
        logger.warn('sweep: repo threw', { fullName, err: String(err) })
      }
    }

    // Recorded per tracker as well as logged, because "last successful sync" is
    // one of the three things the setup panel promises to show and a log line
    // is not a thing the app can read.
    for (const users of byRepo.values()) {
      for (const userId of users) await noteSync(userId, remaining)
    }

    logger.info('githubSweep finished', {
      repos: byRepo.size,
      notModified,
      repaired,
      rateLimitRemaining: remaining,
    })
  },
)
