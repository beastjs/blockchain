import { MARKET_ASSETS, QUOTE_MAX_AGE, type CryptoQuote, type FiatCurrency, type MarketSnapshot } from './market-catalog'
export { QUOTE_MAX_AGE } from './market-catalog'
export type { CryptoQuote } from './market-catalog'
export interface QuoteState extends Partial<Omit<MarketSnapshot, 'data' | 'currency'>> { data: CryptoQuote[]; currency: FiatCurrency; loading: boolean; error?: string }
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

export function createQuoteStore({ fetcher = (url: string, options: RequestInit) => fetch(url, options), now = () => Date.now() } = {}) {
  let state: QuoteState = { data: [], currency: 'USD', loading: true }
  let requestedCurrency: FiatCurrency = 'USD'
  const inFlight = new Map<FiatCurrency, Promise<void>>()
  const listeners = new Set<() => void>()
  const publish = (next: QuoteState) => { state = next; listeners.forEach(listener => listener()) }
  const fresh = (updated?: number) => updated !== undefined && Number.isFinite(updated) && now() - updated >= 0 && now() - updated <= QUOTE_MAX_AGE
  const fetchQuotes = (currency: FiatCurrency = 'USD') => {
    requestedCurrency = currency
    publish(state.currency === currency ? { ...state, loading: true } : { data: [], currency, loading: true })
    const existing = inFlight.get(currency)
    if (existing) return existing
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await fetcher(`/api/market?currency=${currency}`, { signal: AbortSignal.timeout(15_000) })
        const payload: unknown = await response.json()
        if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Market prices are temporarily unavailable.')
        if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) throw new Error('Market prices returned an invalid response.')
        const snapshot = payload as MarketSnapshot
        if (snapshot.currency !== currency || !fresh(snapshot.updated)) throw new Error('Market prices returned an outdated response.')
        const data = Object.entries(MARKET_ASSETS).flatMap(([symbol, asset]) => {
          const quote = snapshot.data.find(item => item?.marketId === asset.id && item.symbol === symbol)
          if (!quote || !positive(quote.price) || !fresh(quote.updated)) return []
          return [{ symbol, marketId: asset.id, price: quote.price, updated: quote.updated, change: typeof quote.change === 'number' && Number.isFinite(quote.change) ? quote.change : undefined }]
        })
        if (!data.length) throw new Error('Market prices returned no fresh quotes.')
        const rate = positive(snapshot.rate) && fresh(snapshot.fxUpdated) && (currency !== 'USD' || snapshot.rate === 1) ? snapshot.rate : undefined
        if (requestedCurrency === currency) publish({ data, currency, rate, fxUpdated: snapshot.fxUpdated, fxError: rate === undefined ? snapshot.fxError ?? 'Fiat exchange rates are temporarily unavailable.' : undefined, loading: false, updated: snapshot.updated })
      } catch (error) {
        if (requestedCurrency === currency) publish({ ...state, loading: false, error: error instanceof Error ? error.message : 'Unable to fetch prices.' })
      } finally { inFlight.delete(currency) }
    })
    inFlight.set(currency, promise)
    return promise
  }
  const getRate = (currency: FiatCurrency = state.currency) => state.currency === currency && !state.error && fresh(state.updated) && fresh(state.fxUpdated) ? state.rate : undefined
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    fetchQuotes,
    getRate,
    getBySymbol: (symbol: string, currency: FiatCurrency = state.currency) => {
      const rate = getRate(currency)
      const quote = state.data.find(quote => quote.symbol === symbol)
      return rate !== undefined && quote && fresh(quote.updated) && positive(quote.price * rate) ? { ...quote, price: quote.price * rate } : undefined
    },
  }
}
export const quoteStore = createQuoteStore()
