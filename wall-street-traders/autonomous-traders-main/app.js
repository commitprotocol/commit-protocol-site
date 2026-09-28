import * as ed from "https://esm.sh/@noble/ed25519@2.1.0";

const REF = "binqxbofehpigwjrwksl";
const BASE = `https://${REF}.supabase.co/functions/v1`;
const EP = {
  prices: `${BASE}/main-prices`,
  pub: `${BASE}/main-public`,
  order: `${BASE}/main-order`,
};
const ARCUS_TESTNET = "https://api.testnet.arcus.xyz";
const SS_KEY = "wst_main_arcus_signing_key_v1";
const SS_AI = "wst_main_arcus_account_index_v1";
const LS_ACT = "wst_main_activation_v2";

const OP_PLACE = 1;
const SIDE = { BUY: 0, SELL: 1 };
const TIF = { GTT: 0, FOK: 1, IOC: 2, ALO: 3 };

const $ = (id) => document.getElementById(id);
const state = {
  wallet: null,
  activation: null,
  tape: [],
  markets: [],
  mids: {},
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

function toInt(value, unit) {
  const n = Number(value) / Number(unit);
  const r = Math.round(n);
  if (Math.abs(n - r) > 1e-9) {
    throw new Error(`${value} is not a multiple of ${unit}`);
  }
  return r;
}

function setPanel(name) {
  document.querySelectorAll(".autonomous-nav button").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.panel === name ? "true" : "false");
  });
  document.querySelectorAll(".page-panel").forEach((el) => {
    el.classList.toggle("active-panel", el.dataset.panel === name);
  });
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    setPanel(el.getAttribute("data-nav"));
  });
});
document.querySelectorAll(".autonomous-nav button").forEach((btn) => {
  btn.addEventListener("click", () => setPanel(btn.dataset.panel));
});

const PANELS = ["overview", "arm", "trade", "brain", "venue", "developers"];
const hash = (location.hash || "#overview").replace("#", "") || "overview";
setPanel(PANELS.includes(hash) ? hash : "overview");

function updateConnectButtons() {
  const label = state.wallet
    ? `CONNECTED ${shortAddr(state.wallet)}`
    : "CONNECT";
  ["btn-connect", "btn-mm-header"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = label;
  });
  if (state.wallet && $("wallet")) $("wallet").value = state.wallet;
}

async function connectMetaMask() {
  if (!window.ethereum) {
    $("arm-state").textContent = JSON.stringify(
      { error: "No MetaMask / ethereum provider. Install MetaMask and retry." },
      null,
      2
    );
    return null;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const addr = (accounts && accounts[0]) || null;
  if (addr) {
    state.wallet = addr.toLowerCase();
    updateConnectButtons();
    loadOrders().catch(() => {});
  }
  return addr;
}

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", (accs) => {
    state.wallet = accs && accs[0] ? accs[0].toLowerCase() : null;
    updateConnectButtons();
    if (state.wallet) loadOrders().catch(() => {});
  });
  // Soft restore if already connected
  window.ethereum
    .request({ method: "eth_accounts" })
    .then((accs) => {
      if (accs && accs[0]) {
        state.wallet = accs[0].toLowerCase();
        updateConnectButtons();
      }
    })
    .catch(() => {});
}

$("btn-connect")?.addEventListener("click", () => {
  connectMetaMask().catch((e) => {
    $("arm-state").textContent = String(e?.message || e);
  });
});
$("btn-mm-header")?.addEventListener("click", () => {
  connectMetaMask().catch(() => {});
});

function renderTape(tapeItems) {
  const track = $("tape-track");
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
    .map(
      (r) => `<tr>
        <td><b>${r.symbol}</b></td>
        <td>${r.arcus_market || "—"}</td>
        <td>${r.display_name || "—"}</td>
        <td class="mid">${r.mid != null ? fmt(r.mid) : "—"}</td>
      </tr>`
    )
    .join("");
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
  if (meta) {
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
  $("dev-payload").textContent = JSON.stringify(data, null, 2);

  const ov = data.overview || {};
  $("m-assets").textContent = ov.assets_active ?? "—";
  $("m-traders").textContent = ov.traders_total ?? "—";
  $("m-armed").textContent = ov.traders_armed ?? "—";
  $("m-mids").textContent = ov.arcus_mid_count ?? "—";
  $("m-mids-note").textContent = ov.arcus_ok
    ? `live · ${ov.tape_source || "arcus"}`
    : "arcus down";

  const prices = data.prices || {};
  state.tape = prices.tape || [];
  state.mids = prices.mids || {};
  renderTape(state.tape);
  renderAssetsTable(state.tape);
  fillMarketSelect();
  $("tape-captured").textContent = prices.captured_at
    ? `captured ${prices.captured_at}`
    : "—";
  return data;
}

async function loadPricesEdge() {
  try {
    const res = await fetch(EP.prices, { headers: { Accept: "application/json" } });
    const data = await res.json();
    $("venue-status").textContent = data.arcus_ok ? "LIVE" : "DOWN";
    $("v-source").textContent = data.source || "arcus";
    $("v-ok").textContent = String(!!data.arcus_ok);
    $("v-captured").textContent = data.captured_at || "—";
    $("v-upserted").textContent = data.upserted != null ? String(data.upserted) : "—";
    $("v-upsert-err").textContent = data.upsert_error
      ? `err: ${data.upsert_error}`
      : "service role path ok / idle";
    if (data.mids) state.mids = { ...state.mids, ...data.mids };
    return data;
  } catch (e) {
    $("venue-status").textContent = "ERROR";
    $("v-ok").textContent = "false";
    $("v-upsert-err").textContent = String(e);
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
  } catch (e) {
    console.warn("testnet markets", e);
    return [];
  }
}

function restoreActivation() {
  try {
    const raw = localStorage.getItem(LS_ACT);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.activation = d.activation || d;
    if (state.activation?.id && $("activation_id")) {
      $("activation_id").value = state.activation.id;
    }
    if (state.activation?.token_id) {
      $("token_id").value = state.activation.token_id;
      $("trade_token").value = state.activation.token_id;
    }
    if (state.activation?.wallet) {
      $("wallet").value = state.activation.wallet;
      if (!state.wallet) state.wallet = state.activation.wallet;
    }
    $("arm-state").textContent = JSON.stringify(state.activation, null, 2);
    updateConnectButtons();
  } catch {
    /* ignore */
  }
}

$("arm-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  let wallet = $("wallet").value.trim();
  if (!wallet && window.ethereum) {
    await connectMetaMask();
    wallet = state.wallet || "";
  }
  const token_id = Number($("token_id").value) || 1;
  const body = {
    action: "activate",
    wallet,
    token_id,
    venue: $("venue").value || "arcus",
    caps: {
      max_notional_usd: Number($("max_notional").value) || 1000,
      max_loss_usd: Number($("max_loss").value) || 200,
      spot_only: !!$("spot_only").checked,
      allow_mainnet: false,
    },
    arcus_account_index: Number(sessionStorage.getItem(SS_AI) || 0) || 0,
  };
  $("arm-state").textContent = "Activating…";
  try {
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
    const res = await fetch(EP.pub, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "revoke", activation_id, wallet }),
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
  const ts = BigInt(Date.now()) * 1000000n; // approx ns
  // Prefer high-res if available
  let timestamp;
  try {
    timestamp = BigInt(Math.trunc(performance.timeOrigin + performance.now()) * 1e6);
  } catch {
    timestamp = ts;
  }
  // Use Date for portable ns estimate: ms * 1e6
  timestamp = BigInt(Date.now()) * 1000000n;

  const tick = marketMeta.tickSize;
  const step = marketMeta.stepSize;
  const p = toInt(price, tick);
  const q = toInt(quantity, step);
  const g = BigInt(goodTilTimeUs) * 1000n; // payload wants ns-ish (docs: good_til * 1000 from µs)
  const payload =
    `{"ad":"${addr}","ai":${accountIndex},"ct":${timestamp},"g":${g},` +
    `"m":${marketMeta.marketId},"op":${OP_PLACE},"p":${p},"q":${q},` +
    `"r":0,"s":${SIDE[orderSide]},"t":${TIF[timeInForce]},"v":1}`;

  const priv = hexToBytes(privHex);
  // noble ed25519 v2: etc.sha512Sync or sync API
  if (!ed.etc?.sha512Sync) {
    const { sha512 } = await import("https://esm.sh/@noble/hashes@1.4.0/sha512");
    ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));
  }
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

  if (!wallet || !activation_id) {
    $("trade-state").textContent = "Connect MetaMask and Arm Desk first.";
    return;
  }
  if (!priv) {
    $("trade-state").textContent =
      "No signing key in session. Paste API Signing Key above, or click SIMULATE.";
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

  const goodTilTimeUs = Date.now() * 1000 + 40 * 86400 * 1_000_000;

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
    };

    const res = await fetch(EP.order, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    $("trade-state").textContent = JSON.stringify(data, null, 2);
    loadOrders().catch(() => {});
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
  } catch (err) {
    $("trade-state").textContent = String(err?.message || err);
  }
});

async function loadOrders() {
  const wallet = state.wallet || $("wallet")?.value?.trim();
  const tb = $("orders-tbody");
  if (!wallet || !tb) return;
  try {
    const res = await fetch(`${EP.order}?wallet=${encodeURIComponent(wallet)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const orders = data.orders || [];
    if (!orders.length) {
      tb.innerHTML = `<tr><td colspan="7" class="empty">No orders yet.</td></tr>`;
      return;
    }
    tb.innerHTML = orders
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
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="7" class="empty">${String(e)}</td></tr>`;
  }
}

$("btn-refresh-orders")?.addEventListener("click", () => loadOrders());

function brainLog(line) {
  const el = $("brain-log");
  if (!el) return;
  el.textContent += (el.textContent.endsWith("\n") ? "" : "\n") + line + "\n";
  el.scrollTop = el.scrollHeight;
}

$("btn-second-pass")?.addEventListener("click", async () => {
  brainLog("$ run policy second pass…");
  brainLog("COMING_SOON · live Grok / xAI (not required for this path)");
  const midSym =
    state.tape.find((t) => t.mid != null) ||
    { symbol: "AAPL", arcus_market: "AAPL-USD", mid: Number(state.mids["AAPL-USD"]) || 0 };
  const dna = {
    bias: "mean_revert_stub",
    risk: "caps_first",
    token_id: Number($("trade_token")?.value || state.activation?.token_id || 1),
  };
  const side = (midSym.mid || 0) > 0 ? "BUY" : "BUY";
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
  } catch (e) {
    brainLog(`error ${e?.message || e}`);
  }
  brainLog("$ done");
});

$("btn-refresh")?.addEventListener("click", () => {
  Promise.all([loadPublic(), loadPricesEdge(), loadTestnetMarkets()]).catch((err) => {
    $("dev-payload").textContent = String(err);
  });
});

renderApiChips();
restoreActivation();
updateKeyStatus();
updateConnectButtons();

Promise.all([loadPublic(), loadPricesEdge(), loadTestnetMarkets()])
  .then(() => loadOrders())
  .catch((err) => {
    $("dev-payload").textContent = String(err);
    renderTape([]);
  });

setInterval(() => {
  loadPublic().catch(() => {});
  loadPricesEdge().catch(() => {});
}, 45000);
