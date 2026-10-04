import { afterEach, describe, expect, mock, test } from 'bun:test'
import { getBitcoinBalance, getBitcoinStatus, requestBitcoinTransfer } from '../../src/lib/appkit/bitcoin'

const HASH = 'a'.repeat(64)
const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function response(payload: unknown, status = 200) {
  globalThis.fetch = mock(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch
}
describe('Bitcoin provider and API boundaries', () => {
  test('sends satoshis as an exact string through one direct request', async () => {
    const sendTransfer = mock(async (_params: { recipient: string; amount: string }) => HASH)
    const fallback = mock(async () => HASH)
    await expect(requestBitcoinTransfer({ sendTransfer, request: fallback as never }, ADDRESS, 900719925474099n)).resolves.toBe(HASH)
    expect(sendTransfer.mock.calls).toEqual([[{ recipient: ADDRESS, amount: '900719925474099' }]])
    expect(fallback).not.toHaveBeenCalled()
  })
  test('never retries via a second provider method after rejection', async () => {
    const sendTransfer = mock(async () => { throw new Error('User rejected') })
    const fallback = mock(async () => HASH)
    await expect(requestBitcoinTransfer({ sendTransfer, request: fallback as never }, ADDRESS, 1n)).rejects.toThrow('User rejected')
    expect(sendTransfer).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })
  test('accepts a request-provider txid object and rejects ambiguous wallet responses', async () => {
    const request = mock(async (_params: { method: string; params: object }) => ({ txid: HASH }))
    await expect(requestBitcoinTransfer({ request: request as never }, ADDRESS, 1n)).resolves.toBe(HASH)
    expect(request.mock.calls).toEqual([[{ method: 'sendTransfer', params: { recipient: ADDRESS, amount: '1' } }]])
    await expect(requestBitcoinTransfer({ sendTransfer: async () => `0x${HASH}` }, ADDRESS, 1n)).rejects.toThrow('Check your wallet before trying again')
    await expect(requestBitcoinTransfer({}, ADDRESS, 1n)).rejects.toThrow('does not support transfers')
    await expect(requestBitcoinTransfer({}, ADDRESS, 0n)).rejects.toThrow('valid Bitcoin amount')
  })
  test('includes pending incoming and outgoing satoshis in the balance', async () => {
    response({ chain_stats: { funded_txo_sum: 100_000_000, spent_txo_sum: 20_000_000 }, mempool_stats: { funded_txo_sum: 10_000, spent_txo_sum: 30_000 } })
    await expect(getBitcoinBalance(ADDRESS)).resolves.toBe(79_980_000n)
  })
  test.each([null, {}, { chain_stats: { funded_txo_sum: '1', spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } }, { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 1 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } }])('rejects malformed or negative API balances: %j', async payload => {
    response(payload)
    await expect(getBitcoinBalance(ADDRESS)).rejects.toThrow('invalid response')
  })
  test('surfaces HTTP failures and validates confirmation status', async () => {
    response({}, 503)
    await expect(getBitcoinBalance(ADDRESS)).rejects.toThrow('unavailable')
    response({ confirmed: 'yes' })
    await expect(getBitcoinStatus(HASH)).rejects.toThrow('invalid response')
    response({ confirmed: false })
    await expect(getBitcoinStatus(HASH)).resolves.toEqual({ confirmed: false })
    response({ confirmed: true, block_height: 900000 })
    await expect(getBitcoinStatus(HASH)).resolves.toMatchObject({ confirmed: true })
    await expect(getBitcoinStatus('../bad')).rejects.toThrow('Invalid Bitcoin transaction ID')
  })
})
