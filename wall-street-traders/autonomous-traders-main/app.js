import * as ed from "./vendor/ed25519.js";

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
const SS_KEY = "wst_main_arcus_signing_key_v1";
const SS_AI = "wst_main_arcus_account_index_v1";
const LS_ACT = "wst_main_activation_v2";
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
  tradeMode: localStorage.getItem("wst_main_trade_mode") || "observe",
  wallet: null,
  activation: null,
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
function hexToBytes(hex) {
  const h = hex.replace(/^0x/i, "").trim();
  if (h.length % 2) throw new Error("odd hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(b) {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/* UI rate-limit (client-side; Edge also rate-limits) */
const uiRate = { place: 0, cancel: 0, pilotSwitch: 0 };
function uiRateOk(kind, minMs = 2500) {
  const now = Date.now();
  if (now - (uiRate[kind] || 0) < minMs) return false;
  uiRate[kind] = now;
  return true;
}

async function signCancelOrder({ wallet, accountIndex, marketMeta, orderId, privHex }) {
  const addr = wallet.toLowerCase();
  const timestamp = BigInt(Date.now()) * 1000000n;
  // Canonical cancel payload (op=2): ad,ai,ct,id,m,op,v — key-sorted, no whitespace
  const payload =
    `{"ad":"${addr}","ai":${accountIndex},"ct":${timestamp},` +
    `"id":"${orderId}","m":${marketMeta.marketId},"op":${OP_CANCEL},"v":1}`;
  const priv = hexToBytes(privHex);
  const sig = await ed.signAsync(new TextEncoder().encode(payload), priv);
  const pub = await ed.getPublicKeyAsync(priv);
  const apiKey = bytesToHex(pub);
  const arcus_body = {
    address: wallet,
    accountIndex,
    marketId: marketMeta.marketId,
    kind: "orderId",
    orderId,
    timestamp: Number(timestamp),
  };
  return {
    arcus_body,
    headers: {
      "X-API-Key": apiKey,
      "X-Timestamp": String(timestamp),
      "X-Signature": bytesToHex(sig),
    },
    payload,
  };
}

function confirmPilotModal() {
  return new Promise((resolve) => {
    const modal = $("pilot-confirm-modal");
    if (!modal) {
      resolve(window.confirm("Enable Pilot (TESTNET LIVE)? Signing key stays in page memory."));
      return;
    }
    modal.hidden = false;
    const ok = $("pilot-confirm-ok");
    const cancel = $("pilot-confirm-cancel");
    const done = (v) => {
      modal.hidden = true;
      ok?.removeEventListener("click", onOk);
      cancel?.removeEventListener("click", onCancel);
      resolve(v);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    ok?.addEventListener("click", onOk);
    cancel?.addEventListener("click", onCancel);
  });
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
    sessionStorage.removeItem(SS_KEY);
    sessionStorage.removeItem(SS_AI);
  } catch (_) {}
  try {
    localStorage.removeItem(LS_ACT);
  } catch (_) {}
  if ($("wallet")) $("wallet").value = "";
  if ($("activation_id")) $("activation_id").value = "";
  if ($("token_id")) $("token_id").value = "1";
  if ($("trade_token")) $("trade_token").value = "1";
  if ($("arcus_signing_key")) $("arcus_signing_key").value = "";
  if ($("arcus_account_index")) $("arcus_account_index").value = "0";
  if ($("cancel_order_id")) $("cancel_order_id").value = "";
  if ($("arm-state")) $("arm-state").textContent = "Disconnected. Connect wallet to arm.";
  if ($("trade-state")) $("trade-state").textContent = "Disconnected. Session signing key cleared.";
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
Orders default to Arcus TESTNET. Paper beta swarm is a separate URL.`;
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
      `${mkt} · marketId=${meta.marketId} · tick=${meta.tickSize} · step=${meta.stepSize} · type=${meta.type || "?"} · TESTNET`;
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

function updateKeyStatus() {
  const has = !!sessionStorage.getItem(SS_KEY);
  if ($("key-status")) $("key-status").textContent = has ? "KEY IN SESSION" : "NO KEY";
  const ai = sessionStorage.getItem(SS_AI);
  if (ai != null && $("arcus_account_index")) $("arcus_account_index").value = ai;
}

$("key-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const k = $("arcus_signing_key").value.trim();
  const ai = Number($("arcus_account_index").value) || 0;
  if (!k || k.length < 64) {
    $("trade-state").textContent = "Need hex API Signing Key (≥32 bytes).";
    return;
  }
  sessionStorage.setItem(SS_KEY, k.replace(/^0x/i, ""));
  sessionStorage.setItem(SS_AI, String(ai));
  $("arcus_signing_key").value = "";
  updateKeyStatus();
  $("trade-state").textContent = JSON.stringify(
    { ok: true, note: "Signing key stored in sessionStorage only", accountIndex: ai },
    null,
    2
  );
});
$("btn-clear-key")?.addEventListener("click", () => {
  sessionStorage.removeItem(SS_KEY);
  sessionStorage.removeItem(SS_AI);
  updateKeyStatus();
  $("trade-state").textContent = "Key cleared from session.";
});

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

$("arm-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  let wallet = $("wallet").value.trim();
  if (!wallet && window.ethereum) {
    await connectMetaMask();
    wallet = state.wallet || "";
  }
  const token_id = Number($("token_id").value) || 1;
  $("arm-state").textContent = "Requesting wallet signature…";
  try {
    const proof = await walletChallenge("activate", { wallet, token_id });
    const body = {
      action: "activate",
      wallet: proof.wallet,
      token_id,
      venue: $("venue").value || "arcus",
      caps: {
        max_notional_usd: Number($("max_notional").value) || 1000,
        max_loss_usd: Number($("max_loss").value) || 200,
        spot_only: !!$("spot_only").checked,
        allow_mainnet: false,
      },
      arcus_account_index: Number(sessionStorage.getItem(SS_AI) || 0) || 0,
      nonce: proof.nonce,
      signature: proof.signature,
    };
    $("arm-state").textContent = "Activating (signed)…";
    const res = await fetch(EP.pub, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    $("arm-state").textContent = JSON.stringify(data, null, 2);
    if (data.activation) {
      state.activation = data.activation;
      localStorage.setItem(LS_ACT, JSON.stringify({ activation: data.activation }));
      $("activation_id").value = data.activation.id;
      $("trade_token").value = data.activation.token_id;
      state.wallet = data.activation.wallet;
      updateConnectButtons();
      if (state.currentToken === data.activation.token_id)
        openTrader(data.activation.token_id, { navigate: false });
    }
  } catch (err) {
    $("arm-state").textContent = String(err?.message || err);
  }
});

$("btn-revoke")?.addEventListener("click", async () => {
  const activation_id = $("activation_id")?.value || state.activation?.id;
  const wallet = $("wallet").value.trim() || state.wallet;
  if (!activation_id || !wallet) {
    $("arm-state").textContent = "Need activation_id + wallet to revoke.";
    return;
  }
  try {
    $("arm-state").textContent = "Requesting revoke signature…";
    const proof = await walletChallenge("revoke", { wallet, activation_id });
    const res = await fetch(EP.pub, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "revoke", activation_id, wallet: proof.wallet, nonce: proof.nonce, signature: proof.signature }),
    });
    const data = await res.json();
    $("arm-state").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    $("arm-state").textContent = String(err?.message || err);
  }
});

async function signPlaceOrder({
  wallet,
  accountIndex,
  marketMeta,
  orderSide,
  quantity,
  price,
  timeInForce,
  goodTilTimeUs,
  privHex,
}) {
  const addr = wallet.toLowerCase();
  const timestamp = BigInt(Date.now()) * 1000000n;
  const tick = marketMeta.tickSize;
  const step = marketMeta.stepSize;
  const p = toInt(price, tick);
  const q = toInt(quantity, step);
  const g = BigInt(goodTilTimeUs) * 1000n;
  const payload =
    `{"ad":"${addr}","ai":${accountIndex},"ct":${timestamp},"g":${g},` +
    `"m":${marketMeta.marketId},"op":${OP_PLACE},"p":${p},"q":${q},` +
    `"r":0,"s":${SIDE[orderSide]},"t":${TIF[timeInForce]},"v":1}`;

  const priv = hexToBytes(privHex);
  const sig = await ed.signAsync(new TextEncoder().encode(payload), priv);
  const pub = await ed.getPublicKeyAsync(priv);
  const apiKey = bytesToHex(pub);
  const arcus_body = {
    address: wallet,
    accountIndex,
    marketId: marketMeta.marketId,
    orderSide,
    orderType: "LIMIT",
    quantity: String(quantity),
    price: String(price),
    timeInForce,
    goodTilTime: String(goodTilTimeUs),
    timestamp: Number(timestamp),
  };
  return {
    arcus_body,
    headers: {
      "X-API-Key": apiKey,
      "X-Timestamp": String(timestamp),
      "X-Signature": bytesToHex(sig),
    },
    payload,
    apiKey,
  };
}

$("trade-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const wallet = ($("wallet")?.value || state.wallet || "").trim();
  const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
  const market = $("trade_market").value;
  const orderSide = $("trade_side").value;
  const quantity = $("trade_qty").value.trim();
  const price = $("trade_price").value.trim();
  const timeInForce = $("trade_tif").value;
  const token_id = Number($("trade_token").value) || 1;
  const priv = sessionStorage.getItem(SS_KEY);
  const accountIndex = Number(sessionStorage.getItem(SS_AI) || 0) || 0;

  if ((state.tradeMode || "observe") !== "pilot") {
    $("trade-state").textContent = "Mode is Observe/Simulate — switch to Pilot to place live TESTNET orders.";
    return;
  }
  if (!uiRateOk("place", 3000)) {
    $("trade-state").textContent = "Slow down — UI rate limit (3s between place attempts).";
    return;
  }
  if (!wallet || !activation_id) {
    $("trade-state").textContent = "Connect MetaMask and Arm Desk first.";
    return;
  }
  if (!priv) {
    $("trade-state").textContent =
      "No signing key in session. Paste API Signing Key above, or click SIMULATE.";
    return;
  }
  const placeConfirm = window.confirm(
    "PLACE live TESTNET order? Key is in page memory. XSS that bypasses CSP can steal it.",
  );
  if (!placeConfirm) {
    $("trade-state").textContent = "Place canceled by user.";
    return;
  }
  let marketMeta = findMarket(market);
  if (!marketMeta) {
    await loadTestnetMarkets();
    marketMeta = findMarket(market);
  }
  if (!marketMeta) {
    $("trade-state").textContent = `Market ${market} not found on testnet /v1/markets.`;
    return;
  }
  const gttMin = Number($("trade_gtt_min")?.value) || 30;
  const goodTilTimeUs = Date.now() * 1000 + Math.min(60, Math.max(15, gttMin)) * 60 * 1_000_000;
  try {
    $("trade-state").textContent = "Signing + proxying to testnet…";
    const signed = await signPlaceOrder({
      wallet,
      accountIndex,
      marketMeta,
      orderSide,
      quantity,
      price,
      timeInForce,
      goodTilTimeUs,
      privHex: priv,
    });
    const idempotency_key = crypto.randomUUID();
    const body = {
      env: "testnet",
      activation_id,
      wallet,
      token_id,
      market,
      orderSide,
      orderType: "LIMIT",
      quantity,
      price,
      timeInForce,
      goodTilTime: String(goodTilTimeUs),
      accountIndex,
      timestamp: signed.arcus_body.timestamp,
      arcus_body: signed.arcus_body,
      headers: signed.headers,
      idempotency_key,
      actor: "holder",
    };
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


/* Mode: Observe/Simulate (default) vs Pilot */
function syncTradeModeUI() {
  const mode = state.tradeMode || "observe";
  document.querySelectorAll("[data-trade-mode]").forEach((el) => {
    el.setAttribute("aria-pressed", el.getAttribute("data-trade-mode") === mode ? "true" : "false");
  });
  const badge = $("trade-mode-badge");
  if (badge) badge.textContent = mode === "pilot" ? "PILOT · TESTNET LIVE" : "OBSERVE · SIMULATE ONLY";
  const place = $("btn-place");
  if (place) place.disabled = mode !== "pilot";
  const warn = $("pilot-xss-warn");
  if (warn) warn.hidden = mode !== "pilot";
  const cancelBtn = $("btn-cancel-order");
  if (cancelBtn) cancelBtn.disabled = mode !== "pilot";
}
document.querySelectorAll("[data-trade-mode]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const next = btn.getAttribute("data-trade-mode") || "observe";
    if (next === "pilot" && state.tradeMode !== "pilot") {
      if (!uiRateOk("pilotSwitch", 1500)) return;
      const ok = await confirmPilotModal();
      if (!ok) return;
    }
    state.tradeMode = next;
    localStorage.setItem("wst_main_trade_mode", state.tradeMode);
    syncTradeModeUI();
  });
});

syncTradeModeUI();


$("btn-cancel-order")?.addEventListener("click", async () => {
  const activation_id = ($("activation_id")?.value || state.activation?.id || "").trim();
  const wallet = ($("wallet")?.value || state.wallet || "").trim();
  const local_order_id = ($("cancel_order_id")?.value || "").trim();
  let arcus_order_id = ($("cancel_arcus_order_id")?.value || "").trim();
  let market = ($("cancel_market")?.value || $("trade_market")?.value || "").trim();
  const priv = sessionStorage.getItem(SS_KEY);
  const accountIndex = Number(sessionStorage.getItem(SS_AI) || 0) || 0;

  if ((state.tradeMode || "observe") !== "pilot") {
    $("trade-state").textContent = "Cancel requires Pilot mode (signed Arcus cancel).";
    return;
  }
  if (!uiRateOk("cancel", 2500)) {
    $("trade-state").textContent = "Slow down — UI rate limit (2.5s between cancels).";
    return;
  }
  if (!activation_id || !wallet) {
    $("trade-state").textContent = "Need activation + wallet to cancel.";
    return;
  }
  if (!priv) {
    $("trade-state").textContent = "Signed cancel needs API signing key in session.";
    return;
  }
  if (!arcus_order_id && !local_order_id) {
    $("trade-state").textContent = "Provide Arcus orderId and/or local order uuid.";
    return;
  }

  try {
    // If only local id, fetch orders to resolve arcus id + market
    if ((!arcus_order_id || !market) && local_order_id) {
      const resL = await fetch(`${EP.order}?wallet=${encodeURIComponent(wallet)}`, {
        headers: { Accept: "application/json" },
      });
      const dataL = await resL.json();
      const row = (dataL.orders || []).find((o) => o.id === local_order_id);
      if (row) {
        if (!arcus_order_id) arcus_order_id = String(row.arcus_order_id || "");
        if (!market) market = String(row.market || "");
      }
    }
    if (!arcus_order_id) {
      $("trade-state").textContent = "Missing Arcus orderId — cannot sign cancel (op=2).";
      return;
    }
    let marketMeta = findMarket(market);
    if (!marketMeta) {
      await loadTestnetMarkets();
      marketMeta = findMarket(market);
    }
    if (!marketMeta) {
      $("trade-state").textContent = `Market ${market || "?"} not found — needed for cancel marketId.`;
      return;
    }

    $("trade-state").textContent = "Signing cancel (op=2) + proxying to testnet cancelOrder…";
    const signed = await signCancelOrder({
      wallet,
      accountIndex,
      marketMeta,
      orderId: arcus_order_id,
      privHex: priv,
    });
    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "cancel",
        activation_id,
        wallet,
        local_order_id: local_order_id || undefined,
        orderId: arcus_order_id,
        market,
        arcus_body: signed.arcus_body,
        headers: signed.headers,
        env: "testnet",
      }),
    });
    const data = await res.json();
    $("trade-state").textContent = JSON.stringify(data, null, 2);
    loadOrders().catch(() => {});
    loadActivity().catch(() => {});
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});
