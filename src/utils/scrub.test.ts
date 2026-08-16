import { describe, expect, it, vi } from 'vitest'
import {
  ADDRESS_PLACEHOLDER,
  SECRET_PLACEHOLDER,
  reportError,
  scrubArgs,
  scrubText,
  scrubValue,
} from './scrub'

const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const XRP = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'

describe('scrubText — addresses never reach a log', () => {
  it('removes an EVM address', () => {
    expect(scrubText(`failed for ${EVM}`)).toBe(`failed for ${ADDRESS_PLACEHOLDER}`)
  })

  it('removes bech32, base58 and TON addresses', () => {
    for (const address of [BTC, SOL, XRP, 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N']) {
      expect(scrubText(`address ${address} failed`), address).not.toContain(address)
    }
  })

  it('removes a Cardano and a Cosmos address', () => {
    const ada =
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
    expect(scrubText(ada)).toBe(ADDRESS_PLACEHOLDER)
    expect(scrubText('cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu')).toBe(ADDRESS_PLACEHOLDER)
  })

  it('removes several addresses in one string', () => {
    const out = scrubText(`${EVM} and ${BTC}`)
    expect(out).not.toContain('0x5aAeb')
    expect(out).not.toContain('bc1q')
  })

  it('leaves ordinary prose alone', () => {
    expect(scrubText('Could not save your changes')).toBe('Could not save your changes')
    expect(scrubText('')).toBe('')
  })
})

describe('scrubText — secrets are redacted, not masked', () => {
  it('redacts a raw private key', () => {
    expect(scrubText('key=' + 'a'.repeat(64))).toBe('key=' + SECRET_PLACEHOLDER)
  })

  it('redacts a WIF and an extended private key', () => {
    expect(scrubText('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ')).toBe(
      SECRET_PLACEHOLDER,
    )
    expect(
      scrubText(
        'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
      ),
    ).toBe(SECRET_PLACEHOLDER)
  })

  it('redacts a whole seed phrase, not word by word', () => {
    const phrase = Array(12).fill('abandon').join(' ')
    expect(scrubText(`pasted: ${phrase}`)).toBe(`pasted: ${SECRET_PLACEHOLDER}`)
  })

  it('leaves an ordinary sentence of the wrong length alone', () => {
    const sentence = 'the quick brown fox jumps over a lazy dog again'
    expect(scrubText(sentence)).toBe(sentence)
  })
})

describe('scrubValue', () => {
  it('walks nested objects and arrays', () => {
    const scrubbed = scrubValue({ a: [{ address: EVM }], b: 'ok', n: 4 })
    expect(scrubbed).toEqual({ a: [{ address: ADDRESS_PLACEHOLDER }], b: 'ok', n: 4 })
  })

  it('scrubs an Error message and stack while keeping its name', () => {
    const err = new Error(`boom for ${EVM}`)
    err.stack = `Error: boom for ${EVM}\n  at somewhere`
    const scrubbed = scrubValue(err) as Error
    expect(scrubbed.name).toBe('Error')
    expect(scrubbed.message).not.toContain('0x5aAeb')
    expect(scrubbed.stack).not.toContain('0x5aAeb')
  })

  it('leaves primitives untouched', () => {
    expect(scrubValue(5)).toBe(5)
    expect(scrubValue(null)).toBeNull()
    expect(scrubValue(true)).toBe(true)
  })

  it('stops recursing before a cycle can run away', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: EVM } } } } } } } }
    expect(() => scrubValue(deep)).not.toThrow()
  })
})

describe('reportError', () => {
  it('scrubs both the context and the details before they hit the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(`balance failed for ${EVM}`, { address: BTC })
    expect(spy).toHaveBeenCalledWith(`balance failed for ${ADDRESS_PLACEHOLDER}`, {
      address: ADDRESS_PLACEHOLDER,
    })
    spy.mockRestore()
  })

  it('scrubs an argument list wholesale', () => {
    expect(scrubArgs(['x', { a: EVM }])).toEqual(['x', { a: ADDRESS_PLACEHOLDER }])
  })
})
