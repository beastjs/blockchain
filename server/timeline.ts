import { isAddress } from 'viem'
import { getNetwork, isNetworkKey } from '../src/lib/appkit/networks'
import { periodDuration, type TimelineEvent, type WalletTimeline } from '../src/lib/wallet-timeline'

const PAGE_SIZE = 1000
const MAX_PAGES = 3
class TimelineError extends Error { constructor(message: string, readonly status = 502) { super(message) } }

export function createTimelineService({
  apiKey = () => process.env.ETHERSCAN_API_KEY_TOKEN ?? process.env.ETHERSCAN_API_TOKEN,
  fetcher = (url: string, options: RequestInit) => fetch(url, options),
  now = () => Date.now(),
  wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
} = {}) {
  const cache = new Map<string, { updated: number; promise: Promise<WalletTimeline> }>()
  let queue: Promise<unknown> = Promise.resolve()
  const request = (params: Record<string, string>) => {
    const operation = queue.then(async () => {
      // Pace all wallet requests against the shared key, including pagination.
      await wait(1050)
      const url = new URL('https://api.etherscan.io/v2/api')
      url.search = new URLSearchParams({ ...params, apikey: apiKey() ?? '' }).toString()
      let body: { status?: string; message?: string; result?: unknown }
      try {
        const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error('upstream')
        body = await response.json()
      } catch { throw new TimelineError('Etherscan is temporarily unreachable. Try again shortly.') }
      if (body?.status === '0' && body.message === 'No transactions found' && Array.isArray(body.result) && body.result.length === 0) return []
      if (body?.status !== '1' || !Array.isArray(body.result)) {
        const reason = typeof body?.result === 'string' ? body.result : ''
        if (/rate limit|too many requests/i.test(reason)) throw new TimelineError('Etherscan rate limit reached. Try again shortly.', 503)
        if (/api key/i.test(reason)) throw new TimelineError('Etherscan rejected the server API key.', 503)
        if (/chain|plan|paid|subscription/i.test(reason)) throw new TimelineError('This network is unavailable on the configured Etherscan API plan.', 503)
        throw new TimelineError('Etherscan returned an invalid history response.')
      }
      return body.result as Record<string, unknown>[]
    })
    queue = operation.catch(() => {})
    return operation
  }
  return {
    getSnapshot(address: string, network: string): Promise<WalletTimeline> {
      if (!isAddress(address) || !isNetworkKey(network) || getNetwork(network).namespace !== 'eip155') return Promise.reject(new TimelineError('Choose a supported EVM wallet and network.', 400))
      if (!apiKey()) return Promise.reject(new TimelineError('Set ETHERSCAN_API_KEY_TOKEN on the server to load wallet history.', 503))
      address = address.toLowerCase()
      const key = `${network}:${address}`
      const cached = cache.get(key)
      if (cached && now() - cached.updated >= 0 && now() - cached.updated < 60_000) return cached.promise
      const updated = now(), since = updated - periodDuration('1Y')
      const promise = (async () => {
        const events = new Map<string, TimelineEvent>()
        let partial = false
        for (const action of ['txlist', 'tokentx']) {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const rows = await request({ chainid: String(getNetwork(network).chain.id), module: 'account', action, address, startblock: '0', endblock: '999999999', page: String(page), offset: String(PAGE_SIZE), sort: 'desc' })
            let reachedStart = false
            for (const row of rows) {
              const timestamp = Number(row.timeStamp) * 1000
              if (typeof row.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(row.hash) || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > updated + 30_000 || typeof row.from !== 'string' || typeof row.to !== 'string') throw new TimelineError('Etherscan returned invalid transaction data.')
              if (timestamp < since) { reachedStart = true; continue }
              const from = row.from.toLowerCase(), to = row.to.toLowerCase()
              if (from !== address && to !== address) continue
              const hash = row.hash.toLowerCase()
              const previous = events.get(hash)
              events.set(hash, { hash, timestamp, received: Boolean(previous?.received || (to === address && row.isError !== '1')), sent: Boolean(previous?.sent || from === address) })
            }
            if (reachedStart || rows.length < PAGE_SIZE) break
            if (page === MAX_PAGES) partial = true
          }
        }
        return { address, network, events: [...events.values()].sort((a, b) => a.timestamp - b.timestamp), updated, since, partial }
      })()
      cache.delete(key)
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      cache.set(key, { updated, promise })
      void promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key) })
      return promise
    },
  }
}

export function createTimelineHandler(service = createTimelineService()) {
  return async (request: Request) => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    const url = new URL(request.url)
    if (url.pathname !== '/api/timeline') return reply({ error: 'Not found.' }, 404)
    if (request.method !== 'GET') return reply({ error: 'Use GET for wallet history.' }, 405)
    if ([...url.searchParams.keys()].some(key => !['address', 'network'].includes(key))) return reply({ error: 'Unsupported history query.' }, 400)
    try { return reply(await service.getSnapshot(url.searchParams.get('address') ?? '', url.searchParams.get('network') ?? '')) }
    catch (error) { return reply({ error: error instanceof TimelineError ? error.message : 'Wallet history is temporarily unavailable.' }, error instanceof TimelineError ? error.status : 502) }
  }
}
