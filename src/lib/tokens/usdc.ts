import type { Address } from 'viem'

/**
 * Official USDC contract addresses (Circle).
 * @see https://www.circle.com/multi-chain-usdc
 * @see https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
 */
export const USDC_ADDRESS_BY_CHAIN_ID: Readonly<Partial<Record<number, Address>>> = {
  /** Ethereum Mainnet */
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
  /** Ethereum Sepolia */
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  /** Polygon Mainnet (native USDC) */
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
  /** Polygon Amoy testnet (test USDC token) */
  80002: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' as Address,
}

export const SUPPORTED_USDC_CHAINS = [1, 11155111, 137, 80002] as const
export type SupportedUsdcChainId = (typeof SUPPORTED_USDC_CHAINS)[number]

export function getUsdcAddress(chainId: number): Address | undefined {
  return USDC_ADDRESS_BY_CHAIN_ID[chainId]
}

export function isUsdcSupportedChain(chainId: number): chainId is SupportedUsdcChainId {
  return SUPPORTED_USDC_CHAINS.includes(chainId as SupportedUsdcChainId)
}

/** Minimal ERC20 ABI for balanceOf and decimals (used with useReadContract). */
export const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const
