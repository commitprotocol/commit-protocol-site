# Autonomous Traders MAIN v8 — frontend env placeholders

Set on the page **before** `app.js` loads (inline script or hosting inject):

```html
<script>
  window.ZERODEV_PROJECT_ID = "…";  // ZeroDev dashboard project id (RH Chain 4663 MAINNET)
  window.ALCHEMY_API_KEY = "…";     // optional; Alchemy path is UI stub until wired

  // ── RH Chain DEX (Uniswap v3 SwapRouter02) ─────────────────────────
  // Defaults match official Uniswap Robinhood Chain v3 deployments.
  // Override only if you intentionally point at another verified router.
  window.RH_DEX_ROUTER = "0xCaf681a66D020601342297493863E78C959E5cb2"; // SwapRouter02
  window.RH_QUOTER_V2  = "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7"; // optional
  window.RH_USDG       = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // quote (6 decimals)
  window.RH_WETH       = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; // anchor
  window.RH_POOL_FEE   = 3000;   // Uniswap v3 fee tier (100 / 500 / 3000 / 10000)
  window.RH_SLIPPAGE_BPS = 50;   // amountOutMinimum haircut (50 = 0.50%)
  window.RH_QUOTE_DECIMALS = 6;  // USDG
  window.RH_STOCK_DECIMALS = 18; // stock tokens per RH docs

  // REQUIRED for LIVE rh_chain swaps — map Arcus base symbol → stock-token address.
  // Addresses: docs.robinhood.com/chain/token-contracts (not hardcoded here).
  window.RH_TOKEN_MAP = {
    // AAPL: "0x…",
    // NVDA: "0x…",
  };
</script>
<script type="module" src="app.js?v=8"></script>
```

## Behavior

- Missing `ZERODEV_PROJECT_ID` → Create session key button stays disabled; Arm Desk shows configure note. Simulate + Arcus BYOS still work.
- With project id → **Create session key (ZeroDev)** uses vendored `vendor/zerodev-rh.js` (Kernel v3.1 + session/permission key). Bundler/paymaster: `https://rpc.zerodev.app/api/v3/{PROJECT_ID}/chain/4663`.
- Never put Arcus Ed25519 private keys in env, HTML, localStorage, or Edge.
- Session key private material: page memory only (cleared on disconnect/reload). Edge stores `session_pub` + policy metadata only.
- **AA execution (v8):** LIVE `rh_chain` encodes Uniswap v3 `approve` + `exactInputSingle` (SwapRouter02) from Trade form fields, sends as ZeroDev UserOp `callData` (Kernel `encodeCalls`), then logs via Edge `place_rh_chain` with richer `client_userop.dex` metadata.
- Missing `RH_DEX_ROUTER` / `RH_USDG` / `RH_TOKEN_MAP[symbol]` in LIVE → **loud UI error** (never silent noop).
- **Arcus orders remain TESTNET** (`api.testnet.arcus.xyz`). RH Chain = MAINNET. Prices may use Arcus mainnet mids for display.

## Sources

- Router/Quoter: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments
- Stock tokens / USDG venue notes: https://docs.robinhood.com/chain/building-with-stock-tokens/
- AA / ZeroDev: https://docs.robinhood.com/chain/account-abstraction/
