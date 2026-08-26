const TOTAL = 444;
const PAGE_SIZE = 24;
let visible = PAGE_SIZE;
let query = "";
let order = "asc";

const grid = document.querySelector("#trader-grid");
const search = document.querySelector("#search");
const orderSelect = document.querySelector("#order");
const resultCount = document.querySelector("#result-count");
const loadMore = document.querySelector("#load-more");
const emptyState = document.querySelector("#empty-state");
const clearSearch = document.querySelector("#clear-search");
const dialog = document.querySelector("#trader-dialog");

function filteredIds() {
  const ids = Array.from({ length: TOTAL }, (_, index) => index + 1);
  const normalized = query.trim().replace(/^#/, "");
  const filtered = normalized ? ids.filter((id) => String(id).includes(normalized)) : ids;
  return order === "asc" ? filtered : filtered.reverse();
}

function openTrader(id) {
  const padded = String(id).padStart(3, "0");
  document.querySelector("#dialog-kicker").textContent = `OFFICIAL PUBLIC FILE / WST-${padded}`;
  document.querySelector("#dialog-title").textContent = `WALL STREET TRADER #${id}`;
  document.querySelector("#dialog-token").textContent = `#${id}`;
  const image = document.querySelector("#dialog-image");
  image.src = `traders/${id}.png`;
  image.alt = `Wall Street Trader #${id}`;
  const download = document.querySelector("#download-link");
  download.href = `traders/${id}.png`;
  download.download = `wall-street-trader-${id}.png`;
  dialog.showModal();
}

function render() {
  const ids = filteredIds();
  const shown = ids.slice(0, visible);
  grid.replaceChildren();
  shown.forEach((id) => {
    const card = document.createElement("button");
    card.className = "trader-card";
    card.innerHTML = `<span class="card-image"><img src="traders/${id}.png" alt="Wall Street Trader #${id}" loading="lazy"><i aria-hidden="true"></i></span><span class="card-copy"><small>PUBLIC FILE / WST-${String(id).padStart(3, "0")}</small><strong>TRADER #${id}</strong><em>OPEN FILE ↗</em></span>`;
    card.addEventListener("click", () => openTrader(id));
    grid.append(card);
  });
  resultCount.textContent = `DISPLAYING ${shown.length} OF ${ids.length}`;
  grid.hidden = shown.length === 0;
  emptyState.hidden = shown.length !== 0;
  loadMore.hidden = visible >= ids.length || ids.length === 0;
}

search.addEventListener("input", () => { search.value = search.value.replace(/[^0-9#]/g, ""); query = search.value; visible = PAGE_SIZE; render(); });
orderSelect.addEventListener("change", () => { order = orderSelect.value; visible = PAGE_SIZE; render(); });
loadMore.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
clearSearch.addEventListener("click", () => { search.value = ""; query = ""; visible = PAGE_SIZE; render(); search.focus(); });
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
render();
