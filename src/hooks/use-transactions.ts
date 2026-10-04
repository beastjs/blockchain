import { useEffect, useSyncExternalStore } from 'octane'
import { getRuntime } from '../lib/appkit/store'
import { journal } from '../lib/appkit/journal'
import { getNetwork } from '../lib/appkit/networks'
import { getBitcoinStatus } from '../lib/appkit/bitcoin'

export function useTransactions() {
  const records = useSyncExternalStore(journal.subscribe, journal.getSnapshot)
  const pending = records.filter(record => record.status === 'pending')
  const pendingKey = pending.map(record => `${record.id}:${record.network}:${record.hash}`).join(',')
  useEffect(() => {
    let active = true
    let running = false
    const check = async () => {
      if (running || !pending.length) return
      running = true
      await Promise.all(pending.map(async record => {
        try {
          if (record.network === 'bitcoin') {
            const status = await getBitcoinStatus(record.hash)
            if (active && status.confirmed) journal.update(record.id, { status: 'confirmed' })
          } else {
            const { config, core } = await getRuntime()
            const receipt = await core.getTransactionReceipt(config, { chainId: Number(getNetwork(record.network).chain.id), hash: record.hash as `0x${string}` })
            if (active && receipt) journal.update(record.id, { status: receipt.status === 'success' ? 'confirmed' : 'reverted' })
          }
        } catch { /* A missing receipt or RPC outage keeps broadcast transactions pending. */ }
      }))
      running = false
    }
    void check()
    const timer = setInterval(() => { if (!document.hidden) void check() }, 12_000)
    return () => { active = false; clearInterval(timer) }
  }, [pendingKey])
  return records
}
