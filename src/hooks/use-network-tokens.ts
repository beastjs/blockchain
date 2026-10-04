import { useEffect, useState } from 'octane'
import { formatUnits, isAddress } from 'viem'
import { getNetwork, type NetworkKey } from '../lib/appkit/networks'
import { getTokens, ERC20_ABI, type Token } from '../lib/appkit/tokens'
import { getRuntime } from '../lib/appkit/store'
import { errorMessage } from '../lib/amounts'
import { getBitcoinBalance } from '../lib/appkit/bitcoin'

export interface TokenBalance extends Token { value: bigint; formatted: string; error?: string }
export function useNetworkTokens(networkKey: NetworkKey, address?: string, refreshKey = 0) {
  const [result, setResult] = useState<{ key: string; tokens: TokenBalance[]; loading: boolean; updated?: number }>({ key: '', tokens: [], loading: false })
  const key = `${networkKey}:${address ?? ''}`
  useEffect(() => {
    let active = true
    let running = false
    const abort = new AbortController()
    const fetchBalances = async () => {
      if (!address || running) return
      running = true
      if (active) setResult(previous => ({ key, tokens: previous.key === key ? previous.tokens : [], updated: previous.key === key ? previous.updated : undefined, loading: true }))
      try {
        const tokens = getTokens(networkKey)
        const runtime = networkKey === 'bitcoin' ? null : await getRuntime()
        const chainId = Number(getNetwork(networkKey).chain.id)
        const readToken = async (token: Token): Promise<TokenBalance> => {
          try {
            let value: bigint
            if (networkKey === 'bitcoin') value = await getBitcoinBalance(address, abort.signal)
            else {
              if (!runtime || !isAddress(address)) throw new Error('Invalid connected EVM account.')
              // A direct native read avoids coupling it to the ERC-20 multicall batch.
              value = token.address
                ? await runtime.core.readContract(runtime.config, { chainId, address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
                : BigInt(await runtime.config.getClient({ chainId }).request({ method: 'eth_getBalance', params: [address, 'latest'] }))
              if (value < 0n) throw new Error('The network returned an invalid token balance.')
            }
            return { ...token, value, formatted: formatUnits(value, token.decimals) }
          } catch (error) { return { ...token, value: 0n, formatted: '0', error: errorMessage(error) } }
        }
        const balances = await Promise.all(tokens.map(async token => {
          const balance = await readToken(token)
          // Publish each result independently so a slow ERC-20 cannot hide native funds.
          if (active) setResult(previous => ({ ...previous, key, tokens: [...(previous.key === key ? previous.tokens.filter(item => item.symbol !== token.symbol) : []), balance], loading: true }))
          return balance
        }))
        if (active) setResult({ key, tokens: balances, loading: false, updated: Date.now() })
      } catch (error) {
        if (active) setResult({ key, tokens: getTokens(networkKey).map(token => ({ ...token, value: 0n, formatted: '0', error: errorMessage(error) })), loading: false })
      } finally { running = false }
    }
    void fetchBalances()
    const interval = setInterval(() => { if (!document.hidden) void fetchBalances() }, 20_000)
    return () => { active = false; abort.abort(); clearInterval(interval) }
  }, [key, refreshKey])
  return result.key === key && address ? result : { key, tokens: [], loading: Boolean(address), updated: undefined }
}
