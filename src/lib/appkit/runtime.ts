import { createAppKit } from '@reown/appkit'
import { WalletNetworkAdapter } from './wallet-network-adapter'
import { BitcoinAdapter } from '@reown/appkit-adapter-bitcoin'
import * as core from '@wagmi/core'
export { core }
import { mainnet } from '@reown/appkit/networks'
import { networks } from './networks'
import { projectId, walletStore } from './store'

const wagmiAdapter = new WalletNetworkAdapter({ projectId, networks, ssr: false })
export const config = wagmiAdapter.wagmiConfig
export const appKit = createAppKit({
  adapters: [wagmiAdapter, new BitcoinAdapter({ projectId })],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: 'BLOCK / Transaction terminal',
    description: 'Your assets. Your execution. A multichain transaction workspace.',
    url: window.location.origin,
    icons: [`${window.location.origin}/mark.svg`],
  },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#c8f36a', '--w3m-border-radius-master': '2px', '--w3m-font-family': 'Inter, sans-serif' },
  features: { analytics: false, email: false, socials: false, swaps: true, onramp: false },
})
let initialized = false
export function initialize() {
  if (initialized) return
  initialized = true
  let namespace: 'eip155' | 'bip122' = 'eip155'
  const syncAccounts = () => {
    const evmAccount = core.getAccount(config)
    walletStore.update({
      evmAddress: evmAccount.address ?? appKit.getAccount('eip155')?.address,
      bitcoinAddress: appKit.getAccount('bip122')?.address,
      // The provider's chain takes precedence over AppKit's last selected EVM chain.
      chainId: namespace === 'eip155' ? evmAccount.chainId ?? appKit.getChainId() : appKit.getChainId(),
      namespace,
    })
  }
  appKit.subscribeAccount(syncAccounts, 'eip155')
  appKit.subscribeAccount(syncAccounts, 'bip122')
  appKit.subscribeNetwork(state => {
    if (state.caipNetwork?.chainNamespace === 'eip155' || state.caipNetwork?.chainNamespace === 'bip122') namespace = state.caipNetwork.chainNamespace
    syncAccounts()
  })
  core.watchAccount(config, { onChange: syncAccounts })
  syncAccounts()
  void core.reconnect(config).catch(() => {})
}
