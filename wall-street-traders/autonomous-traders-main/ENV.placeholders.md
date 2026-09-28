# Autonomous Traders MAIN v7 — frontend env placeholders

Set on the page **before** `app.js` loads (inline script or hosting inject):

```html
<script>
  window.ZERODEV_PROJECT_ID = "…";  // ZeroDev dashboard project id (RH Chain 4663)
  window.ALCHEMY_API_KEY = "…";     // optional; Alchemy path is UI stub until wired
</script>
<script type="module" src="app.js?v=7"></script>
```

- Missing `ZERODEV_PROJECT_ID` → Create session key button stays disabled; Arm Desk shows configure note. Simulate + Arcus BYOS still work.
- With project id → **Create session key (ZeroDev)** uses vendored `vendor/zerodev-rh.js` (Kernel v3.1 + session/permission key). Bundler/paymaster: `https://rpc.zerodev.app/api/v3/{PROJECT_ID}/chain/4663`.
- Never put Arcus Ed25519 private keys in env, HTML, localStorage, or Edge.
- Session key private material: page memory only (cleared on disconnect/reload). Edge stores `session_pub` + policy metadata only.
- AA execution: client-side UserOp via ZeroDev; Edge `place_rh_chain` logs intent (DEX swap calldata still stub — default UserOp is noop pipeline proof).
