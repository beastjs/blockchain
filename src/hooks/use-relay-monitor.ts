import { useEffect, useRef, useState } from 'octane'
import { createRelayMonitor, type MonitorTransfer, type RelaySettings } from '../lib/relay-monitor'
import { journal } from '../lib/appkit/journal'
import { errorMessage } from '../lib/amounts'
import type { Hash } from 'viem'

export function useRelayMonitor(settings: RelaySettings | null) {
  const [rows, setRows] = useState<MonitorTransfer[]>([])
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(0)
  const [block, setBlock] = useState('')
  const session = useRef<{ monitor: ReturnType<typeof createRelayMonitor>; active: boolean } | null>(null)
  useEffect(() => {
    setRows([]); setError(''); setUpdated(0); setBlock('')
    if (!settings) return
    const current = { monitor: createRelayMonitor(settings), active: true }
    session.current = current
    let running = false
    const check = async () => {
      if (running) return
      running = true
      try {
        for (const record of journal.getSnapshot().filter(record => record.network === settings.network && record.status === 'pending' && [record.from.toLowerCase(), record.to.toLowerCase()].some(address => address === settings.relay.toLowerCase() || address === settings.destination.toLowerCase()))) {
          try { await current.monitor.track(record.hash as Hash) } catch { /* Hash may not have propagated yet. */ }
        }
        const result = await current.monitor.poll()
        if (current.active) { setRows(result.rows); setUpdated(result.updated); setBlock(result.block); setError('') }
      } catch (error) { if (current.active) setError(errorMessage(error)) }
      finally { running = false }
    }
    void check()
    const timer = setInterval(() => { void check() }, 3000)
    const unsubscribe = journal.subscribe(() => { void check() })
    return () => { current.active = false; clearInterval(timer); unsubscribe(); if (session.current === current) session.current = null }
  }, [settings])
  const track = async (hash: string) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) throw new Error('Enter a valid EVM transaction hash.')
    const current = session.current
    if (!current) throw new Error('Start monitoring first.')
    const result = await current.monitor.track(hash.trim() as Hash)
    if (current.active) setRows(result)
  }
  return { rows, error, updated, block, track }
}
