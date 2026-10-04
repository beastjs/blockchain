import { formatUnits, parseUnits } from 'viem'

/** Exact decimal parsing: viem's rounding must never silently alter a transfer. */
export function parseAmount(amount: string, decimals: number): bigint {
  const normalized = amount.trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || normalized.length > 100) throw new Error('Enter a valid positive amount.')
  const fraction = normalized.split('.')[1] ?? ''
  if (fraction.length > decimals) throw new Error(`This asset supports up to ${decimals} decimal places.`)
  const value = parseUnits(normalized, decimals)
  if (value <= 0n) throw new Error('Amount must be greater than zero.')
  if (value >= 2n ** 256n) throw new Error('Amount exceeds the supported range.')
  return value
}

/** Round upward at the smallest unit, keeping currency arithmetic in integers. */
export function fiatToToken(amount: string, price: number, decimals: number, currency = 'USD'): string {
  if (!Number.isFinite(price) || price <= 0) throw new Error('A current market price is required.')
  const minorDecimals = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const fiatUnits = parseAmount(amount, minorDecimals)
  const priceUnits = parseUnits(price.toFixed(8), 8)
  if (priceUnits === 0n) throw new Error('Market price is below supported precision.')
  const numerator = fiatUnits * 10n ** BigInt(decimals) * 10n ** 8n
  const denominator = priceUnits * 10n ** BigInt(minorDecimals)
  return formatUnits((numerator + denominator - 1n) / denominator, decimals)
}
export const usdToToken = (amount: string, price: number, decimals: number) => fiatToToken(amount, price, decimals)
export const truncateAddress = (address: string, start = 6, end = 4) => `${address.slice(0, start)}…${address.slice(-end)}`
export const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
export const compactBalance = (value: string) => Number(value) > 0 && Number(value) < 0.000001 ? '<0.000001' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(value))
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'shortMessage' in error && typeof error.shortMessage === 'string') return error.shortMessage
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
