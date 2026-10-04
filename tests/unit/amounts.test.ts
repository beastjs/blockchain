import { describe, expect, test } from 'bun:test'
import { parseAmount, usdToToken, fiatToToken, compactBalance } from '../../src/lib/amounts'
import { getTokens, getTransferAbi, supportsFiatPricing } from '../../src/lib/appkit/tokens'
import { NETWORKS, networks, getNetwork, getNetworkByChainId } from '../../src/lib/appkit/networks'
import { getTransactionExplorerUrl } from '../../src/lib/explorer'
import { validateBitcoinAddress } from '../../src/lib/appkit/transactions'
import { decodeFunctionResult, encodeFunctionResult, erc20Abi, isAddress, type Address } from 'viem'

describe('exact transaction amounts', () => {
  test('preserves wei and token units without floating point arithmetic', () => {
    expect(parseAmount('0.000000000000000001', 18)).toBe(1n)
    expect(parseAmount('6824.500001', 6)).toBe(6824500001n)
    expect(parseAmount('9007199254740993.01', 2)).toBe(900719925474099301n)
  })
  test('rejects truncation, exponent notation, nonfinite and nonpositive values', () => {
    for (const value of ['1.0000001', '1e3', 'Infinity', 'NaN', '-1', '0', ' ', '1,000', '1.']) expect(() => parseAmount(value, 6)).toThrow()
  })
  test('accepts the largest uint256 and rejects overflow', () => {
    const limit = 2n ** 256n
    expect(parseAmount((limit - 1n).toString(), 0)).toBe(limit - 1n)
    expect(() => parseAmount(limit.toString(), 0)).toThrow('supported range')
  })
  test('converts dollars upward to the smallest unit', () => {
    expect(usdToToken('1.00', 3, 6)).toBe('0.333334')
    expect(usdToToken('24.00', 2, 8)).toBe('12')
    expect(() => usdToToken('1.001', 2, 8)).toThrow()
    expect(() => usdToToken('1.00', 0, 8)).toThrow()
  })
  test('converts fiat with its currency precision and preserves tiny holdings', () => {
    expect(fiatToToken('700.00', 140000, 18, 'PHP')).toBe('0.005')
    expect(fiatToToken('1500', 375000, 18, 'JPY')).toBe('0.004')
    expect(() => fiatToToken('1500.01', 375000, 18, 'JPY')).toThrow('decimal places')
    expect(compactBalance('0.000000000000000001')).toBe('<0.000001')
    expect(compactBalance('0')).toBe('0')
  })
})
describe('migrated chain metadata', () => {
  test('matches decimal and hexadecimal wallet chain IDs without inventing a mainnet fallback', () => {
    expect(getNetworkByChainId(11155111)?.key).toBe('sepolia')
    expect(getNetworkByChainId('0xaa36a7', 'eip155')?.key).toBe('sepolia')
    expect(getNetworkByChainId('80002')?.key).toBe('amoy')
    expect(getNetworkByChainId(1, 'bip122')).toBeUndefined()
    expect(getNetworkByChainId(9999)).toBeUndefined()
    expect(getNetworkByChainId()).toBeUndefined()
  })
  test('dev test assets share the exact mainnet market identity while retaining their real contracts', () => {
    for (const [testnet, mainnet] of [['sepolia', 'ethereum'], ['amoy', 'polygon']] as const) {
      for (const token of getTokens(testnet)) expect(token.marketId).toBe(getTokens(mainnet).find(item => item.symbol === token.symbol)!.marketId)
      expect(getTokens(testnet).find(token => token.symbol === 'USDC')!.address).not.toBe(getTokens(mainnet).find(token => token.symbol === 'USDC')!.address)
      expect(supportsFiatPricing(testnet, true)).toBe(true)
      expect(supportsFiatPricing(testnet, false)).toBe(false)
      expect(supportsFiatPricing(mainnet, false)).toBe(true)
    }
  })
  test('selects legacy Tether decoding by chain and contract, independent of its label', () => {
    const tether = getTokens('ethereum').find(token => token.symbol === 'USDT')!
    const usdc = getTokens('ethereum').find(token => token.symbol === 'USDC')!
    const falseResult = encodeFunctionResult({ abi: erc20Abi, functionName: 'transfer', result: false })
    const relabeledTether = { ...tether, symbol: 'USD₮', address: tether.address!.toLowerCase() as Address }
    const relabeledUsdc = { ...usdc, symbol: 'USDT' }

    expect(decodeFunctionResult({ abi: getTransferAbi(relabeledTether, 1), functionName: 'transfer', data: '0x' })).toBeUndefined()
    expect(decodeFunctionResult({ abi: getTransferAbi(relabeledUsdc, 1), functionName: 'transfer', data: falseResult })).toBe(false)
    expect(decodeFunctionResult({ abi: getTransferAbi(tether, 137), functionName: 'transfer', data: falseResult })).toBe(false)
  })
  test('every deployed token has a valid address and unique symbol', () => {
    for (const network of NETWORKS) {
      const tokens = getTokens(network.key)
      expect(new Set(tokens.map(token => token.symbol)).size).toBe(tokens.length)
      for (const token of tokens) if (token.address) expect(isAddress(token.address)).toBe(true)
    }
    expect(getTokens('sepolia').some(token => token.symbol === 'USDT')).toBe(false)
    expect(getTokens('amoy').some(token => token.symbol === 'USDT')).toBe(false)
    expect(getTokens('bitcoin').map(token => token.symbol)).toEqual(['BTC'])
  })
  test('Amoy uses its own chain, native POL, test USDC, and explorer', () => {
    expect(getNetwork('amoy').chain.id).toBe(80002)
    expect(networks.some(chain => chain.id === 80002)).toBe(true)
    const tokens = getTokens('amoy')
    expect(tokens.map(token => token.symbol)).toEqual(['POL', 'USDC'])
    expect(tokens.find(token => token.symbol === 'USDC')?.address).toBe('0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582')
    expect(getTransactionExplorerUrl('amoy', `0x${'a'.repeat(64)}`)).toBe(`https://amoy.polygonscan.com/tx/0x${'a'.repeat(64)}`)
  })
  test('keeps EVM and Bitcoin transaction hash formats separate', () => {
    const hash = 'a'.repeat(64)
    expect(getTransactionExplorerUrl('bitcoin', hash)).toBe(`https://mempool.space/tx/${hash}`)
    expect(getTransactionExplorerUrl('ethereum', `0x${hash}`)).toBe(`https://etherscan.io/tx/0x${hash}`)
    expect(getTransactionExplorerUrl('bitcoin', `0x${hash}`)).toBeNull()
    expect(getTransactionExplorerUrl('ethereum', hash)).toBeNull()
  })
  test('Bitcoin validation verifies checksums and rejects testnet recipients', async () => {
    expect(await validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true)
    expect(await validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBe(false)
    expect(await validateBitcoinAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(false)
  })
})
