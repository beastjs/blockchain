import { useEffect, useState } from 'octane'
import type { NetworkKey } from '../lib/appkit/networks'
import type { WalletTimeline } from '../lib/wallet-timeline'

export function useWalletTimeline(network: NetworkKey, address?: string) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refetch = () => setRefreshKey(value => value + 1)
  const key = `${network}:${address?.toLowerCase() ?? ''}`
  const [state, setState] = useState<{ key: string; data?: WalletTimeline; error?: string; loading: boolean }>({ key: '', loading: false })
  useEffect(() => {
    if (!address || network === 'bitcoin') return
    let active = true, running = false
    const controller = new AbortController()
    const refresh = async () => {
      if (running || !active) return
      running = true
      setState(previous => ({ key, data: previous.key === key ? previous.data : undefined, loading: true }))
      try {
        const response = await fetch(`/api/timeline?${new URLSearchParams({ network, address })}`, { signal: controller.signal })
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Restart the server to enable the wallet history endpoint.')
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Wallet history is unavailable.')
        if (!Array.isArray(payload.events) || payload.address !== address.toLowerCase() || payload.network !== network) throw new Error('Wallet history returned an invalid response.')
        if (active) setState({ key, data: payload, loading: false })
      } catch (error) {
        if (active) setState(previous => ({ key, data: previous.key === key ? previous.data : undefined, error: error instanceof Error ? error.message : 'Wallet history is unavailable.', loading: false }))
      } finally { running = false }
    }
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 60_000)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [key, refreshKey])
  return state.key === key ? { ...state, refetch } : { key, refetch, loading: Boolean(address) && network !== 'bitcoin', data: undefined, error: undefined }
}
