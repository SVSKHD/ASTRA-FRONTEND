// The IP never leaves this file intact.
//
// The spec's rule is "store a salted HASH of the IP, not the IP itself", and the
// reason is that an IP is a re-identifier: paired with a timestamp it locates a
// person, and it is the one field in a session document that an attacker who
// reads the database gets real leverage from. A hash keeps what the feature
// actually needs — "is this the same network as last time?" — and discards what
// it does not.
//
// Salted, because the IPv4 space is 2^32: an unsalted SHA-256 of every address
// is a rainbow table someone has already built. The salt lives in the function's
// environment, so reversing the hash requires the database *and* the deploy
// config, not the database alone.

import { createHash } from 'node:crypto'
import type { Request } from 'firebase-functions/v2/https'

/**
 * The salt, read at call time rather than at module load so a deploy that
 * forgets it fails loudly on the first request instead of silently hashing
 * everything with `undefined`.
 */
function salt(): string {
  const s = process.env.IP_HASH_SALT
  if (!s || s.length < 16) {
    throw new Error(
      'IP_HASH_SALT is missing or too short. Set a random 32+ character secret ' +
        'before deploying: an unsalted IP hash is reversible by brute force.',
    )
  }
  return s
}

/** Truncated to 32 hex chars: enough to compare, too little to attack. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(salt()).update('␟').update(ip).digest('hex').slice(0, 32)
}

/**
 * The client's address as the platform reports it.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each proxy, so the
 * client is the FIRST entry — but only because Google's load balancer rewrites
 * the header rather than appending to a client-supplied one. Anywhere else this
 * would be spoofable; here it is not, and `rawRequest.ip` (which Express derives
 * from the same header with `trust proxy` set) is preferred where present.
 */
export function clientIp(req: Request): string {
  const direct = req.ip
  if (direct) return normalise(direct)
  const forwarded = req.headers['x-forwarded-for']
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const first = (chain ?? '').split(',')[0]?.trim()
  return first ? normalise(first) : ''
}

/** `::ffff:1.2.3.4` is an IPv4 address wearing an IPv6 hat. */
function normalise(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}
