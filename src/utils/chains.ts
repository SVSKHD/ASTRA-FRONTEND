// The chain registry (section 14). One place that knows what a chain is called,
// what its addresses look like, where its explorer lives and whether it has a
// payment URI scheme — so no explorer URL is ever written inline in a component.
//
// This is an address book for PUBLIC addresses. Nothing here signs, constructs a
// transaction, or connects a wallet, and no chain entry has anywhere to put a
// key even if one were offered.

export type ChainKey =
  | 'BTC'
  | 'ETH'
  | 'POLYGON'
  | 'BSC'
  | 'ARBITRUM'
  | 'OPTIMISM'
  | 'BASE'
  | 'AVAX'
  | 'SOL'
  | 'XRP'
  | 'TRX'
  | 'TON'
  | 'LTC'
  | 'DOGE'
  | 'ADA'
  | 'DOT'
  | 'ATOM'

export type Network = 'mainnet' | 'testnet'

// How an address on this chain is shaped. The validators in utils/address
// dispatch on this rather than on the chain key, so adding an EVM chain is one
// registry entry and no new validation code.
export type AddressFamily =
  | 'evm'
  | 'btc' // base58check P2PKH/P2SH + bech32/bech32m
  | 'base58' // plain base58 with a fixed decoded byte length (SOL)
  | 'base58check' // base58 + sha256d checksum (XRP, TRX)
  | 'bech32' // bech32 with a chain-specific human-readable part
  | 'cardano'
  | 'polkadot'
  | 'ton'

export interface ChainDef {
  key: ChainKey
  name: string
  symbol: string
  family: AddressFamily
  // A short glyph for the list; the app has no chain-logo assets to ship.
  glyph: string
  color: string
  // Explorer address-page templates. `{address}` is substituted. Testnet is
  // absent where the app has no sensible explorer for it.
  explorer: Record<Network, string | null>
  // BIP-21 style URI scheme, where the chain defines one.
  uriScheme?: string
  // Chains whose deposits need a destination tag / memo alongside the address.
  memo?: 'tag' | 'memo'
  // bech32 human-readable part(s), for the families that use one.
  hrp?: Partial<Record<Network, string[]>>
  // base58check version bytes, for the families that use them.
  versions?: Partial<Record<Network, number[]>>
  // Exact decoded byte length, where the family fixes one.
  byteLength?: number
  // Tokens that live on this chain rather than being chains of their own —
  // USDT/USDC are noted here, never listed as separate chains.
  tokens?: string[]
}

// EVM chains share one address shape; only the explorer and the label differ.
function evm(
  key: ChainKey,
  name: string,
  symbol: string,
  color: string,
  mainnet: string,
  testnet: string | null,
  tokens: string[] = ['USDT', 'USDC'],
): ChainDef {
  return {
    key,
    name,
    symbol,
    family: 'evm',
    glyph: '◈',
    color,
    explorer: { mainnet, testnet },
    uriScheme: 'ethereum',
    tokens,
  }
}

export const CHAINS: readonly ChainDef[] = [
  {
    key: 'BTC',
    name: 'Bitcoin',
    symbol: 'BTC',
    family: 'btc',
    glyph: '₿',
    color: 'oklch(0.75 0.16 65)',
    explorer: {
      mainnet: 'https://mempool.space/address/{address}',
      testnet: 'https://mempool.space/testnet/address/{address}',
    },
    uriScheme: 'bitcoin',
    hrp: { mainnet: ['bc'], testnet: ['tb'] },
    // P2PKH 0x00 / P2SH 0x05 on mainnet; 0x6f / 0xc4 on testnet.
    versions: { mainnet: [0x00, 0x05], testnet: [0x6f, 0xc4] },
  },
  evm(
    'ETH',
    'Ethereum',
    'ETH',
    'oklch(0.7 0.11 275)',
    'https://etherscan.io/address/{address}',
    'https://sepolia.etherscan.io/address/{address}',
  ),
  evm(
    'POLYGON',
    'Polygon',
    'POL',
    'oklch(0.65 0.2 300)',
    'https://polygonscan.com/address/{address}',
    'https://amoy.polygonscan.com/address/{address}',
  ),
  evm(
    'BSC',
    'BNB Smart Chain',
    'BNB',
    'oklch(0.82 0.16 92)',
    'https://bscscan.com/address/{address}',
    'https://testnet.bscscan.com/address/{address}',
  ),
  evm(
    'ARBITRUM',
    'Arbitrum One',
    'ETH',
    'oklch(0.7 0.12 240)',
    'https://arbiscan.io/address/{address}',
    'https://sepolia.arbiscan.io/address/{address}',
  ),
  evm(
    'OPTIMISM',
    'Optimism',
    'ETH',
    'oklch(0.65 0.2 25)',
    'https://optimistic.etherscan.io/address/{address}',
    'https://sepolia-optimism.etherscan.io/address/{address}',
  ),
  evm(
    'BASE',
    'Base',
    'ETH',
    'oklch(0.62 0.19 260)',
    'https://basescan.org/address/{address}',
    'https://sepolia.basescan.org/address/{address}',
  ),
  evm(
    'AVAX',
    'Avalanche C-Chain',
    'AVAX',
    'oklch(0.65 0.21 25)',
    'https://snowtrace.io/address/{address}',
    'https://testnet.snowtrace.io/address/{address}',
  ),
  {
    key: 'SOL',
    name: 'Solana',
    symbol: 'SOL',
    family: 'base58',
    glyph: '◎',
    color: 'oklch(0.72 0.2 300)',
    explorer: {
      mainnet: 'https://solscan.io/account/{address}',
      testnet: 'https://solscan.io/account/{address}?cluster=devnet',
    },
    uriScheme: 'solana',
    byteLength: 32,
    tokens: ['USDT', 'USDC'],
  },
  {
    key: 'XRP',
    name: 'XRP Ledger',
    symbol: 'XRP',
    family: 'base58check',
    glyph: '✕',
    color: 'oklch(0.7 0.03 250)',
    explorer: {
      mainnet: 'https://xrpscan.com/account/{address}',
      testnet: 'https://test.xrplexplorer.com/en/account/{address}',
    },
    memo: 'tag',
    versions: { mainnet: [0x00], testnet: [0x00] },
    byteLength: 20,
  },
  {
    key: 'TRX',
    name: 'Tron',
    symbol: 'TRX',
    family: 'base58check',
    glyph: '⟁',
    color: 'oklch(0.65 0.2 25)',
    explorer: {
      mainnet: 'https://tronscan.org/#/address/{address}',
      testnet: 'https://shasta.tronscan.org/#/address/{address}',
    },
    versions: { mainnet: [0x41], testnet: [0x41] },
    byteLength: 20,
    tokens: ['USDT', 'USDC'],
  },
  {
    key: 'TON',
    name: 'TON',
    symbol: 'TON',
    family: 'ton',
    glyph: '◆',
    color: 'oklch(0.7 0.13 230)',
    explorer: {
      mainnet: 'https://tonviewer.com/{address}',
      testnet: 'https://testnet.tonviewer.com/{address}',
    },
    memo: 'memo',
    tokens: ['USDT'],
  },
  {
    key: 'LTC',
    name: 'Litecoin',
    symbol: 'LTC',
    family: 'btc',
    glyph: 'Ł',
    color: 'oklch(0.72 0.02 250)',
    explorer: {
      mainnet: 'https://litecoinspace.org/address/{address}',
      testnet: 'https://litecoinspace.org/testnet/address/{address}',
    },
    uriScheme: 'litecoin',
    hrp: { mainnet: ['ltc'], testnet: ['tltc'] },
    versions: { mainnet: [0x30, 0x32, 0x05], testnet: [0x6f, 0x3a, 0xc4] },
  },
  {
    key: 'DOGE',
    name: 'Dogecoin',
    symbol: 'DOGE',
    family: 'btc',
    glyph: 'Ð',
    color: 'oklch(0.82 0.14 90)',
    explorer: {
      mainnet: 'https://blockchair.com/dogecoin/address/{address}',
      testnet: null,
    },
    uriScheme: 'dogecoin',
    versions: { mainnet: [0x1e, 0x16], testnet: [0x71, 0xc4] },
  },
  {
    key: 'ADA',
    name: 'Cardano',
    symbol: 'ADA',
    family: 'cardano',
    glyph: '₳',
    color: 'oklch(0.6 0.13 250)',
    explorer: {
      mainnet: 'https://cardanoscan.io/address/{address}',
      testnet: 'https://preprod.cardanoscan.io/address/{address}',
    },
    hrp: { mainnet: ['addr'], testnet: ['addr_test'] },
  },
  {
    key: 'DOT',
    name: 'Polkadot',
    symbol: 'DOT',
    family: 'polkadot',
    glyph: '●',
    color: 'oklch(0.68 0.22 350)',
    explorer: {
      mainnet: 'https://polkadot.subscan.io/account/{address}',
      testnet: 'https://westend.subscan.io/account/{address}',
    },
  },
  {
    key: 'ATOM',
    name: 'Cosmos Hub',
    symbol: 'ATOM',
    family: 'bech32',
    glyph: '⚛',
    color: 'oklch(0.62 0.09 285)',
    explorer: {
      mainnet: 'https://www.mintscan.io/cosmos/address/{address}',
      testnet: null,
    },
    memo: 'memo',
    hrp: { mainnet: ['cosmos'], testnet: ['cosmos'] },
  },
] as const

const BY_KEY = new Map(CHAINS.map((c) => [c.key, c]))

export function chainDef(key: ChainKey): ChainDef | undefined {
  return BY_KEY.get(key)
}

export function isChainKey(v: unknown): v is ChainKey {
  return typeof v === 'string' && BY_KEY.has(v as ChainKey)
}

export function chainName(key: ChainKey): string {
  return chainDef(key)?.name ?? key
}

// Every chain that shares one address shape — used to warn when the selected
// chain does not match the detected format ("looks like an EVM address").
export function chainsInFamily(family: AddressFamily): ChainDef[] {
  return CHAINS.filter((c) => c.family === family)
}

// The explorer deep link for an address, or null when the app has no explorer
// for that chain/network pair (better than a link that 404s).
export function explorerUrl(key: ChainKey, address: string, network: Network): string | null {
  const template = chainDef(key)?.explorer[network]
  if (!template || !address) return null
  return template.replace('{address}', encodeURIComponent(address))
}

// A BIP-21 style payment URI where the chain defines one, otherwise the bare
// address. Amounts are never included — this is a receive address book, not a
// payment request. No launch chain that needs a destination tag or memo defines
// a URI scheme, so the tag travels in the share block beside the address rather
// than as a query parameter a wallet might ignore.
export function paymentUri(key: ChainKey, address: string): string {
  const def = chainDef(key)
  return def?.uriScheme ? `${def.uriScheme}:${address}` : address
}

// Tokens are noted on the chain they live on rather than as chains of their own.
export function tokensOn(key: ChainKey): string[] {
  return chainDef(key)?.tokens ?? []
}
