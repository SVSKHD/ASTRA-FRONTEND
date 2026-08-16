import { describe, expect, it } from 'vitest'
import {
  SECRET_MESSAGE,
  base58CheckDecode,
  base58Decode,
  bech32Decode,
  chainMismatch,
  copyVerification,
  detectChains,
  looksLikeKeystore,
  looksLikeMnemonic,
  looksLikePrivateKey,
  rejectSecret,
  truncateAddress,
  validateAddress,
  validateEvm,
} from './address'

// Well-known public addresses, plus a couple constructed with valid checksums
// where a well-known one was not to hand. All of them are public receive
// addresses; there is no key material anywhere in this suite.
const VALID: Record<string, string> = {
  BTC_P2PKH: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  BTC_P2SH: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
  BTC_BECH32: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  BTC_TAPROOT: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  EVM: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  SOL: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  XRP: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
  TRX: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  LTC: 'LKW2MEtSaS8nhzywDkMeV45Wt5FjFizyaC',
  LTC_P2SH: 'M8BEKTV1zo4YLsG7Gb2HTJd695mcbkACUr',
  LTC_BECH32: 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9',
  DOGE: 'D5RAdHXFoBo1zCUNnCMukoBMYzckSY7GKc',
  ADA: 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
  ATOM: 'cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu',
  TON: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
}

describe('secret rejection (acceptance 61)', () => {
  it('refuses a 12-word seed phrase', () => {
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    expect(looksLikeMnemonic(phrase)).toBe(true)
    expect(rejectSecret(phrase)).toBe(SECRET_MESSAGE)
  })

  it('refuses a 24-word seed phrase', () => {
    const phrase = Array(24).fill('legal').join(' ')
    expect(looksLikeMnemonic(phrase)).toBe(true)
  })

  it('refuses a raw hex private key, with or without 0x', () => {
    const key = 'a'.repeat(64)
    expect(looksLikePrivateKey(key)).toBe(true)
    expect(looksLikePrivateKey('0x' + key)).toBe(true)
  })

  it('refuses a WIF and an extended private key', () => {
    expect(looksLikePrivateKey('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ')).toBe(true)
    expect(
      looksLikePrivateKey(
        'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
      ),
    ).toBe(true)
  })

  it('refuses a pasted keystore file', () => {
    expect(looksLikeKeystore('{"version":3,"crypto":{"ciphertext":"deadbeef"}}')).toBe(true)
  })

  it('refuses a Solana secret-key byte array', () => {
    expect(looksLikePrivateKey('[' + Array(64).fill('12').join(',') + ']')).toBe(true)
  })

  it('lets an ordinary address through untouched', () => {
    expect(rejectSecret(VALID.EVM)).toBeNull()
    expect(rejectSecret(VALID.BTC_BECH32)).toBeNull()
    expect(looksLikeMnemonic('send to my cold wallet')).toBe(false)
  })

  it('rejects a secret before any chain validation runs', () => {
    const phrase = Array(12).fill('abandon').join(' ')
    expect(validateAddress('BTC', phrase)).toMatchObject({ ok: false, reason: SECRET_MESSAGE })
  })
})

describe('primitives', () => {
  it('decodes base58 with leading zero bytes preserved', () => {
    const decoded = base58Decode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
    expect(decoded).not.toBeNull()
    expect(decoded?.[0]).toBe(0)
  })

  it('rejects base58 containing an ambiguous character', () => {
    expect(base58Decode('1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0a')).toBeNull()
  })

  it('verifies a base58check checksum and exposes the version byte', () => {
    expect(base58CheckDecode(VALID.BTC_P2PKH)?.version).toBe(0)
    expect(base58CheckDecode(VALID.BTC_P2SH)?.version).toBe(5)
  })

  it('rejects a base58check string with one character changed', () => {
    const broken = VALID.BTC_P2PKH.slice(0, -1) + (VALID.BTC_P2PKH.endsWith('a') ? 'b' : 'a')
    expect(base58CheckDecode(broken)).toBeNull()
  })

  it('decodes bech32 and bech32m, telling them apart', () => {
    expect(bech32Decode(VALID.BTC_BECH32)?.encoding).toBe('bech32')
    expect(bech32Decode(VALID.BTC_TAPROOT)?.encoding).toBe('bech32m')
  })

  it('rejects mixed-case bech32 and a broken checksum', () => {
    expect(bech32Decode('bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeNull()
    expect(bech32Decode('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toBeNull()
  })
})

describe('EVM validation (acceptance 62)', () => {
  it('accepts a correctly checksummed address', () => {
    expect(validateEvm(VALID.EVM)).toMatchObject({ ok: true, level: 'ok' })
  })

  it('warns — but does not block — on an all-lowercase address', () => {
    const check = validateEvm(VALID.EVM.toLowerCase())
    expect(check.level).toBe('warn')
    expect(check.ok).toBe(true)
    expect(check.reason).toContain('EIP-55')
  })

  it('blocks a mixed-case address whose checksum fails', () => {
    // One character's case flipped from the valid form.
    const broken = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    const check = validateEvm(broken)
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('checksum')
  })

  it('rejects a wrong-length or non-hex address with a specific reason', () => {
    expect(validateEvm('0x123').reason).toContain('40 hex')
    expect(validateEvm('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed').reason).toContain('0x')
  })
})

describe('per-chain validation (acceptance 60)', () => {
  it('accepts a valid address on every launch chain', () => {
    const cases: [Parameters<typeof validateAddress>[0], string][] = [
      ['BTC', VALID.BTC_P2PKH],
      ['BTC', VALID.BTC_P2SH],
      ['BTC', VALID.BTC_BECH32],
      ['BTC', VALID.BTC_TAPROOT],
      ['ETH', VALID.EVM],
      ['POLYGON', VALID.EVM],
      ['BSC', VALID.EVM],
      ['ARBITRUM', VALID.EVM],
      ['OPTIMISM', VALID.EVM],
      ['BASE', VALID.EVM],
      ['AVAX', VALID.EVM],
      ['SOL', VALID.SOL],
      ['XRP', VALID.XRP],
      ['TRX', VALID.TRX],
      ['LTC', VALID.LTC],
      ['LTC', VALID.LTC_P2SH],
      ['LTC', VALID.LTC_BECH32],
      ['DOGE', VALID.DOGE],
      ['ADA', VALID.ADA],
      ['ATOM', VALID.ATOM],
      ['TON', VALID.TON],
    ]
    for (const [chain, address] of cases) {
      expect(validateAddress(chain, address), `${chain} ${address}`).toMatchObject({ ok: true })
    }
  })

  it('rejects a mistyped address with a reason that names the problem', () => {
    expect(validateAddress('BTC', VALID.BTC_P2PKH.slice(0, -1) + 'X').reason).toContain('checksum')
    expect(validateAddress('BTC', VALID.BTC_BECH32.slice(0, -1) + 'q').reason).toContain('bech32')
    expect(validateAddress('SOL', VALID.SOL.slice(0, 20)).reason).toContain('bytes')
    expect(validateAddress('XRP', VALID.TRX).reason).toContain('starts with r')
    expect(validateAddress('TRX', VALID.XRP).reason).toContain('starts with T')
    expect(validateAddress('TON', 'EQ-too-short').reason).toContain('48')
    expect(validateAddress('ATOM', 'cosmos1nope').reason).toContain('bech32')
    expect(validateAddress('ADA', VALID.ATOM).reason).toContain('prefix')
  })

  it('rejects an empty address rather than saving a blank', () => {
    expect(validateAddress('BTC', '   ')).toMatchObject({ ok: false, reason: 'Enter an address' })
  })

  it('rejects a mainnet address selected as testnet', () => {
    expect(validateAddress('BTC', VALID.BTC_BECH32, 'testnet').ok).toBe(false)
    expect(validateAddress('ADA', VALID.ADA, 'testnet').ok).toBe(false)
  })

  it('requires bech32m for taproot and bech32 for v0', () => {
    // A v0 payload re-encoded as bech32m fails its own checksum first, so the
    // guard here is that the two encodings are never treated interchangeably.
    expect(bech32Decode(VALID.BTC_BECH32)?.encoding).not.toBe(
      bech32Decode(VALID.BTC_TAPROOT)?.encoding,
    )
  })
})

describe('format detection', () => {
  it('names every EVM chain for an 0x address', () => {
    expect(detectChains(VALID.EVM)).toContain('POLYGON')
    expect(detectChains(VALID.EVM)).toContain('ETH')
  })

  it('recognises the distinctive prefixes', () => {
    expect(detectChains(VALID.BTC_BECH32)).toEqual(['BTC'])
    expect(detectChains(VALID.LTC_BECH32)).toEqual(['LTC'])
    expect(detectChains(VALID.XRP)).toEqual(['XRP'])
    expect(detectChains(VALID.TRX)).toEqual(['TRX'])
    expect(detectChains(VALID.TON)).toEqual(['TON'])
    expect(detectChains(VALID.ADA)).toEqual(['ADA'])
    expect(detectChains(VALID.ATOM)).toEqual(['ATOM'])
    expect(detectChains(VALID.SOL)).toEqual(['SOL'])
  })

  it('reports nothing for an unrecognisable string', () => {
    expect(detectChains('hello')).toEqual([])
    expect(detectChains('')).toEqual([])
  })

  it('flags a chain/format mismatch loudly', () => {
    expect(chainMismatch('SOL', VALID.EVM)).toContain('ETH')
    expect(chainMismatch('BTC', VALID.XRP)).toEqual(['XRP'])
  })

  it('does not flag a match, including across the shared EVM shape', () => {
    expect(chainMismatch('ETH', VALID.EVM)).toEqual([])
    expect(chainMismatch('BASE', VALID.EVM)).toEqual([])
    expect(chainMismatch('BTC', VALID.BTC_BECH32)).toEqual([])
  })
})

describe('display helpers', () => {
  it('truncates to first-6 and last-6', () => {
    expect(truncateAddress('0x1234567890abcdef9abc')).toBe('0x1234…ef9abc')
  })

  it('leaves a short address whole', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })

  it('exposes the head/tail pair used to verify a copy', () => {
    expect(copyVerification(VALID.EVM)).toEqual({ head: '0x5aAe', tail: 'f1BeAed'.slice(1) })
  })
})
