import { useEffect, useSyncExternalStore } from 'octane'
import { getRuntime, walletStore } from '../lib/appkit/store'

/** Native Octane replacement for the ftsb React provider/account hooks. */
export function useAppKit() {
  const state = useSyncExternalStore(walletStore.subscribe, walletStore.getSnapshot)
  useEffect(() => {
    if (!state.configured) return
    const timer = setTimeout(() => { void getRuntime().catch(() => {}) }, 700)
    return () => clearTimeout(timer)
  }, [state.configured])
  return state
}
