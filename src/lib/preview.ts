/** Deliberately illustrative data. Never used by transaction execution. */
export const PREVIEW_ASSETS = [
  { symbol: 'ETH', name: 'Ethereum', network: 'ethereum' as const, amount: '4.825', price: 2846.32, change: 3.42, color: '#a7b8fc', spark: '0,21 9,19 18,22 27,10 36,14 45,8 54,11 63,3 72,6' },
  { symbol: 'USDC', name: 'USD Coin', network: 'ethereum' as const, amount: '6824.5', price: 1, change: 0.01, color: '#8ebdf9', spark: '0,13 9,13 18,12 27,14 36,13 45,12 54,13 63,12 72,13' },
  { symbol: 'BTC', name: 'Bitcoin', network: 'bitcoin' as const, amount: '0.0524', price: 78645.8, change: 1.87, color: '#e8ad64', spark: '0,23 9,18 18,20 27,13 36,15 45,6 54,10 63,5 72,2' },
  { symbol: 'POL', name: 'Polygon', network: 'polygon' as const, amount: '482.6', price: 0.38, change: -1.24, color: '#b6a1ef', spark: '0,5 9,10 18,8 27,11 36,9 45,16 54,13 63,21 72,20' },
]
export const previewTotal = PREVIEW_ASSETS.reduce((sum, asset) => sum + Number(asset.amount) * asset.price, 0)
