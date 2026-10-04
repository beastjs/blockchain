import { useRef, useState } from 'octane'
import { broadcastTransfer, prepareTransfer, type PreparedTransfer, type TransferInput } from '../lib/appkit/transactions'
import { journal } from '../lib/appkit/journal'
import { errorMessage } from '../lib/amounts'

/** Replaces ftsb's send/payment state with an exact-amount, reviewed transaction. */
export function useSend() {
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'review' | 'signing' | 'broadcast'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const lock = useRef(false)
  const review = async (input: TransferInput) => {
    if (lock.current) return
    lock.current = true
    setError(null); setHash(null); setPrepared(null); setPhase('preparing')
    try { setPrepared(await prepareTransfer(input)); setPhase('review') }
    catch (error) { setError(errorMessage(error)); setPhase('idle') }
    finally { lock.current = false }
  }
  const confirm = async () => {
    if (!prepared || lock.current || phase !== 'review') return
    lock.current = true
    setPhase('signing'); setError(null)
    try {
      const hash = await broadcastTransfer(prepared)
      setHash(hash)
      journal.add({ id: `${prepared.network}:${hash}`, hash, network: prepared.network, from: prepared.from, to: prepared.to, symbol: prepared.symbol, amount: prepared.amount, created: Date.now(), status: 'pending' })
      setPhase('broadcast')
    } catch (error) { setError(errorMessage(error)); setPhase('idle'); setPrepared(null) }
    finally { lock.current = false }
  }
  const reset = () => { if (lock.current) return; setPrepared(null); setError(null); setHash(null); setPhase('idle') }
  return { prepared, phase, error, hash, review, confirm, reset, busy: phase === 'preparing' || phase === 'signing' }
}
