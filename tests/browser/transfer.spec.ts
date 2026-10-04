import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { readFile } from 'node:fs/promises'
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi } from 'viem'

const ACCOUNT = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
const RECIPIENT = '0x1111111111111111111111111111111111111111'
const HASH = `0x${'a'.repeat(64)}`
const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`

interface WalletOptions { reject?: boolean; rejectSwitch?: boolean; initialChainId?: string; nativeBalance?: bigint; tokenBalance?: bigint; decimals?: number; transferSuccess?: boolean; receiptStatus?: '0x0' | '0x1'; receiptPending?: boolean }
async function mockWallet(page: Page, options: WalletOptions | boolean = {}) {
  const { reject = false, rejectSwitch = false, initialChainId = '0x1', nativeBalance = 10n ** 19n, tokenBalance = 10_000_000_000n, decimals = 6, transferSuccess = true, receiptStatus = '0x1', receiptPending = false } = typeof options === 'boolean' ? { reject: options } : options
  await page.addInitScript(({ account, hash, reject, rejectSwitch, initialChainId }) => {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
    let chainId = initialChainId
    let connected = false
    const provider = {
      isMetaMask: true,
      isConnected: () => connected,
      on: (name: string, handler: (...args: unknown[]) => void) => { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(handler) },
      removeListener: (name: string, handler: (...args: unknown[]) => void) => handlers.get(name)?.delete(handler),
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') { connected = true; return method === 'eth_requestAccounts' ? [account] : [{ parentCapability: 'eth_accounts' }] }
        if (method === 'eth_accounts') return connected ? [account] : []
        if (method === 'eth_chainId') return chainId
        if (method === 'wallet_switchEthereumChain') {
          if (rejectSwitch) throw Object.assign(new Error('User rejected the network switch.'), { code: 4001 })
          chainId = (params![0] as { chainId: string }).chainId; handlers.get('chainChanged')?.forEach(handler => handler(chainId)); return null
        }
        if (method === 'wallet_getPermissions') return connected ? [{ parentCapability: 'eth_accounts' }] : []
        if (method === 'eth_sendTransaction') {
          (window as unknown as { submitted: unknown[] }).submitted.push({ ...(params![0] as object), activeChainId: chainId })
          if (reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
          return hash
        }
        if (method === 'wallet_getCapabilities') return {}
        if (method === 'eth_getBalance') return '0x8ac7230489e80000'
        return null
      },
    }
    Object.defineProperty(window, 'ethereum', { value: provider })
    ;(window as unknown as { submitted: unknown[] }).submitted = []
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: '350670db-19fa-4704-a166-e52e178b59d2', name: 'Mock Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.block.wallet' }, provider } }))
    window.addEventListener('eip6963:requestProvider', announce)
    announce()
  }, { account: ACCOUNT, hash: HASH, reject, rejectSwitch, initialChainId })
  await page.route('**/*', async route => {
    const request = route.request()
    if (request.url().includes('/appkit/v1/config')) return route.fulfill({ json: { features: [] } });
    if (request.method() !== 'POST') return route.fallback()
    let payload: { jsonrpc: string; id: number; method: string; params: unknown[] } | { jsonrpc: string; id: number; method: string; params: unknown[] }[]
    try { payload = request.postDataJSON() } catch { return route.fallback() }
    if (!payload || (!Array.isArray(payload) && !payload.method)) return route.fallback()
    const respond = (rpc: { id: number; method: string; params: unknown[] }) => {
      let result: unknown = null
      if (rpc.method === 'eth_getBalance') result = `0x${nativeBalance.toString(16)}`
      if (rpc.method === 'eth_chainId') result = '0x1'
      if (rpc.method === 'eth_blockNumber') result = '0x100'
      if (rpc.method === 'eth_gasPrice') result = '0x77359400'
      if (rpc.method === 'eth_maxPriorityFeePerGas') result = '0x3b9aca00'
      if (rpc.method === 'eth_estimateGas') result = '0x5208'
      if (rpc.method === 'eth_getCode') result = '0x'
      if (rpc.method === 'eth_getBlockByNumber') result = { number: '0x100', baseFeePerGas: '0x3b9aca00', gasUsed: '0x0', gasLimit: '0x1c9c380', timestamp: '0x65000000', transactions: [], hash: `0x${'b'.repeat(64)}`, parentHash: `0x${'c'.repeat(64)}`, difficulty: '0x0', extraData: '0x', logsBloom: `0x${'0'.repeat(512)}`, miner: RECIPIENT, mixHash: `0x${'0'.repeat(64)}`, nonce: '0x0000000000000000', receiptsRoot: `0x${'0'.repeat(64)}`, sha3Uncles: `0x${'0'.repeat(64)}`, size: '0x0', stateRoot: `0x${'0'.repeat(64)}`, totalDifficulty: '0x0', transactionsRoot: `0x${'0'.repeat(64)}`, uncles: [] }
      if (rpc.method === 'eth_call') {
        const data = (rpc.params[0] as { data: string }).data
        const single = (call: string, target?: string) => call.startsWith('0x313ce567') ? word(BigInt(decimals)) : call.startsWith('0xa9059cbb') ? (target?.toLowerCase() === '0xdac17f958d2ee523a2206206994597c13d831ec7' ? '0x' : word(transferSuccess ? 1n : 0n)) : call.startsWith('0x4d2301cc') ? word(nativeBalance) : word(tokenBalance)
        if (data.startsWith('0x82ad56cb')) {
          const decoded = decodeFunctionData({ abi: multicall3Abi, data: data as `0x${string}` })
          const calls = decoded.args![0] as readonly { callData: string; target: string }[]
          result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: calls.map(call => ({ success: true, returnData: single(call.callData, call.target) as `0x${string}` })) })
        } else result = single(data, (rpc.params[0] as { to: string }).to)
      }
      if (rpc.method === 'eth_getTransactionReceipt') result = receiptPending ? null : { transactionHash: HASH, transactionIndex: '0x0', blockHash: `0x${'b'.repeat(64)}`, blockNumber: '0x100', from: ACCOUNT, to: RECIPIENT, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', contractAddress: null, logs: [], logsBloom: `0x${'0'.repeat(512)}`, status: receiptStatus, effectiveGasPrice: '0x77359400', type: '0x2' }
      return { jsonrpc: '2.0', id: rpc.id, result }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(payload) ? payload.map(respond) : respond(payload)) })
  })
}

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click()
  await page.locator('w3m-modal').getByText('Mock Wallet', { exact: true }).click()
  await expect(page.locator('.wallet-connected-dot')).toBeVisible()
  await expect(page.getByText('Demo portfolio balance')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Review transaction' })).toBeVisible()
  await expect(page.locator('w3m-modal')).not.toHaveClass(/open/)
}

test('native transfer is reviewed before the only signing request, then journaled and confirmed', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await page.getByRole('textbox', { name: 'You send' }).fill('0.1')
  await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill(RECIPIENT)
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
  await expect(page.locator('.activity-row .status-badge')).toHaveText('Confirmed', { timeout: 20_000 })
  const submitted = await page.evaluate(() => (window as unknown as { submitted: { to: string; value: string; gas: string; chainId: string }[] }).submitted)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]!.to.toLowerCase()).toBe(RECIPIENT)
  expect(BigInt(submitted[0]!.value)).toBe(100000000000000000n)
  await page.reload()
  await connect(page)
  await expect(page.locator('.activity-row')).toHaveCount(1)
})

test('recipient validation and wallet rejection cannot create a successful transfer', async ({ page }) => {
  await mockWallet(page, true)
  await connect(page)
  await page.getByRole('textbox', { name: 'You send' }).fill('0.1')
  await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill('0x0000000000000000000000000000000000000000')
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.getByRole('alert')).toContainText('Zero-address')
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
  await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill(RECIPIENT)
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByRole('alert')).toContainText('rejected')
  await expect(page.locator('.activity-row')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(1)
})

test('receive QR encodes the connected account', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await page.getByRole('tab', { name: 'Receive' }).click()
  await expect(page.getByAltText('Receive address QR code on Ethereum')).toBeVisible()
  await expect(page.locator('.receive-address')).toHaveText(ACCOUNT)
})

for (const [symbol, contract] of [['USDC', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'], ['USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7']] as const) {
  test(`${symbol} simulates and sends the exact ERC-20 calldata`, async ({ page }) => {
    await mockWallet(page)
    await connect(page)
    await page.getByRole('combobox', { name: 'Asset to send' }).selectOption(symbol)
    await page.getByRole('textbox', { name: 'You send' }).fill('25.125')
    await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill(RECIPIENT)
    await page.getByRole('button', { name: 'Review transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm & send' }).click()
    await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
    const sent = await page.evaluate(() => (window as unknown as { submitted: { to: string; data: string; value: string }[] }).submitted)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to.toLowerCase()).toBe(contract.toLowerCase())
    expect(BigInt(sent[0]!.value)).toBe(0n)
    expect(sent[0]!.data).toBe(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [RECIPIENT, 25125000n] }))
  })
}

test('changing the wallet network after review stops signing', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await page.getByRole('textbox', { name: 'You send' }).fill('0.1')
  await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill(RECIPIENT)
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(async () => { await (window as unknown as { ethereum: { request: (args: object) => Promise<unknown> } }).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] }) })
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue('polygon')
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
})

async function fillTransfer(page: Page, amount = '0.1') {
  await page.getByRole('textbox', { name: 'You send' }).fill(amount)
  await page.getByRole('textbox', { name: 'Recipient', exact: true }).fill(RECIPIENT)
}

test('asset row opens the selected token in the send form', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await page.locator('.asset-row').filter({ has: page.locator('.asset-name', { hasText: 'USD Coin' }) }).click()
  await expect(page.getByRole('combobox', { name: 'Asset to send' })).toHaveValue('USDC')
})

for (const [network, chainId, symbol, destination, value] of [
  ['sepolia', 11155111, 'ETH', RECIPIENT, 10_000_000_000_000_000n],
  ['amoy', 80002, 'USDC', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', 0n],
] as const) {
  test(`${network} transfer switches the wallet to its test chain`, async ({ page }) => {
    await mockWallet(page)
    await connect(page)
    await page.getByRole('combobox', { name: 'Transaction network' }).selectOption(network)
    await page.getByRole('combobox', { name: 'Asset to send' }).selectOption(symbol)
    await expect(page.getByRole('button', { name: 'Token amount', exact: true })).toBeEnabled()
    await fillTransfer(page, '0.01')
    await page.getByRole('button', { name: 'Review transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm & send' }).click()
    await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
    const sent = await page.evaluate(() => (window as unknown as { submitted: { activeChainId: string; to: string; value: string; data?: string }[] }).submitted)
    expect(sent).toHaveLength(1)
    expect(Number(BigInt(sent[0]!.activeChainId))).toBe(chainId)
    expect(sent[0]!.to.toLowerCase()).toBe(destination.toLowerCase())
    expect(BigInt(sent[0]!.value)).toBe(value)
    if (symbol === 'USDC') expect(sent[0]!.data).toBe(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [RECIPIENT, 10_000n] }))
  })
}
test('balance privacy covers the send form and persists after reload', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await expect(page.locator('.balance-label')).toContainText('Balance: 10')
  await page.getByRole('button', { name: 'Hide balances', exact: true }).click()
  await expect(page.locator('.balance-label')).toHaveText('Balance: ••••')
  expect(await page.evaluate(() => localStorage.getItem('block.hide-balances'))).toBe('true')
  await page.reload()
  await connect(page)
  await expect(page.locator('.balance-label')).toHaveText('Balance: ••••')
  await expect(page.locator('.portfolio-value h2')).toHaveText('••••••')
})

test('USD entry converts the current quote into exact native units', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await expect(page.getByRole('button', { name: 'Token amount', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Token amount', exact: true }).click()
  await fillTransfer(page, '12.50')
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.locator('.review-amount')).toHaveText('0.005ETH')
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
  const sent = await page.evaluate(() => (window as unknown as { submitted: { value: string }[] }).submitted)
  expect(sent).toHaveLength(1)
  expect(BigInt(sent[0]!.value)).toBe(5_000_000_000_000_000n)
})

test('USD entry refuses a quote that aged while the form was open', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await expect(page.getByRole('button', { name: 'Token amount', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Token amount', exact: true }).click()
  await fillTransfer(page, '12.50')
  await page.evaluate(() => { const original = Date.now; Date.now = () => original() + 121_000 })
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.getByRole('alert')).toContainText('current market price')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
})

test('an expired review cannot request a wallet signature', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await fillTransfer(page)
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => { const original = Date.now; Date.now = () => original() + 90_001 })
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByRole('alert')).toContainText('fee estimate expired')
  expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
})

for (const [reason, options, message] of [
  ['gas funding', { nativeBalance: 0n }, 'network fee'],
  ['token balance', { tokenBalance: 0n }, 'Insufficient USDC'],
  ['contract decimals', { decimals: 18 }, 'unexpected decimals'],
  ['contract rejection', { transferSuccess: false }, 'contract rejected'],
] as const) {
  test(`ERC-20 ${reason} failure stops review and signing`, async ({ page }) => {
    await mockWallet(page, options)
    await connect(page)
    await page.getByRole('combobox', { name: 'Asset to send' }).selectOption('USDC')
    await fillTransfer(page, '1')
    await page.getByRole('button', { name: 'Review transaction' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { submitted: unknown[] }).submitted.length)).toBe(0)
  })
}

test('a mined reverted receipt is shown as reverted instead of confirmed', async ({ page }) => {
  await mockWallet(page, { receiptStatus: '0x0' })
  await connect(page)
  await fillTransfer(page)
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
  await expect(page.locator('.activity-row .status-badge')).toHaveText('Reverted')
  await page.getByRole('button', { name: 'Reverted', exact: true }).click()
  await expect(page.locator('.activity-row')).toHaveCount(1)
})

test('history filters and export contain only the connected account and selected status', async ({ page }) => {
  await mockWallet(page, { receiptPending: true })
  await page.addInitScript(({ account, recipient }) => {
    const make = (id: number, status: string, from = account) => ({ id: String(id), hash: `0x${id.toString(16).padStart(64, '0')}`, network: 'ethereum', from, to: recipient, symbol: 'ETH', amount: '0.1', created: 1_700_000_000_000, status })
    localStorage.setItem('block.transactions.v1', JSON.stringify([make(1, 'confirmed'), make(2, 'pending'), make(3, 'reverted'), make(4, 'confirmed', recipient)]))
  }, { account: ACCOUNT, recipient: RECIPIENT })
  await connect(page)
  await page.getByRole('button', { name: 'View all' }).click()
  await expect(page.locator('.activity-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Pending', exact: true }).click()
  await expect(page.locator('.activity-row')).toHaveCount(1)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloading
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported).toHaveLength(1)
  expect(exported[0]).toMatchObject({ id: '2', status: 'pending', from: ACCOUNT, networkName: 'Ethereum' })
  expect(exported[0].explorer).toContain('/tx/0x')
})

for (const [chainId, network, label, native, price] of [
  ['0xaa36a7', 'sepolia', 'Sepolia', 'ETH', '$2,500.00'],
  ['0x13882', 'amoy', 'Polygon Amoy', 'POL', '$0.40'],
] as const) {
  test(`connecting on ${label} follows the wallet and values test assets using mainnet prices`, async ({ page }) => {
    await mockWallet(page, { initialChainId: chainId })
    await connect(page)
    await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue(network)
    await expect(page.locator('.mode-label')).toHaveText(`${label} · TESTNET`)
    await expect(page.getByText(`${label} portfolio balance`, { exact: true })).toBeVisible()
    const nativeRow = page.locator('.asset-row').filter({ has: page.locator('.asset-name > span', { hasText: new RegExp(`^${native}$`) }) })
    await expect(nativeRow.locator('.asset-holdings strong')).toHaveText('10')
    await expect(nativeRow.locator('.asset-price strong')).toHaveText(price)
    const usdc = page.locator('.asset-row').filter({ hasText: 'USD Coin' })
    await expect(usdc.locator('.asset-holdings strong')).toHaveText('10,000')
    await expect(usdc.locator('.asset-value strong')).toHaveText('$10,000.00')
    await expect(page.getByText('Mainnet-equivalent prices · development')).toBeVisible()
    await page.screenshot({ path: `artifacts/wallet-${network}.png`, fullPage: true })
  })
}

test('network selection switches the provider immediately and rejected changes retain its actual chain', async ({ page }) => {
  await mockWallet(page, { rejectSwitch: true, initialChainId: '0xaa36a7' })
  await connect(page)
  await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue('sepolia')
  await page.getByRole('combobox', { name: 'Transaction network' }).selectOption('amoy')
  await expect(page.getByRole('status')).toContainText('rejected')
  await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue('sepolia')
  await expect(page.locator('.mode-label')).toHaveText('Sepolia · TESTNET')
})

test('external wallet chain changes update balances and label without app selection', async ({ page }) => {
  await mockWallet(page)
  await connect(page)
  await page.evaluate(async () => { await (window as unknown as { ethereum: { request: (args: object) => Promise<unknown> } }).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13882' }] }) })
  await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue('amoy')
  await expect(page.getByRole('combobox', { name: 'Asset to send' })).toHaveValue('POL')
  await expect(page.locator('.mode-label')).toHaveText('Polygon Amoy · TESTNET')
  await expect(page.locator('.balance-label')).toHaveText('Balance: 10')
})

test('testnet PHP valuations, exchange rates and fiat transfer entry use current CMC prices', async ({ page }) => {
  await mockWallet(page, { initialChainId: '0xaa36a7' })
  await connect(page)
  await page.getByRole('combobox', { name: 'Display currency' }).selectOption('PHP')
  await expect(page.locator('.quote-source')).toHaveText('1 USD = 56 PHP · CoinMarketCap')
  const eth = page.locator('.asset-row').filter({ hasText: 'Ethereum' })
  await expect(eth.locator('.asset-price strong')).toHaveText('₱140,000.00')
  await expect(eth.locator('.asset-value strong')).toHaveText('₱1,400,000.00')
  await page.getByRole('button', { name: 'Token amount', exact: true }).click()
  await fillTransfer(page, '700.00')
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.locator('.review-amount')).toHaveText('0.005ETH')
  await page.getByRole('button', { name: 'Confirm & send' }).click()
  await expect(page.getByText('Transaction broadcast', { exact: true })).toBeVisible()
  const sent = await page.evaluate(() => (window as unknown as { submitted: { value: string; activeChainId: string }[] }).submitted)
  expect(BigInt(sent[0]!.value)).toBe(5_000_000_000_000_000n)
  expect(Number(BigInt(sent[0]!.activeChainId))).toBe(11155111)
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Display currency' })).toHaveValue('PHP')
})

test('missing fiat prices never hide Sepolia holdings, including on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockWallet(page, { initialChainId: '0xaa36a7' })
  await page.route('**/api/market?**', route => route.fulfill({ status: 503, json: { error: 'CoinMarketCap prices are temporarily unavailable.' } }))
  await connect(page)
  const eth = page.locator('.asset-row').filter({ hasText: 'Ethereum' })
  await expect(eth.locator('.asset-mobile-holdings')).toBeVisible()
  await expect(eth.locator('.asset-mobile-holdings')).toHaveText('10 ETH')
  await expect(eth.locator('.asset-value strong')).toHaveText('—')
  await expect(page.locator('.portfolio-value h2')).toHaveText('—')
  await expect(page.locator('.quote-error')).toContainText('Token holdings and transfers remain available')
  await expect(page.getByRole('button', { name: 'Token amount', exact: true })).toBeDisabled()
  await fillTransfer(page, '0.01')
  await page.getByRole('button', { name: 'Review transaction' }).click()
  await expect(page.locator('.review-amount')).toHaveText('0.01ETH')
})

test('a connected testnet stays selectable when testnet visibility is disabled', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('block.testnets.development', 'false'))
  await mockWallet(page, { initialChainId: '0xaa36a7' })
  await connect(page)
  await expect(page.getByRole('combobox', { name: 'Transaction network' })).toHaveValue('sepolia')
  await expect(page.locator('.mode-label')).toHaveText('Sepolia · TESTNET')
})

test('native balances appear before a delayed token balance and pending reads never look like zero', async ({ page }) => {
  await mockWallet(page, { initialChainId: '0xaa36a7' })
  let releaseTokens!: () => void
  const tokensReady = new Promise<void>(resolve => { releaseTokens = resolve })
  await page.route('**/*', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    let payload: unknown
    try { payload = route.request().postDataJSON() } catch { return route.fallback() }
    const calls = Array.isArray(payload) ? payload : [payload]
    if (calls.some(call => call && typeof call === 'object' && call.method === 'eth_call')) await tokensReady
    await route.fallback()
  })
  try {
    await connect(page)
    await expect(page.locator('.asset-row').filter({ hasText: 'Ethereum' }).locator('.asset-holdings strong')).toHaveText('10')
    await expect(page.locator('.asset-row').filter({ hasText: 'USD Coin' }).locator('.asset-holdings strong')).toHaveText('…')
    await expect(page.locator('.portfolio-value h2')).toHaveText('—')
  } finally { releaseTokens() }
  await expect(page.locator('.asset-row').filter({ hasText: 'USD Coin' }).locator('.asset-holdings strong')).toHaveText('10,000')
  await expect(page.locator('.portfolio-value h2')).toHaveText('$35,000.00')
})

test('large PHP portfolio values fit a mobile wallet layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockWallet(page, { initialChainId: '0xaa36a7' })
  await connect(page)
  await page.getByRole('combobox', { name: 'Display currency' }).selectOption('PHP')
  await expect(page.locator('.portfolio-value h2')).toHaveText('₱1,960,000.00')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'artifacts/wallet-sepolia-php-mobile.png', fullPage: true })
})
