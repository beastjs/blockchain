import { createPublicClient, decodeFunctionData, formatUnits, http, isAddress, parseAbiItem, zeroAddress, type Hash } from 'viem'
import { getNetwork, isNetworkKey, type NetworkKey } from './appkit/networks'
import { ERC20_ABI, getTokens } from './appkit/tokens'

export interface RelaySettings { network: NetworkKey; relay: string; destination: string }
export interface MonitorTransfer { id: string; hash: Hash; from: string; to: string; amount: string; symbol: string; status: 'processing' | 'completed' | 'failed'; observed: number }
export const RELAY_SETTINGS_KEY = 'block.relay-settings.v1'
export const defaultRelaySettings: RelaySettings = { network: 'sepolia', relay: '', destination: '' }
export function validateRelaySettings(value: RelaySettings) {
  if (!isNetworkKey(value.network) || value.network === 'bitcoin') throw new Error('Choose a supported EVM network.')
  value = { ...value, relay: value.relay.trim(), destination: value.destination.trim() }
  for (const key of ['relay', 'destination'] as const) {
    if (!isAddress(value[key]) || value[key].toLowerCase() === zeroAddress) throw new Error(`Enter a valid ${key} address, including its checksum.`)
  }
  if (value.relay.toLowerCase() === value.destination.toLowerCase()) throw new Error('Use different relay and destination addresses.')
  return { ...value, relay: value.relay.trim(), destination: value.destination.trim() }
}
export function readRelaySettings(): RelaySettings {
  try {
    const value = JSON.parse(localStorage.getItem(RELAY_SETTINGS_KEY) ?? 'null')
    return validateRelaySettings(value)
  } catch { return { ...defaultRelaySettings } }
}

/** Read-only chain observations. No signing, forwarding, or application processing is inferred. */
export function createRelayMonitor(settings: RelaySettings) {
  const network = getNetwork(settings.network)
  const client = createPublicClient({ transport: http(network.chain.rpcUrls.default.http[0], { timeout: 10_000, retryCount: 0 }) })
  const tokens = getTokens(settings.network)
  const addresses = [settings.relay.toLowerCase(), settings.destination.toLowerCase()]
  const relevant = (from: string, to: string) => addresses.includes(from.toLowerCase()) || addresses.includes(to.toLowerCase())
  let cursor: bigint | undefined
  const rows = new Map<string, MonitorTransfer>()
  const add = (hash: Hash, from: string, to: string, value: bigint, symbol: string, decimals: number, suffix = '') => {
    if (!relevant(from, to) || value === 0n) return
    if (suffix === ':token' && [...rows.values()].some(row => row.hash === hash && row.symbol === symbol && row.to.toLowerCase() === to.toLowerCase() && row.amount === formatUnits(value, decimals))) return
    const id = `${hash}${suffix}`
    if (!rows.has(id)) rows.set(id, { id, hash, from, to, amount: formatUnits(value, decimals), symbol, status: 'processing', observed: Date.now() })
  }
  return {
    async track(hash: Hash) {
      const tx = await client.getTransaction({ hash })
      if (!tx.to) throw new Error('Contract creation is outside this transfer monitor.')
      const token = tokens.find(token => token.address?.toLowerCase() === tx.to!.toLowerCase())
      if (token) {
        const decoded = decodeFunctionData({ abi: ERC20_ABI, data: tx.input })
        if (decoded.functionName !== 'transfer') throw new Error('Only native and supported ERC-20 transfers can be tracked by hash.')
        const [to, value] = decoded.args
        if (!relevant(tx.from, to)) throw new Error('This transaction does not involve the configured addresses.')
        add(hash, tx.from, to, value, token.symbol, token.decimals, ':token')
      } else {
        if (!relevant(tx.from, tx.to) || tx.value === 0n) throw new Error('This transaction does not transfer native funds through the configured addresses.')
        add(hash, tx.from, tx.to, tx.value, network.nativeSymbol, network.chain.nativeCurrency.decimals)
      }
      return [...rows.values()].reverse().map(row => ({ ...row }))
    },
    async poll() {
      const head = await client.getBlockNumber({ cacheTime: 0 })
      if (cursor === undefined) cursor = head - 1n
      // A bounded batch catches up after RPC outages without skipping blocks.
      const end = cursor + 10n < head ? cursor + 10n : head
      for (let number = cursor + 1n; number <= end; number++) {
        const block = await client.getBlock({ blockNumber: number, includeTransactions: true })
        const contracts = tokens.flatMap(token => token.address ? [token.address] : [])
        const logs = contracts.length ? await client.getLogs({ address: contracts, event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'), fromBlock: number, toBlock: number }) : []
        for (const tx of block.transactions) if (tx.to) add(tx.hash, tx.from, tx.to, tx.value, network.nativeSymbol, network.chain.nativeCurrency.decimals)
        for (const log of logs) {
          const token = tokens.find(token => token.address?.toLowerCase() === log.address.toLowerCase())!
          if (log.transactionHash && log.args.from && log.args.to && log.args.value !== undefined) {
            if (relevant(log.args.from, log.args.to)) rows.delete(`${log.transactionHash}:token`)
            add(log.transactionHash, log.args.from, log.args.to, log.args.value, token.symbol, token.decimals, `:${log.logIndex}`)
          }
        }
        cursor = number
      }
      const pending = [...rows.values()].filter(row => row.status === 'processing')
      let receiptError: unknown
      for (const hash of new Set(pending.map(row => row.hash))) {
        try {
          const receipt = await client.getTransactionReceipt({ hash })
          for (const row of pending.filter(row => row.hash === hash)) row.status = receipt.status === 'success' ? 'completed' : 'failed'
        } catch (error) {
          if (!(error instanceof Error && error.name === 'TransactionReceiptNotFoundError')) receiptError = error
        }
      }
      if (receiptError) throw receiptError
      while (rows.size > 100) rows.delete(rows.keys().next().value!)
      return { rows: [...rows.values()].reverse().map(row => ({ ...row })), block: cursor!.toString(), updated: Date.now() }
    },
  }
}
