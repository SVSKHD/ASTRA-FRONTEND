import { describe, expect, it } from 'vitest'
import {
  CHAINS,
  chainDef,
  chainName,
  chainsInFamily,
  explorerUrl,
  isChainKey,
  paymentUri,
  tokensOn,
} from './chains'

describe('the registry', () => {
  it('covers every chain the spec launches with', () => {
    const keys = CHAINS.map((c) => c.key)
    for (const key of [
      'BTC',
      'ETH',
      'POLYGON',
      'BSC',
      'ARBITRUM',
      'OPTIMISM',
      'BASE',
      'SOL',
      'XRP',
      'TRX',
      'TON',
      'LTC',
      'DOGE',
      'ADA',
      'DOT',
      'ATOM',
      'AVAX',
    ]) {
      expect(keys, key).toContain(key)
    }
  })

  it('gives every chain a mainnet explorer template with an address slot', () => {
    for (const chain of CHAINS) {
      expect(chain.explorer.mainnet, chain.key).toContain('{address}')
    }
  })

  it('recognises its own keys and rejects anything else', () => {
    expect(isChainKey('BTC')).toBe(true)
    expect(isChainKey('DOGECOIN')).toBe(false)
    expect(isChainKey(7)).toBe(false)
  })

  it('names a chain, falling back to the key', () => {
    expect(chainName('SOL')).toBe('Solana')
  })

  it('groups the EVM chains into one family', () => {
    const evm = chainsInFamily('evm').map((c) => c.key)
    expect(evm).toEqual(['ETH', 'POLYGON', 'BSC', 'ARBITRUM', 'OPTIMISM', 'BASE', 'AVAX'])
  })

  it('notes USDT/USDC as tokens on a chain rather than chains of their own', () => {
    expect(tokensOn('TRX')).toContain('USDT')
    expect(tokensOn('ETH')).toContain('USDC')
    expect(CHAINS.map((c) => c.key)).not.toContain('USDT')
  })

  it('marks the chains whose deposits need a tag or memo', () => {
    expect(chainDef('XRP')?.memo).toBe('tag')
    expect(chainDef('ATOM')?.memo).toBe('memo')
    expect(chainDef('BTC')?.memo).toBeUndefined()
  })
})

describe('explorerUrl', () => {
  it('builds the right explorer per chain', () => {
    expect(explorerUrl('BTC', 'bc1qxyz', 'mainnet')).toBe('https://mempool.space/address/bc1qxyz')
    expect(explorerUrl('ETH', '0xabc', 'mainnet')).toBe('https://etherscan.io/address/0xabc')
    expect(explorerUrl('SOL', 'So1', 'mainnet')).toBe('https://solscan.io/account/So1')
    expect(explorerUrl('XRP', 'rABC', 'mainnet')).toBe('https://xrpscan.com/account/rABC')
    expect(explorerUrl('TRX', 'TABC', 'mainnet')).toBe('https://tronscan.org/#/address/TABC')
    expect(explorerUrl('TON', 'EQabc', 'mainnet')).toBe('https://tonviewer.com/EQabc')
  })

  it('switches to the testnet explorer where there is one', () => {
    expect(explorerUrl('BTC', 'tb1q', 'testnet')).toContain('/testnet/')
  })

  it('returns null rather than a link that would 404', () => {
    expect(explorerUrl('DOGE', 'D123', 'testnet')).toBeNull()
    expect(explorerUrl('ATOM', 'cosmos1', 'testnet')).toBeNull()
    expect(explorerUrl('BTC', '', 'mainnet')).toBeNull()
  })
})

describe('paymentUri', () => {
  it('uses the chain scheme where one is defined', () => {
    expect(paymentUri('BTC', 'bc1qxyz')).toBe('bitcoin:bc1qxyz')
    expect(paymentUri('ETH', '0xabc')).toBe('ethereum:0xabc')
    expect(paymentUri('LTC', 'ltc1q')).toBe('litecoin:ltc1q')
  })

  it('leaves tag/memo chains as a bare address — the tag rides in the share block', () => {
    expect(paymentUri('XRP', 'rABC')).toBe('rABC')
    expect(paymentUri('ATOM', 'cosmos1abc')).toBe('cosmos1abc')
  })

  it('falls back to the bare address for chains with no scheme', () => {
    expect(paymentUri('ADA', 'addr1abc')).toBe('addr1abc')
    expect(paymentUri('TON', 'EQabc')).toBe('EQabc')
  })

  it('never encodes an amount — this is a receive address book', () => {
    expect(paymentUri('BTC', 'bc1qxyz')).not.toContain('amount')
  })
})
