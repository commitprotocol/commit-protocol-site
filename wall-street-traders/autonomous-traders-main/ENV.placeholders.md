# Autonomous Traders MAIN — frontend env (v8 / CSP-safe)

CSP is `script-src 'self'` — **inline `<script>window.…` is blocked by the browser**.

1. Copy `config.example.js` → `config.js`
2. Set your ZeroDev project id (RH Chain 4663):

```js
window.ZERODEV_PROJECT_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
```

3. Load order in `index.html` (already wired):

```html
<script src="config.js"></script>
<script type="module" src="app.js?v=81"></script>
```

Optional for LIVE Uniswap swap on RH Chain:

```js
window.RH_TOKEN_MAP = { AAPL: "0x…", TSLA: "0x…" };
window.RH_DEX_ROUTER = "0xCaf681a66D020601342297493863E78C959E5cb2"; // default
window.RH_USDG = "0x…"; // default wired in app if unset
window.RH_POOL_FEE = 3000;
window.RH_SLIPPAGE_BPS = 50;
window.ALCHEMY_API_KEY = ""; // Alchemy path still stub
```

Do not put private keys in config.js.
