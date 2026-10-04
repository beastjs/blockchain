import { erc20Abi, type Address } from 'viem'
import { getUsdcAddress } from '../tokens/usdc'
import { getUsdtAddress } from '../tokens/usdt'
import { getNetwork, type Network, type NetworkKey } from './networks'
import { MARKET_ASSETS } from '../market-catalog'

export interface Token {
  symbol: string
  name: string
  decimals: number
  address?: Address
  color: string
  marketId: number
}
export const ERC20_ABI = erc20Abi
// Ethereum's deployed Tether contract predates ERC-20 return-value conventions.
// https://tether.to/en/supported-protocols/
const TETHER_TRANSFER_ABI = [{
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [],
}] as const

export function getTransferAbi(token: Pick<Token, 'address'>, chainId: number) {
  const tetherAddress = chainId === 1 ? getUsdtAddress(chainId) : undefined
  return token.address && tetherAddress && token.address.toLowerCase() === tetherAddress.toLowerCase()
    ? TETHER_TRANSFER_ABI
    : ERC20_ABI
}

const NATIVE_TOKEN_METADATA = {
  ETH: { name: MARKET_ASSETS.ETH.name, marketId: MARKET_ASSETS.ETH.id },
  POL: { name: MARKET_ASSETS.POL.name, marketId: MARKET_ASSETS.POL.id },
  BTC: { name: MARKET_ASSETS.BTC.name, marketId: MARKET_ASSETS.BTC.id },
} as const satisfies Record<Network['nativeSymbol'], Pick<Token, 'name' | 'marketId'>>

export function getTokens(networkKey: NetworkKey): Token[] {
  const network = getNetwork(networkKey)
  const nativeToken: Token = {
    ...NATIVE_TOKEN_METADATA[network.nativeSymbol],
    symbol: network.nativeSymbol,
    decimals: network.chain.nativeCurrency.decimals,
    color: network.color,
  }
  if (network.namespace !== 'eip155') return [nativeToken]

  const chainId = Number(network.chain.id)
  const usdc = getUsdcAddress(chainId)
  const usdt = getUsdtAddress(chainId)
  return [
    nativeToken,
    ...(usdc ? [{ symbol: 'USDC', name: 'USD Coin', decimals: 6, address: usdc, color: '#8ebdf9', marketId: MARKET_ASSETS.USDC.id }] : []),
    ...(usdt ? [{ symbol: 'USDT', name: 'Tether', decimals: 6, address: usdt, color: '#86c6af', marketId: MARKET_ASSETS.USDT.id }] : []),
  ]
}

export const supportsFiatPricing = (network: NetworkKey, development: boolean) => development || !getNetwork(network).testnet
