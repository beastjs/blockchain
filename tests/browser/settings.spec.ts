import { test, expect } from './fixtures'
const relay = `0x${'1'.repeat(40)}`
const destination = `0x${'2'.repeat(40)}`
const hash = `0x${'a'.repeat(64)}`

test('settings persist and pending transfers react to successful and reverted receipts', async ({ page }) => {
  let status: string | null = null
  await page.route('**/*', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    let body: { method?: string; id: number }
    try { body = route.request().postDataJSON() } catch { return route.fallback() }
    let result: unknown
    switch (body.method) {
      case 'eth_blockNumber': result = '0x10'; break
      case 'eth_getLogs': result = []; break
      case 'eth_getBlockByNumber': result = { number: '0x10', hash: `0x${'b'.repeat(64)}`, parentHash: `0x${'c'.repeat(64)}`, timestamp: '0x1', transactions: [], gasLimit: '0x100', gasUsed: '0x0', size: '0x100', difficulty: '0x0', extraData: '0x', miner: relay, nonce: '0x0000000000000000' }; break
      case 'eth_getTransactionByHash': result = { hash, from: relay, to: destination, value: '0xde0b6b3a7640000', input: '0x', nonce: '0x0', gas: '0x5208', gasPrice: '0x1', blockHash: null, blockNumber: null, transactionIndex: null, type: '0x0', v: '0x1b', r: '0x1', s: '0x1' }; break
      case 'eth_getTransactionReceipt': result = status ? { transactionHash: hash, from: relay, to: destination, blockHash: `0x${'b'.repeat(64)}`, blockNumber: '0x10', transactionIndex: '0x0', cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', logs: [], logsBloom: `0x${'0'.repeat(512)}`, status, type: '0x0', contractAddress: null } : null; break
      default: return route.fallback()
    }
    return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result } })
  })
  await page.goto('/settings')
  await page.getByLabel('Relay address', { exact: true }).fill(relay)
  await page.getByLabel('Destination address', { exact: true }).fill(relay)
  await page.getByRole('button', { name: 'Save & start monitoring' }).click()
  await expect(page.getByRole('status')).toContainText('Use different')
  await page.getByLabel('Destination address', { exact: true }).fill(destination)
  await page.getByRole('button', { name: 'Save & start monitoring' }).click()
  await expect(page.getByText(/Last checked/)).toBeVisible()
  await page.getByLabel('Watch a pending transaction by hash').fill(hash)
  await page.getByRole('button', { name: 'Watch transaction', exact: true }).click()
  await expect(page.locator('.monitor-status')).toHaveText('Processing')
  await expect(page.locator('.monitor-transfer')).toContainText('Relay → Destination')
  status = '0x1'
  await expect(page.locator('.monitor-status')).toHaveText('Completed', { timeout: 10000 })
  await page.getByRole('button', { name: 'Stop monitoring', exact: true }).click()
  await page.getByRole('button', { name: 'Save & start monitoring' }).click()
  status = '0x0'
  await page.getByLabel('Watch a pending transaction by hash').fill(hash)
  await page.getByRole('button', { name: 'Watch transaction', exact: true }).click()
  await expect(page.locator('.monitor-status')).toHaveText('Failed', { timeout: 10000 })
  await page.reload()
  await expect(page.getByLabel('Relay address', { exact: true })).toHaveValue(relay)
  await expect(page.getByLabel('Destination address', { exact: true })).toHaveValue(destination)
  await expect(page.getByRole('button', { name: 'Save & start monitoring' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('discovers incoming native and ERC-20 transfers and recovers from an RPC outage', async ({ page }) => {
  let outage = true
  const blockHash = `0x${'b'.repeat(64)}`
  const external = `0x${'3'.repeat(40)}`
  const tokenHash = `0x${'d'.repeat(64)}`
  await page.route('**/*', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    let body: { method?: string; id: number }
    try { body = route.request().postDataJSON() } catch { return route.fallback() }
    if (!body.method?.startsWith('eth_')) return route.fallback()
    if (outage) return route.fulfill({ status: 503, body: 'RPC temporarily unavailable' })
    let result: unknown
    switch (body.method) {
      case 'eth_blockNumber': result = '0x10'; break
      case 'eth_getBlockByNumber': result = { number: '0x10', hash: blockHash, parentHash: blockHash, timestamp: '0x1', gasLimit: '0x100', gasUsed: '0x0', size: '0x100', difficulty: '0x0', extraData: '0x', miner: relay, nonce: '0x0000000000000000', transactions: [{ hash, from: external, to: relay, value: '0xde0b6b3a7640000', input: '0x', nonce: '0x0', gas: '0x5208', gasPrice: '0x1', blockHash, blockNumber: '0x10', transactionIndex: '0x0', type: '0x0', v: '0x1b', r: '0x1', s: '0x1' }] }; break
      case 'eth_getLogs': result = [{ address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', transactionHash: tokenHash, blockHash, blockNumber: '0x10', transactionIndex: '0x1', logIndex: '0x0', removed: false, data: `0x${(2000000).toString(16).padStart(64, '0')}`, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', `0x${relay.slice(2).padStart(64, '0')}`, `0x${destination.slice(2).padStart(64, '0')}`] }]; break
      case 'eth_getTransactionReceipt': result = { transactionHash: hash, from: external, to: relay, blockHash, blockNumber: '0x10', transactionIndex: '0x0', cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', logs: [], logsBloom: `0x${'0'.repeat(512)}`, status: '0x1', type: '0x0', contractAddress: null }; break
      default: return route.fallback()
    }
    return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result } })
  })
  await page.goto('/settings')
  await page.getByLabel('Relay address', { exact: true }).fill(relay)
  await page.getByLabel('Destination address', { exact: true }).fill(destination)
  await page.getByRole('button', { name: 'Save & start monitoring' }).click()
  await expect(page.getByRole('alert')).toContainText('Monitor unavailable')
  outage = false
  await expect(page.locator('.monitor-transfer')).toHaveCount(2, { timeout: 10000 })
  await expect(page.locator('.monitor-feed')).toContainText('1 ETH')
  await expect(page.locator('.monitor-feed')).toContainText('2 USDC')
  await expect(page.locator('.monitor-feed')).toContainText('Relay → Destination')
  await expect(page.locator('.monitor-status').filter({ hasText: 'Completed' })).toHaveCount(2)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Save & start monitoring' })).toBeVisible()
})
