// Address validation (section 14). Client-side, synchronous, and run before any
// write — a mistyped address is rejected with a specific reason rather than
// stored and discovered later by a lost deposit.
//
// THE HARD CONSTRAINT COMES FIRST: this module refuses secrets. A pasted
// mnemonic, private key, WIF, extended private key or keystore file is rejected
// outright, and the caller is told never to persist the input — not to a draft,
// not to a log.
//
// Cryptography is borrowed rather than reimplemented: viem supplies EIP-55
// checksums (keccak) and sha256 for base58check. bech32/bech32m is a short,
// self-contained decoder, which is cheaper than pulling a multi-chain SDK in for
// one polynomial.

import { getAddress, sha256 } from 'viem'
import { chainDef, type ChainKey, type Network } from '@/utils/chains'

// ---- secret rejection (acceptance 61) --------------------------------------

export const SECRET_MESSAGE = 'Never paste a private key or seed phrase'

// BIP-39 mnemonics are 12/15/18/21/24 lowercase words. The check is on the
// shape, not on the wordlist: over-rejecting something that looks like a seed
// phrase costs nothing, and shipping 2048 words to catch it would be worse than
// the false positive it prevents.
export function looksLikeMnemonic(input: string): boolean {
  const words = input.trim().toLowerCase().split(/\s+/)
  if (![12, 15, 18, 21, 24].includes(words.length)) return false
  return words.every((w) => /^[a-z]{3,8}$/.test(w))
}

// Raw private keys, WIFs, extended private keys, and Solana secret-key arrays.
export function looksLikePrivateKey(input: string): boolean {
  const value = input.trim()
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) return true
  // WIF: 5… (uncompressed) or K…/L… (compressed), 51–52 base58 characters.
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(value)) return true
  // Extended private keys across the common prefixes.
  if (/^([xyzt]prv|[Ll]tpv|dgpv)[1-9A-HJ-NP-Za-km-z]{50,}$/.test(value)) return true
  // A JSON array of 64 bytes — how Solana CLI keypairs are pasted.
  if (/^\[\s*\d{1,3}\s*(,\s*\d{1,3}\s*){31,}\]$/.test(value)) return true
  return false
}

// A Web3 Secret Storage / geth keystore file, pasted as JSON.
export function looksLikeKeystore(input: string): boolean {
  const value = input.trim()
  if (!value.startsWith('{')) return false
  return /"crypto"\s*:/i.test(value) && /"ciphertext"\s*:/i.test(value)
}

// The single gate every input passes through before anything else looks at it.
// Returns a rejection message, or null when the input carries no secret.
export function rejectSecret(input: string): string | null {
  if (!input) return null
  if (looksLikeMnemonic(input) || looksLikePrivateKey(input) || looksLikeKeystore(input)) {
    return SECRET_MESSAGE
  }
  return null
}

// ---- primitives -------------------------------------------------------------

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B58_INDEX = new Map([...B58_ALPHABET].map((ch, i) => [ch, i]))

export function base58Decode(input: string): Uint8Array | null {
  if (!input) return null
  const bytes: number[] = [0]
  for (const ch of input) {
    const value = B58_INDEX.get(ch)
    if (value === undefined) return null
    let carry = value
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  // Leading '1's are leading zero bytes.
  for (const ch of input) {
    if (ch !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

function toHex(bytes: Uint8Array): `0x${string}` {
  let out = '0x'
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out as `0x${string}`
}

function sha256d(bytes: Uint8Array): Uint8Array {
  const once = sha256(toHex(bytes), 'bytes')
  return sha256(toHex(once), 'bytes')
}

// base58check: payload + 4 checksum bytes of sha256(sha256(payload)).
export function base58CheckDecode(input: string): { version: number; payload: Uint8Array } | null {
  const raw = base58Decode(input)
  if (!raw || raw.length < 5) return null
  const body = raw.slice(0, raw.length - 4)
  const checksum = raw.slice(raw.length - 4)
  const expected = sha256d(body).slice(0, 4)
  for (let i = 0; i < 4; i++) if (checksum[i] !== expected[i]) return null
  return { version: body[0], payload: body.slice(1) }
}

// ---- bech32 / bech32m --------------------------------------------------------

const B32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_CONST = 1
const BECH32M_CONST = 0x2bc830a3

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const ch of hrp) out.push(ch.charCodeAt(0) >> 5)
  out.push(0)
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31)
  return out
}

export interface Bech32Result {
  hrp: string
  data: number[]
  encoding: 'bech32' | 'bech32m'
}

export function bech32Decode(input: string): Bech32Result | null {
  if (input.length < 8 || input.length > 130) return null
  // Mixed case is invalid in bech32 — it is not merely a display choice.
  const lower = input.toLowerCase()
  if (input !== lower && input !== input.toUpperCase()) return null
  const split = lower.lastIndexOf('1')
  if (split < 1 || split + 7 > lower.length) return null
  const hrp = lower.slice(0, split)
  const data: number[] = []
  for (const ch of lower.slice(split + 1)) {
    const value = B32_ALPHABET.indexOf(ch)
    if (value === -1) return null
    data.push(value)
  }
  const checksum = polymod([...hrpExpand(hrp), ...data])
  const encoding =
    checksum === BECH32_CONST ? 'bech32' : checksum === BECH32M_CONST ? 'bech32m' : null
  if (!encoding) return null
  return { hrp, data: data.slice(0, data.length - 6), encoding }
}

// ---- per-chain validation ----------------------------------------------------

export type CheckLevel = 'ok' | 'warn' | 'error'

export interface AddressCheck {
  // Whether the address may be saved. A 'warn' is savable; an 'error' is not.
  ok: boolean
  level: CheckLevel
  // Always specific: what is wrong, not just "invalid address".
  reason: string
}

const OK: AddressCheck = { ok: true, level: 'ok', reason: '' }
const err = (reason: string): AddressCheck => ({ ok: false, level: 'error', reason })
const warn = (reason: string): AddressCheck => ({ ok: true, level: 'warn', reason })

// EVM: 0x + 40 hex, with EIP-55 enforced. An all-lowercase address carries no
// checksum at all, so it is a warning; a mixed-case address that fails the
// checksum is a typo and is rejected (acceptance 62).
export function validateEvm(address: string): AddressCheck {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return err('An EVM address is 0x followed by 40 hex characters')
  }
  const body = address.slice(2)
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase()
  if (!mixed) {
    return warn('No EIP-55 checksum on an all-lowercase address — check it character by character')
  }
  try {
    // getAddress throws when a mixed-case address fails its checksum.
    return getAddress(address) === address
      ? OK
      : err('EIP-55 checksum failed — the capitalisation does not match the address')
  } catch {
    return err('EIP-55 checksum failed — the capitalisation does not match the address')
  }
}

function validateBtcLike(key: ChainKey, address: string, network: Network): AddressCheck {
  const def = chainDef(key)
  if (!def) return err('Unknown chain')
  // Segwit / taproot first: bech32 (v0) and bech32m (v1+).
  const hrps = def.hrp?.[network] ?? []
  if (hrps.some((h) => address.toLowerCase().startsWith(h + '1'))) {
    const decoded = bech32Decode(address)
    if (!decoded) return err('bech32 checksum failed — retype or re-copy the address')
    if (!hrps.includes(decoded.hrp)) {
      return err(`Wrong network prefix: expected ${hrps.join(' or ')}`)
    }
    const version = decoded.data[0]
    if (version === 0 && decoded.encoding !== 'bech32') {
      return err('A v0 segwit address must use bech32, not bech32m')
    }
    if (version > 0 && decoded.encoding !== 'bech32m') {
      return err('A v1+ (taproot) address must use bech32m')
    }
    return OK
  }
  // Otherwise base58check P2PKH / P2SH.
  const decoded = base58CheckDecode(address)
  if (!decoded) return err('base58 checksum failed — one character is likely wrong')
  const versions = def.versions?.[network] ?? []
  if (versions.length && !versions.includes(decoded.version)) {
    return err(`Not a ${def.name} ${network} address (unexpected version byte)`)
  }
  if (decoded.payload.length !== 20) return err('Decoded address is not 20 bytes')
  return OK
}

function validateBase58Fixed(address: string, byteLength: number): AddressCheck {
  const decoded = base58Decode(address)
  if (!decoded) return err('Not valid base58 — check for 0, O, I or l')
  if (decoded.length !== byteLength) {
    return err(`Decodes to ${decoded.length} bytes, expected ${byteLength}`)
  }
  return OK
}

// XRP uses its own base58 dictionary; ripple-flavoured decoding is the same
// algorithm over a different alphabet.
const XRP_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
function xrpToBitcoinAlphabet(address: string): string | null {
  let out = ''
  for (const ch of address) {
    const index = XRP_ALPHABET.indexOf(ch)
    if (index === -1) return null
    out += B58_ALPHABET[index]
  }
  return out
}

function validateBase58Check(key: ChainKey, address: string, network: Network): AddressCheck {
  const def = chainDef(key)
  if (!def) return err('Unknown chain')
  if (key === 'XRP') {
    if (!address.startsWith('r')) return err('An XRP address starts with r')
    const translated = xrpToBitcoinAlphabet(address)
    if (!translated) return err('Not valid XRP base58 — check for 0, O, I or l')
    const decoded = base58CheckDecode(translated)
    if (!decoded) return err('XRP checksum failed — one character is likely wrong')
    if (decoded.payload.length !== 20) return err('Decoded address is not 20 bytes')
    return OK
  }
  if (key === 'TRX' && !address.startsWith('T')) return err('A Tron address starts with T')
  const decoded = base58CheckDecode(address)
  if (!decoded) return err('base58 checksum failed — one character is likely wrong')
  const versions = def.versions?.[network] ?? []
  if (versions.length && !versions.includes(decoded.version)) {
    return err(`Not a ${def.name} address (unexpected version byte)`)
  }
  if (def.byteLength && decoded.payload.length !== def.byteLength) {
    return err(`Decoded address is not ${def.byteLength} bytes`)
  }
  return OK
}

function validateBech32Prefixed(key: ChainKey, address: string, network: Network): AddressCheck {
  const def = chainDef(key)
  const hrps = def?.hrp?.[network] ?? []
  const decoded = bech32Decode(address)
  if (!decoded) return err('bech32 checksum failed — retype or re-copy the address')
  if (hrps.length && !hrps.includes(decoded.hrp)) {
    return err(`Wrong prefix: expected ${hrps.join(' or ')}`)
  }
  return OK
}

function validateCardano(address: string, network: Network): AddressCheck {
  const decoded = bech32Decode(address)
  if (!decoded) return err('bech32 checksum failed — retype or re-copy the address')
  const expected = network === 'mainnet' ? 'addr' : 'addr_test'
  if (decoded.hrp !== expected) return err(`Wrong prefix: expected ${expected}`)
  return OK
}

// Polkadot SS58: base58check-shaped but with its own checksum construction. The
// structural checks (alphabet, decoded length, network prefix byte) catch a
// typo without pulling in an SS58 implementation.
function validatePolkadot(address: string): AddressCheck {
  const decoded = base58Decode(address)
  if (!decoded) return err('Not valid base58 — check for 0, O, I or l')
  if (decoded.length !== 35) return err('A Polkadot SS58 address decodes to 35 bytes')
  if (decoded[0] !== 0) return err('Not a Polkadot-network SS58 address')
  return OK
}

// TON user-friendly addresses are 48 characters of base64url over 36 bytes.
function validateTon(address: string): AddressCheck {
  if (!/^[A-Za-z0-9_-]{48}$/.test(address)) {
    return err('A TON address is 48 base64url characters')
  }
  if (!/^(EQ|UQ|kQ|0Q)/.test(address)) {
    return err('A TON address starts with EQ, UQ, kQ or 0Q')
  }
  return OK
}

// The one entry point. Every caller — the form, the store, the importer — goes
// through this, so no path can write an address that was never checked.
export function validateAddress(
  key: ChainKey,
  rawAddress: string,
  network: Network = 'mainnet',
): AddressCheck {
  const address = (rawAddress || '').trim()
  if (!address) return err('Enter an address')
  const secret = rejectSecret(address)
  if (secret) return err(secret)

  const def = chainDef(key)
  if (!def) return err('Unknown chain')

  switch (def.family) {
    case 'evm':
      return validateEvm(address)
    case 'btc':
      return validateBtcLike(key, address, network)
    case 'base58':
      return validateBase58Fixed(address, def.byteLength ?? 32)
    case 'base58check':
      return validateBase58Check(key, address, network)
    case 'bech32':
      return validateBech32Prefixed(key, address, network)
    case 'cardano':
      return validateCardano(address, network)
    case 'polkadot':
      return validatePolkadot(address)
    case 'ton':
      return validateTon(address)
  }
}

// ---- format detection --------------------------------------------------------

// Which chains an address could belong to, for the "this does not look like the
// chain you picked" warning. Deliberately coarse: it names the family, and the
// caller warns rather than blocks, because several chains share a shape.
export function detectChains(rawAddress: string): ChainKey[] {
  const address = (rawAddress || '').trim()
  if (!address) return []
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return ['ETH', 'POLYGON', 'BSC', 'ARBITRUM', 'OPTIMISM', 'BASE', 'AVAX']
  }
  if (/^(bc1|tb1)/i.test(address)) return ['BTC']
  if (/^(ltc1|tltc1)/i.test(address)) return ['LTC']
  if (/^addr(_test)?1/.test(address)) return ['ADA']
  if (/^cosmos1/.test(address)) return ['ATOM']
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) return ['XRP']
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return ['TRX']
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(address)) return ['TON']
  if (/^[LM3][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) return ['LTC']
  if (/^D[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) return ['DOGE']
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) return ['BTC']
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(address)) return ['SOL']
  return []
}

// True when the address plainly belongs to a different chain than the one
// selected — the loud warning the spec asks for, not a silent acceptance.
export function chainMismatch(key: ChainKey, address: string): ChainKey[] {
  const detected = detectChains(address)
  if (!detected.length || detected.includes(key)) return []
  return detected
}

// ---- display -----------------------------------------------------------------

// `0x1234…9abc`. Used everywhere an address is shown in a list; the full string
// is only ever shown in the QR modal, the share block, and the copy toast.
export function truncateAddress(address: string, head = 6, tail = 6): string {
  const value = address || ''
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

// The first-6/last-6 pair shown next to the "Copied" toast, so the user can
// verify what landed on the clipboard against the destination.
export function copyVerification(address: string): { head: string; tail: string } {
  const value = address || ''
  return { head: value.slice(0, 6), tail: value.slice(-6) }
}
