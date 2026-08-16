import { describe, expect, it } from 'vitest'
import { qrFileName, receiveBlock } from './walletShare'
import type { Wallet } from '@/types'

function wallet(over: Partial<Wallet> = {}): Wallet {
  return {
    id: 1,
    label: 'Cold storage',
    chain: 'BTC',
    network: 'mainnet',
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    memoTag: null,
    isDefault: true,
    order: 0,
    notes: '',
    balanceEnabled: false,
    balance: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('receiveBlock', () => {
  it('carries label, chain, network and the full address', () => {
    expect(receiveBlock(wallet())).toBe(
      [
        'Cold storage',
        'Chain: Bitcoin (BTC)',
        'Network: mainnet',
        'Address: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      ].join('\n'),
    )
  })

  it('marks a destination tag as required, because a deposit without it is lost', () => {
    const block = receiveBlock(
      wallet({ chain: 'XRP', address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', memoTag: '12345' }),
    )
    expect(block).toContain('Destination tag: 12345 (required)')
  })

  it('calls it a memo on the chains that use that word', () => {
    expect(receiveBlock(wallet({ chain: 'ATOM', memoTag: 'abc' }))).toContain(
      'Memo: abc (required)',
    )
  })

  it('names the tokens the chain accepts, so USDT does not arrive on the wrong one', () => {
    expect(receiveBlock(wallet({ chain: 'TRX' }))).toContain('Tokens accepted on this chain: USDT')
  })

  it('says testnet when that is what it is', () => {
    expect(receiveBlock(wallet({ network: 'testnet' }))).toContain('Network: testnet')
  })

  it('never truncates the address — the block is what gets pasted', () => {
    const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
    expect(receiveBlock(wallet({ address }))).toContain(address)
    expect(receiveBlock(wallet({ address }))).not.toContain('…')
  })
})

describe('qrFileName', () => {
  it('slugs the label and names the chain', () => {
    expect(qrFileName(wallet({ label: 'Cold Storage #2' }))).toBe('cold-storage-2-btc.png')
  })

  it('falls back to a usable name for an unlabelled wallet', () => {
    expect(qrFileName(wallet({ label: '' }))).toBe('wallet-btc.png')
    expect(qrFileName(wallet({ label: '!!!' }))).toBe('wallet-btc.png')
  })
})
