import { getRuntime } from './store'

const MEMPOOL_API = 'https://mempool.space/api'
const requestSignal = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000)
export async function getBitcoinBalance(address: string, signal?: AbortSignal): Promise<bigint> {
  const response = await fetch(`${MEMPOOL_API}/address/${encodeURIComponent(address)}`, { signal: requestSignal(signal) })
  if (!response.ok) throw new Error('Bitcoin balance is temporarily unavailable.')
  const data = await response.json() as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } }
  const counts = [data?.chain_stats?.funded_txo_sum, data?.chain_stats?.spent_txo_sum, data?.mempool_stats?.funded_txo_sum, data?.mempool_stats?.spent_txo_sum]
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Bitcoin balance returned an invalid response.')
  const balance = BigInt(counts[0]!) - BigInt(counts[1]!) + BigInt(counts[2]!) - BigInt(counts[3]!)
  if (balance < 0n) throw new Error('Bitcoin balance returned an invalid response.')
  return balance
}
export interface BitcoinProvider {
  sendTransfer?: (params: { recipient: string; amount: string }) => Promise<string>
  request?: <T>(params: { method: string; params: object }) => Promise<T>
}
/** One request only. A rejected transfer must never trigger a second signing request. */
export async function sendBitcoin(recipient: string, amount: bigint, beforeSign?: () => void): Promise<string> {
  const { appKit } = await getRuntime()
  const provider = appKit.getProvider<BitcoinProvider>('bip122')
  if (!provider) throw new Error('Connect a Bitcoin wallet first.')
  beforeSign?.()
  return requestBitcoinTransfer(provider, recipient, amount)
}
export async function requestBitcoinTransfer(provider: BitcoinProvider, recipient: string, amount: bigint): Promise<string> {
  if (amount <= 0n || amount > 2_100_000_000_000_000n) throw new Error('Enter a valid Bitcoin amount.')
  const params = { recipient, amount: amount.toString() }
  let response: unknown
  if (provider.sendTransfer) response = await provider.sendTransfer(params)
  else if (provider.request) response = await provider.request({ method: 'sendTransfer', params })
  else throw new Error('This Bitcoin wallet does not support transfers.')
  const hash = typeof response === 'string' ? response : response && typeof response === 'object' && 'txid' in response ? response.txid : undefined
  if (typeof hash !== 'string' || !/^[a-f\d]{64}$/i.test(hash)) throw new Error('Wallet returned an invalid transaction ID. Check your wallet before trying again.')
  return hash
}
export async function getBitcoinStatus(hash: string) {
  if (!/^[a-f\d]{64}$/i.test(hash)) throw new Error('Invalid Bitcoin transaction ID.')
  const response = await fetch(`${MEMPOOL_API}/tx/${hash}/status`, { signal: requestSignal() })
  if (!response.ok) throw new Error('Bitcoin confirmation status is unavailable.')
  const data = await response.json() as { confirmed: boolean; block_height?: number }
  if (typeof data?.confirmed !== 'boolean') throw new Error('Bitcoin status returned an invalid response.')
  return data
}
