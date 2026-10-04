import { describe, expect, mock, test } from 'bun:test'
import { encodeFunctionData, erc20Abi, type Address } from 'viem'
import { createTransferService, formatFee, type TransferInput } from '../../src/lib/appkit/transactions'
import type { getRuntime } from '../../src/lib/appkit/store'

const FROM: Address = '0x1111111111111111111111111111111111111111'
const TO: Address = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'a'.repeat(64)}`
const BTC = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const input: TransferInput = { network: 'ethereum', symbol: 'ETH', to: TO, amount: '0.1' }

function harness() {
  const state = { address: FROM, chainId: 1, isConnected: true, nativeBalance: 10n ** 19n, tokenBalance: 100_000_000n, decimals: 6, time: 1_000_000, bitcoinAddress: BTC }
  const core = {
    getAccount: mock(() => ({ address: state.address, chainId: state.chainId, isConnected: state.isConnected })),
    getBalance: mock(async () => ({ value: state.nativeBalance })),
    estimateFeesPerGas: mock(async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n })),
    estimateGas: mock(async () => 21_001n),
    readContract: mock(async (_config: unknown, request: { functionName: string }) => request.functionName === 'decimals' ? state.decimals : state.tokenBalance),
    simulateContract: mock(async () => ({ result: true as boolean | undefined })),
    sendTransaction: mock(async (_config: unknown, _request: unknown) => HASH),
  }
  const switchNetwork = mock(async (chain: { id: number | string }) => { state.chainId = Number(chain.id) })
  // Wagmi methods are generic; this boundary models only the operations used by the service.
  const runtime = { config: {}, core, appKit: { switchNetwork } } as unknown as Awaited<ReturnType<typeof getRuntime>>
  const bitcoinBalance = mock(async () => 100_000_000n)
  const bitcoinSend = mock(async (_to: string, _amount: bigint, beforeSign?: () => void) => { beforeSign?.(); return 'b'.repeat(64) })
  const service = createTransferService({ loadRuntime: async () => runtime, getWallet: () => ({ configured: true, status: 'ready', bitcoinAddress: state.bitcoinAddress }), bitcoinBalance, bitcoinSend, now: () => state.time })
  return { state, core, switchNetwork, bitcoinBalance, bitcoinSend, ...service }
}

describe('transfer preparation', () => {
  test('keeps exact native units, rounds gas headroom upward, and never signs at review', async () => {
    const h = harness()
    const prepared = await h.prepareTransfer({ ...input, to: ` ${TO} ` })
    expect(prepared.value).toBe(100_000_000_000_000_000n)
    expect(prepared.to).toBe(TO)
    expect(prepared.gas).toBe(25_202n)
    expect(prepared.fee).toBe(50_404n)
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
    expect(formatFee(prepared)).toBe('0.000000000000050404 ETH')
  })
  test.each([
    { symbol: 'UNKNOWN' }, { amount: '1e3' }, { amount: '0' }, { amount: '0.0000000000000000001' },
    { to: 'invalid' }, { to: '0x0000000000000000000000000000000000000000' },
  ])('rejects invalid input before signing: %j', async patch => {
    const h = harness()
    await expect(h.prepareTransfer({ ...input, ...patch })).rejects.toThrow()
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
  })
  test('requires the native amount plus the maximum gas fee', async () => {
    const h = harness()
    h.state.nativeBalance = 100_000_000_000_050_403n
    await expect(h.prepareTransfer(input)).rejects.toThrow('network fee')
    h.state.nativeBalance += 1n
    await expect(h.prepareTransfer(input)).resolves.toMatchObject({ fee: 50_404n })
  })
  test('switches to the selected chain and propagates a rejected switch', async () => {
    const h = harness()
    h.state.chainId = 137
    await h.prepareTransfer(input)
    expect(h.switchNetwork).toHaveBeenCalledTimes(1)
    h.state.chainId = 137
    h.switchNetwork.mockRejectedValueOnce(new Error('Switch rejected'))
    await expect(h.prepareTransfer(input)).rejects.toThrow('Switch rejected')
  })
  test('rejects an account change during gas estimation', async () => {
    const h = harness()
    h.core.estimateGas.mockImplementationOnce(async () => { h.state.address = TO; return 21_000n })
    await expect(h.prepareTransfer(input)).rejects.toThrow('account or network changed')
  })
  test('builds exact ERC-20 calldata and sends no native value to the contract', async () => {
    const h = harness()
    const prepared = await h.prepareTransfer({ ...input, symbol: 'USDC', amount: '25.125001' })
    expect(prepared.data).toBe(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [TO, 25_125_001n] }))
    await h.broadcastTransfer(prepared)
    expect(h.core.sendTransaction.mock.calls[0]![1]).toMatchObject({ to: prepared.token.address, value: 0n, data: prepared.data, gas: prepared.gas, maxFeePerGas: 2n })
  })
  test.each(['balance', 'decimals', 'simulation', 'gas'] as const)('stops an ERC-20 transfer with invalid %s', async reason => {
    const h = harness()
    if (reason === 'balance') h.state.tokenBalance = 1n
    if (reason === 'decimals') h.state.decimals = 18
    if (reason === 'simulation') h.core.simulateContract.mockResolvedValue({ result: false })
    if (reason === 'gas') h.state.nativeBalance = 0n
    await expect(h.prepareTransfer({ ...input, symbol: 'USDC', amount: '1' })).rejects.toThrow()
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
  })
  test('accepts the legacy Tether simulation with no return value', async () => {
    const h = harness()
    h.core.simulateContract.mockResolvedValue({ result: undefined })
    const prepared = await h.prepareTransfer({ ...input, symbol: 'USDT', amount: '1' })
    await expect(h.broadcastTransfer(prepared)).resolves.toBe(HASH)
  })
})

describe('broadcast guards', () => {
  test.each(['address', 'chain', 'disconnected', 'expired', 'clock rewind'] as const)('stops a reviewed transfer after %s changes', async reason => {
    const h = harness()
    const prepared = await h.prepareTransfer(input)
    if (reason === 'address') h.state.address = TO
    if (reason === 'chain') h.state.chainId = 137
    if (reason === 'disconnected') h.state.isConnected = false
    if (reason === 'expired') h.state.time += 90_001
    if (reason === 'clock rewind') h.state.time -= 1
    await expect(h.broadcastTransfer(prepared)).rejects.toThrow()
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
  })
  test.each(['account', 'expiry', 'simulation'] as const)('rechecks %s after awaiting the second contract simulation', async reason => {
    const h = harness()
    const prepared = await h.prepareTransfer({ ...input, symbol: 'USDC', amount: '1' })
    h.core.simulateContract.mockImplementationOnce(async () => {
      if (reason === 'account') h.state.address = TO
      if (reason === 'expiry') h.state.time += 90_001
      return { result: reason !== 'simulation' }
    })
    await expect(h.broadcastTransfer(prepared)).rejects.toThrow()
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
  })
  test('allows only one signing request across callers and releases the lock after rejection', async () => {
    const h = harness()
    const prepared = await h.prepareTransfer(input)
    let entered!: () => void
    let reject!: (error: Error) => void
    const started = new Promise<void>(resolve => { entered = resolve })
    h.core.sendTransaction.mockImplementationOnce(async () => { entered(); return new Promise<string>((_resolve, fail) => { reject = fail }) })
    const first = h.broadcastTransfer(prepared).catch((error: Error) => error)
    await started
    await expect(h.broadcastTransfer(prepared)).rejects.toThrow('already awaiting your wallet')
    reject(new Error('User rejected'))
    expect(await first).toEqual(new Error('User rejected'))
    expect(h.core.sendTransaction).toHaveBeenCalledTimes(1)
    await expect(h.broadcastTransfer(await h.prepareTransfer(input))).resolves.toBe(HASH)
  })
})

describe('Bitcoin transfer review', () => {
  const bitcoinInput: TransferInput = { network: 'bitcoin', symbol: 'BTC', to: BTC, amount: '0.00000001' }
  test('sends exact satoshis and lets the wallet set the fee', async () => {
    const h = harness()
    const prepared = await h.prepareTransfer(bitcoinInput)
    expect(prepared.value).toBe(1n)
    expect(formatFee(prepared)).toBe('Set by your Bitcoin wallet')
    await expect(h.broadcastTransfer(prepared)).resolves.toBe('b'.repeat(64))
    expect(h.bitcoinSend.mock.calls[0]!.slice(0, 2)).toEqual([BTC, 1n])
    expect(h.core.sendTransaction).not.toHaveBeenCalled()
  })
  test('leaves Bitcoin for fees and rejects invalid recipients', async () => {
    const h = harness()
    await expect(h.prepareTransfer({ ...bitcoinInput, amount: '1' })).rejects.toThrow('Leave enough Bitcoin')
    await expect(h.prepareTransfer({ ...bitcoinInput, to: TO })).rejects.toThrow('Bitcoin mainnet address')
  })
  test('checks the Bitcoin account again after balance retrieval and immediately before signing', async () => {
    const h = harness()
    h.bitcoinBalance.mockImplementationOnce(async () => { h.state.bitcoinAddress = 'changed'; return 100_000_000n })
    await expect(h.prepareTransfer(bitcoinInput)).rejects.toThrow('Bitcoin account changed')
    h.state.bitcoinAddress = BTC
    const prepared = await h.prepareTransfer(bitcoinInput)
    h.bitcoinSend.mockImplementationOnce(async (_to, _amount, beforeSign) => { h.state.bitcoinAddress = 'changed'; beforeSign?.(); return 'b'.repeat(64) })
    await expect(h.broadcastTransfer(prepared)).rejects.toThrow('Bitcoin account changed')
  })
})
