import { getNetwork, isNetworkKey, type NetworkKey } from './networks'
import { getTransactionExplorerUrl } from '../explorer'
import { parseAmount } from '../amounts'
import { getTokens } from './tokens'
import { isAddress, zeroAddress } from 'viem'

export interface TransactionRecord {
  id: string
  hash: string
  network: NetworkKey
  from: string
  to: string
  symbol: string
  amount: string
  created: number
  status: 'pending' | 'confirmed' | 'reverted' | 'cancelled'
}
const STORAGE_KEY = 'block.transactions.v1'
function isRecord(value: unknown): value is TransactionRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as TransactionRecord
  if (!['id', 'hash', 'network', 'from', 'to', 'symbol', 'amount'].every(key => typeof (item as unknown as Record<string, unknown>)[key] === 'string')) return false
  if (!item.id || !isNetworkKey(item.network) || !['pending', 'confirmed', 'reverted', 'cancelled'].includes(item.status)) return false
  if (!Number.isSafeInteger(item.created) || item.created < 0 || item.created > 8_640_000_000_000_000 || getTransactionExplorerUrl(item.network, item.hash) === null) return false
  if (item.network !== 'bitcoin' && (!isAddress(item.from) || !isAddress(item.to) || item.to.toLowerCase() === zeroAddress)) return false
  if (!item.from || !item.to) return false
  const token = getTokens(item.network).find(token => token.symbol === item.symbol)
  if (!token) return false
  try { parseAmount(item.amount, token.decimals); return true } catch { return false }
}

export function createJournal(storage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}) {
  const listeners = new Set<() => void>()
  function load(): readonly TransactionRecord[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]')
      if (!Array.isArray(parsed)) return []
      const ids = new Set<string>()
      const hashes = new Set<string>()
      return Object.freeze(parsed.filter(isRecord).filter(item => {
        const hash = `${item.network}:${item.hash.toLowerCase()}`
        if (ids.has(item.id) || hashes.has(hash)) return false
        ids.add(item.id); hashes.add(hash); return true
      }).slice(0, 100).map(item => Object.freeze({ ...item })))
    } catch { return [] }
  }
  let records = load()
  const publish = () => {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(records)) } catch { /* Session history remains available if storage is full. */ }
    listeners.forEach(listener => listener())
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => records,
    reload: () => { records = load(); listeners.forEach(listener => listener()) },
    add: (record: TransactionRecord) => {
      if (!isRecord(record)) throw new Error('Invalid transaction record.')
      if (records.some(item => item.id === record.id || (item.network === record.network && item.hash.toLowerCase() === record.hash.toLowerCase()))) return
      records = Object.freeze([Object.freeze({ ...record }), ...records].slice(0, 100)); publish()
    },
    update: (id: string, patch: Partial<Pick<TransactionRecord, 'hash' | 'status'>>) => {
      if (!records.some(record => record.id === id)) return
      records = Object.freeze(records.map(record => {
        if (record.id !== id) return record
        const next = { ...record, ...patch }
        if (!isRecord(next)) throw new Error('Invalid transaction update.')
        return Object.freeze(next)
      })); publish()
    },
  }
}
export const journal = createJournal()
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) journal.reload()
})
export function exportTransactions(items: readonly TransactionRecord[]) {
  const data = items.map(item => ({ ...item, networkName: getNetwork(item.network).name, explorer: getTransactionExplorerUrl(item.network, item.hash) }))
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `block-transactions-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
