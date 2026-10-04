import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

/** Connecting a browser wallet should preserve the chain already selected in it. */
export class WalletNetworkAdapter extends WagmiAdapter {
  override connect(params: Parameters<WagmiAdapter['connect']>[0]) {
    const browserWallet = params.type === 'INJECTED' || params.type === 'ANNOUNCED'
    return super.connect(browserWallet ? { ...params, chainId: undefined } : params)
  }
}
