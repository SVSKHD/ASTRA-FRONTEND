// The webhook's two security-relevant decisions, tested from the app's own run
// (sections 39–40): is a delivery genuine, and does a replay of it overwrite.
//
// These import the same module the deployed function does, so a change to
// either fails here rather than in production.
import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  BODY_PREVIEW_CHARS,
  bodyPreview,
  commentDocId,
  driftRepairs,
  isHandled,
  millisOf,
  pullDocId,
  pullState,
  repoDocId,
  toPullDoc,
  verifySignature,
} from '../../functions/src/githubPure'

const SECRET = 'a-shared-secret'
const BODY = JSON.stringify({ action: 'opened', number: 7 })
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

describe('a delivery is genuine or it is nothing', () => {
  it('accepts a correctly signed body', () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true)
  })

  it('refuses a body signed with a different secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'not-the-secret'), SECRET)).toBe(false)
  })

  it('refuses a body that was changed after signing', () => {
    // The whole point: the signature is over the bytes, so one altered
    // character anywhere in the payload invalidates it.
    const signature = sign(BODY)
    expect(verifySignature(BODY.replace('7', '8'), signature, SECRET)).toBe(false)
  })

  it('refuses a missing or empty signature outright', () => {
    expect(verifySignature(BODY, '', SECRET)).toBe(false)
    expect(verifySignature(BODY, sign(BODY), '')).toBe(false)
  })

  it('does not throw on a header of the wrong length', () => {
    // `timingSafeEqual` throws on unequal lengths, and a throw is an observable
    // difference between "wrong length" and "wrong value" — which is why both
    // sides are padded to a fixed width before the compare.
    expect(() => verifySignature(BODY, 'sha256=short', SECRET)).not.toThrow()
    expect(verifySignature(BODY, 'sha256=short', SECRET)).toBe(false)
    expect(() => verifySignature(BODY, 'x'.repeat(500), SECRET)).not.toThrow()
  })

  it('compares the raw bytes, not a re-serialised object', () => {
    // A JSON round trip normalises whitespace and unicode escaping; a check
    // that parsed first would compare the signature against bytes GitHub never
    // sent, and reject deliveries that are perfectly genuine.
    const raw = '{"a": 1, "note": "caf\\u00e9"}'
    const reserialised = JSON.stringify(JSON.parse(raw))
    expect(raw).not.toBe(reserialised)
    expect(verifySignature(raw, sign(raw), SECRET)).toBe(true)
    expect(verifySignature(reserialised, sign(raw), SECRET)).toBe(false)
  })
})

describe('a replayed delivery overwrites rather than duplicating', () => {
  it('derives every id from GitHub’s own ids', () => {
    expect(repoDocId(12345)).toBe('r12345')
    expect(pullDocId(12345, 7)).toBe('r12345-p7')
    expect(commentDocId('review_comment', 999)).toBe('review_comment-999')
  })

  it('gives the same id for the same event twice, and different ids across kinds', () => {
    expect(pullDocId(1, 2)).toBe(pullDocId(1, 2))
    // An issue comment and a review comment can share a numeric id — they are
    // different id spaces in GitHub — so the kind is part of the document id.
    expect(commentDocId('issue', 5)).not.toBe(commentDocId('review', 5))
  })
})

describe('which events are handled', () => {
  it('takes the five that describe a pull request’s life', () => {
    for (const event of [
      'pull_request',
      'pull_request_review',
      'pull_request_review_comment',
      'issue_comment',
      'push',
    ]) {
      expect(isHandled(event), event).toBe(true)
    }
  })

  it('leaves everything else alone', () => {
    expect(isHandled('star')).toBe(false)
    expect(isHandled('workflow_run')).toBe(false)
    expect(isHandled('')).toBe(false)
  })
})

describe('a pull request’s state is one word', () => {
  it('separates draft from open, because a draft is waiting for nobody', () => {
    expect(pullState({ state: 'open', draft: false })).toBe('open')
    expect(pullState({ state: 'open', draft: true })).toBe('draft')
  })

  it('separates merged from closed, because closed means abandoned', () => {
    expect(pullState({ state: 'closed', merged: true })).toBe('merged')
    expect(pullState({ state: 'closed', merged_at: '2026-09-04T00:00:00Z' })).toBe('merged')
    expect(pullState({ state: 'closed' })).toBe('closed')
  })

  it('reads merged before draft, for a draft that was merged anyway', () => {
    expect(pullState({ state: 'closed', draft: true, merged: true })).toBe('merged')
  })
})

describe('a comment is a pointer, not a copy', () => {
  it('leaves a short comment exactly as written', () => {
    expect(bodyPreview('Looks good to me.')).toBe('Looks good to me.')
  })

  it('truncates a long one and says it truncated', () => {
    const preview = bodyPreview('word '.repeat(200))
    expect(preview.length).toBeLessThanOrEqual(BODY_PREVIEW_CHARS + 1)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('cuts on a word boundary when one is near the limit', () => {
    const long = `${'a'.repeat(260)} boundary ${'b'.repeat(100)}`
    expect(bodyPreview(long)).not.toMatch(/b…$/)
  })

  it('survives a comment that is not a string', () => {
    expect(bodyPreview(null)).toBe('')
    expect(bodyPreview(undefined)).toBe('')
    expect(bodyPreview(42)).toBe('42')
  })
})

describe('the stored pull request', () => {
  const pr = {
    number: 7,
    title: 'Flatten the collections',
    state: 'open',
    draft: false,
    user: { login: 'svskhd' },
    head: { ref: 'feature' },
    base: { ref: 'dev01' },
    additions: 120,
    deletions: 8,
    comments: 3,
    review_comments: 2,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-04T10:00:00Z',
    html_url: 'https://github.com/o/r/pull/7',
  }

  it('carries the owner the function stamped, never one from the payload', () => {
    expect(toPullDoc(pr, 'u1', 42).userId).toBe('u1')
  })

  it('adds the two comment counts, because a reader wants one number', () => {
    expect(toPullDoc(pr, 'u1', 42).commentCount).toBe(5)
  })

  it('survives the REST list shape, which omits additions and deletions', () => {
    const listed = { ...pr, additions: undefined, deletions: undefined }
    const doc = toPullDoc(listed, 'u1', 42)
    expect(doc.additions).toBe(0)
    expect(doc.deletions).toBe(0)
    expect(doc.title).toBe('Flatten the collections')
  })

  it('says "not known" rather than "none" for a review decision REST omits', () => {
    expect(toPullDoc(pr, 'u1', 42).reviewDecision).toBe('')
  })

  it('flattens every timestamp to epoch ms', () => {
    expect(toPullDoc(pr, 'u1', 42).updatedAt).toBe(Date.parse('2026-09-04T10:00:00Z'))
    expect(millisOf('not a date')).toBe(0)
    expect(millisOf(1234)).toBe(1234)
  })
})

describe('replaying a delivery from GitHub’s UI', () => {
  // Item 10 asks for a replay with zero duplicates. GitHub's "Redeliver" sends
  // the identical bytes with the identical signature, so the simulation is the
  // real thing minus the network: verify, route, write at a derived id, twice.
  const repoId = 12345
  const delivery = {
    event: 'pull_request',
    body: JSON.stringify({
      action: 'opened',
      repository: { id: repoId, full_name: 'svskhd/astra-frontend' },
      pull_request: {
        number: 7,
        title: 'Flatten the collections',
        state: 'open',
        draft: false,
        user: { login: 'svskhd' },
        head: { ref: 'feature' },
        base: { ref: 'dev01' },
        comments: 1,
        review_comments: 0,
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-04T10:00:00Z',
        html_url: 'https://github.com/svskhd/astra-frontend/pull/7',
      },
    }),
  }

  /** What `githubEvent` does, with a Map standing in for the collection. */
  function deliver(store: Map<string, unknown>, raw: string, signature: string): number {
    if (!verifySignature(raw, signature, SECRET)) return 401
    const payload = JSON.parse(raw)
    if (!isHandled(delivery.event)) return 200
    const pr = payload.pull_request
    store.set(pullDocId(repoId, pr.number), toPullDoc(pr, 'u1', repoId))
    return 200
  }

  it('lands on one document however many times it is redelivered', () => {
    const store = new Map<string, unknown>()
    const signature = sign(delivery.body)
    expect(deliver(store, delivery.body, signature)).toBe(200)
    expect(deliver(store, delivery.body, signature)).toBe(200)
    expect(deliver(store, delivery.body, signature)).toBe(200)
    expect(store.size).toBe(1)
    expect([...store.keys()]).toEqual(['r12345-p7'])
  })

  it('lets a later delivery for the same PR update the row it already has', () => {
    const store = new Map<string, { state: string }>()
    deliver(store as Map<string, unknown>, delivery.body, sign(delivery.body))
    const closing = JSON.parse(delivery.body)
    closing.action = 'closed'
    closing.pull_request.state = 'closed'
    closing.pull_request.merged = true
    const raw = JSON.stringify(closing)
    deliver(store as Map<string, unknown>, raw, sign(raw))
    expect(store.size).toBe(1)
    expect(store.get('r12345-p7')?.state).toBe('merged')
  })

  it('writes nothing at all when the replayed signature does not match', () => {
    // A replay through anything other than GitHub — an attacker resending a
    // captured body against a rotated secret — never reaches the write.
    const store = new Map<string, unknown>()
    expect(deliver(store, delivery.body, sign(delivery.body, 'rotated'))).toBe(401)
    expect(store.size).toBe(0)
  })
})

describe('the sweep repairs what the webhook missed', () => {
  // Force a missed delivery by simply not applying it: the row stays open in
  // the store while GitHub's own list no longer carries the number. That is
  // exactly the state a dropped `closed` webhook leaves behind, and the sweep
  // is the only thing that would ever notice.
  const held = [
    { id: 'r1-p7', number: 7, state: 'open' as const },
    { id: 'r1-p8', number: 8, state: 'draft' as const },
    { id: 'r1-p9', number: 9, state: 'open' as const },
    { id: 'r1-p3', number: 3, state: 'merged' as const },
    { id: 'r1-p4', number: 4, state: 'closed' as const },
  ]

  it('closes a row GitHub no longer lists as open', () => {
    expect(driftRepairs(held, [7, 9])).toEqual(['r1-p8'])
  })

  it('repairs a draft the same as an open one — both claim to be live', () => {
    expect(driftRepairs(held, [8])).toEqual(['r1-p7', 'r1-p9'])
  })

  it('does nothing when every delivery arrived', () => {
    expect(driftRepairs(held, [7, 8, 9])).toEqual([])
  })

  it('never touches a row that is already merged or closed', () => {
    // The list of open PRs never contains them, so a careless comparison would
    // rewrite every historical row on every sweep, forever.
    expect(driftRepairs(held, [])).toEqual(['r1-p7', 'r1-p8', 'r1-p9'])
  })

  it('is idempotent: a second sweep after the repair finds nothing left', () => {
    const stale = new Set(driftRepairs(held, [9]))
    const after = held.map((row) =>
      stale.has(row.id) ? { ...row, state: 'closed' as const } : row,
    )
    expect(driftRepairs(after, [9])).toEqual([])
  })
})
