import { bitcoin, mainnet, polygon, polygonAmoy, sepolia, type AppKitNetwork } from '@reown/appkit/networks'

export const bitcoinNetwork = {
  ...bitcoin,
  blockExplorers: { default: { name: 'mempool.space', url: 'https://mempool.space' } }
}

export const NETWORKS = [
  {
    key: 'ethereum',
    name: 'Ethereum',
    short: 'ETH',
    chain: mainnet,
    namespace: 'eip155',
    nativeSymbol: 'ETH',
    testnet: false,
    color: '#cfb1fc'
  },
  {
    key: 'polygon',
    name: 'Polygon',
    short: 'POL',
    chain: polygon,
    namespace: 'eip155',
    nativeSymbol: 'POL',
    testnet: false,
    color: '#710ee8'
  },
  {
    key: 'bitcoin',
    name: 'Bitcoin',
    short: 'BTC',
    chain: bitcoinNetwork,
    namespace: 'bip122',
    nativeSymbol: 'BTC',
    testnet: false,
    color: '#ff9500'
  },
  {
    key: 'sepolia',
    name: 'Sepolia',
    short: 'SEP',
    chain: sepolia,
    namespace: 'eip155',
    nativeSymbol: 'ETH',
    testnet: true,
    color: '#a4fcf5'
  },
  {
    key: 'amoy',
    name: 'Polygon Amoy',
    short: 'POL',
    chain: polygonAmoy,
    namespace: 'eip155',
    nativeSymbol: 'POL',
    testnet: true,
    color: '#84a8fb'
  }
] as const
export type NetworkKey = (typeof NETWORKS)[number]['key']
export type Network = (typeof NETWORKS)[number]
export const isNetworkKey = (value: unknown): value is NetworkKey => NETWORKS.some((network) => network.key === value)
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  NETWORKS[0].chain,
  ...NETWORKS.slice(1).map((network) => network.chain)
]
export const getNetwork = (key: NetworkKey) => NETWORKS.find((network) => network.key === key)!

export function getNetworkByChainId(chainId?: string | number, namespace?: 'eip155' | 'bip122') {
  if (chainId === undefined) return undefined
  return NETWORKS.find(
    (network) =>
      (!namespace || network.namespace === namespace) &&
      (network.namespace === 'eip155'
        ? Number(network.chain.id) === Number(chainId)
        : String(network.chain.id).toLowerCase() === String(chainId).toLowerCase())
  )
}
