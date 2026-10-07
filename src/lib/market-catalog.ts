// CoinMarketCap IDs distinguish assets that share the same ticker.
export const MARKET_ASSETS = {
  ETH: { id: 1027, name: 'Ethereum' },
  POL: { id: 28321, name: 'Polygon' },
  BTC: { id: 1, name: 'Bitcoin' },
  USDC: { id: 3408, name: 'USD Coin' },
  USDT: { id: 825, name: 'Tether' },
} as const
export const FIAT_CURRENCIES = ['USD', 'PHP', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD'] as const
export type FiatCurrency = typeof FIAT_CURRENCIES[number]
export const isFiatCurrency = (value: unknown): value is FiatCurrency => FIAT_CURRENCIES.some(currency => currency === value)
export const QUOTE_MAX_AGE = 120_000
export const QUOTE_REFRESH_MARGIN = 15_000
export interface CryptoQuote { symbol: string; marketId: number; price: number; change?: number; updated: number }
export interface MarketSnapshot {
  data: CryptoQuote[]
  currency: FiatCurrency
  rate?: number // Units of the selected fiat per USD; crypto prices are denominated in USD.
  fxUpdated?: number
  fxError?: string
  updated: number
}
