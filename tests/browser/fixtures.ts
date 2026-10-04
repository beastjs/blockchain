import { test as base, expect } from '@playwright/test'
import { MARKET_ASSETS } from '../../src/lib/market-catalog'

export const test = base.extend<{ publicServices: void }>({
  publicServices: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/appkit/v1/config**', route => route.fulfill({ json: { features: [] } }))
    await page.route('**/getWallets?**', route => route.fulfill({ json: { data: [], count: 0 } }))
    await page.route('**/api/market?**', route => {
      const currency = new URL(route.request().url()).searchParams.get('currency') ?? 'USD'
      const rate = ({ USD: 1, PHP: 56, EUR: 0.9, GBP: 0.8, JPY: 150, AUD: 1.5, CAD: 1.4, SGD: 1.3 } as Record<string, number>)[currency]
      const updated = Date.now()
      return route.fulfill({ json: {
        currency, rate, updated, fxUpdated: updated,
        data: Object.entries(MARKET_ASSETS).map(([symbol, asset]) => ({ symbol, marketId: asset.id, price: ({ ETH: 2500, BTC: 80000, POL: 0.4, USDC: 1, USDT: 1 } as Record<string, number>)[symbol], change: symbol === 'ETH' || symbol === 'BTC' ? 1 : 0, updated })),
      } })
    })
    await use()
    expect(errors, 'Unexpected browser errors').toEqual([])
  }, { auto: true }],
})
export { expect }
