import { useState } from 'octane'
import { isFiatCurrency, type FiatCurrency } from '../lib/market-catalog'

export function useCurrency() {
  const [currency, setCurrency] = useState<FiatCurrency>(() => {
    try { const value = localStorage.getItem('block.currency'); return isFiatCurrency(value) ? value : 'USD' } catch { return 'USD' }
  })
  const update = (value: string) => {
    if (!isFiatCurrency(value)) return
    try { localStorage.setItem('block.currency', value) } catch { /* Keep the session preference. */ }
    setCurrency(value)
  }
  return [currency, update] as const
}
