# Autonomous Traders MAIN v6 — frontend env placeholders

Set on the page before app.js loads (or via hosting inject):

  <script>
    window.ZERODEV_PROJECT_ID = "…";  // ZeroDev dashboard project id (RH Chain 4663)
    window.ALCHEMY_API_KEY = "…";     // optional; Alchemy path is UI stub until wired
  </script>

Missing keys: Arm Desk shows “configure AA keys”. Simulate + Arcus BYOS still work.

Never put Arcus Ed25519 private keys in env, HTML, localStorage, or Edge.
AA execution: client-side UserOp with session key; Edge place_rh_chain is a log stub.
