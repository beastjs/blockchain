import type { Address } from 'viem'

/** Ethereum Tether and the Polygon deployment. Unverified test tokens are excluded.
 * Polygon: https://docs.usdt0.to/technical-documentation/deployments
 */
export const USDT_ADDRESS_BY_CHAIN_ID: Readonly<Partial<Record<number, Address>>> = {
  1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
}
export const getUsdtAddress = (chainId: number): Address | undefined => USDT_ADDRESS_BY_CHAIN_ID[chainId]
export const isUsdtSupportedChain = (chainId: number) => Boolean(getUsdtAddress(chainId))
