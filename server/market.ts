import { MARKET_ASSETS, QUOTE_MAX_AGE, isFiatCurrency, type CryptoQuote, type FiatCurrency, type MarketSnapshot } from '../src/lib/market-catalog'

export const MARKET_CACHE_TTL = 60_000
const RETRY_DELAY = 15_000
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
class MarketError extends Error {
  constructor(message: string, readonly status = 502) { super(message) }
}

export function createMarketService({
  apiKey = () => process.env.CMC_API_KEY,
  fetcher = (url: string, options: RequestInit) => fetch(url, options),
  now = () => Date.now(),
} = {}) {
  type Entry = { value?: unknown; fetchedAt?: number; inFlight?: Promise<unknown>; failure?: { time: number; error: Error } }
  const cache = new Map<string, Entry>()
  const timestamp = (value: unknown) => {
    const time = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isFinite(time) && time <= now() + 30_000 && now() - time <= QUOTE_MAX_AGE ? time : undefined
  }
  async function request(path: string, params: Record<string, string>) {
    const key = apiKey()
    if (!key) throw new MarketError('Set CMC_API_KEY on the server to enable CoinMarketCap prices.', 503)
    const url = new URL(path, 'https://pro-api.coinmarketcap.com')
    url.search = new URLSearchParams(params).toString()
    let response: Response
    try { response = await fetcher(url.toString(), { headers: { 'X-CMC_PRO_API_KEY': key }, signal: AbortSignal.timeout(10_000) }) }
    catch { throw new MarketError('CoinMarketCap is temporarily unreachable.') }
    if (!response.ok) {
      if (response.status === 429) throw new MarketError('CoinMarketCap rate limit reached. Try again shortly.', 503)
      if (response.status === 401 || response.status === 403) throw new MarketError('CoinMarketCap rejected the server key or API plan.', 503)
      throw new MarketError('CoinMarketCap prices are temporarily unavailable.')
    }
    let payload: unknown
    try { payload = await response.json() } catch { throw new MarketError('CoinMarketCap returned an invalid response.') }
    const body = object(payload)
    if (!body || Number(object(body.status)?.error_code) !== 0) throw new MarketError('CoinMarketCap returned an invalid response.')
    return body.data
  }
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const entry = cache.get(key) ?? {}
    cache.set(key, entry)
    if (entry.inFlight) return entry.inFlight as Promise<T>
    if (entry.failure && now() - entry.failure.time >= 0 && now() - entry.failure.time < RETRY_DELAY) return Promise.reject(entry.failure.error)
    if (entry.fetchedAt !== undefined && now() - entry.fetchedAt >= 0 && now() - entry.fetchedAt < MARKET_CACHE_TTL) return Promise.resolve(entry.value as T)
    entry.inFlight = Promise.resolve().then(load).then(value => {
      entry.value = value
      entry.fetchedAt = now()
      entry.failure = undefined
      return value
    }).catch(error => {
      entry.failure = { time: now(), error }
      throw error
    }).finally(() => { entry.inFlight = undefined })
    return entry.inFlight as Promise<T>
  }
  const cryptoQuotes = () => cached('quotes', async () => {
    const data = await request('/v3/cryptocurrency/quotes/latest', { id: Object.values(MARKET_ASSETS).map(asset => asset.id).join(','), convert: 'USD' })
    if (!Array.isArray(data)) throw new MarketError('CoinMarketCap returned invalid crypto quotes.')
    const quotes: CryptoQuote[] = Object.entries(MARKET_ASSETS).flatMap(([symbol, asset]) => {
      const coin = data.map(object).find(coin => coin?.id === asset.id && coin.symbol === symbol)
      const quote = Array.isArray(coin?.quote) ? coin.quote.map(object).find(quote => quote?.id === 2781 && quote.symbol === 'USD') : undefined
      const updated = timestamp(quote?.last_updated)
      if (!positive(quote?.price) || updated === undefined) return []
      const change = quote.percent_change_24h
      return [{ symbol, marketId: asset.id, price: quote.price, updated, change: typeof change === 'number' && Number.isFinite(change) ? change : undefined }]
    })
    if (!quotes.length) throw new MarketError('CoinMarketCap returned no fresh crypto quotes.')
    return quotes
  })
  const fiatRate = (currency: FiatCurrency) => currency === 'USD'
    ? Promise.resolve({ rate: 1, fxUpdated: now() })
    : cached(`fx:${currency}`, async () => {
      // One conversion per call also works on plans that limit convert bundling.
      const data = await request('/v2/tools/price-conversion', { amount: '1', id: '2781', convert: currency })
      const usd = (Array.isArray(data) ? data : [data]).map(object).find(item => item?.id === 2781)
      const quote = object(object(usd?.quote)?.[currency])
      const fxUpdated = timestamp(quote?.last_updated)
      if (!positive(quote?.price) || fxUpdated === undefined) throw new MarketError('CoinMarketCap returned no fresh fiat exchange rate.')
      return { rate: quote.price, fxUpdated }
    })
  return {
    async getSnapshot(currency: FiatCurrency): Promise<MarketSnapshot> {
      const [crypto, fiat] = await Promise.allSettled([cryptoQuotes(), fiatRate(currency)])
      if (crypto.status === 'rejected') throw crypto.reason
      return {
        data: crypto.value, currency, updated: now(),
        ...(fiat.status === 'fulfilled' ? fiat.value : { fxError: fiat.reason instanceof Error ? fiat.reason.message : 'Fiat rates are unavailable.' }),
      }
    },
  }
}

export function createMarketHandler(service = createMarketService()) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'cache-control': 'no-store', 'content-type': 'application/json' }
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    const url = new URL(request.url)
    if (url.pathname !== '/api/market') return reply({ error: 'Not found.' }, 404)
    if (request.method !== 'GET') return reply({ error: 'Use GET for market prices.' }, 405)
    const currency = url.searchParams.get('currency') ?? 'USD'
    if (!isFiatCurrency(currency) || [...url.searchParams.keys()].some(key => key !== 'currency')) return reply({ error: 'Unsupported market currency or query.' }, 400)
    try { return reply(await service.getSnapshot(currency)) }
    catch (error) { return reply({ error: error instanceof MarketError ? error.message : 'Market prices are temporarily unavailable.' }, error instanceof MarketError ? error.status : 502) }
  }
}
