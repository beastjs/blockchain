# Changelog

All notable changes to `blockchain` will be recorded here.

## [Unreleased]

### Added

- Private CoinMarketCap v3 crypto quotes and v2 fiat conversions, shared server caching, eight display currencies, fiat transfer entry, and a Bun production server.
- Development mainnet-equivalent valuation for Sepolia ETH, Amoy POL, and supported test tokens; explicit simulation labeling with real test-chain transactions.
- Polygon Amoy with native POL, test USDC, and its explorer; dev servers show Sepolia and Amoy by default with a separate visibility preference.
- BLOCK, a responsive Beast/Octane wallet and transaction terminal with graphite surfaces, lime accents, local fonts, portfolio preview, asset tables, activity, and network navigation.
- Ported Reown AppKit, EVM/Bitcoin adapters, wallet subscriptions, balance reads, crypto quotes, token contracts, and helpers from `ftsb` into native Octane modules.
- Exact-amount native and ERC-20 transfers, gas estimates, simulation, review-before-signing, connected-account checks, and receipt tracking.
- Bitcoin address checksum validation, direct wallet transfer support, and broadcast/confirmation separation.
- Receive QR codes, real AppKit swaps, local transaction journal/export, and persisted privacy/network preferences.
- Unit and browser tests, including mocked wallet execution and viewport verification.

### Fixed

- Network labels, token selection, and balance reads follow the connected provider's chain. App selection switches the wallet; rejected switches preserve the actual network, and external changes invalidate open reviews.
- Token quantities remain visible without prices and on compact layouts; loading balances and tiny holdings no longer appear as zero. Market and FX failures are handled independently.
- Contract-address-based Tether ABI selection, chain-derived native decimals, and correctly optional stablecoin address lookups.
- Wallet identity and review-expiry checks after async RPC work, a shared signing lock across send panels, and upward gas headroom rounding.
- Quote validation and expiry at USD review, market IDs sourced from the token registry, Bitcoin request timeouts and response validation, and duplicate/corrupt history records.
- Asset-row token selection, balance privacy in the send form, preference persistence on immediate reload, receipt polling after hash changes, reverted activity filtering, and development-only Octane profiling.
- Test discovery and typechecking for all test files, deterministic public-service browser fixtures, and a complete `bun run check` workflow.
