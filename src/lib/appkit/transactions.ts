import { encodeFunctionData, formatUnits, isAddress, zeroAddress, type Address } from 'viem'
import { getRuntime, walletStore } from './store'
import { getNetwork, type NetworkKey } from './networks'
import { ERC20_ABI, getTokens, getTransferAbi, type Token } from './tokens'
import { parseAmount } from '../amounts'
import { getBitcoinBalance, sendBitcoin } from './bitcoin'

export interface TransferInput { network: NetworkKey; symbol: string; to: string; amount: string }
export interface PreparedTransfer extends TransferInput {
  from: string
  value: bigint
  token: Token
  gas?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  fee?: bigint
  data?: `0x${string}`
  preparedAt: number
}
export async function validateBitcoinAddress(address: string) {
  try {
    const { Address } = await import('@scure/btc-signer')
    Address().decode(address)
    return true
  } catch { return false }
}
/** Each service shares one signing lock across component mounts. Dependencies keep RPC tests isolated. */
export function createTransferService({
  loadRuntime = getRuntime,
  getWallet = walletStore.getSnapshot,
  bitcoinBalance = getBitcoinBalance,
  bitcoinSend = sendBitcoin,
  now = () => Date.now(),
} = {}) {
  let signing = false
  const assertFresh = (transfer: PreparedTransfer) => {
    const age = now() - transfer.preparedAt
    if (age < 0 || age > 90_000) throw new Error('This fee estimate expired. Review the transfer again.')
  }
  const assertAccount = (transfer: PreparedTransfer, account: { address?: string; chainId?: number; isConnected: boolean }, chainId: number) => {
    if (!account.isConnected || account.address?.toLowerCase() !== transfer.from.toLowerCase() || account.chainId !== chainId) throw new Error('Wallet account or network changed. Review the transfer again.')
  }
  async function prepareTransfer(input: TransferInput): Promise<PreparedTransfer> {
    const { network: networkKey, symbol } = input
    const network = getNetwork(networkKey)
    const token = getTokens(networkKey).find(item => item.symbol === symbol)
    if (!token) throw new Error('This asset is unavailable on the selected network.')
    const value = parseAmount(input.amount, token.decimals)
    const to = input.to.trim()
    const { appKit, config, core: { estimateGas, estimateFeesPerGas, getAccount, getBalance, readContract, simulateContract } } = await loadRuntime()
    if (networkKey === 'bitcoin') {
      if (!await validateBitcoinAddress(to)) throw new Error('Enter a valid Bitcoin mainnet address, including its checksum.')
      const from = getWallet().bitcoinAddress
      if (!from) throw new Error('Connect a Bitcoin wallet first.')
      const balance = await bitcoinBalance(from)
      if (value >= balance) throw new Error('Insufficient BTC. Leave enough Bitcoin for the wallet’s network fee.')
      if (getWallet().bitcoinAddress !== from) throw new Error('Bitcoin account changed. Review again.')
      return { ...input, to, token, value, from, preparedAt: now() }
    }
    if (!isAddress(to) || to.toLowerCase() === zeroAddress) throw new Error('Enter a valid recipient address. Zero-address transfers are blocked.')
    const account = getAccount(config)
    if (!account.address || !account.isConnected) throw new Error('Connect an EVM wallet first.')
    const chainId = Number(network.chain.id)
    if (account.chainId !== chainId) await appKit.switchNetwork(network.chain, { throwOnFailure: true })
    const current = getAccount(config)
    if (current.address !== account.address || current.chainId !== chainId) throw new Error('The wallet changed during preparation. Review the transfer again.')
    const from = current.address
    const [nativeBalance, feeData] = await Promise.all([
      getBalance(config, { address: from, chainId }),
      estimateFeesPerGas(config, { chainId }),
    ])
    let data: `0x${string}` | undefined
    if (token.address) {
      const [balance, decimals, simulation] = await Promise.all([
        readContract(config, { chainId, address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [from] }),
        readContract(config, { chainId, address: token.address, abi: ERC20_ABI, functionName: 'decimals' }),
        simulateContract(config, { chainId, account: from, address: token.address, abi: getTransferAbi(token, chainId), functionName: 'transfer', args: [to, value] }),
      ])
      if (Number(decimals) !== token.decimals) throw new Error('The token contract has unexpected decimals. Transfer stopped.')
      if (value > balance) throw new Error(`Insufficient ${symbol} balance.`)
      if (simulation.result === false) throw new Error('The token contract rejected this transfer.')
      data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, value] })
    }
    const gasEstimate = await estimateGas(config, { chainId, account: from, to: token.address ?? to, value: token.address ? 0n : value, data })
    const gas = (gasEstimate * 120n + 99n) / 100n
    const maxFeePerGas = feeData.maxFeePerGas
    const fee = gas * maxFeePerGas
    if (nativeBalance.value < fee + (token.address ? 0n : value)) throw new Error(`Insufficient ${network.nativeSymbol} to cover the amount and network fee.`)
    const prepared = { ...input, to, token, value, from, data, gas, maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas, fee, preparedAt: now() }
    assertAccount(prepared, getAccount(config), chainId)
    return prepared
  }
  async function broadcastTransfer(transfer: PreparedTransfer): Promise<string> {
    if (signing) throw new Error('A transfer is already awaiting your wallet. Complete it before sending another.')
    signing = true
    try {
      assertFresh(transfer)
      const { config, core: { getAccount, sendTransaction, simulateContract } } = await loadRuntime()
      if (transfer.network === 'bitcoin') {
        assertFresh(transfer)
        if (getWallet().bitcoinAddress !== transfer.from) throw new Error('Bitcoin account changed. Review again.')
        return await bitcoinSend(transfer.to, transfer.value, () => {
          assertFresh(transfer)
          if (getWallet().bitcoinAddress !== transfer.from) throw new Error('Bitcoin account changed. Review again.')
        })
      }
      const account = getAccount(config)
      const chainId = Number(getNetwork(transfer.network).chain.id)
      assertAccount(transfer, account, chainId)
      if (transfer.token.address) {
        const simulation = await simulateContract(config, { chainId, account: account.address, address: transfer.token.address, abi: getTransferAbi(transfer.token, chainId), functionName: 'transfer', args: [transfer.to as Address, transfer.value] })
        if (simulation.result === false) throw new Error('The token contract rejected this transfer.')
      }
      assertFresh(transfer)
      assertAccount(transfer, getAccount(config), chainId)
      return await sendTransaction(config, {
        chainId, account: account.address, to: transfer.token.address ?? transfer.to as Address,
        value: transfer.token.address ? 0n : transfer.value, data: transfer.data,
        gas: transfer.gas, maxFeePerGas: transfer.maxFeePerGas, maxPriorityFeePerGas: transfer.maxPriorityFeePerGas,
      })
    } finally { signing = false }
  }
  return { prepareTransfer, broadcastTransfer }
}
export const { prepareTransfer, broadcastTransfer } = createTransferService()
export const formatFee = (transfer: PreparedTransfer) => transfer.fee === undefined ? 'Set by your Bitcoin wallet' : `${formatUnits(transfer.fee, getNetwork(transfer.network).chain.nativeCurrency.decimals)} ${getNetwork(transfer.network).nativeSymbol}`
