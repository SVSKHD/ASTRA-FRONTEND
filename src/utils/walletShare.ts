// "Share receive details" (section 14 SHARE): a copyable block a counterparty
// can act on — label, chain, network, address, and the memo/tag when the chain
// needs one.
//
// Public share LINKS are out of scope in v1, so this is text the user copies and
// sends themselves; nothing is published anywhere. The block never contains
// anything but public data.

import { chainDef, chainName } from '@/utils/chains'
import type { Wallet } from '@/types'

export function receiveBlock(wallet: Wallet): string {
  const def = chainDef(wallet.chain)
  const lines = [
    wallet.label,
    `Chain: ${chainName(wallet.chain)}${def?.symbol ? ` (${def.symbol})` : ''}`,
    `Network: ${wallet.network}`,
    `Address: ${wallet.address}`,
  ]
  if (wallet.memoTag) {
    const kind = def?.memo === 'tag' ? 'Destination tag' : 'Memo'
    // Stated as required, because on these chains a deposit without it is
    // routinely lost.
    lines.push(`${kind}: ${wallet.memoTag} (required)`)
  }
  if (def?.tokens?.length) {
    lines.push(`Tokens accepted on this chain: ${def.tokens.join(', ')}`)
  }
  return lines.join('\n')
}

// A filename for the QR image download: readable, safe, and unambiguous about
// which wallet it depicts.
export function qrFileName(wallet: Wallet): string {
  const label = (wallet.label || 'wallet')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${label || 'wallet'}-${wallet.chain.toLowerCase()}.png`
}
