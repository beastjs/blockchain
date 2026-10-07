import { useEffect, useSyncExternalStore } from 'octane'
import { quoteStore, quoteRefreshDelay } from '../lib/markets'
import type { FiatCurrency } from '../lib/market-catalog'

export const fetchQuotes = quoteStore.fetchQuotes
export function useCrypto(currency: FiatCurrency = 'USD') {
  const quote = useSyncExternalStore(quoteStore.subscribe, quoteStore.getSnapshot)
  useEffect(() => {
    let active = true
    let running = false
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      if (active) timer = setTimeout(() => { void refresh() }, quoteRefreshDelay(quoteStore.getSnapshot(), currency))
    }
    const refresh = async () => {
      if (!active || running) return
      running = true
      clearTimeout(timer)
      try { if (!document.hidden) await fetchQuotes(currency) }
      finally { running = false; schedule() }
    }
    const onVisibility = () => { if (!document.hidden) void refresh() }
    const snapshot = quoteStore.getSnapshot()
    if (snapshot.currency !== currency || snapshot.updated === undefined || quoteRefreshDelay(snapshot, currency) < 60_000) void refresh()
    else schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [currency])
  return { ...quote, refetch: () => fetchQuotes(currency), getRate: () => quoteStore.getRate(currency), getBySymbol: (symbol: string) => quoteStore.getBySymbol(symbol, currency) }
}
