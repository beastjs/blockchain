import { describe, expect, mock, test } from 'bun:test'
import { createMarketHandler, createMarketService, MARKET_CACHE_TTL } from '../../server/market'
import { MARKET_ASSETS, QUOTE_MAX_AGE } from '../../src/lib/market-catalog'

const NOW = 1_800_000_000_000
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ status: { error_code: '0' }, data }), { status })
const quotes = (time = NOW) => Object.entries(MARKET_ASSETS).map(([symbol, asset]) => ({ id: asset.id, symbol, quote: [{ id: 2781, symbol: 'USD', price: symbol === 'ETH' ? 2500 : 1, percent_change_24h: 2, last_updated: new Date(time).toISOString() }] }))
const fx = (time = NOW) => ({ id: 2781, symbol: 'USD', quote: { PHP: { price: 56, last_updated: new Date(time).toISOString() } } })
const fakeFetch = () => mock(async (url: string, _options: RequestInit) => response(url.includes('/cryptocurrency/') ? quotes() : fx()))
const options = (fetcher = fakeFetch()) => ({ apiKey: () => 'server-secret', now: () => NOW, fetcher })

describe('CoinMarketCap server integration', () => {
  test('uses numeric asset IDs, authenticated v3 crypto quotes, and v2 fiat conversions', async () => {
    const fetcher = fakeFetch()
    const service = createMarketService(options(fetcher))
    const result = await service.getSnapshot('PHP')
    expect(result.data.map(quote => quote.marketId).sort((a, b) => a - b)).toEqual([1, 825, 1027, 3408, 28321])
    expect(result.rate).toBe(56)
    expect(result.fxUpdated).toBe(NOW)
    const crypto = new URL(fetcher.mock.calls.find(([url]) => url.includes('/cryptocurrency/'))![0])
    expect(crypto.pathname).toBe('/v3/cryptocurrency/quotes/latest')
    expect(crypto.searchParams.get('convert')).toBe('USD')
    expect(crypto.searchParams.get('id')!.split(',')).toHaveLength(5)
    const fiat = new URL(fetcher.mock.calls.find(([url]) => url.includes('/tools/'))![0])
    expect(fiat.pathname).toBe('/v2/tools/price-conversion')
    expect(fiat.searchParams.get('id')).toBe('2781')
    expect(fiat.searchParams.get('convert')).toBe('PHP')
    expect(fetcher.mock.calls[0]![1].headers).toEqual({ 'X-CMC_PRO_API_KEY': 'server-secret' })
    expect(JSON.stringify(result)).not.toContain('server-secret')
  })
  test('deduplicates concurrent callers and shares crypto cache across fiat selections', async () => {
    const fetcher = fakeFetch()
    const service = createMarketService(options(fetcher))
    await Promise.all([service.getSnapshot('PHP'), service.getSnapshot('PHP'), service.getSnapshot('USD')])
    expect(fetcher).toHaveBeenCalledTimes(2)
    await service.getSnapshot('USD')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  test('refreshes expired data and recovers from provider rate limits after the retry delay', async () => {
    let time = NOW
    let limited = false
    const fetcher = mock(async () => response(quotes(time), limited ? 429 : 200))
    const service = createMarketService({ apiKey: () => 'key', now: () => time, fetcher })
    await service.getSnapshot('USD')
    time += MARKET_CACHE_TTL
    limited = true
    await expect(service.getSnapshot('USD')).rejects.toThrow('rate limit')
    await expect(service.getSnapshot('USD')).rejects.toThrow('rate limit')
    expect(fetcher).toHaveBeenCalledTimes(2)
    time += 15_000
    limited = false
    expect((await service.getSnapshot('USD')).data[0]!.updated).toBe(time)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  test('an FX outage preserves USD crypto quotes while exposing no fiat conversion', async () => {
    const service = createMarketService({ ...options(), fetcher: async url => response(url.includes('/cryptocurrency/') ? quotes() : {}, url.includes('/cryptocurrency/') ? 200 : 403) })
    const result = await service.getSnapshot('PHP')
    expect(result.data).toHaveLength(5)
    expect(result.rate).toBeUndefined()
    expect(result.fxError).toContain('API plan')
    expect((await service.getSnapshot('USD')).rate).toBe(1)
  })
  test('accepts the v2 fiat array response as well as the ID-based object response', async () => {
    const service = createMarketService({ ...options(), fetcher: async url => response(url.includes('/cryptocurrency/') ? quotes() : [fx()]) })
    expect((await service.getSnapshot('PHP')).rate).toBe(56)
  })
  test('stale, malformed and ambiguous symbols cannot create a valid quote', async () => {
    const payload = [
      { id: 6297, symbol: 'POL', quote: [{ id: 2781, symbol: 'USD', price: 999, last_updated: new Date(NOW).toISOString() }] },
      ...quotes(NOW - QUOTE_MAX_AGE - 1),
    ]
    const service = createMarketService({ ...options(), fetcher: async () => response(payload) })
    await expect(service.getSnapshot('USD')).rejects.toThrow('fresh crypto')
  })
  test('missing credentials produce an actionable server response without fetching upstream', async () => {
    const fetcher = fakeFetch()
    const handle = createMarketHandler(createMarketService({ ...options(fetcher), apiKey: () => undefined }))
    const result = await handle(new Request('http://localhost/api/market'))
    expect(result.status).toBe(503)
    expect(await result.text()).toContain('CMC_API_KEY')
    expect(fetcher).not.toHaveBeenCalled()
  })
  test.each([401, 403, 500])('upstream errors are sanitized: %i', async status => {
    const handle = createMarketHandler(createMarketService({ ...options(), fetcher: async () => new Response('server-secret and internal details', { status }) }))
    const result = await handle(new Request('http://localhost/api/market'))
    expect(result.status).toBeGreaterThanOrEqual(500)
    expect(await result.text()).not.toContain('server-secret')
  })
  test('transport errors cannot leak headers or credentials', async () => {
    const handle = createMarketHandler(createMarketService({ ...options(), fetcher: async () => { throw new Error('server-secret') } }))
    expect(await (await handle(new Request('http://localhost/api/market'))).text()).not.toContain('server-secret')
  })
  test.each(['/api/market?currency=BAD', '/api/market?id=123', '/api/market?currency=USD&url=https://example.com'])('rejects unbounded proxy queries: %s', async path => {
    const fetcher = fakeFetch()
    const handle = createMarketHandler(createMarketService(options(fetcher)))
    expect((await handle(new Request(`http://localhost${path}`))).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  test('allows only GET on the fixed endpoint', async () => {
    const fetcher = fakeFetch()
    const handle = createMarketHandler(createMarketService(options(fetcher)))
    expect((await handle(new Request('http://localhost/api/market', { method: 'POST' }))).status).toBe(405)
    expect((await handle(new Request('http://localhost/api/unknown'))).status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
