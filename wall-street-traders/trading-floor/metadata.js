const SOURCE_URL = "data/metadata.csv";
const STORAGE_KEY = "wst-metadata-desk-v1";
const TRAIT_PREFIX = "attributes[";
let headers = [];
let records = [];
let currentIndex = 0;
let originalSnapshot = "";

const workspace = document.querySelector(".metadata-workspace");
const editorLayout = document.querySelector(".editor-layout");
const editor = document.querySelector("#trait-editor");
const search = document.querySelector("#token-search");
const loadStatus = document.querySelector("#load-status");
const changeCount = document.querySelector("#change-count");
const errorBox = document.querySelector("#desk-error");

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
  return { headers: parsedHeaders, records: rows.filter((item) => item.some(Boolean)).map((values) => Object.fromEntries(parsedHeaders.map((header, index) => [header, values[index] || ""]))) };
}

function csvEscape(value) {
  const string = String(value ?? "");
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function toCsv() {
  return "\uFEFF" + [headers.map(csvEscape).join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\r\n");
}

function getSavedDraft() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ headers, records, updatedAt: new Date().toISOString() }));
  updateChangeCount();
}

function updateChangeCount() {
  const baseline = JSON.parse(originalSnapshot || "[]");
  let changed = 0;
  records.forEach((record, index) => {
    headers.forEach((header) => { if ((record[header] || "") !== (baseline[index]?.[header] || "")) changed += 1; });
  });
  changeCount.textContent = `${changed} CHANGED ${changed === 1 ? "FIELD" : "FIELDS"} / READY TO EXPORT`;
}

function friendlyLabel(header) {
  if (header.startsWith(TRAIT_PREFIX)) return header.slice(TRAIT_PREFIX.length, -1).toUpperCase();
  return header.replaceAll("_", " ").toUpperCase();
}

function renderRecord() {
  const record = records[currentIndex];
  if (!record) return;
  const tokenId = record.tokenID || String(currentIndex + 1);
  search.value = tokenId;
  document.querySelector("#record-label").textContent = `PUBLIC FILE / WST-${String(tokenId).padStart(3, "0")}`;
  document.querySelector("#record-title").textContent = record.name || `WALL STREET TRADER #${tokenId}`;
  const image = document.querySelector("#record-image");
  image.src = `traders/${tokenId}.png`;
  image.alt = `Wall Street Trader #${tokenId}`;
  editor.replaceChildren();
  headers.filter((header) => header.startsWith(TRAIT_PREFIX)).forEach((header) => {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = friendlyLabel(header);
    const input = document.createElement("input");
    input.value = record[header] || "";
    input.autocomplete = "off";
    input.dataset.header = header;
    input.addEventListener("input", () => { record[header] = input.value; saveDraft(); });
    label.append(title, input);
    editor.append(label);
  });
  document.querySelector("#previous-token").disabled = currentIndex === 0;
  document.querySelector("#next-token").disabled = currentIndex === records.length - 1;
}

function loadData(parsed, preferDraft = false) {
  headers = parsed.headers;
  records = parsed.records;
  if (!headers.includes("tokenID") || records.length === 0) throw new Error("Invalid metadata CSV");
  originalSnapshot = JSON.stringify(records);
  if (preferDraft) {
    const draft = getSavedDraft();
    if (draft?.headers?.join("|") === headers.join("|") && draft.records?.length === records.length) records = draft.records;
  }
  currentIndex = 0;
  errorBox.hidden = true;
  editorLayout.hidden = false;
  workspace.setAttribute("aria-busy", "false");
  loadStatus.textContent = `${records.length} RECORDS LOADED / AUTOSAVE ON`;
  renderRecord();
  updateChangeCount();
}

function goToToken(value) {
  const index = records.findIndex((record) => String(record.tokenID) === String(value));
  if (index >= 0) { currentIndex = index; renderRecord(); }
}

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

search.addEventListener("change", () => goToToken(search.value));
document.querySelector("#previous-token").addEventListener("click", () => { if (currentIndex > 0) { currentIndex -= 1; renderRecord(); } });
document.querySelector("#next-token").addEventListener("click", () => { if (currentIndex < records.length - 1) { currentIndex += 1; renderRecord(); } });
document.querySelector("#csv-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { loadData(parseCsv(await file.text()), false); saveDraft(); loadStatus.textContent = `${records.length} RECORDS IMPORTED / AUTOSAVE ON`; }
  catch { errorBox.hidden = false; }
});
document.querySelector("#export-csv").addEventListener("click", () => download(toCsv(), "text/csv;charset=utf-8", "wall-street-traders-metadata-corrected.csv"));
document.querySelector("#export-json").addEventListener("click", () => {
  const json = records.map((record) => ({ tokenID: record.tokenID, name: record.name, description: record.description, image: record.file_name, external_url: record.external_url, attributes: headers.filter((header) => header.startsWith(TRAIT_PREFIX)).map((header) => ({ trait_type: friendlyLabel(header).replaceAll(" ", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), value: record[header] || "" })) }));
  download(JSON.stringify(json, null, 2), "application/json", "wall-street-traders-metadata-corrected.json");
});
document.querySelector("#reset-draft").addEventListener("click", () => {
  if (!confirm("Clear every local metadata edit saved in this browser?")) return;
  localStorage.removeItem(STORAGE_KEY);
  records = JSON.parse(originalSnapshot);
  currentIndex = 0;
  renderRecord(); updateChangeCount();
  loadStatus.textContent = `${records.length} RECORDS LOADED / LOCAL DRAFT CLEARED`;
});

fetch(SOURCE_URL).then((response) => {
  if (!response.ok) throw new Error("Metadata not found");
  return response.text();
}).then((text) => loadData(parseCsv(text), true)).catch(() => {
  workspace.setAttribute("aria-busy", "false");
  loadStatus.textContent = "WAITING FOR CSV IMPORT";
  errorBox.hidden = false;
});
