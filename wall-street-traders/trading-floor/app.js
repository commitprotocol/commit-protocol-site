const SOURCE_URL = "data/metadata.csv";
const PAGE_SIZE = 24;
const TRAIT_PREFIX = "attributes[";
const SITE_ROOT = "https://commitprotocol.org/wall-street-traders/trading-floor/";
const OPENSEA_ASSET_ROOT = "https://opensea.io/assets/robinhood/0x7a5f95f898cf968cac3f9d6231f03f36c3da5b0d";
const FAVORITES_KEY = "wst-trading-floor-favorites-v1";
let records = [];
let headers = [];
let visible = PAGE_SIZE;
let query = "";
let order = "asc";
let activeFilters = {};
let openGroup = "attributes[Character Type]";
let favoritesOnly = false;
let selectedToken = null;
const favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]").map(String));
const compareTokens = new Set();

const grid = document.querySelector("#trader-grid");
const search = document.querySelector("#search");
const orderSelect = document.querySelector("#order");
const resultCount = document.querySelector("#result-count");
const loadMore = document.querySelector("#load-more");
const emptyState = document.querySelector("#empty-state");
const clearSearch = document.querySelector("#clear-search");
const clearFilters = document.querySelector("#clear-filters");
const filterGroups = document.querySelector("#public-filter-groups");
const activeFilterCount = document.querySelector("#active-filter-count");
const dialog = document.querySelector("#trader-dialog");
const statsDialog = document.querySelector("#stats-dialog");
const compareDialog = document.querySelector("#compare-dialog");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const parsedHeaders = rows.shift() || [];
  return {
    headers: parsedHeaders,
    records: rows.filter(values => values.some(Boolean)).map(values =>
      Object.fromEntries(parsedHeaders.map((header, index) => [header, values[index] || ""]))
    )
  };
}

function traitHeaders() { return headers.filter(header => header.startsWith(TRAIT_PREFIX)); }
function traitName(header) { return header.slice(TRAIT_PREFIX.length, -1); }
function traitValue(record, header) { return record[header] || "None"; }

function calculateRarity() {
  const rarityHeaders = traitHeaders();
  const frequency = {};
  rarityHeaders.forEach(header => {
    frequency[header] = {};
    records.forEach(record => {
      const value = traitValue(record, header);
      frequency[header][value] = (frequency[header][value] || 0) + 1;
    });
  });

  records.forEach(record => {
    record.rarityScore = rarityHeaders.reduce((score, header) =>
      score + Math.log2(records.length / frequency[header][traitValue(record, header)]), 0
    );
    record.uniqueTraitCount = rarityHeaders.reduce((count, header) =>
      count + (frequency[header][traitValue(record, header)] === 1 ? 1 : 0), 0
    );
  });

  const ranked = [...records].sort((a, b) =>
    b.uniqueTraitCount - a.uniqueTraitCount ||
    b.rarityScore - a.rarityScore ||
    Number(a.tokenID) - Number(b.tokenID)
  );

  let previousUniqueTraitCount = null;
  let previousScore = null;
  let currentRank = 0;

  ranked.forEach((record, index) => {
    const isTie =
      record.uniqueTraitCount === previousUniqueTraitCount &&
      Math.abs(record.rarityScore - previousScore) < 1e-12;

    if (!isTie) currentRank = index + 1;
    record.rarityRank = currentRank;
    previousUniqueTraitCount = record.uniqueTraitCount;
    previousScore = record.rarityScore;
  });
}

function filteredRecords() {
  const normalized = query.trim().toLowerCase().replace(/^#/, "");
  const filtered = records.filter(record => {
    const matchesSearch = !normalized || record.tokenID.includes(normalized) || record.name.toLowerCase().includes(normalized);
    const matchesTraits = Object.entries(activeFilters).every(([header, values]) => !values.size || values.has(traitValue(record, header)));
    const matchesFavorites = !favoritesOnly || favorites.has(record.tokenID);
    return matchesSearch && matchesTraits && matchesFavorites;
  });
  return filtered.sort((a, b) => {
    if (order === "desc") return Number(b.tokenID) - Number(a.tokenID);
    if (order === "rarest") return a.rarityRank - b.rarityRank;
    if (order === "common") return b.rarityRank - a.rarityRank;
    if (order === "character") return traitValue(a, "attributes[Character Type]").localeCompare(traitValue(b, "attributes[Character Type]")) || Number(a.tokenID) - Number(b.tokenID);
    return Number(a.tokenID) - Number(b.tokenID);
  });
}

function countActiveFilters() {
  return Object.values(activeFilters).reduce((total, values) => total + values.size, 0) + (favoritesOnly ? 1 : 0);
}

function updateFilterStatus() {
  const count = countActiveFilters();
  activeFilterCount.textContent = `${count} ACTIVE`;
  clearFilters.hidden = !count && !query;
  document.querySelector("#show-favorites").classList.toggle("is-active", favoritesOnly);
}

function syncUrl(tokenId = null) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (order !== "asc") params.set("order", order);
  if (favoritesOnly) params.set("favorites", "1");
  Object.entries(activeFilters).forEach(([header, values]) => values.forEach(value => params.append("trait", `${traitName(header)}:${value}`)));
  if (tokenId) params.set("trader", tokenId);
  const next = `${location.pathname}${params.size ? `?${params}` : ""}`;
  history.replaceState(null, "", next);
}

function restoreUrlState() {
  const params = new URLSearchParams(location.search);
  query = params.get("q") || "";
  search.value = query;
  order = params.get("order") || "asc";
  if ([...orderSelect.options].some(option => option.value === order)) orderSelect.value = order;
  favoritesOnly = params.get("favorites") === "1";
  params.getAll("trait").forEach(entry => {
    const separator = entry.indexOf(":");
    if (separator < 0) return;
    const name = entry.slice(0, separator), value = entry.slice(separator + 1);
    const header = traitHeaders().find(item => traitName(item) === name);
    if (header) { activeFilters[header] ||= new Set(); activeFilters[header].add(value); }
  });
  return params.get("trader");
}

function renderFilters() {
  filterGroups.replaceChildren();
  traitHeaders().forEach(header => {
    const counts = new Map();
    records.forEach(record => {
      const value = traitValue(record, header);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    const values = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const section = document.createElement("section");
    section.className = `public-filter-group${openGroup === header ? " is-open" : ""}`;
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "public-filter-heading";
    heading.innerHTML = `<span>${traitName(header)}</span><b>${values.length}</b><i>${openGroup === header ? "−" : "+"}</i>`;
    heading.addEventListener("click", () => { openGroup = openGroup === header ? "" : header; renderFilters(); });
    section.append(heading);
    if (openGroup === header) {
      const options = document.createElement("div");
      options.className = "public-filter-options";
      values.forEach(([value, count]) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = activeFilters[header]?.has(value) || false;
        checkbox.addEventListener("change", () => {
          activeFilters[header] ||= new Set();
          checkbox.checked ? activeFilters[header].add(value) : activeFilters[header].delete(value);
          visible = PAGE_SIZE;
          updateFilterStatus();
          syncUrl();
          render();
        });
        const name = document.createElement("span");
        name.textContent = value;
        const total = document.createElement("b");
        total.textContent = count;
        label.append(checkbox, name, total);
        options.append(label);
      });
      section.append(options);
    }
    filterGroups.append(section);
  });
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
}

function toggleFavorite(tokenId) {
  const id = String(tokenId);
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavorites();
  updateProfileActions();
  render();
}

function updateProfileActions() {
  if (!selectedToken) return;
  document.querySelector("#favorite-trader").textContent = favorites.has(selectedToken) ? "★ FAVORITED" : "☆ FAVORITE";
  document.querySelector("#compare-trader").textContent = compareTokens.has(selectedToken) ? "✓ COMPARING" : "＋ COMPARE";
}

function updateCompareStatus() {
  const count = compareTokens.size;
  document.querySelector("#compare-count").textContent = count;
  document.querySelector("#open-compare").hidden = count < 2;
  updateProfileActions();
}

function toggleCompare(tokenId) {
  const id = String(tokenId);
  if (compareTokens.has(id)) compareTokens.delete(id);
  else if (compareTokens.size < 4) compareTokens.add(id);
  else { alert("You can compare up to four Traders."); return; }
  updateCompareStatus();
}

function traderShareUrl(tokenId) { return `${SITE_ROOT}trader/${tokenId}/`; }

function openTrader(tokenId, updateUrl = true) {
  const record = records.find(item => item.tokenID === String(tokenId));
  if (!record) return;
  selectedToken = record.tokenID;
  const padded = record.tokenID.padStart(3, "0");
  document.querySelector("#dialog-kicker").textContent = `OFFICIAL PUBLIC FILE / WST-${padded}`;
  document.querySelector("#dialog-title").textContent = record.name.toUpperCase();
  document.querySelector("#dialog-token").textContent = `#${record.tokenID}`;
  document.querySelector("#dialog-rarity").textContent = traitValue(record, "attributes[Rarity Tier]").toUpperCase();
  document.querySelector("#dialog-rank").textContent = `#${record.rarityRank} / 444`;
  document.querySelector("#dialog-score").textContent = record.rarityScore.toFixed(2);
  const image = document.querySelector("#dialog-image");
  image.src = `traders/${record.tokenID}.png`;
  image.alt = record.name;
  const traitList = document.querySelector("#dialog-traits");
  traitList.replaceChildren();
  traitHeaders().forEach(header => {
    const item = document.createElement("div");
    item.innerHTML = `<span>${traitName(header)}</span><b>${traitValue(record, header)}</b>`;
    traitList.append(item);
  });
  const download = document.querySelector("#download-link");
  download.href = `traders/${record.tokenID}.png`;
  download.download = `wall-street-trader-${record.tokenID}.png`;
  const openseaLink = document.querySelector("#opensea-token-link");
  openseaLink.href = `${OPENSEA_ASSET_ROOT}/${record.tokenID}`;
  openseaLink.setAttribute("aria-label", `View ${record.name} on OpenSea`);
  updateProfileActions();
  if (!dialog.open) dialog.showModal();
  if (updateUrl) syncUrl(record.tokenID);
}

function render() {
  const filtered = filteredRecords();
  const shown = filtered.slice(0, visible);
  grid.replaceChildren();
  shown.forEach(record => {
    const rarity = traitValue(record, "attributes[Rarity Tier]");
    const character = traitValue(record, "attributes[Character Type]");
    const card = document.createElement("button");
    card.className = "trader-card";
    card.innerHTML = `<span class="card-image"><img src="traders/${record.tokenID}.png" alt="${record.name}" loading="lazy" decoding="async"><i aria-hidden="true"></i><b class="rarity-stamp">${rarity}</b><span class="favorite-stamp" role="button" tabindex="0" aria-label="Favorite ${record.name}">${favorites.has(record.tokenID) ? "★" : "☆"}</span></span><span class="card-copy"><small>PUBLIC FILE / WST-${record.tokenID.padStart(3, "0")}</small><strong>TRADER #${record.tokenID}</strong><em>RANK #${record.rarityRank} / ${character} ↗</em></span>`;
    const favorite = card.querySelector(".favorite-stamp");
    favorite.addEventListener("click", event => { event.stopPropagation(); toggleFavorite(record.tokenID); });
    favorite.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleFavorite(record.tokenID); } });
    card.addEventListener("click", () => openTrader(record.tokenID));
    grid.append(card);
  });
  resultCount.textContent = `DISPLAYING ${shown.length} OF ${filtered.length} MATCHING TRADERS`;
  grid.hidden = shown.length === 0;
  emptyState.hidden = shown.length !== 0;
  loadMore.hidden = visible >= filtered.length || filtered.length === 0;
}

function resetFilters() {
  query = "";
  search.value = "";
  activeFilters = {};
  favoritesOnly = false;
  visible = PAGE_SIZE;
  renderFilters();
  updateFilterStatus();
  syncUrl();
  render();
}

function renderStats() {
  const target = document.querySelector("#stats-grid");
  target.replaceChildren();
  traitHeaders().forEach(header => {
    const counts = new Map();
    records.forEach(record => counts.set(traitValue(record, header), (counts.get(traitValue(record, header)) || 0) + 1));
    const section = document.createElement("section");
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => `<li><span>${value}</span><b>${count}</b><em>${(count / records.length * 100).toFixed(1)}%</em></li>`).join("");
    section.innerHTML = `<h3>${traitName(header)}</h3><ul>${rows}</ul>`;
    target.append(section);
  });
}

function renderComparison() {
  const target = document.querySelector("#compare-grid");
  target.replaceChildren();
  [...compareTokens].map(id => records.find(record => record.tokenID === id)).filter(Boolean).forEach(record => {
    const article = document.createElement("article");
    article.innerHTML = `<img src="traders/${record.tokenID}.png" alt="${record.name}" loading="lazy" decoding="async"><h3>TRADER #${record.tokenID}</h3><p>RANK #${record.rarityRank} · ${record.rarityScore.toFixed(2)} PTS</p><dl>${traitHeaders().map(header => `<div><dt>${traitName(header)}</dt><dd>${traitValue(record, header)}</dd></div>`).join("")}</dl><button data-remove="${record.tokenID}">REMOVE</button>`;
    article.querySelector("button").onclick = () => { compareTokens.delete(record.tokenID); updateCompareStatus(); renderComparison(); };
    target.append(article);
  });
}

search.addEventListener("input", () => { query = search.value; visible = PAGE_SIZE; updateFilterStatus(); syncUrl(); render(); });
orderSelect.addEventListener("change", () => { order = orderSelect.value; visible = PAGE_SIZE; syncUrl(); render(); });
loadMore.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
clearSearch.addEventListener("click", resetFilters);
clearFilters.addEventListener("click", resetFilters);
document.querySelector("#random-trader").addEventListener("click", () => openTrader(records[Math.floor(Math.random() * records.length)].tokenID));
document.querySelector("#show-favorites").addEventListener("click", () => { favoritesOnly = !favoritesOnly; visible = PAGE_SIZE; updateFilterStatus(); syncUrl(); render(); });
document.querySelector("#show-stats").addEventListener("click", () => { renderStats(); statsDialog.showModal(); });
document.querySelector("#open-compare").addEventListener("click", () => { renderComparison(); compareDialog.showModal(); });
document.querySelector("#clear-compare").addEventListener("click", () => { compareTokens.clear(); updateCompareStatus(); renderComparison(); compareDialog.close(); });
document.querySelector("#favorite-trader").addEventListener("click", () => toggleFavorite(selectedToken));
document.querySelector("#compare-trader").addEventListener("click", () => toggleCompare(selectedToken));
document.querySelector("#share-x").addEventListener("click", () => {
  const text = `Wall Street Trader #${selectedToken} has entered The Trading Floor.`;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(traderShareUrl(selectedToken))}`, "_blank", "noopener,noreferrer");
});
document.querySelector("#copy-link").addEventListener("click", async event => {
  await navigator.clipboard.writeText(traderShareUrl(selectedToken));
  const button = event.currentTarget, original = button.textContent;
  button.textContent = "LINK COPIED";
  setTimeout(() => { button.textContent = original; }, 1200);
});
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => { selectedToken = null; syncUrl(); });
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close()));
[statsDialog, compareDialog].forEach(item => item.addEventListener("click", event => { if (event.target === item) item.close(); }));

fetch(SOURCE_URL)
  .then(response => { if (!response.ok) throw Error("Metadata not found"); return response.text(); })
  .then(text => {
    const parsed = parseCsv(text);
    headers = parsed.headers;
    records = parsed.records;
    if (records.length !== 444 || !headers.includes("attributes[Rarity Tier]")) throw Error("Invalid collection metadata");
    calculateRarity();
    const initialTrader = restoreUrlState();
    renderFilters();
    updateFilterStatus();
    updateCompareStatus();
    render();
    if (initialTrader) openTrader(initialTrader, false);
  })
  .catch(() => {
    resultCount.textContent = "METADATA COULD NOT BE LOADED";
    document.querySelector("#load-error").hidden = false;
    emptyState.hidden = true;
    loadMore.hidden = true;
  });
