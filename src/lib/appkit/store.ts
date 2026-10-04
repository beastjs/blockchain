import type { NetworkKey } from './networks'

export interface WalletState {
  configured: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  evmAddress?: string
  bitcoinAddress?: string
  chainId?: number | string
  namespace?: 'eip155' | 'bip122'
  error?: string
}
export const projectId = process.env.PUBLIC_REOWN_PROJECT_ID ?? ''
let state: WalletState = { configured: Boolean(projectId), status: 'idle' }
const listeners = new Set<() => void>()
export const walletStore = {
  getSnapshot: () => state,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  update: (patch: Partial<WalletState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) },
}
let runtimePromise: Promise<typeof import('./runtime')> | undefined
export function getRuntime() {
  if (!projectId) return Promise.reject(new Error('Set PUBLIC_REOWN_PROJECT_ID in .env.local to enable wallet connections.'))
  if (!runtimePromise) {
    walletStore.update({ status: 'loading', error: undefined })
    runtimePromise = import('./runtime').then(module => {
      module.initialize()
      walletStore.update({ status: 'ready' })
      return module
    }).catch(error => {
      runtimePromise = undefined
      walletStore.update({ status: 'error', error: error instanceof Error ? error.message : 'Wallet initialization failed.' })
      throw error
    })
  }
  return runtimePromise
}
export async function openWallet(network: NetworkKey, view: 'Connect' | 'Account' | 'Swap' = 'Connect') {
  const runtime = await getRuntime()
  const namespace = network === 'bitcoin' ? 'bip122' : 'eip155'
  return runtime.appKit.open({ view, namespace })
}
