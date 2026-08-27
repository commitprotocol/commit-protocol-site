const SOURCE_URL = "data/metadata.csv";
const PAGE_SIZE = 24;
const TRAIT_PREFIX = "attributes[";
let records = [];
let headers = [];
let visible = PAGE_SIZE;
let query = "";
let order = "asc";
let activeFilters = {};
let openGroup = "attributes[Character Type]";

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

function filteredRecords() {
  const normalized = query.trim().toLowerCase().replace(/^#/, "");
  const filtered = records.filter(record => {
    const matchesSearch = !normalized || record.tokenID.includes(normalized) || record.name.toLowerCase().includes(normalized);
    const matchesTraits = Object.entries(activeFilters).every(([header, values]) => !values.size || values.has(traitValue(record, header)));
    return matchesSearch && matchesTraits;
  });
  return filtered.sort((a, b) => order === "asc" ? Number(a.tokenID) - Number(b.tokenID) : Number(b.tokenID) - Number(a.tokenID));
}

function countActiveFilters() {
  return Object.values(activeFilters).reduce((total, values) => total + values.size, 0);
}

function updateFilterStatus() {
  const count = countActiveFilters();
  activeFilterCount.textContent = `${count} ACTIVE`;
  clearFilters.hidden = !count && !query;
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

function openTrader(tokenId) {
  const record = records.find(item => item.tokenID === String(tokenId));
  if (!record) return;
  const padded = record.tokenID.padStart(3, "0");
  document.querySelector("#dialog-kicker").textContent = `OFFICIAL PUBLIC FILE / WST-${padded}`;
  document.querySelector("#dialog-title").textContent = record.name.toUpperCase();
  document.querySelector("#dialog-token").textContent = `#${record.tokenID}`;
  document.querySelector("#dialog-rarity").textContent = traitValue(record, "attributes[Rarity Tier]").toUpperCase();
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
  dialog.showModal();
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
    card.innerHTML = `<span class="card-image"><img src="traders/${record.tokenID}.png" alt="${record.name}" loading="lazy"><i aria-hidden="true"></i><b class="rarity-stamp">${rarity}</b></span><span class="card-copy"><small>PUBLIC FILE / WST-${record.tokenID.padStart(3, "0")}</small><strong>TRADER #${record.tokenID}</strong><em>${character} / OPEN ↗</em></span>`;
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
  visible = PAGE_SIZE;
  renderFilters();
  updateFilterStatus();
  render();
}

search.addEventListener("input", () => { query = search.value; visible = PAGE_SIZE; updateFilterStatus(); render(); });
orderSelect.addEventListener("change", () => { order = orderSelect.value; visible = PAGE_SIZE; render(); });
loadMore.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
clearSearch.addEventListener("click", resetFilters);
clearFilters.addEventListener("click", resetFilters);
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

fetch(SOURCE_URL)
  .then(response => { if (!response.ok) throw Error("Metadata not found"); return response.text(); })
  .then(text => {
    const parsed = parseCsv(text);
    headers = parsed.headers;
    records = parsed.records;
    if (records.length !== 444 || !headers.includes("attributes[Rarity Tier]")) throw Error("Invalid collection metadata");
    renderFilters();
    updateFilterStatus();
    render();
  })
  .catch(() => {
    resultCount.textContent = "METADATA COULD NOT BE LOADED";
    emptyState.hidden = false;
    emptyState.querySelector("h3").textContent = "The official metadata is temporarily unavailable.";
    clearSearch.hidden = true;
    loadMore.hidden = true;
  });
