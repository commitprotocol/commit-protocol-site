import {
  createSessionKey as zdCreateSessionKey,
  sendSessionUserOp as zdSendSessionUserOp,
  clearMemSession as zdClearMemSession,
  getMemSession as zdGetMemSession,
  META as ZD_META,
  buildRhDexSwapCalls as zdBuildRhDexSwapCalls,
  parseUnitsDecimal as zdParseUnitsDecimal,
  RH_DEFAULT_DEX_ROUTER,
  RH_DEFAULT_USDG,
  RH_DEFAULT_WETH,
  RH_DEFAULT_QUOTER_V2,
} from "./vendor/zerodev-rh.js";
/* ── Configurable WST NFT contract (Robinhood Chain) ── */
const CONTRACT_ADDRESS = "0x7a5f95f898cf968cac3f9d6231f03f36c3da5b0d";
const CHAIN_HEX = "0x1237"; // Robinhood Chain
const CHAIN_NAME = "Robinhood Chain";
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const SUPPLY = 444;
const IMG_BASE = "https://commitprotocol.org/wall-street-traders/trading-floor/traders";

const REF = "binqxbofehpigwjrwksl";
const BASE = `https://${REF}.supabase.co/functions/v1`;
const EP = {
  prices: `${BASE}/main-prices`,
  pub: `${BASE}/main-public`,
  order: `${BASE}/main-order`,
};
const BETA_PUB =
  "https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/autonomous-public";
const ARCUS_TESTNET = "https://api.testnet.arcus.xyz";
const SS_AI = "wst_main_arcus_account_index_v1";
const LS_ACT = "wst_main_activation_v6"; // meta schema unchanged in v7
const LS_ARMS = "wst_main_venue_arms_v6";
const ZERODEV_PROJECT_ID = (typeof window !== "undefined" && window.ZERODEV_PROJECT_ID) || "";
function getZeroDevProjectId() {
  return (typeof window !== "undefined" && window.ZERODEV_PROJECT_ID) || ZERODEV_PROJECT_ID || "";
}
const ALCHEMY_API_KEY = (typeof window !== "undefined" && window.ALCHEMY_API_KEY) || "";
/** Uniswap v3 SwapRouter02 on RH Chain — official Uniswap docs (v3-robinhood-chain-deployments). Overridable. */
const RH_DEX_ROUTER =
  (typeof window !== "undefined" && window.RH_DEX_ROUTER) || RH_DEFAULT_DEX_ROUTER || "";
const RH_USDG = (typeof window !== "undefined" && window.RH_USDG) || RH_DEFAULT_USDG || "";
const RH_WETH = (typeof window !== "undefined" && window.RH_WETH) || RH_DEFAULT_WETH || "";
const RH_QUOTER_V2 =
  (typeof window !== "undefined" && window.RH_QUOTER_V2) || RH_DEFAULT_QUOTER_V2 || "";
/** Map base symbol → stock-token ERC-20 address on RH Chain. Empty until operator fills. */
const RH_TOKEN_MAP =
  (typeof window !== "undefined" && window.RH_TOKEN_MAP && typeof window.RH_TOKEN_MAP === "object"
    ? window.RH_TOKEN_MAP
    : {}) || {};
const RH_POOL_FEE = Number(
  (typeof window !== "undefined" && window.RH_POOL_FEE) != null ? window.RH_POOL_FEE : 3000
);
/** Slippage bps for amountOutMinimum (default 50 = 0.50%). Arm spend/loss caps still enforced off-chain. */
const RH_SLIPPAGE_BPS = Number(
  (typeof window !== "undefined" && window.RH_SLIPPAGE_BPS) != null ? window.RH_SLIPPAGE_BPS : 50
);
/** Quote token decimals (USDG = 6 on RH Chain). Stock tokens = 18 per RH docs. */
const RH_QUOTE_DECIMALS = Number(
  (typeof window !== "undefined" && window.RH_QUOTE_DECIMALS) != null ? window.RH_QUOTE_DECIMALS : 6
);
const RH_STOCK_DECIMALS = Number(
  (typeof window !== "undefined" && window.RH_STOCK_DECIMALS) != null ? window.RH_STOCK_DECIMALS : 18
);
const WATCH_KEY = "wst_main_watchlist_v1";

const OP_PLACE = 1;
const OP_CANCEL = 2;
const SIDE = { BUY: 0, SELL: 1 };
const TIF = { GTT: 0, FOK: 1, IOC: 2, ALO: 3 };

const DNA_LABELS = [
  ["RISK", "risk_tolerance"],
  ["DISCIPLINE", "discipline"],
  ["PATIENCE", "patience"],
  ["ADAPTABILITY", "adaptability"],
  ["RESEARCH", "research_skill"],
  ["MOMENTUM", "momentum_bias"],
];

const PANELS = [
  "overview",
  "finder",
  "rankings",
  "activity",
  "scan",
  "nfts",
  "profile",
  "arm",
  "trade",
  "brain",
  "venue",
  "developers",
  "notice",
];

const $ = (id) => document.getElementById(id);
const state = {
  tradeMode: localStorage.getItem("wst_main_trade_mode_v6") || "observe",
  wallet: null,
  activation: null,
  arms: { rh_chain: null, arcus: null },
  tape: [],
  markets: [],
  mids: {},
  owned: [],
  traders: [],
  currentToken: null,
  profile: null,
};

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  if (Math.abs(x) >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(x) >= 1) return x.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return x.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
function shortAddr(a) {
  if (!a || a.length < 10) return a || "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function imageUrl(id) {
  return `${IMG_BASE}/${id}.png`;
}
function title(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])
  );
}

/* UI rate-limit (client-side; Edge also rate-limits) */
const uiRate = { place: 0, cancel: 0, pilotSwitch: 0 };
function uiRateOk(kind, minMs = 2500) {
  const now = Date.now();
  if (now - (uiRate[kind] || 0) < minMs) return false;
  uiRate[kind] = now;
  return true;
}




function toInt(value, unit) {
  const n = Number(value) / Number(unit);
  const r = Math.round(n);
  if (Math.abs(n - r) > 1e-9) throw new Error(`${value} is not a multiple of ${unit}`);
  return r;
}
function padWord(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

/* ── Nav / panels (beta IA) ── */
function setPanel(name) {
  if (!PANELS.includes(name)) name = "overview";
  document.querySelectorAll(".autonomous-nav button[data-panel]").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.panel === name ? "true" : "false");
  });
  document.querySelectorAll(".page-panel").forEach((el) => {
    const id = el.id || el.dataset.panel;
    el.classList.toggle("active-panel", id === name || el.dataset.panel === name);
  });
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    setPanel(el.getAttribute("data-nav"));
  });
});
document.querySelectorAll(".autonomous-nav button[data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => setPanel(btn.dataset.panel));
});
document.querySelectorAll("[data-panel-jump]").forEach((el) => {
  el.addEventListener("click", () => setPanel(el.getAttribute("data-panel-jump")));
});

const hash = (location.hash || "#overview").replace("#", "") || "overview";
setPanel(PANELS.includes(hash) ? hash : "overview");

/* ── Profile subnav ── */
function setProfileTab(tab) {
  document.querySelectorAll("#profile-subnav button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.profileTab === tab ? "true" : "false");
  });
  document.querySelectorAll(".profile-subpanel").forEach((p) => {
    const on = p.dataset.profilePanel === tab;
    p.classList.toggle("active-subpanel", on);
    p.hidden = !on;
  });
}
document.querySelectorAll("#profile-subnav button").forEach((b) => {
  b.addEventListener("click", () => setProfileTab(b.dataset.profileTab));
});

/* ── Watchlist (local) ── */
function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCH_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveWatchlist(list) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
}
function renderWatchlist() {
  const list = loadWatchlist();
  const html = list.length
    ? list
        .map(
          (s) =>
            `<button type="button" class="api-chip" data-unwatch="${escapeHtml(s)}">${escapeHtml(s)} ×</button>`
        )
        .join("")
    : `<p class="watchlist-empty">No symbols watched yet. Use + WATCH on tape rows when available.</p>`;
  ["watchlist-strip", "watchlist-strip-tab"].forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = html;
  });
  if ($("watchlist-count")) $("watchlist-count").textContent = String(list.length);
  document.querySelectorAll("[data-unwatch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveWatchlist(loadWatchlist().filter((x) => x !== btn.dataset.unwatch));
      renderWatchlist();
    });
  });
}

/* ── Wallet ── */
function updateConnectButtons() {
  const label = state.wallet ? `CONNECTED ${shortAddr(state.wallet)}` : "CONNECT WALLET";
  ["btn-mm-header", "btn-connect", "btn-connect-nfts"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.textContent = label;
    el.classList.toggle("connected", !!state.wallet);
  });
  const disc = $("btn-mm-disconnect");
  if (disc) disc.hidden = !state.wallet;
  if (state.wallet && $("wallet")) $("wallet").value = state.wallet;
  if ($("profile-wallet"))
    $("profile-wallet").textContent = state.wallet ? shortAddr(state.wallet) : "—";
}

/** Clear wallet-bound UI + Arcus session key. Does not revoke MetaMask permissions (browser-owned). */
function disconnectWallet() {
  state.wallet = null;
  state.owned = [];
  state.activation = null;
  try {
    sessionStorage.removeItem(SS_AI);
    try { localStorage.removeItem(LS_ARMS); } catch {}
    state.arms = { rh_chain: null, arcus: null };
  } catch (_) {}
  try {
    localStorage.removeItem(LS_ACT);
  } catch (_) {}
  if ($("wallet")) $("wallet").value = "";
  if ($("activation_id")) $("activation_id").value = "";
  if ($("token_id")) $("token_id").value = "1";
  if ($("trade_token")) $("trade_token").value = "1";
  if ($("byos_headers")) $("byos_headers").value = "";
  if ($("byos_body")) $("byos_body").value = "";
  if ($("byos_intent")) $("byos_intent").value = "";
  if ($("session_pub")) $("session_pub").value = "";
  try { zdClearMemSession(); } catch (_) {}
  if ($("arcus_account_index")) $("arcus_account_index").value = "0";
  if ($("cancel_order_id")) $("cancel_order_id").value = "";
  if ($("arm-state")) $("arm-state").textContent = "Disconnected. Connect wallet to arm.";
  if ($("rh-arm-status")) $("rh-arm-status").textContent = "DISARMED";
  if ($("arcus-arm-status")) $("arcus-arm-status").textContent = "DISARMED";
  if ($("activation_id_display")) $("activation_id_display").value = "";
  if ($("btn-place")) $("btn-place").disabled = true;
  if ($("trade-state")) $("trade-state").textContent = "Disconnected. Local arm UI cleared.";
  if ($("nfts-status")) $("nfts-status").textContent = "WALLET DISCONNECTED";
  if ($("orders-kpi")) $("orders-kpi").textContent = "—";
  const otb = $("orders-tbody");
  if (otb) otb.innerHTML = `<tr><td colspan="9" class="empty">Connect wallet to load.</td></tr>`;
  const atb = $("activity-tbody");
  if (atb) atb.innerHTML = `<tr><td colspan="8" class="empty">Connect wallet to load Main orders.</td></tr>`;
  const potb = $("profile-orders-tbody");
  if (potb) potb.innerHTML = `<tr><td colspan="7" class="empty">No orders for this wallet yet.</td></tr>`;
  if ($("profile-wallet")) $("profile-wallet").textContent = "—";
  if ($("profile-owned")) $("profile-owned").textContent = "—";
  updateConnectButtons();
  updateKeyStatus();
  try { renderNftGrid(); } catch (_) {}
}

async function switchChain() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (error) {
    if (error?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: CHAIN_NAME,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [RPC_URL],
          },
        ],
      });
    } else throw error;
  }
}

async function connectMetaMask() {
  if (!window.ethereum) {
    const msg = "No MetaMask / ethereum provider. Install MetaMask and retry.";
    if ($("arm-state")) $("arm-state").textContent = JSON.stringify({ error: msg }, null, 2);
    if ($("nfts-status")) $("nfts-status").textContent = msg;
    return null;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const addr = (accounts && accounts[0]) || null;
  if (addr) {
    await switchChain().catch(() => {});
    state.wallet = addr.toLowerCase();
    updateConnectButtons();
    loadOwnedNfts().catch((e) => console.warn(e));
    loadOrders().catch(() => {});
    loadActivity().catch(() => {});
  }
  return addr;
}

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", (accs) => {
    state.wallet = accs && accs[0] ? accs[0].toLowerCase() : null;
    updateConnectButtons();
    if (state.wallet) {
      loadOwnedNfts().catch(() => {});
      loadOrders().catch(() => {});
      loadActivity().catch(() => {});
    } else {
      disconnectWallet();
    }
  });
  window.ethereum
    .request({ method: "eth_accounts" })
    .then((accs) => {
      if (accs && accs[0]) {
        state.wallet = accs[0].toLowerCase();
        updateConnectButtons();
        loadOwnedNfts().catch(() => {});
      }
    })
    .catch(() => {});
}

["btn-connect", "btn-mm-header", "btn-connect-nfts"].forEach((id) => {
  $(id)?.addEventListener("click", () => {
    connectMetaMask().catch((e) => {
      if ($("nfts-status")) $("nfts-status").textContent = String(e?.message || e);
    });
  });
});

$("btn-mm-disconnect")?.addEventListener("click", () => {
  disconnectWallet();
});

/* ── On-chain ownership (ownerOf loop; not enumerable) ── */
async function rpcCall(data) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: CONTRACT_ADDRESS, data }, "latest"],
  };
  // Prefer wallet provider when available (correct chain); else public RPC
  if (window.ethereum) {
    try {
      return await window.ethereum.request({
        method: "eth_call",
        params: [{ to: CONTRACT_ADDRESS, data }, "latest"],
      });
    } catch {
      /* fall through */
    }
  }
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "rpc_error");
  return j.result;
}

async function ownerOf(tokenId) {
  const data = "0x6352211e" + padWord(tokenId);
  const result = await rpcCall(data);
  if (!result || result === "0x") return null;
  return ("0x" + result.slice(-40)).toLowerCase();
}

async function loadOwnedNfts() {
  const note = $("nft-contract-note");
  if (note)
    note.textContent = `Contract: ${CONTRACT_ADDRESS} · ${CHAIN_NAME} · ownerOf scan 1–${SUPPLY}`;
  if (!state.wallet) {
    if ($("nfts-status")) $("nfts-status").textContent = "WALLET NOT CONNECTED";
    renderNftGrid();
    return [];
  }
  if ($("nfts-status"))
    $("nfts-status").textContent = `SCANNING OWNERSHIP ON ${CHAIN_NAME}…`;
  const wallet = state.wallet.toLowerCase();
  const owned = [];
  const batch = 40;
  for (let start = 1; start <= SUPPLY; start += batch) {
    const ids = [];
    for (let id = start; id < start + batch && id <= SUPPLY; id++) ids.push(id);
    const owners = await Promise.all(
      ids.map(async (id) => {
        try {
          const o = await ownerOf(id);
          return o === wallet ? id : null;
        } catch {
          return null;
        }
      })
    );
    owners.forEach((id) => id && owned.push(id));
    if ($("nfts-status"))
      $("nfts-status").textContent = `SCANNING… ${Math.min(start + batch - 1, SUPPLY)}/${SUPPLY} · found ${owned.length}`;
  }
  state.owned = owned;
  if ($("nfts-status"))
    $("nfts-status").textContent = owned.length
      ? `${owned.length} WST NFT${owned.length === 1 ? "" : "S"} · ${shortAddr(wallet)}`
      : `NO WST NFTS IN ${shortAddr(wallet)}`;
  renderNftGrid();
  return owned;
}

function renderNftGrid() {
  const host = $("nft-grid");
  if (!host) return;
  if (!state.wallet) {
    host.innerHTML = `<p class="loading">Connect MetaMask to list WST tokens you own.</p>`;
    return;
  }
  if (!state.owned.length) {
    host.innerHTML = `<p class="loading">No Wall Street Traders found in this wallet on-chain.</p>`;
    return;
  }
  host.innerHTML = state.owned
    .map(
      (id) => `<button type="button" class="nft-card" data-open-token="${id}">
      <img src="${imageUrl(id)}" alt="WST #${id}" loading="lazy" />
      <div class="nft-meta"><b>TRADER #${id}</b><small>OWNED · OPEN PROFILE</small></div>
    </button>`
    )
    .join("");
  host.querySelectorAll("[data-open-token]").forEach((btn) => {
    btn.addEventListener("click", () => openTrader(Number(btn.dataset.openToken)));
  });
}

/* ── DNA / profile ── */
function hasRichDna(dna) {
  if (!dna || typeof dna !== "object") return false;
  return DNA_LABELS.some(([_, k]) => dna[k] != null) || dna.archetype || dna.traits;
}

function normalizeTrader(mainRow, beta) {
  const dna = mainRow?.dna && hasRichDna(mainRow.dna) ? mainRow.dna : null;
  const src = dna || beta?.trader || {};
  const token_id = Number(mainRow?.token_id || beta?.trader?.token_id || state.currentToken || 1);
  return {
    token_id,
    status: mainRow?.status || "dormant",
    name: src.name || `Wall Street Trader #${token_id}`,
    rarity_tier: src.rarity_tier || src.traits?.["Rarity Tier"] || "—",
    rarity_score: src.rarity_score ?? "—",
    archetype: src.archetype || "—",
    risk_tolerance: Number(src.risk_tolerance ?? 50),
    discipline: Number(src.discipline ?? 50),
    patience: Number(src.patience ?? 50),
    adaptability: Number(src.adaptability ?? 50),
    research_skill: Number(src.research_skill ?? 50),
    momentum_bias: Number(src.momentum_bias ?? 50),
    traits: src.traits || {},
    dna_version: src.dna_version || (dna ? "main" : beta ? "beta-read" : "empty"),
    dna_source: dna ? "main_traders.dna" : beta ? "beta autonomous-public (read-only)" : "none",
    raw_main_dna: mainRow?.dna || null,
    activation: mainRow?.activation || null,
  };
}

function renderDnaBars(trader) {
  const host = $("dna-bars");
  if (!host) return;
  host.innerHTML = DNA_LABELS.map(
    ([label, key]) =>
      `<div class="dna-row"><header><span>${label}</span><b>${trader[key]}/100</b></header><div class="bar"><i style="width:${trader[key]}%"></i></div></div>`
  ).join("");
}

function renderTraits(traits) {
  const host = $("traits");
  if (!host) return;
  const entries = Object.entries(traits || {}).filter(([, v]) => v != null && v !== "");
  if (!entries.length) {
    host.innerHTML = `<div class="trait"><span>TRAITS</span><b>Unavailable</b></div>`;
    return;
  }
  host.innerHTML = entries
    .map(
      ([k, v]) =>
        `<div class="trait"><span>${escapeHtml(String(k).toUpperCase())}</span><b>${escapeHtml(String(v))}</b></div>`
    )
    .join("");
}

function renderDigest(trader) {
  const owned = state.owned.includes(trader.token_id);
  const act = trader.activation;
  const text = `Trader #${trader.token_id} · archetype ${title(trader.archetype)} · rarity ${trader.rarity_tier} (${trader.rarity_score}/100).
DNA source: ${trader.dna_source}. Main status: ${trader.status}.
${owned ? "This wallet owns this NFT on-chain." : "Ownership not confirmed for the connected wallet."}
${act ? `Active activation ${act.id} · venue ${act.venue} · caps notional $${act.caps?.max_notional_usd ?? "—"} / max loss $${act.caps?.max_loss_usd ?? "—"}.` : "No active Main activation — use Arm Desk to opt in."}
RH Chain = MAINNET UserOp/DEX · Arcus orders = TESTNET. Paper beta swarm is a separate URL.`;
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  ["portfolio-digest", "portfolio-digest-tab"].forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = html;
  });
  if ($("second-brain-line"))
    $("second-brain-line").textContent =
      `pass_1: DNA · ${title(trader.archetype)} — pass_2: Grok · pending`;
}

function renderProfile(trader) {
  state.profile = trader;
  state.currentToken = trader.token_id;
  $("trader-image").src = imageUrl(trader.token_id);
  $("trader-image").alt = `Wall Street Trader #${trader.token_id}`;
  $("public-file").textContent = `PUBLIC FILE / WST-${trader.token_id}`;
  $("trader-name").textContent = `TRADER #${trader.token_id}`;
  $("archetype").textContent = title(trader.archetype);
  $("rarity-score").textContent =
    trader.rarity_score === "—" ? "—" : `${trader.rarity_score}/100`;
  $("dna-version").textContent = String(trader.dna_source).toUpperCase();
  $("dna-archetype").textContent = title(trader.archetype).toUpperCase();
  $("rarity-badge").textContent = String(trader.rarity_tier || "—").toUpperCase();
  $("identity-season").textContent = "MAIN · OPT-IN";
  $("agent-status").textContent = String(trader.status || "—").toUpperCase();
  $("trader-status-kpi").textContent = String(trader.status || "—").toUpperCase();
  $("profile-owned").textContent = state.owned.includes(trader.token_id)
    ? "YES · ON-CHAIN"
    : state.wallet
      ? "NOT IN WALLET"
      : "CONNECT TO VERIFY";
  $("total-value").textContent = "—";
  $("total-return").textContent = "MAIN · NO PAPER BOOK";

  const act = trader.activation || state.activation;
  if (act?.id) {
    $("activation-kpi").textContent = shortAddr(act.id);
    $("activation-kpi-note").textContent = `${act.status || "active"} · ${act.venue || "arcus"}`;
    $("budget-ring-value").textContent =
      `$${act.caps?.max_notional_usd ?? "—"} notional · $${act.caps?.max_loss_usd ?? "—"} max loss`;
    if ($("risk-caps-state"))
      $("risk-caps-state").textContent = JSON.stringify(act, null, 2);
    if ($("activation_id")) $("activation_id").value = act.id;
  } else {
    $("activation-kpi").textContent = "NONE";
    $("activation-kpi-note").textContent = "opt-in required";
    $("budget-ring-value").textContent = "Caps not set";
  }

  if ($("token_id")) $("token_id").value = trader.token_id;
  if ($("trade_token")) $("trade_token").value = trader.token_id;

  renderDnaBars(trader);
  renderTraits(trader.traits);
  renderDigest(trader);
  renderWatchlist();
  setProfileTab("overview");
  if ($("profile-error")) $("profile-error").hidden = true;
}

async function fetchMainTrader(tokenId) {
  try {
    const res = await fetch(`${EP.pub}?token_id=${tokenId}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.error) return data;
    }
  } catch {
    /* fall through */
  }
  // Fallback: pull from traders list + activations
  try {
    const res = await fetch(`${EP.pub}?traders=1&activations=1&wallet=${encodeURIComponent(state.wallet || "")}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const trader = (data.traders || []).find((t) => Number(t.token_id) === Number(tokenId)) || {
      token_id: Number(tokenId),
      status: "dormant",
      dna: null,
    };
    const activation = (data.activations || []).find(
      (a) => Number(a.token_id) === Number(tokenId) && a.status === "active"
    ) || null;
    return { trader, activation };
  } catch (e) {
    return { trader: { token_id: Number(tokenId), status: "dormant", dna: null }, activation: null };
  }
}

async function fetchBetaDna(tokenId) {
  try {
    const res = await fetch(`${BETA_PUB}?token_id=${tokenId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function openTrader(tokenId, { navigate = true } = {}) {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id < 1 || id > 444) return;
  state.currentToken = id;
  if (navigate) setPanel("profile");
  if ($("status")) $("status").textContent = `Loading trader #${id}…`;
  try {
    const [main, beta] = await Promise.all([fetchMainTrader(id), fetchBetaDna(id)]);
    const row = {
      token_id: id,
      status: main?.trader?.status || main?.status || "dormant",
      dna: main?.trader?.dna || main?.dna || null,
      activation: main?.activation || null,
    };
    const trader = normalizeTrader(row, beta);
    renderProfile(trader);
    if ($("status")) $("status").textContent = `Trader #${id} loaded.`;
    loadOrders().catch(() => {});
  } catch (e) {
    if ($("profile-error")) {
      $("profile-error").hidden = false;
      $("profile-error-text").textContent = String(e?.message || e);
    }
  }
}

$("search-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  openTrader(Number($("token-input").value));
});
$("profile-retry-btn")?.addEventListener("click", () =>
  openTrader(state.currentToken || 1)
);

function goArmTrade(panel) {
  if (state.currentToken) {
    if ($("token_id")) $("token_id").value = state.currentToken;
    if ($("trade_token")) $("trade_token").value = state.currentToken;
  }
  if (state.wallet && $("wallet")) $("wallet").value = state.wallet;
  setPanel(panel);
}
["btn-arm-from-profile", "btn-arm-inline"].forEach((id) =>
  $(id)?.addEventListener("click", () => goArmTrade("arm"))
);
["btn-trade-from-profile", "btn-trade-inline"].forEach((id) =>
  $(id)?.addEventListener("click", () => goArmTrade("trade"))
);

/* ── Tape / public ── */
function renderTape(tapeItems) {
  const track = $("price-tape");
  if (!track) return;
  const items = tapeItems?.length
    ? tapeItems
    : [{ symbol: "WAIT", mid: null, arcus_market: "—" }];
  const html = items
    .map((t) => {
      const mid = t.mid != null ? fmt(t.mid) : "—";
      return `<span class="tape-item"><b>${t.symbol}</b><em>${mid}</em><i>${t.arcus_market || "ARCUS"}</i></span>`;
    })
    .join("");
  track.innerHTML = html + html;
}

function renderAssetsTable(tape) {
  const tb = $("assets-tbody");
  if (!tb) return;
  if (!tape?.length) {
    tb.innerHTML = `<tr><td colspan="4" class="empty">No assets / mids yet.</td></tr>`;
    return;
  }
  tb.innerHTML = tape
    .map((r) => {
      const sym = r.symbol;
      return `<tr>
        <td><b>${escapeHtml(sym)}</b> <button type="button" class="ghost-btn" style="padding:4px 8px;margin-left:6px" data-watch="${escapeHtml(sym)}">+ WATCH</button></td>
        <td>${escapeHtml(r.arcus_market || "—")}</td>
        <td>${escapeHtml(r.display_name || "—")}</td>
        <td class="mid">${r.mid != null ? fmt(r.mid) : "—"}</td>
      </tr>`;
    })
    .join("");
  tb.querySelectorAll("[data-watch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.watch.toUpperCase();
      const list = loadWatchlist();
      if (!list.includes(s)) {
        list.push(s);
        saveWatchlist(list);
        renderWatchlist();
      }
    });
  });
}

function fillMarketSelect() {
  const sel = $("trade_market");
  if (!sel) return;
  const prev = sel.value;
  const fromTape = (state.tape || []).map((t) => t.arcus_market || t.symbol);
  const fromMkts = (state.markets || []).map((m) => m.marketDisplayName);
  const syms = [...new Set([...fromTape, ...fromMkts].filter(Boolean))].sort();
  if (!syms.length) {
    sel.innerHTML = `<option value="AAPL-USD">AAPL-USD</option>`;
    return;
  }
  sel.innerHTML = syms.map((s) => `<option value="${s}">${s}</option>`).join("");
  if (prev && syms.includes(prev)) sel.value = prev;
  else if (syms.includes("AAPL-USD")) sel.value = "AAPL-USD";
  prefillPrice();
}

function findMarket(name) {
  return (state.markets || []).find(
    (m) =>
      m.marketDisplayName === name ||
      String(m.marketId) === String(name) ||
      m.baseAsset === name
  );
}

function prefillPrice() {
  const mkt = $("trade_market")?.value;
  if (!mkt || !$("trade_price")) return;
  const mid =
    state.mids[mkt] != null
      ? Number(state.mids[mkt])
      : state.tape.find((t) => (t.arcus_market || t.symbol) === mkt)?.mid;
  const meta = findMarket(mkt);
  if (mid != null && Number.isFinite(mid)) {
    const tick = meta ? Number(meta.tickSize) : 0.01;
    const snapped = Math.round(mid / tick) * tick;
    $("trade_price").value = String(Number(snapped.toFixed(10)));
  }
  if (meta && $("trade-mkt-meta")) {
    $("trade-mkt-meta").textContent =
      `${mkt} · marketId=${meta.marketId} · tick=${meta.tickSize} · step=${meta.stepSize} · type=${meta.type || "?"} · Arcus TESTNET markets (RH DEX uses RH_TOKEN_MAP)`;
  }
}
$("trade_market")?.addEventListener("change", prefillPrice);

function renderApiChips() {
  const host = $("api-chips");
  if (!host) return;
  const chips = [
    { label: "overview", q: "overview=1" },
    { label: "assets", q: "assets=1" },
    { label: "prices", q: "prices=1" },
    { label: "traders", q: "traders=1" },
    { label: "token_id=1", q: "token_id=1" },
    { label: "activations", q: "activations=1&wallet=0x..." },
    { label: "main-prices", href: EP.prices },
    { label: "main-order", href: EP.order },
  ];
  host.innerHTML = chips
    .map((c) => {
      const href = c.href || `${EP.pub}?${c.q}`;
      return `<a class="chip" href="${href}" target="_blank" rel="noopener"><code>${c.label}</code> →</a>`;
    })
    .join("");
}

function updateKeyStatus() { /* v6: no private keys in session */ }


async function loadPublic() {
  const url = `${EP.pub}?overview=1&assets=1&prices=1&traders=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();
  if ($("dev-payload")) $("dev-payload").textContent = JSON.stringify(data, null, 2);
  const ov = data.overview || {};
  if ($("m-assets")) $("m-assets").textContent = ov.assets_active ?? "—";
  if ($("m-traders"))
    $("m-traders").textContent = `${ov.traders_total ?? "—"} / ${ov.traders_armed ?? "—"}`;
  if ($("m-armed-note"))
    $("m-armed-note").textContent = `${ov.activations_active ?? 0} active activations`;
  if ($("m-mids")) $("m-mids").textContent = ov.arcus_mid_count ?? "—";
  if ($("m-mids-note"))
    $("m-mids-note").textContent = ov.arcus_ok
      ? `live · ${ov.tape_source || "arcus"}`
      : "arcus down";
  const prices = data.prices || {};
  state.tape = prices.tape || [];
  state.mids = prices.mids || {};
  state.traders = data.traders || [];
  renderTape(state.tape);
  renderAssetsTable(state.tape);
  fillMarketSelect();
  renderRankings();
  if ($("tape-captured"))
    $("tape-captured").textContent = prices.captured_at
      ? `captured ${prices.captured_at}`
      : "—";
  return data;
}

async function loadPricesEdge() {
  try {
    const res = await fetch(EP.prices, { headers: { Accept: "application/json" } });
    const data = await res.json();
    if ($("venue-status")) $("venue-status").textContent = data.arcus_ok ? "LIVE" : "DOWN";
    if ($("v-source")) $("v-source").textContent = data.source || "arcus";
    if ($("v-ok")) $("v-ok").textContent = String(!!data.arcus_ok);
    if ($("v-captured")) $("v-captured").textContent = data.captured_at || "—";
    if ($("v-upserted"))
      $("v-upserted").textContent = data.upserted != null ? String(data.upserted) : "—";
    if ($("v-upsert-err"))
      $("v-upsert-err").textContent = data.upsert_error
        ? `err: ${data.upsert_error}`
        : "service role path ok / idle";
    if (data.mids) state.mids = { ...state.mids, ...data.mids };
    return data;
  } catch (e) {
    if ($("venue-status")) $("venue-status").textContent = "ERROR";
    return null;
  }
}

async function loadTestnetMarkets() {
  try {
    const res = await fetch(`${ARCUS_TESTNET}/v1/markets`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    state.markets = data.markets || data || [];
    fillMarketSelect();
    return state.markets;
  } catch {
    return [];
  }
}

function renderRankings() {
  const host = $("leaderboard");
  if (!host) return;
  const rows = (state.traders || [])
    .slice()
    .sort((a, b) => {
      const rank = (s) => (s === "armed" ? 0 : 1);
      return rank(a.status) - rank(b.status) || a.token_id - b.token_id;
    })
    .slice(0, 50);
  if (!rows.length) {
    host.innerHTML = `<p class="loading">No Main traders loaded yet.</p>`;
    return;
  }
  host.innerHTML = rows
    .map(
      (r, i) =>
        `<a class="leader-row" href="#profile" data-token="${r.token_id}"><b>#${i + 1}</b><img src="${imageUrl(r.token_id)}" alt="WST #${r.token_id}" loading="lazy"><div><strong>TRADER #${r.token_id}</strong><br><small>${escapeHtml(String(r.status || "").toUpperCase())}</small></div><span class="gain">${escapeHtml(String(r.status || "").toUpperCase())}</span></a>`
    )
    .join("");
  host.querySelectorAll("[data-token]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openTrader(Number(a.dataset.token));
    });
  });
}

$("scan-run-btn")?.addEventListener("click", () => {
  const status = ($("scan-status")?.value || "").toLowerCase();
  const token = Number($("scan-token")?.value);
  let rows = state.traders || [];
  if (status) rows = rows.filter((r) => String(r.status).toLowerCase() === status);
  if (Number.isInteger(token) && token >= 1)
    rows = rows.filter((r) => r.token_id === token);
  const host = $("scan-results");
  if ($("scan-count")) $("scan-count").textContent = String(rows.length);
  if ($("scan-status-label")) $("scan-status-label").textContent = `${rows.length} MATCHES`;
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<p class="loading">No matches.</p>`;
    return;
  }
  host.innerHTML = rows
    .slice(0, 50)
    .map(
      (r) =>
        `<a class="leader-row" href="#profile" data-token="${r.token_id}"><b>#${r.token_id}</b><img src="${imageUrl(r.token_id)}" alt="" loading="lazy"><div><strong>TRADER #${r.token_id}</strong><br><small>${escapeHtml(String(r.status || "").toUpperCase())}</small></div><span>${escapeHtml(String(r.status || "").toUpperCase())}</span></a>`
    )
    .join("");
  host.querySelectorAll("[data-token]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openTrader(Number(a.dataset.token));
    });
  });
});

/* ── Arm / Trade (Main v2) ── */
function restoreActivation() {
  try {
    const raw = localStorage.getItem(LS_ACT);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.activation = d.activation || d;
    if (state.activation?.id && $("activation_id"))
      $("activation_id").value = state.activation.id;
    if (state.activation?.token_id) {
      if ($("token_id")) $("token_id").value = state.activation.token_id;
      if ($("trade_token")) $("trade_token").value = state.activation.token_id;
    }
    if (state.activation?.wallet) {
      if ($("wallet")) $("wallet").value = state.activation.wallet;
      if (!state.wallet) state.wallet = state.activation.wallet;
    }
    if ($("arm-state"))
      $("arm-state").textContent = JSON.stringify(state.activation, null, 2);
    updateConnectButtons();
  } catch {
    /* ignore */
  }
}


/** Harden v4: wallet-signed challenge via main-public (personal_sign). */
async function walletChallenge(purpose, extra = {}) {
  const wallet = (extra.wallet || state.wallet || $("wallet")?.value || "").trim();
  if (!wallet) throw new Error("Connect wallet first");
  if (!window.ethereum) throw new Error("MetaMask required for signed activate/revoke");
  const pr = await fetch(EP.pub, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "challenge", purpose, wallet, ...extra }) });
  const ch = await pr.json();
  if (!ch?.nonce || !ch?.message) throw new Error(ch?.error || "challenge_failed");
  const signature = await window.ethereum.request({ method: "personal_sign", params: [ch.message, wallet] });
  return { wallet, nonce: ch.nonce, signature, message: ch.message, expires_at: ch.expires_at };
}




// trade-form handler replaced in v6 block below

$("btn-simulate")?.addEventListener("click", async () => {
  const wallet = ($("wallet")?.value || state.wallet || "").trim();
  const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
  const market = $("trade_market").value;
  const body = {
    action: "simulate",
    activation_id: activation_id || undefined,
    wallet: wallet || undefined,
    token_id: Number($("trade_token").value) || 1,
    market,
    orderSide: $("trade_side").value,
    quantity: $("trade_qty").value,
    price: $("trade_price").value,
    note: "ui_simulate",
    source: "trade_panel",
  };
  try {
    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    $("trade-state").textContent = JSON.stringify(data, null, 2);
    loadOrders().catch(() => {});
    loadActivity().catch(() => {});
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});

function renderOrdersInto(tb, orders) {
  if (!tb) return;
  if (!orders.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">No orders yet.</td></tr>`;
    return;
  }
  tb.innerHTML = orders
    .map(
      (o) => `<tr>
        <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
        <td>${o.token_id ?? "—"}</td>
        <td>${o.market || "—"}</td>
        <td>${o.side || "—"}</td>
        <td>${o.qty ?? "—"}</td>
        <td class="mid">${o.price ?? "—"}</td>
        <td>${o.status || "—"}</td>
        <td>${o.arcus_env || "—"}</td>
      </tr>`
    )
    .join("");
}

async function loadOrders() {
  const wallet = state.wallet || $("wallet")?.value?.trim();
  if (!wallet) return;
  try {
    const res = await fetch(`${EP.order}?wallet=${encodeURIComponent(wallet)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const orders = data.orders || [];
    if ($("orders-kpi")) $("orders-kpi").textContent = String(orders.length);
    const tb = $("orders-tbody");
    if (tb) {
      if (!orders.length) {
        tb.innerHTML = `<tr><td colspan="9" class="empty">No orders yet.</td></tr>`;
      } else {
        tb.innerHTML = orders
          .map(
            (o) => {
              const gtt = o.good_til_time
                ? new Date(Number(o.good_til_time) / 1000).toLocaleString()
                : "—";
              return `<tr>
            <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
            <td>${o.market || "—"}</td>
            <td>${o.side || "—"}</td>
            <td>${o.qty ?? "—"}</td>
            <td class="mid">${o.price ?? "—"}</td>
            <td>${o.status || "—"}</td>
            <td>${o.actor || "holder"}</td>
            <td>${gtt}</td>
            <td>${o.arcus_env || "TESTNET"}</td>
          </tr>`;
            }
          )
          .join("");
      }
    }
    const ptb = $("profile-orders-tbody");
    if (ptb) {
      const filtered = state.currentToken
        ? orders.filter((o) => Number(o.token_id) === Number(state.currentToken))
        : orders;
      if (!filtered.length) {
        ptb.innerHTML = `<tr><td colspan="7" class="empty">No orders for this trader yet.</td></tr>`;
      } else {
        ptb.innerHTML = filtered
          .map(
            (o) => `<tr>
            <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
            <td>${o.market || "—"}</td>
            <td>${o.side || "—"}</td>
            <td>${o.qty ?? "—"}</td>
            <td class="mid">${o.price ?? "—"}</td>
            <td>${o.status || "—"}</td>
            <td>${o.arcus_env || "—"}</td>
          </tr>`
          )
          .join("");
      }
    }
  } catch (e) {
    console.warn(e);
  }
}

async function loadActivity() {
  const wallet = state.wallet || $("wallet")?.value?.trim();
  const tb = $("activity-tbody");
  if (!tb) return;
  if (!wallet) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">Connect wallet to load Main orders.</td></tr>`;
    return;
  }
  if ($("activity-status")) $("activity-status").textContent = "LOADING…";
  try {
    const res = await fetch(`${EP.order}?wallet=${encodeURIComponent(wallet)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const orders = data.orders || [];
    if ($("activity-status")) $("activity-status").textContent = `${orders.length} ROWS`;
    renderOrdersInto(tb, orders);
  } catch (e) {
    if ($("activity-status")) $("activity-status").textContent = "ERROR";
    tb.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(String(e))}</td></tr>`;
  }
}

$("btn-refresh-orders")?.addEventListener("click", () => {
  loadOrders();
  loadActivity();
});

function brainLog(line) {
  const el = $("brain-log");
  if (!el) return;
  el.textContent += (el.textContent.endsWith("\n") ? "" : "\n") + line + "\n";
  el.scrollTop = el.scrollHeight;
}

async function runSecondPass() {
  brainLog("$ run policy second pass…");
  brainLog("COMING_SOON · live Grok / xAI (not required for this path)");
  const midSym =
    state.tape.find((t) => t.mid != null) || {
      symbol: "AAPL",
      arcus_market: "AAPL-USD",
      mid: Number(state.mids["AAPL-USD"]) || 0,
    };
  const dna = {
    bias: state.profile?.archetype || "main_stub",
    risk: "caps_first",
    token_id: Number($("trade_token")?.value || state.currentToken || state.activation?.token_id || 1),
  };
  const side = "BUY";
  const qty = "0.01";
  const price = String(midSym.mid || $("trade_price")?.value || "1");
  brainLog(`dna=${JSON.stringify(dna)}`);
  brainLog(`signal mid ${midSym.arcus_market || midSym.symbol}=${midSym.mid} → ${side} ${qty} @ ${price}`);
  try {
    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "simulate",
        activation_id: state.activation?.id || $("activation_id")?.value || undefined,
        wallet: state.wallet || $("wallet")?.value || undefined,
        token_id: dna.token_id,
        market: midSym.arcus_market || midSym.symbol,
        orderSide: side,
        quantity: qty,
        price,
        note: "second_brain_policy_pass",
        source: "second_brain",
      }),
    });
    const data = await res.json();
    brainLog(`intent ${data.intent?.id || "?"} status=${data.intent?.status || data.error}`);
    brainLog(JSON.stringify(data.order || data, null, 2));
    loadOrders().catch(() => {});
    loadActivity().catch(() => {});
  } catch (e) {
    brainLog(`error ${e?.message || e}`);
  }
  brainLog("$ done");
}
$("btn-second-pass")?.addEventListener("click", () => runSecondPass());
$("btn-second-pass-profile")?.addEventListener("click", () => {
  setPanel("brain");
  runSecondPass();
});

$("btn-refresh")?.addEventListener("click", () => {
  Promise.all([loadPublic(), loadPricesEdge(), loadTestnetMarkets()]).catch((err) => {
    if ($("dev-payload")) $("dev-payload").textContent = String(err);
  });
});

/* ── Boot ── */
if ($("nft-contract-note"))
  $("nft-contract-note").textContent =
    `Contract: ${CONTRACT_ADDRESS} · ${CHAIN_NAME} (${CHAIN_HEX}) · RPC ${RPC_URL}`;

renderApiChips();
restoreActivation();
updateKeyStatus();
updateConnectButtons();
renderWatchlist();

Promise.all([loadPublic(), loadPricesEdge(), loadTestnetMarkets()])
  .then(() => {
    loadOrders().catch(() => {});
    loadActivity().catch(() => {});
  })
  .catch((err) => {
    if ($("dev-payload")) $("dev-payload").textContent = String(err);
    renderTape([]);
  });

setInterval(() => {
  loadPublic().catch(() => {});
  loadPricesEdge().catch(() => {});
}, 45000);



function syncTradeModeUI() {
  const mode = state.tradeMode === "live" || state.tradeMode === "pilot" ? "live" : "observe";
  state.tradeMode = mode;
  document.querySelectorAll("[data-trade-mode]").forEach((el) => {
    const m = el.getAttribute("data-trade-mode");
    el.setAttribute("aria-pressed", m === mode ? "true" : "false");
  });
  const badge = $("trade-mode-badge");
  if (badge) badge.textContent = mode === "live" ? "LIVE · ARMED VENUE ONLY" : "OBSERVE · SIMULATE ONLY";
  try { persistArms(); } catch {}
}
/* v6 trade-mode clicks registered later; keep sync helper */
syncTradeModeUI();


$("btn-cancel-order")?.addEventListener("click", async () => {
  const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
  const wallet = ($("wallet")?.value || state.wallet || "").trim();
  const local_order_id = ($("cancel_order_id")?.value || "").trim();
  let arcus_order_id = ($("cancel_arcus_order_id")?.value || "").trim();
  let market = ($("cancel_market")?.value || $("trade_market")?.value || "").trim();

  if ((state.tradeMode || "observe") !== "live") {
    $("trade-state").textContent = "Cancel requires PLACE VIA ARMED VENUE mode + BYOS signed headers.";
    return;
  }
  if (!uiRateOk("cancel", 2500)) {
    $("trade-state").textContent = "Slow down — UI rate limit (2.5s between cancels).";
    return;
  }
  if (!activation_id || !wallet) {
    $("trade-state").textContent = "Need activation_id + wallet for cancel.";
    return;
  }
  if (!state.arms?.arcus) {
    $("trade-state").textContent = "Arm Arcus BYOS first for signed cancel.";
    return;
  }
  // BYOS cancel: require pre-signed headers (same as place)
  let headers = {};
  let cancel_body = {};
  try {
    headers = JSON.parse($("byos_headers")?.value || "{}");
    cancel_body = JSON.parse($("byos_body")?.value || "{}");
  } catch {
    $("trade-state").textContent = "Paste valid signed headers + cancel body JSON (BYOS).";
    return;
  }
  const blob = JSON.stringify({ headers, cancel_body });
  if (/private[_ ]?key|mnemonic|seed|signing_key/i.test(blob)) {
    $("trade-state").textContent = "Rejected: remove private key fields.";
    return;
  }
  if (!headers["X-API-Key"] && !headers["x-api-key"]) {
    $("trade-state").textContent = "BYOS cancel needs signed headers from external signer.";
    return;
  }
  $("trade-state").textContent = "Submitting BYOS signed cancel…";
  try {
    const data = await postJSON(ORDER_URL, {
      action: "cancel",
      activation_id,
      wallet,
      local_order_id: local_order_id || null,
      arcus_order_id: arcus_order_id || null,
      market: market || null,
      headers,
      arcus_body: cancel_body,
      idempotency_key: `cancel-${Date.now()}`,
    });
    $("trade-state").textContent = data.ok
      ? `Cancel submitted · ${data.arcus_order_id || local_order_id || "ok"}`
      : (data.error || "cancel_failed");
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});


/* ═══════════════ MAIN v6 Dual-Venue Arm Desk ═══════════════ */
function capsFromForm() {
  return {
    max_notional_usd: Number($("max_notional")?.value) || 1000,
    max_loss_usd: Number($("max_loss")?.value) || 200,
    spot_only: !!$("spot_only")?.checked,
    allow_mainnet: false,
  };
}

function persistArms() {
  try {
    localStorage.setItem(LS_ARMS, JSON.stringify({ arms: state.arms, activation: state.activation }));
  } catch {}
  const actId = state.activation?.id || state.arms?.arcus?.activation_id || state.arms?.rh_chain?.activation_id || "";
  if ($("activation_id")) $("activation_id").value = actId;
  if ($("activation_id_display")) $("activation_id_display").value = actId;
  if ($("rh-arm-status"))
    $("rh-arm-status").textContent = state.arms?.rh_chain ? "ARMED" : "DISARMED";
  if ($("arcus-arm-status"))
    $("arcus-arm-status").textContent = state.arms?.arcus ? "ARMED" : "DISARMED";
  const live = (state.tradeMode || "observe") === "live";
  const hasArm = !!(state.arms?.arcus || state.arms?.rh_chain);
  if ($("btn-place")) $("btn-place").disabled = !(live && hasArm);
}

function restoreArms() {
  try {
    const raw = localStorage.getItem(LS_ARMS);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.arms = d.arms || { rh_chain: null, arcus: null };
    if (d.activation) state.activation = d.activation;
    persistArms();
    if ($("arm-state"))
      $("arm-state").textContent = JSON.stringify({ arms: state.arms, activation: state.activation }, null, 2);
  } catch {}
}

function showAaConfigNote() {
  const missingZd = !getZeroDevProjectId();
  const missingAll = !getZeroDevProjectId() && !ALCHEMY_API_KEY;
  if ($("aa-config-note")) $("aa-config-note").hidden = !missingAll;
  const btn = $("btn-zd-create");
  if (btn) {
    btn.disabled = missingZd;
    btn.title = missingZd
      ? "Set window.ZERODEV_PROJECT_ID (ENV.placeholders.md)"
      : "Create Kernel + session key via vendored ZeroDev (MetaMask)";
  }
}

async function armVenue(action, extra = {}) {
  let wallet = ($("wallet")?.value || state.wallet || "").trim();
  if (!wallet && window.ethereum) {
    await connectMetaMask();
    wallet = state.wallet || "";
  }
  const token_id = Number($("token_id")?.value) || 1;
  if ($("arm-state")) $("arm-state").textContent = `Requesting signature for ${action}…`;
  const proof = await walletChallenge("arm", { wallet, token_id });
  const body = {
    action,
    wallet: proof.wallet,
    token_id,
    caps: capsFromForm(),
    nonce: proof.nonce,
    signature: proof.signature,
    ...extra,
  };
  const res = await fetch(EP.pub, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if ($("arm-state")) $("arm-state").textContent = JSON.stringify(data, null, 2);
  if (!data.ok) throw new Error(data.error || "arm_failed");
  if (data.activation) {
    state.activation = data.activation;
    localStorage.setItem(LS_ACT, JSON.stringify({ activation: data.activation }));
  }
  if (data.venue_arm) {
    const v = data.venue_arm.venue;
    state.arms[v] = data.venue_arm;
  }
  persistArms();
  return data;
}

async function disarmVenue(venue) {
  const wallet = ($("wallet")?.value || state.wallet || "").trim();
  if (!wallet) throw new Error("Connect wallet first");
  const token_id = Number($("token_id")?.value) || state.activation?.token_id || null;
  if ($("arm-state")) $("arm-state").textContent = `Requesting disarm signature (${venue || "all"})…`;
  const proof = await walletChallenge("disarm", { wallet, token_id });
  const body = {
    action: "disarm",
    wallet: proof.wallet,
    nonce: proof.nonce,
    signature: proof.signature,
  };
  if (venue) body.venue = venue;
  if (token_id) body.token_id = token_id;
  const res = await fetch(EP.pub, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if ($("arm-state")) $("arm-state").textContent = JSON.stringify(data, null, 2);
  if (venue) state.arms[venue] = null;
  else state.arms = { rh_chain: null, arcus: null };
  if (!venue) state.activation = null;
  persistArms();
  return data;
}

$("btn-arm-arcus")?.addEventListener("click", async () => {
  try {
    const pub = ($("arcus_api_key_pub")?.value || "").trim();
    const ai = Number($("arcus_account_index")?.value) || 0;
    sessionStorage.setItem(SS_AI, String(ai));
    await armVenue("arm_arcus_byos", {
      arcus_account_index: ai,
      ...(pub ? { arcus_api_key_pub: pub } : {}),
    });
  } catch (err) {
    if ($("arm-state")) $("arm-state").textContent = String(err?.message || err);
  }
});

$("btn-arm-rh")?.addEventListener("click", async () => {
  try {
    const session_pub = ($("session_pub")?.value || "").trim();
    const aa = ($("aa_provider")?.value || "zerodev");
    await armVenue("arm_rh_chain", {
      aa_provider: aa,
      session_pub,
      ttl_sec: Number($("session_ttl")?.value) || 86400,
      spend_limit_usd: Number($("spend_limit")?.value) || 1000,
    });
  } catch (err) {
    if ($("arm-state")) $("arm-state").textContent = String(err?.message || err);
  }
});

$("btn-disarm-arcus")?.addEventListener("click", async () => {
  try { await disarmVenue("arcus"); } catch (err) {
    if ($("arm-state")) $("arm-state").textContent = String(err?.message || err);
  }
});
$("btn-disarm-rh")?.addEventListener("click", async () => {
  try { await disarmVenue("rh_chain"); } catch (err) {
    if ($("arm-state")) $("arm-state").textContent = String(err?.message || err);
  }
});
$("btn-disarm-all")?.addEventListener("click", async () => {
  try { await disarmVenue(null); } catch (err) {
    if ($("arm-state")) $("arm-state").textContent = String(err?.message || err);
  }
});

$("btn-rh-guide")?.addEventListener("click", () => {
  const box = $("rh-guide-box");
  if (!box) return;
  box.hidden = false;
  const zd = getZeroDevProjectId() || "(set config.js ZERODEV_PROJECT_ID)";
  const al = ALCHEMY_API_KEY ? "configured" : "missing — Alchemy path stub only";
  const mem = typeof zdGetMemSession === "function" ? zdGetMemSession() : null;
  box.textContent = [
    "RH Chain AA guide · MAIN v8 (ZeroDev + Uniswap v3 SwapRouter02)",
    `Vendor: ./vendor/zerodev-rh.js · ${ZD_META?.name || "wst-zerodev-rh"} · v${ZD_META?.version || "8"} · kernel ${ZD_META?.kernel || "v3.1"}`,
    "1. Inject window.ZERODEV_PROJECT_ID (ZeroDev dashboard · RH Chain 4663 MAINNET).",
    "2. Inject window.RH_TOKEN_MAP = { AAPL: '0x…', … } (stock-token addresses from RH Token Contracts).",
    `   Router default: ${RH_DEX_ROUTER || "(set RH_DEX_ROUTER)"} · USDG: ${RH_USDG || "(set RH_USDG)"} · fee ${RH_POOL_FEE} · slip ${RH_SLIPPAGE_BPS}bps`,
    "3. Connect MetaMask · switch to Robinhood Chain MAINNET (4663 / 0x1237).",
    "4. CREATE SESSION KEY (ZERODEV) — Kernel + permission key (TTL + gas policy). Key stays in page memory.",
    "5. session_pub → ARM RH CHAIN (wallet challenge + Edge meta). Spend/loss caps still on Edge.",
    "6. Trade LIVE · venue rh_chain → encode approve+exactInputSingle → ZeroDev UserOp → Edge place_rh_chain log.",
    "   Missing router/token map → loud UI error (never silent noop in LIVE).",
    "7. Arcus orders remain TESTNET (api.testnet.arcus.xyz). Prices may use Arcus mainnet mids.",
    `8. ZERODEV_PROJECT_ID: ${zd}`,
    `9. ALCHEMY_API_KEY: ${al}`,
    `10. In-memory session: ${mem ? mem.sessionAddress + " · kernel " + mem.kernelAddress : "(none this page load)"}`,
    "Uniswap RH: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments",
    "RH AA: https://docs.robinhood.com/chain/account-abstraction",
    "Stock tokens: https://docs.robinhood.com/chain/building-with-stock-tokens/",
  ].join("\n");
});

$("btn-zd-create")?.addEventListener("click", async () => {
  const box = $("rh-guide-box");
  try {
    if (!getZeroDevProjectId()) {
      throw new Error("Set ZERODEV_PROJECT_ID in config.js (see config.example.js)");
    }
    if (!window.ethereum) throw new Error("MetaMask / window.ethereum required");
    if ($("arm-state")) $("arm-state").textContent = "Creating ZeroDev Kernel + session key (MetaMask may prompt)…";
    if (box) {
      box.hidden = false;
      box.textContent = "Creating session key via vendor/zerodev-rh.js…";
    }
    const ttl = Number($("session_ttl")?.value) || 86400;
    const spend = Number($("spend_limit")?.value) || 1000;
    const result = await zdCreateSessionKey({
      projectId: getZeroDevProjectId(),
      ethereum: window.ethereum,
      ttlSec: ttl,
      spendLimitUsd: spend,
      enableOnChain: true,
    });
    if ($("session_pub") && result.session_pub) $("session_pub").value = result.session_pub;
    if ($("aa_provider")) $("aa_provider").value = "zerodev";
    if (!state.wallet && result.owner) {
      state.wallet = result.owner;
      updateConnectButtons();
    }
    const summary = JSON.stringify(result, null, 2);
    if ($("arm-state")) $("arm-state").textContent = summary;
    if (box) box.textContent = summary;
  } catch (err) {
    const msg = String(err?.message || err);
    if ($("arm-state")) $("arm-state").textContent = "ZeroDev session create failed: " + msg;
    if (box) {
      box.hidden = false;
      box.textContent = "ZeroDev session create failed:\n" + msg;
    }
  }
});

/* Trade mode: observe vs live-via-armed */
document.querySelectorAll("[data-trade-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-trade-mode");
    state.tradeMode = mode === "live" ? "live" : "observe";
    localStorage.setItem("wst_main_trade_mode_v6", state.tradeMode);
    document.querySelectorAll("[data-trade-mode]").forEach((b) => {
      b.setAttribute("aria-pressed", b.getAttribute("data-trade-mode") === state.tradeMode ? "true" : "false");
    });
    if ($("trade-mode-badge")) {
      $("trade-mode-badge").textContent =
        state.tradeMode === "live" ? "LIVE · ARMED VENUE ONLY" : "OBSERVE · SIMULATE ONLY";
    }
    persistArms();
  });
});

function syncActivationDisplay() {
  const id = $("activation_id")?.value || state.activation?.id || "";
  if ($("activation_id_display") && id) $("activation_id_display").value = id;
}

$("btn-copy-intent")?.addEventListener("click", async () => {
  try {
    const wallet = ($("wallet")?.value || state.wallet || "").trim();
    const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
    if (!wallet || !activation_id) {
      $("trade-state").textContent = "Arm Arcus BYOS first (need activation_id).";
      return;
    }
    const market = $("trade_market")?.value;
    let marketMeta = findMarket(market);
    if (!marketMeta) {
      await loadTestnetMarkets();
      marketMeta = findMarket(market);
    }
    const body = {
      action: "intent_arcus",
      activation_id,
      wallet,
      market,
      orderSide: $("trade_side")?.value || "BUY",
      quantity: $("trade_qty")?.value,
      price: $("trade_price")?.value,
      gtt_minutes: Number($("trade_gtt_min")?.value) || 30,
      timeInForce: $("trade_tif")?.value || "GTT",
      accountIndex: Number(sessionStorage.getItem(SS_AI) || 0) || 0,
      marketId: marketMeta?.marketId ?? null,
    };
    $("trade-state").textContent = "Fetching unsigned intent…";
    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    $("trade-state").textContent = JSON.stringify(data, null, 2);
    if ($("byos_intent")) $("byos_intent").value = JSON.stringify(data, null, 2);
    if (data?.unsigned?.arcus_body && $("byos_body")) {
      $("byos_body").value = JSON.stringify(data.unsigned.arcus_body, null, 2);
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {}
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});

$("btn-submit-byos")?.addEventListener("click", async () => {
  try {
    if ((state.tradeMode || "observe") !== "live") {
      $("trade-state").textContent = "Switch to PLACE VIA ARMED VENUE to submit signed BYOS orders.";
      return;
    }
    const wallet = ($("wallet")?.value || state.wallet || "").trim();
    const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
    const headers = JSON.parse($("byos_headers")?.value || "{}");
    const arcus_body = JSON.parse($("byos_body")?.value || "{}");
    // Reject if user pasted private key fields into textareas
    const blob = JSON.stringify({ headers, arcus_body });
    if (/private[_ ]?key|mnemonic|seed|signing_key/i.test(blob)) {
      $("trade-state").textContent = "Rejected: remove private key fields. Headers + body only.";
      return;
    }
    const body = {
      action: "place_arcus_byos",
      activation_id,
      wallet,
      market: $("trade_market")?.value,
      orderSide: $("trade_side")?.value || "BUY",
      quantity: $("trade_qty")?.value,
      price: $("trade_price")?.value,
      idempotency_key: crypto.randomUUID(),
      arcus_body,
      headers,
    };
    $("trade-state").textContent = "Submitting BYOS signed order…";
    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Idempotency-Key": body.idempotency_key },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    $("trade-state").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});


/** Parse Arcus-style market display (e.g. AAPL-USD) → base symbol for RH_TOKEN_MAP. */
function rhBaseSymbol(market) {
  const raw = String(market || "").trim().toUpperCase();
  if (!raw) return "";
  const base = raw.split(/[-_/]/)[0] || raw;
  return base.replace(/[^A-Z0-9.]/g, "");
}

function rhResolveToken(symbol) {
  const sym = String(symbol || "").toUpperCase();
  if (!sym) return "";
  const map = RH_TOKEN_MAP || {};
  const hit =
    map[sym] ||
    map[sym.toLowerCase()] ||
    (typeof window !== "undefined" && window.RH_TOKEN_MAP && (window.RH_TOKEN_MAP[sym] || window.RH_TOKEN_MAP[sym.toLowerCase()]));
  return hit ? String(hit).trim() : "";
}

function applyBpsFloor(amountWei, bps) {
  const a = typeof amountWei === "bigint" ? amountWei : BigInt(amountWei);
  const b = BigInt(Math.max(0, Number(bps) || 0));
  return a - (a * b) / 10000n;
}

/**
 * Build Kernel calls for Uniswap v3 exactInputSingle on RH Chain.
 * BUY: USDG → stock token (amountIn ≈ qty*price in quote decimals).
 * SELL: stock → USDG (amountIn = qty in stock decimals).
 * Fails loudly if router / token map / amounts missing — never silent noop in LIVE.
 */
function buildRhChainSwapPlan({ market, side, quantity, price, recipient, slippageBps }) {
  const router = (RH_DEX_ROUTER || "").trim();
  if (!router) {
    throw new Error(
      "RH DEX router missing. Set window.RH_DEX_ROUTER (Uniswap v3 SwapRouter02 on chain 4663)."
    );
  }
  const quote = (RH_USDG || "").trim();
  if (!quote) {
    throw new Error("RH quote token missing. Set window.RH_USDG (USDG on Robinhood Chain).");
  }
  const baseSym = rhBaseSymbol(market);
  const stock = rhResolveToken(baseSym);
  if (!stock) {
    throw new Error(
      `RH stock token address missing for "${baseSym || market}". Set window.RH_TOKEN_MAP["${baseSym || "SYMBOL"}"] = "0x…". See ENV.placeholders.md + docs.robinhood.com/chain/token-contracts`
    );
  }
  const qty = Number(quantity);
  const px = Number(price);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number");
  if (!Number.isFinite(px) || px <= 0) {
    throw new Error("Limit price required for RH DEX amount sizing (use mid prefill or enter price)");
  }
  if (!recipient) throw new Error("Kernel smart-account address required as swap recipient");
  const isBuy = String(side || "BUY").toUpperCase() === "BUY";
  const fee = Number(RH_POOL_FEE) || 3000;
  const slip = slippageBps != null ? Number(slippageBps) : RH_SLIPPAGE_BPS;
  let tokenIn;
  let tokenOut;
  let amountIn;
  let amountOutMinimum;
  if (isBuy) {
    tokenIn = quote;
    tokenOut = stock;
    // Spend up to qty*price quote units (USDG 6dp). Min out = qty stock with slippage floor.
    const notional = qty * px;
    amountIn = zdParseUnitsDecimal(notional, RH_QUOTE_DECIMALS);
    const idealOut = zdParseUnitsDecimal(qty, RH_STOCK_DECIMALS);
    amountOutMinimum = applyBpsFloor(idealOut, slip);
  } else {
    tokenIn = stock;
    tokenOut = quote;
    amountIn = zdParseUnitsDecimal(qty, RH_STOCK_DECIMALS);
    const idealOut = zdParseUnitsDecimal(qty * px, RH_QUOTE_DECIMALS);
    amountOutMinimum = applyBpsFloor(idealOut, slip);
  }
  const built = zdBuildRhDexSwapCalls({
    router,
    tokenIn,
    tokenOut,
    fee,
    recipient,
    amountIn,
    amountOutMinimum,
    skipApprove: false,
  });
  return {
    ...built,
    meta: {
      market,
      baseSym,
      side: isBuy ? "BUY" : "SELL",
      quantity: String(quantity),
      price: String(price),
      slippageBps: slip,
      poolFee: fee,
      quoteToken: quote,
      stockToken: stock,
      router,
      quoterV2: RH_QUOTER_V2 || null,
      weth: RH_WETH || null,
      sources: {
        router: "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments",
        stockTokens: "https://docs.robinhood.com/chain/building-with-stock-tokens/",
        aa: "https://docs.robinhood.com/chain/account-abstraction/",
      },
    },
  };
}


$("trade-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if ((state.tradeMode || "observe") !== "live") {
    $("trade-state").textContent = "Mode is Observe/Simulate — use SIMULATE, or switch to PLACE VIA ARMED VENUE.";
    return;
  }
  const venueSel = $("trade_venue")?.value || "auto";
  const venue =
    venueSel === "auto"
      ? (state.activation?.venue || (state.arms?.arcus ? "arcus" : state.arms?.rh_chain ? "rh_chain" : ""))
      : venueSel;
  if (venue === "arcus") {
    $("trade-state").textContent =
      "Arcus is BYOS: use COPY INTENT → external signer → SUBMIT SIGNED ORDER (no private keys on site).";
    return;
  }
  if (venue === "rh_chain") {
    try {
      const wallet = ($("wallet")?.value || state.wallet || "").trim();
      const activation_id = ($("activation_id")?.value || state.activation?.id || state.arms?.rh_chain?.activation_id || "").trim();
      const market = $("trade_market")?.value;
      const orderSide = $("trade_side")?.value || "BUY";
      const quantity = $("trade_qty")?.value;
      const price = $("trade_price")?.value;
      let userOpResult = null;
      let swapPlan = null;
      const mem = typeof zdGetMemSession === "function" ? zdGetMemSession() : null;
      if (!getZeroDevProjectId()) {
        throw new Error(
          "LIVE rh_chain requires ZERODEV_PROJECT_ID in config.js. Refusing silent noop."
        );
      }
      if (!mem?.hasApproval || !mem?.kernelAddress) {
        throw new Error(
          "No in-memory ZeroDev session this page load — click CREATE SESSION KEY (ZERODEV) first. Refusing silent noop."
        );
      }
      $("trade-state").textContent = "Encoding RH Chain Uniswap v3 swap (approve + exactInputSingle)…";
      swapPlan = buildRhChainSwapPlan({
        market,
        side: orderSide,
        quantity,
        price,
        recipient: mem.kernelAddress,
        slippageBps: RH_SLIPPAGE_BPS,
      });
      $("trade-state").textContent =
        `Sending ZeroDev UserOp · ${swapPlan.meta.side} ${swapPlan.meta.baseSym} via SwapRouter02…`;
      userOpResult = await zdSendSessionUserOp({
        projectId: getZeroDevProjectId(),
        calls: swapPlan.calls,
        wait: true,
      });
      userOpResult = {
        ...userOpResult,
        dex: swapPlan.plan,
        dex_meta: swapPlan.meta,
      };
      const body = {
        action: "place_rh_chain",
        activation_id,
        wallet,
        market,
        orderSide,
        quantity,
        price,
        session_pub: state.arms?.rh_chain?.session_pub || $("session_pub")?.value || mem?.sessionAddress || null,
        note: userOpResult?.live ? "ui_place_rh_chain_userop_dex_v8" : "ui_place_rh_chain_log_only",
        client_userop: userOpResult,
      };
      $("trade-state").textContent = "Logging RH Chain DEX UserOp to Edge (place_rh_chain)…";
      const res = await fetch(EP.order, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      $("trade-state").textContent = JSON.stringify(
        { client_userop: userOpResult, edge: data, rh_chain: "MAINNET", arcus_orders: "TESTNET" },
        null,
        2
      );
    } catch (err) {
      const msg = String(err?.message || err);
      $("trade-state").textContent =
        "RH Chain LIVE failed (no silent noop):\n" + msg;
    }
    return;
  }
  $("trade-state").textContent = "No armed venue. Arm RH Chain or Arcus BYOS first.";
});

// Init v8 UI bits
showAaConfigNote();
restoreArms();
syncActivationDisplay();
document.querySelectorAll("[data-trade-mode]").forEach((b) => {
  b.setAttribute("aria-pressed", b.getAttribute("data-trade-mode") === (state.tradeMode || "observe") ? "true" : "false");
});
if ($("trade-mode-badge")) {
  $("trade-mode-badge").textContent =
    state.tradeMode === "live" ? "LIVE · ARMED VENUE ONLY" : "OBSERVE · SIMULATE ONLY";
}
persistArms();

// Keep restoreActivation compatibility
const _restoreActivationOrig = restoreActivation;
restoreActivation = function () {
  _restoreActivationOrig();
  restoreArms();
  syncActivationDisplay();
};

