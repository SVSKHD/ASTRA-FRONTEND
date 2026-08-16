import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { SECRET_MESSAGE } from '@/utils/address'

const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

describe('addWallet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stores a valid address with its chain and network (acceptance 60)', () => {
    const app = useAppStore()
    const { id, error } = app.addWallet({ label: 'Cold', chain: 'BTC', address: BTC })
    expect(error).toBe('')
    expect(app.wallets).toHaveLength(1)
    expect(app.walletById(id as number)).toMatchObject({
      label: 'Cold',
      chain: 'BTC',
      network: 'mainnet',
      address: BTC,
      isDefault: true,
    })
  })

  it('rejects a mistyped address with a specific reason and writes nothing', () => {
    const app = useAppStore()
    const { id, error } = app.addWallet({ label: 'Oops', chain: 'BTC', address: BTC + 'x' })
    expect(id).toBeNull()
    expect(error).toContain('bech32')
    expect(app.wallets).toEqual([])
  })

  it('refuses a seed phrase and persists nothing at all (acceptance 61)', () => {
    const app = useAppStore()
    const phrase = Array(12).fill('abandon').join(' ')
    const { id, error } = app.addWallet({ label: 'x', chain: 'BTC', address: phrase })
    expect(id).toBeNull()
    expect(error).toBe(SECRET_MESSAGE)
    expect(app.wallets).toEqual([])
    // Nothing about the input reaches any stored field.
    expect(JSON.stringify(app.wallets)).not.toContain('abandon')
  })

  it('refuses a private key the same way', () => {
    const app = useAppStore()
    const { error } = app.addWallet({ label: 'x', chain: 'ETH', address: '0x' + 'a'.repeat(64) })
    expect(error).toBe(SECRET_MESSAGE)
    expect(app.wallets).toEqual([])
  })

  it('blocks an EVM address that fails its EIP-55 checksum (acceptance 62)', () => {
    const app = useAppStore()
    const { error } = app.addWallet({
      label: 'Hot',
      chain: 'ETH',
      address: '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    })
    expect(error).toContain('checksum')
    expect(app.wallets).toEqual([])
  })

  it('saves an all-lowercase EVM address — it warns rather than blocks', () => {
    const app = useAppStore()
    expect(app.addWallet({ label: 'Hot', chain: 'ETH', address: EVM.toLowerCase() }).error).toBe('')
    expect(app.wallets).toHaveLength(1)
  })

  it('refuses the same address twice on the same chain', () => {
    const app = useAppStore()
    app.addWallet({ label: 'One', chain: 'SOL', address: SOL })
    const second = app.addWallet({ label: 'Two', chain: 'SOL', address: SOL })
    expect(second.error).toContain('already saved')
    expect(app.wallets).toHaveLength(1)
  })

  it('allows the same address on two different chains', () => {
    const app = useAppStore()
    app.addWallet({ label: 'Main', chain: 'ETH', address: EVM })
    expect(app.addWallet({ label: 'L2', chain: 'BASE', address: EVM }).error).toBe('')
    expect(app.wallets).toHaveLength(2)
  })

  it('names an unlabelled wallet after its chain', () => {
    const app = useAppStore()
    const { id } = app.addWallet({ label: '  ', chain: 'SOL', address: SOL })
    expect(app.walletById(id as number)?.label).toBe('Solana wallet')
  })

  it('makes only the first wallet on a chain the default', () => {
    const app = useAppStore()
    app.addWallet({ label: 'First', chain: 'ETH', address: EVM })
    const second = app.addWallet({
      label: 'Second',
      chain: 'ETH',
      address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    })
    expect(app.walletById(second.id as number)?.isDefault).toBe(false)
    expect(app.defaultWalletFor('ETH')?.label).toBe('First')
  })

  it('groups wallets by chain in display order', () => {
    const app = useAppStore()
    app.addWallet({ label: 'Btc', chain: 'BTC', address: BTC })
    app.addWallet({ label: 'Eth', chain: 'ETH', address: EVM })
    expect([...app.walletsByChain.keys()]).toEqual(['BTC', 'ETH'])
    expect(app.walletsByChain.get('BTC')).toHaveLength(1)
  })

  it('stores a destination tag where the chain uses one', () => {
    const app = useAppStore()
    const { id } = app.addWallet({
      label: 'Exchange',
      chain: 'XRP',
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      memoTag: ' 12345 ',
    })
    expect(app.walletById(id as number)?.memoTag).toBe('12345')
  })
})
