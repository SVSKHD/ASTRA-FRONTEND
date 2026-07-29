// A tiny, dependency-free nanoid.
//
// Share ids are minted once when an item is first made public and then reused,
// so they end up in URLs the owner hands out. That means the id must be short,
// URL-safe and unguessable — the same brief nanoid solves, without pulling the
// package in for a single call. The alphabet is the nanoid default (URL-safe
// base64: A–Z, a–z, 0–9, `-`, `_`), so a 12-char id carries ~71 bits of
// entropy — far beyond anything a public link is at risk of being guessed at.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Crypto-strength bytes when the platform offers them (browser and modern
// Node both expose globalThis.crypto.getRandomValues), falling back to
// Math.random only where it does not — a share id is not a secret key, so the
// fallback is acceptable rather than a hard failure.
function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes)
  } else {
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

// The alphabet has exactly 64 entries, so `byte & 63` maps each byte onto one
// character with no modulo bias to correct for.
export function nanoid(size = 21): string {
  const bytes = randomBytes(size)
  let id = ''
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] & 63]
  return id
}
