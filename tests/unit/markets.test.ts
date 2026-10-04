import { describe, expect, mock, test } from 'bun:test'
import { createQuoteStore, QUOTE_MAX_AGE } from '../../src/lib/markets'
import type { FiatCurrency } from '../../src/lib/market-catalog'

const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
const snapshot = (updated = 1000, currency: FiatCurrency = 'USD', rate = 1) => ({ currency, rate, fxUpdated: updated, updated, data: [{ symbol: 'ETH', marketId: 1027, price: 2500, change: 2, updated }] })
describe('CoinMarketCap client quotes', () => {
  test('deduplicates requests and only contacts the private server endpoint', async () => {
    const fetcher = mock(async (_url: string, _options: RequestInit) => response(snapshot()))
    const store = createQuoteStore({ fetcher, now: () => 1000 })
    const first = store.fetchQuotes()
    expect(store.fetchQuotes()).toBe(first)
    await first
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0]).toBe('/api/market?currency=USD')
    expect(fetcher.mock.calls[0]![1].headers).toBeUndefined()
    expect(store.getBySymbol('ETH')).toMatchObject({ marketId: 1027, price: 2500, change: 2 })
  })
  test('converts USD crypto prices using the current selected fiat rate', async () => {
    const store = createQuoteStore({ fetcher: async () => response(snapshot(1000, 'PHP', 56)), now: () => 1000 })
    await store.fetchQuotes('PHP')
    expect(store.getBySymbol('ETH', 'PHP')?.price).toBe(140000)
    expect(store.getBySymbol('ETH', 'USD')).toBeUndefined()
    expect(store.getRate()).toBe(56)
  })
  test('rejects stale or rewound-clock quotes at lookup time', async () => {
    let time = 1000
    const store = createQuoteStore({ fetcher: async () => response(snapshot()), now: () => time })
    await store.fetchQuotes()
    time += QUOTE_MAX_AGE + 1
    expect(store.getBySymbol('ETH')).toBeUndefined()
    time = 999
    expect(store.getBySymbol('ETH')).toBeUndefined()
  })
  test('rejects stale upstream timestamps even when the server just fetched them', async () => {
    const payload = snapshot(QUOTE_MAX_AGE + 1001)
    payload.data[0]!.updated = 1000
    const store = createQuoteStore({ fetcher: async () => response(payload), now: () => QUOTE_MAX_AGE + 1001 })
    await store.fetchQuotes()
    expect(store.getBySymbol('ETH')).toBeUndefined()
  })
  test('excludes malformed prices and unknown market IDs without inventing changes', async () => {
    const payload = { ...snapshot(), data: [
      { symbol: 'ETH', marketId: 1027, price: 2500, change: 'bad', updated: 1000 },
      { symbol: 'BTC', marketId: 1, price: '80000', updated: 1000 },
      { symbol: 'USDT', marketId: 825, price: -1, updated: 1000 },
      { symbol: 'POL', marketId: 6297, price: 5, updated: 1000 },
    ] }
    const store = createQuoteStore({ fetcher: async () => response(payload), now: () => 1000 })
    await store.fetchQuotes()
    expect(store.getSnapshot().data).toHaveLength(1)
    expect(store.getBySymbol('ETH')?.change).toBeUndefined()
    expect(store.getBySymbol('POL')).toBeUndefined()
  })
  test('disables quotes on an outage and recovers on retry', async () => {
    const fetcher = mock(async () => response(snapshot()))
    const store = createQuoteStore({ fetcher, now: () => 1000 })
    await store.fetchQuotes()
    fetcher.mockResolvedValueOnce(response({ error: 'Market prices are temporarily unavailable.' }, 503))
    await store.fetchQuotes()
    expect(store.getBySymbol('ETH')).toBeUndefined()
    expect(store.getSnapshot().error).toContain('unavailable')
    await store.fetchQuotes()
    expect(store.getBySymbol('ETH')?.price).toBe(2500)
    expect(store.getSnapshot().error).toBeUndefined()
  })
  test.each([0, -1, '56', undefined])('never substitutes USD for a missing fiat rate: %j', async rate => {
    const store = createQuoteStore({ fetcher: async () => response({ ...snapshot(1000, 'PHP'), rate }), now: () => 1000 })
    await store.fetchQuotes('PHP')
    expect(store.getSnapshot().data).toHaveLength(1)
    expect(store.getSnapshot().fxError).toBeDefined()
    expect(store.getBySymbol('ETH')).toBeUndefined()
  })
  test.each([null, [], {}, { ...snapshot(), data: [] }, { ...snapshot(), currency: 'EUR' }])('surfaces invalid payloads: %j', async payload => {
    const store = createQuoteStore({ fetcher: async () => response(payload), now: () => 1000 })
    await store.fetchQuotes()
    expect(store.getSnapshot().error).toBeDefined()
    expect(store.getBySymbol('ETH')).toBeUndefined()
  })
  test('a delayed previous currency request cannot replace the current selection', async () => {
    let finishUSD!: (response: Response) => void
    const store = createQuoteStore({ now: () => 1000, fetcher: async url => url.endsWith('USD') ? new Promise<Response>(resolve => { finishUSD = resolve }) : response(snapshot(1000, 'PHP', 56)) })
    const first = store.fetchQuotes('USD')
    await Promise.resolve()
    await store.fetchQuotes('PHP')
    finishUSD(response(snapshot()))
    await first
    expect(store.getSnapshot().currency).toBe('PHP')
    expect(store.getBySymbol('ETH')?.price).toBe(140000)
  })
  test('releases the shared request after a synchronous fetch failure', async () => {
    const fetcher = mock((_url: string, _options: RequestInit): Promise<Response> => { throw new Error('offline') })
    const store = createQuoteStore({ fetcher, now: () => 1000 })
    await store.fetchQuotes()
    fetcher.mockImplementation(async () => response(snapshot()))
    await store.fetchQuotes()
    expect(store.getBySymbol('ETH')?.price).toBe(2500)
  })
})
