// The setup page and the webhook handler agree (section 44, item 9).
//
// The app cannot import `functions/src/githubPure.ts` — it pulls in
// `node:crypto` for the signature check — so the two lists the guided setup
// shows are declared twice. This is the one place that can see both, and it is
// what stops the copies drifting.
//
// The drift matters in both directions and is silent in both:
//
//   The page lists an event the handler ignores → somebody configures a
//   delivery that is acknowledged and dropped, forever, and concludes the
//   integration is broken.
//   The page omits an event the handler acts on → the feature that event
//   drives simply never happens, with nothing anywhere saying why.
import { describe, expect, it } from 'vitest'
import { REQUIRED_SCOPES, WEBHOOK_EVENTS } from '@/utils/ghSetupCopy'
import {
  HANDLED_EVENTS,
  REQUIRED_SCOPES as SERVER_SCOPES,
  WEBHOOK_EVENTS as SERVER_EVENTS,
  describeConnection,
} from '../../functions/src/githubPure'

describe('the events the setup lists are the events the handler acts on', () => {
  it('matches the server list exactly, in order', () => {
    expect(WEBHOOK_EVENTS).toEqual([...SERVER_EVENTS])
  })

  it('is the handler’s own list, not a second one beside it', () => {
    // `WEBHOOK_EVENTS` on the server is `HANDLED_EVENTS` — derived, never
    // retyped — so this asserts the chain all the way to what `isHandled`
    // actually tests against.
    expect([...SERVER_EVENTS]).toEqual([...HANDLED_EVENTS])
  })

  it('names five, which is what the steps say', () => {
    expect(WEBHOOK_EVENTS).toHaveLength(5)
  })
})

describe('the permissions the setup asks for', () => {
  it('matches the server list exactly', () => {
    expect(REQUIRED_SCOPES).toEqual([...SERVER_SCOPES])
  })

  it('asks for the three the integration needs and nothing else', () => {
    expect(REQUIRED_SCOPES.map((s) => s.key)).toEqual(['metadata', 'pull_requests', 'contents'])
  })

  it('is read-only throughout', () => {
    // The security argument for pasting a token into a web page rests on this:
    // a leak of a correctly-scoped token reads data the holder could already
    // see. A write permission in this list would quietly withdraw that.
    for (const scope of REQUIRED_SCOPES) {
      expect(scope.access, scope.key).toBe('Read-only')
    }
  })
})

describe('what comes back about a connection carries no credential', () => {
  it('returns facts about the token, never the token', () => {
    const described = describeConnection({
      login: 'octocat',
      connectedAtMs: 1_700_000_000_000,
      lastSyncAtMs: 1_700_000_600_000,
      limit: 5000,
      remaining: 4873,
      resetAtMs: 1_700_003_600_000,
    })
    const json = JSON.stringify(described)
    for (const word of ['pat', 'token', 'secret', 'github_pat_', 'ghp_']) {
      expect(json.toLowerCase(), word).not.toContain(word)
    }
    expect(described.login).toBe('octocat')
    expect(described.rateLimit.remaining).toBe(4873)
  })

  it('calls the quota low inside a tenth of the window', () => {
    const at = (remaining: number) =>
      describeConnection({
        login: 'x',
        connectedAtMs: 0,
        lastSyncAtMs: 0,
        limit: 5000,
        remaining,
        resetAtMs: 0,
      }).low
    expect(at(4000)).toBe(false)
    expect(at(500)).toBe(false)
    expect(at(499)).toBe(true)
  })

  it('never calls an unknown quota low', () => {
    // `limit: 0` means GitHub did not report one. Warning about a number
    // nobody has is a warning that trains people to ignore the real one.
    const unknown = describeConnection({
      login: 'x',
      connectedAtMs: 0,
      lastSyncAtMs: 0,
      limit: 0,
      remaining: 0,
      resetAtMs: 0,
    })
    expect(unknown.low).toBe(false)
  })
})
