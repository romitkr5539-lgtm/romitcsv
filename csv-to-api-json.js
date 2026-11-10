(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const upload = $("#apiJsonUploadCard"), workspace = $("#apiJsonWorkspace"), fileInput = $("#apiJsonFile"), paste = $("#apiJsonPaste"), status = $("#apiJsonUploadStatus");
  const sample = "id,name,city\n0012,Asha,Delhi\n0013,Marco,Rome\n0014,Lin,Taipei";
  const maxBytes = 50 * 1024 * 1024;
  let rows = [], fileName = "data.csv", delimiter = ",", jsonText = "";
  const esc = value => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  function detect(text) {
    const options = [",", "\t", ";", "|"], counts = new Map(options.map(item => [item, 0]));
    let quoted = false;
    for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1]; if (c === '"') { if (quoted && next === '"') i++; else quoted = !quoted; } else if (!quoted && counts.has(c)) counts.set(c, counts.get(c) + 1); else if (!quoted && (c === "\r" || c === "\n")) break; }
    return options.reduce((best, item) => counts.get(item) > counts.get(best) ? item : best, ",");
  }
  function parse(text, separator) {
    text = String(text ?? "").replace(/^\uFEFF/, ""); const result = [];
    let row = [], cell = "", quoted = false, record = false, afterQuote = false;
    const endRow = () => { row.push(cell); if (record) result.push(row); row = []; cell = ""; record = false; afterQuote = false; };
    for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1];
      if (quoted && c === '"') { if (next === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else if (!quoted && c === '"') { if (cell || afterQuote) throw new Error("A quotation mark appears inside an unquoted field."); quoted = true; record = true; }
      else if (!quoted && c === separator) { row.push(cell); cell = ""; record = true; afterQuote = false; }
      else if (!quoted && (c === "\n" || c === "\r")) { if (c === "\r" && next === "\n") i++; endRow(); }
      else { if (afterQuote && !/\s/.test(c)) throw new Error("Unexpected text after a closing quotation mark."); cell += c; if (!/\s/.test(c)) record = true; }
    }
    if (quoted) throw new Error("A quoted field is not closed.");
    if (cell || row.length || record) endRow();
    if (!result.length) throw new Error("This file is empty or has no delimited rows.");
    return result;
  }
  function headings() {
    const source = rows[0] || [], seen = new Set();
    return Array.from({ length: rows.reduce((max, row) => Math.max(max, row.length), 0) }, (_, i) => {
      const base = String(source[i] ?? "").trim() || `Column ${i + 1}`; let name = base, suffix = 2;
      while (seen.has(name)) name = `${base}_${suffix++}`;
      seen.add(name); return name;
    });
  }
  function table(data, names) {
    return `<div class="api-json-table-wrap"><table><thead><tr>${names.map((name, i) => `<th scope="col"><span>${esc(name)}</span><small>${i + 1}</small></th>`).join("")}</tr></thead><tbody>${data.length ? data.map(row => `<tr>${names.map((_, i) => `<td title="${esc(row[i] ?? "")}">${esc(row[i] ?? "") || '<span class="api-json-empty">—</span>'}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${Math.max(1, names.length)}" class="api-json-empty-row">No data rows were found.</td></tr>`}</tbody></table></div>`;
  }
  function build() {
    const names = headings(), data = rows.slice(1).map(row => Object.fromEntries(names.map((name, i) => [name, String(row[i] ?? "")])));
    workspace.innerHTML = `<section class="api-json-card"><div class="api-json-filebar"><div><span class="api-json-file-icon">CSV</span><span><strong title="${esc(fileName)}">${esc(fileName)}</strong><small>${data.length.toLocaleString()} data rows · ${names.length} columns · ${delimiter === "\t" ? "Tab" : delimiter === ";" ? "Semicolon" : delimiter === "|" ? "Pipe" : "Comma"} separated</small></span></div><button class="viewer-clear" id="apiJsonStartOver" type="button">Open another file</button></div><section class="api-json-source"><div><span class="api-json-kicker">SOURCE DATA</span><h2>Review the CSV table</h2><p>The first row supplies the JSON property names.</p></div>${table(data, names)}</section><section class="api-json-result"><div class="api-json-result-head"><div><span class="api-json-kicker">RESPONSE SETTINGS</span><h2>Build the JSON object</h2><p>Records appear under this property; metadata is added beside it.</p></div><label class="api-json-property">Data array property<input id="apiJsonRoot" type="text" value="data" maxlength="80" autocomplete="off"></label><button class="viewer-primary" id="apiJsonConvert" type="button">Generate JSON</button></div><p id="apiJsonStatus" class="api-json-status" role="status" aria-live="polite"></p><div id="apiJsonOutput" hidden><div class="api-json-preview-head"><div><h3>API response preview</h3><p id="apiJsonSummary"></p></div><div class="api-json-actions"><button class="viewer-edit" id="apiJsonCopy" type="button">Copy JSON</button><button class="viewer-primary" id="apiJsonDownload" type="button">Download JSON</button></div></div><pre id="apiJsonPreview"></pre></div></section></section>`;
    $("#apiJsonStartOver").onclick = reset;
    $("#apiJsonConvert").onclick = convert;
    $("#apiJsonCopy").onclick = async () => { try { await navigator.clipboard.writeText(jsonText); $("#apiJsonStatus").textContent = "JSON copied to clipboard."; } catch { $("#apiJsonStatus").textContent = "Clipboard access is unavailable in this browser."; } };
    $("#apiJsonDownload").onclick = () => { const link = document.createElement("a"), url = URL.createObjectURL(new Blob([jsonText], { type: "application/json;charset=utf-8" })); link.href = url; link.download = "api-data.json"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    workspace.hidden = false;
    convert();
  }
  function convert() {
    const root = $("#apiJsonRoot").value.trim() || "data";
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(root) || root === "meta") { $("#apiJsonStatus").textContent = "Enter a property name such as data or records. The name meta is reserved for metadata."; return; }
    const names = headings(), data = rows.slice(1).map(row => Object.fromEntries(names.map((name, i) => [name, String(row[i] ?? "")])));
    const payload = { [root]: data, meta: { rowCount: data.length, columns: names } };
    jsonText = JSON.stringify(payload, null, 2); $("#apiJsonPreview").textContent = jsonText.slice(0, 12000) + (jsonText.length > 12000 ? "\n\nPreview shortened. Copy or download the complete JSON." : ""); $("#apiJsonSummary").textContent = `${data.length.toLocaleString()} records · ${names.length} properties · data array: “${root}”`;
    $("#apiJsonOutput").hidden = false; $("#apiJsonStatus").textContent = "JSON generated from the table above.";
  }
  function openData(text, name) {
    try { delimiter = detect(text); rows = parse(text, delimiter); fileName = name || "pasted-data.csv"; upload.hidden = true; status.textContent = ""; build(); requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" })); }
    catch (error) { status.textContent = error.message; }
  }
  async function loadFile(file) { if (!/\.(csv|tsv|txt)$/i.test(file.name)) { status.textContent = "Choose a CSV, TSV, or TXT file."; return; } if (file.size > maxBytes) { status.textContent = "Choose a file no larger than 50 MB."; return; } try { openData(await file.text(), file.name); fileInput.value = ""; } catch { status.textContent = "Could not read this file."; } }
  function reset() { rows = []; jsonText = ""; fileName = "data.csv"; paste.value = ""; fileInput.value = ""; workspace.innerHTML = ""; workspace.hidden = true; upload.hidden = false; status.textContent = ""; upload.scrollIntoView({ behavior: "smooth", block: "center" }); }
  $("#apiJsonBrowse").onclick = () => fileInput.click();
  $("#apiJsonDropzone").onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#apiJsonUsePaste").onclick = () => paste.value.trim() ? openData(paste.value, "pasted-data.csv") : (status.textContent = "Paste delimited data first.");
  $("#apiJsonSample").onclick = () => openData(sample, "sample-api-records.csv");
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => $("#apiJsonDropzone").addEventListener(type, event => { event.preventDefault(); $("#apiJsonDropzone").classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => $("#apiJsonDropzone").addEventListener(type, event => { event.preventDefault(); $("#apiJsonDropzone").classList.remove("drag"); }));
  $("#apiJsonDropzone").addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#apiJsonMenu").onclick = () => { const open = $("#apiJsonNav").classList.toggle("open"); $("#apiJsonMenu").setAttribute("aria-expanded", String(open)); };
})();
