import { describe, expect, mock, test } from 'bun:test'
import { createTimelineHandler, createTimelineService } from '../../server/timeline'
import { timelinePath, timelinePoints } from '../../src/lib/wallet-timeline'

const ADDRESS = `0x${'1'.repeat(40)}`
const OTHER = `0x${'2'.repeat(40)}`
const NOW = 1_800_000_000_000
const hash = (index: number) => `0x${index.toString(16).padStart(64, '0')}`
const row = (index: number, from = ADDRESS, to = OTHER, timestamp = NOW - 1000) => ({ hash: hash(index), from, to, timeStamp: String(timestamp / 1000), isError: '0' })
const response = (rows: unknown[]) => Response.json({ status: '1', message: 'OK', result: rows })
const options = { apiKey: () => 'private-test-key', now: () => NOW, wait: async () => {} }

describe('wallet timeline explorer integration', () => {
  test('combines normal and ERC-20 transactions by hash and keeps self transfers in both directions', async () => {
    const fetcher = mock(async (url: string) => response(new URL(url).searchParams.get('action') === 'txlist'
      ? [row(1), row(2, OTHER, ADDRESS), row(3, ADDRESS, ADDRESS)]
      : [row(1), row(4, OTHER, ADDRESS)]))
    const service = createTimelineService({ ...options, fetcher })
    const [first, second] = await Promise.all([service.getSnapshot(ADDRESS, 'sepolia'), service.getSnapshot(ADDRESS, 'sepolia')])
    expect(first).toBe(second)
    expect(first.events).toHaveLength(4)
    expect(first.events.filter(event => event.sent)).toHaveLength(2)
    expect(first.events.filter(event => event.received)).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const url = new URL(fetcher.mock.calls[0]![0])
    expect(url.origin + url.pathname).toBe('https://api.etherscan.io/v2/api')
    expect(url.searchParams.get('chainid')).toBe('11155111')
    expect(JSON.stringify(first)).not.toContain('private-test-key')
  })
  test('paginates descending history until the requested year is covered', async () => {
    const fetcher = mock(async (url: string) => {
      const params = new URL(url).searchParams
      return response(params.get('action') === 'tokentx' ? [] : params.get('page') === '1' ? Array.from({ length: 1000 }, (_, i) => row(i)) : [row(1001, ADDRESS, OTHER, NOW - 366 * 86_400_000)])
    })
    const data = await createTimelineService({ ...options, fetcher }).getSnapshot(ADDRESS, 'ethereum')
    expect(data.events).toHaveLength(1000)
    expect(data.partial).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  test('reports bounded history as partial rather than implying a complete timeline', async () => {
    const data = await createTimelineService({ ...options, fetcher: async () => response(Array.from({ length: 1000 }, (_, i) => row(i))) }).getSnapshot(ADDRESS, 'ethereum')
    expect(data.partial).toBe(true)
  })
  test('accepts empty histories but rejects provider errors and malformed records', async () => {
    const empty = await createTimelineService({ ...options, fetcher: async () => Response.json({ status: '0', message: 'No transactions found', result: [] }) }).getSnapshot(ADDRESS, 'ethereum')
    expect(empty.events).toEqual([])
    const handle = createTimelineHandler(createTimelineService({ ...options, fetcher: async () => Response.json({ status: '0', result: 'Invalid API Key private-test-key' }) }))
    const result = await handle(new Request(`http://localhost/api/timeline?address=${ADDRESS}&network=ethereum`))
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('private-test-key')
    await expect(createTimelineService({ ...options, fetcher: async () => response([{ ...row(1), timeStamp: 'bad' }]) }).getSnapshot(ADDRESS, 'ethereum')).rejects.toThrow('invalid transaction')
  })
  test('rejects unsupported networks, invalid addresses, unknown parameters and missing keys', async () => {
    const fetcher = mock(async () => response([]))
    const handle = createTimelineHandler(createTimelineService({ ...options, fetcher }))
    for (const query of [`address=${ADDRESS}&network=bitcoin`, 'address=bad&network=ethereum', `address=${ADDRESS}&network=ethereum&url=bad`]) {
      expect((await handle(new Request(`http://localhost/api/timeline?${query}`))).status).toBe(400)
    }
    expect(fetcher).not.toHaveBeenCalled()
    await expect(createTimelineService({ ...options, apiKey: () => undefined }).getSnapshot(ADDRESS, 'ethereum')).rejects.toThrow('ETHERSCAN_API_KEY_TOKEN')
  })
})

test('cumulative chart samples exclude events outside the period and curves stay monotone', () => {
  const points = timelinePoints([
    { hash: hash(1), timestamp: NOW - 2 * 86_400_000, sent: true, received: false },
    { hash: hash(2), timestamp: NOW - 1000, sent: false, received: true },
    { hash: hash(3), timestamp: NOW + 1000, sent: true, received: false },
  ], '1D', NOW)
  expect(points[0]!.total).toBe(0)
  expect(points.at(-1)).toMatchObject({ total: 1, sent: 0, received: 1 })
  expect(timelinePath(points, 'total', 1)).toContain('C')
  expect(timelinePath(points, 'total', 1)).not.toContain('NaN')
  for (let i = 1; i < points.length; i++) expect(points[i]!.total).toBeGreaterThanOrEqual(points[i - 1]!.total)
})
