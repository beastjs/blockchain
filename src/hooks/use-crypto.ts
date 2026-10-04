import { useEffect, useSyncExternalStore } from 'octane'
import { quoteStore } from '../lib/markets'
import type { FiatCurrency } from '../lib/market-catalog'

export const fetchQuotes = quoteStore.fetchQuotes
export function useCrypto(currency: FiatCurrency = 'USD') {
  const quote = useSyncExternalStore(quoteStore.subscribe, quoteStore.getSnapshot)
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void fetchQuotes(currency) }
    const snapshot = quoteStore.getSnapshot()
    if (snapshot.currency !== currency || snapshot.updated === undefined || Date.now() - snapshot.updated > 60_000) refresh()
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [currency])
  return { ...quote, refetch: () => fetchQuotes(currency), getRate: () => quoteStore.getRate(currency), getBySymbol: (symbol: string) => quoteStore.getBySymbol(symbol, currency) }
}
