(() => {
  const REF = "binqxbofehpigwjrwksl";
  const BASE = `https://${REF}.supabase.co/functions/v1`;
  const EP = {
    prices: `${BASE}/main-prices`,
    pub: `${BASE}/main-public`,
  };
  const LS_KEY = "wst_main_arm_draft_v1";

  const $ = (id) => document.getElementById(id);

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const x = Number(n);
    if (Math.abs(x) >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (Math.abs(x) >= 1) return x.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return x.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  function setPanel(name) {
    document.querySelectorAll(".autonomous-nav button").forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.panel === name ? "true" : "false");
    });
    document.querySelectorAll(".page-panel").forEach((el) => {
      el.classList.toggle("active-panel", el.dataset.panel === name);
    });
    if (location.hash !== `#${name}`) {
      history.replaceState(null, "", `#${name}`);
    }
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

  const hash = (location.hash || "#overview").replace("#", "") || "overview";
  setPanel(["overview", "arm", "venue", "developers"].includes(hash) ? hash : "overview");

  function renderTape(tapeItems) {
    const track = $("tape-track");
    if (!track) return;
    const items = (tapeItems && tapeItems.length)
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
    if (!tape || !tape.length) {
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
    ];
    host.innerHTML = chips
      .map((c) => {
        const href = c.href || `${EP.pub}?${c.q}`;
        return `<a class="chip" href="${href}" target="_blank" rel="noopener"><code>${c.label}</code> →</a>`;
      })
      .join("");
  }

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
    $("m-mids-note").textContent = ov.arcus_ok ? "arcus live" : "arcus down";

    const prices = data.prices || {};
    const tape = prices.tape || [];
    renderTape(tape);
    renderAssetsTable(tape);
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
      return data;
    } catch (e) {
      $("venue-status").textContent = "ERROR";
      $("v-ok").textContent = "false";
      $("v-upsert-err").textContent = String(e);
      return null;
    }
  }

  function loadArmDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.wallet) $("wallet").value = d.wallet;
      if (d.token_id) $("token_id").value = d.token_id;
      if (d.max_notional != null) $("max_notional").value = d.max_notional;
      if (d.max_loss != null) $("max_loss").value = d.max_loss;
      if (d.venue) $("venue").value = d.venue;
      $("spot_only").checked = d.spot_only !== false;
      $("arm-state").textContent = JSON.stringify(d, null, 2);
    } catch {
      /* ignore */
    }
  }

  $("btn-connect")?.addEventListener("click", () => {
    const fake = "0xMAIN_STUB_" + Math.random().toString(16).slice(2, 10);
    $("wallet").value = fake;
    $("arm-state").textContent = JSON.stringify(
      { note: "Wallet connect is a stub — no provider hooked.", wallet: fake },
      null,
      2
    );
  });

  $("arm-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const draft = {
      wallet: $("wallet").value.trim(),
      token_id: Number($("token_id").value) || 1,
      venue: $("venue").value || "arcus",
      caps: {
        max_notional_usd: Number($("max_notional").value) || 1000,
        max_loss_usd: Number($("max_loss").value) || 200,
        spot_only: !!$("spot_only").checked,
      },
      max_notional: Number($("max_notional").value) || 1000,
      max_loss: Number($("max_loss").value) || 200,
      spot_only: !!$("spot_only").checked,
      status: "local_draft",
      live_trading: false,
      placeOrder: false,
      saved_at: new Date().toISOString(),
      note: "Local only. Not posted. No activation created.",
    };
    localStorage.setItem(LS_KEY, JSON.stringify(draft));
    $("arm-state").textContent = JSON.stringify(draft, null, 2);
  });

  $("btn-refresh")?.addEventListener("click", () => {
    Promise.all([loadPublic(), loadPricesEdge()]).catch((err) => {
      $("dev-payload").textContent = String(err);
    });
  });

  renderApiChips();
  loadArmDraft();
  Promise.all([loadPublic(), loadPricesEdge()]).catch((err) => {
    $("dev-payload").textContent = String(err);
    renderTape([]);
  });

  // Soft refresh tape every 45s
  setInterval(() => {
    loadPublic().catch(() => {});
    loadPricesEdge().catch(() => {});
  }, 45000);
})();
