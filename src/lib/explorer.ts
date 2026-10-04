import { getNetwork, type NetworkKey } from './appkit/networks'

/** Ported from ftsb, with native Bitcoin hashes kept intact. */
export function getTransactionExplorerUrl(network: NetworkKey, hash: string): string | null {
  const valid = network === 'bitcoin' ? /^[a-f\d]{64}$/i.test(hash) : /^0x[a-f\d]{64}$/i.test(hash)
  if (!valid) return null
  return `${getNetwork(network).chain.blockExplorers!.default.url.replace(/\/$/, '')}/tx/${hash}`
}
export function getAddressExplorerUrl(network: NetworkKey, address: string) {
  return `${getNetwork(network).chain.blockExplorers!.default.url.replace(/\/$/, '')}/address/${encodeURIComponent(address)}`
}
