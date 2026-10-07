# BLOCK — the onchain terminal

A Beast/Octane transaction workspace, built on the AppKit integration from `~/Code/ftsb`. Dark graphite surfaces, lime accents, local Inter/IBM Plex Mono fonts, and a responsive layout with no gradients.

```sh
bun install
bun run dev
```

The development server runs at http://localhost:3000. On another checkout, copy `.env.example` to `.env.local` and set `PUBLIC_REOWN_PROJECT_ID` and the private `CMC_API_KEY`. Existing local credentials are read from the ignored environment files. Allow the deployed origin in the Reown dashboard. AppKit cloud settings control features such as swaps and wallet ownership authentication; the app preserves those settings.

## Implemented

- Ethereum, Polygon, Bitcoin, Sepolia, and Polygon Amoy wallet connections through Reown's Wagmi and Bitcoin adapters. Dev servers show both testnets by default; production defaults to mainnets. Test-network visibility is configurable in Preferences, with a separate dev preference.
- Native ETH/POL/BTC transfers, USDC on supported EVM chains, and mainnet USDT transfers. Unverified Sepolia USDT is excluded.
- Exact bigint amounts, optional fresh fiat conversion, recipient/checksum validation, contract simulation, token-decimal verification, native gas funding checks, and expiring fee estimates.
- Review before signing, protection against duplicate submissions, and account/network checks immediately before broadcast. Ethereum Tether's nonstandard transfer ABI is supported.
- Wallet-driven network selection and onchain EVM/Bitcoin balance reads. Connecting on Sepolia or Amoy immediately follows the provider's chain; selecting a network switches the wallet, with rejected switches retaining its previous network.
- CoinMarketCap crypto quotes and fiat exchange rates through a private server endpoint, with USD/PHP/EUR/GBP/JPY/AUD/CAD/SGD selection. Requests are deduplicated and cached for 60 seconds. Only the selected foreign currency is fetched, and quotes expire after two minutes based on the upstream timestamps. Missing prices leave token quantities visible on desktop and mobile.
- Dev-only mainnet-equivalent pricing: Sepolia ETH uses ETH's market ID, Amoy POL uses POL's ID, and supported test tokens use the matching mainnet token ID. Balances, token contracts, explorers, and signed transactions always use the actual test chain. Production testnet holdings remain visible without fiat valuation.
- Receive addresses and QR codes, plus real AppKit swap routing on supported mainnets.
- A local transfer journal with pending, confirmed, and reverted receipts; search, status filtering, explorer links, and JSON export.
- Balance privacy, display currency, and test-network preferences persisted on the device.

The disconnected overview is explicitly a workspace preview: its portfolio, chart, and transactions are illustrative. Connecting any wallet removes those sample values. Live portfolio history is intentionally not fabricated. The local journal tracks transfers submitted through this workspace, rather than importing a wallet's complete chain history. Replaced/dropped hashes may remain pending; check the linked explorer for wallet-side speedups or cancellations. AppKit swaps have their own provider history.

Balances cover each chain's native currency and the verified contracts in `src/lib/appkit/tokens.ts` (currently USDC and supported mainnet USDT). CoinMarketCap provides prices, not wallet token discovery; other ERC-20 contracts need registry entries before their balances are displayed.

## Pricing server and production

Rsbuild registers `/api/market?currency=USD` on both the dev server and `bun run preview`. For production, build and start the included Bun server:

```sh
bun run build
CMC_API_KEY=your_private_key bun run start
# Optional: HOST=0.0.0.0 PORT=8080 bun run start
```

The production server serves `dist` and the same market endpoint. A static-only host must forward `/api/market` to this server. Keep `CMC_API_KEY` in server environment variables; it must never have a `PUBLIC_` prefix. API failures and plan/rate limits are surfaced in the UI; fiat entry is disabled while token entry remains available. Foreign rates are true USD/fiat conversions, not stablecoin pegs. The integration uses numeric asset IDs with CoinMarketCap's [v3 crypto quotes](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency) and [v2 price conversion](https://coinmarketcap.com/api/documentation/pro-api-reference/tools) endpoints.

## Migration

The source React provider is replaced by AppKit's framework-independent client and Octane subscriptions. `use-crypto`, `use-network-tokens`, `use-send`, Bitcoin balance/transfer logic, clipboard handling, token contracts, and explorer helpers were ported or consolidated under `src/hooks` and `src/lib/appkit`. The original React UI and its simulated swap implementation were replaced. The source's commerce relays, Firebase, Convex, private-key signing, and unrelated dependencies are outside this wallet-owned transaction app.

AppKit uses the source's `1.8.19` release. Wagmi Core and connectors are pinned to a compatible Wagmi 2 family; the adapter's broad optional connector range otherwise installs incompatible Wagmi 3 connectors. The substantial wallet SDK loads separately from the interface. QR and Bitcoin validation modules load when used.

## Validation

```sh
bun run typecheck      # strict types for source, configuration, and tests
bun run test           # isolated unit tests; no wallet or network required
bunx playwright install chromium
bun run test:browser   # responsive UI and a mocked EIP-1193 wallet, RPC, and receipts
bun run check          # types, unit tests, production build, and browser tests
```

Unit tests cover exact amount limits, fiat minor units, token ABIs, gas funding, wallet changes during async work, review expiry, shared signing locks, Bitcoin API/provider failures, quote/FX freshness and concurrency, server caching/authentication/error handling, and storage corruption. Browser tests exercise review-before-signing, exact native/ERC-20 and fiat transfers, initial testnet connection, external chain changes, rejected network switches, unavailable prices with visible mobile holdings, recipient validation, wallet rejection, reverted receipts, journal persistence/export, balance privacy, receive QR codes, AppKit connection, and responsive controls. They do not submit real transactions. A newly started test server uses a dummy public project ID and mocked APIs, so tests do not require local credentials. Use `PLAYWRIGHT_PORT=3001 bun run test:browser` for an isolated server; for an existing browser binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

`src/App.btsx` contains the shell; transaction components live in `src/components`. The transaction engine is `src/lib/appkit/transactions.ts`. Record future changes in `CHANGELOG.md`.

Visit `/checkout` or select **Checkout** in the sidebar for the example storefront checkout. It supports quantity changes, item removal, saved carts, the `BLOCK10` promo code, delivery options, required address fields, and card/USDC demo payment choices. Review the order before confirming; the confirmation is simulated and creates no charge, wallet transaction, email, or shipment. Prices are in USD, tax is a fixed 8% estimate, and standard shipping is free for discounted subtotals of at least $200 (otherwise $8); express shipping costs $15. Only product IDs and quantities are saved locally. The workspace also supports `/transactions` and `/networks`, direct page loads, and browser back/forward navigation.

Visit `/product` or select **Featured product** to explore `src/lib/scene/turbine__turbofan_engine__jet_engine.glb`. The [model-viewer](https://modelviewer.dev/) renderer is loaded only when the page opens, with orbit, zoom, camera presets, optional auto-rotation, fullscreen where supported, studio background switching, error recovery, and a GLB download. The source file is emitted as a bundled asset for both development and production. The model is **Turbine | Turbofan Engine | Jet Engine** by [blenderbirb](https://sketchfab.com/blenderbirb), from [Sketchfab](https://sketchfab.com/3d-models/turbine-turbofan-engine-jet-engine-74c6aceed86b4a41aaad3b93afc3e262), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution comes from the GLB's embedded metadata; the model is displayed without modification.

Visit `/settings` or select **Testing settings** for temporary relay/destination monitoring. Save two different EVM addresses and choose a network (Sepolia by default), then start monitoring. Settings persist locally; monitoring runs while this page is open and stops on navigation/reload. It discovers native transfers and supported USDC/USDT Transfer logs starting at the current block, tracks matching pending transfers from the local journal, and accepts external transfer hashes. Status refreshes every three seconds: received means RPC observation, processing means waiting for a receipt, completed means a successful included receipt, and failed means a revert. This does not configure a forwarding service or report its internal processing; it does not sign transactions, fetch historical activity, cover Bitcoin/internal native calls, or guarantee finality. RPC outages are shown with automatic retry.


## Wallet activity timeline

The overview chart follows the connected EVM wallet and selected network, using Etherscan V2 normal transactions and ERC-20 transfers rather than the device journal. It shows cumulative **Total activity**, **Sent**, and **Received** counts for 1D, 1W, 1M, and 1Y, with smooth curves, date tooltips, keyboard navigation, and a clearly labeled disconnected demo. Counts start at zero for each period; matching hashes are counted once. Self-transfers count in both directions, and Sent includes reverted outgoing transactions. Internal transfers, NFTs, and Bitcoin history are excluded. This is an activity chart; it does not reconstruct historical portfolio valuations.

Set the private `ETHERSCAN_API_KEY_TOKEN` on the server (`ETHERSCAN_API_TOKEN` is also accepted). Restart the development server after adding the key or endpoint. The `/api/timeline?network=sepolia&address=0x…` endpoint keeps the key off the client, paces upstream calls, caches wallet responses for 60 seconds, and loads up to three pages of 1,000 records per source over the last year. Busy wallets are labeled as partial history. Network access depends on the Etherscan API plan; errors are displayed with a retry action. Browser tests mock this endpoint and require no explorer credentials.
