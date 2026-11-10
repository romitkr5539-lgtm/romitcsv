(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#columnCountUploadCard"), uploadStatus = $("#columnCountUploadStatus");
  const fileInput = $("#columnCountFile"), pasteInput = $("#columnCountPaste");
  const workspaceSection = $("#columnCountWorkspaceSection"), workspace = $("#columnCountWorkspace");
  const sample = "Order ID,Status,Amount\nA-104,Open,125.50\nA-105,Closed,0\nA-106,Open,240.00,check\nA-107,Pending,82.75\nA-108,Open,45.00";
  const maxBytes = 50 * 1024 * 1024;
  let fileName = "data.csv", fileBytes = 0, delimiter = ",", sourceRows = [], hasHeader = true, reportRows = null;
  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function detectDelimiter(text) {
    const choices = [",", "\t", ";", "|"];
    const counts = new Map(choices.map(choice => [choice, 0]));
    let quoted = false, lines = 0;
    for (let i = 0; i < text.length && lines < 8; i++) {
      const char = text[i], next = text[i + 1];
      if (char === '"') { if (quoted && next === '"') i++; else quoted = !quoted; }
      else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
      else if (!quoted && (char === "\n" || char === "\r")) { lines++; if (char === "\r" && next === "\n") i++; }
    }
    return choices.reduce((best, choice) => counts.get(choice) > counts.get(best) ? choice : best, ",");
  }

  function parseDelimited(text, separator) {
    text = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], cell = "", quoted = false, afterQuote = false, hasRecordSyntax = false;
    const finishRow = () => {
      row.push(cell);
      if (hasRecordSyntax) rows.push(row);
      row = []; cell = ""; afterQuote = false; hasRecordSyntax = false;
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (quoted && char === '"') {
        if (next === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else if (!quoted && char === '"') {
        if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted field. Escape quotation marks by doubling them inside a quoted field.");
        quoted = true; hasRecordSyntax = true;
      } else if (!quoted && char === separator) {
        row.push(cell); cell = ""; afterQuote = false; hasRecordSyntax = true;
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i++;
        finishRow();
      } else {
        if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a closing quotation mark. Add a separator or line break.");
        cell += char; if (!/\s/.test(char)) hasRecordSyntax = true;
      }
    }
    if (quoted) throw new Error("A quoted field is not closed. Add the missing quotation mark and try again.");
    if (cell.length || row.length || hasRecordSyntax) finishRow();
    if (!rows.length) throw new Error("This file is empty or contains no delimited rows.");
    return rows;
  }

  function serializeCSV(rows) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\r\n");
  }

  function getStats() {
    const widest = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);
    const headerWidth = hasHeader ? (sourceRows[0]?.length || 0) : null;
    const expected = headerWidth ?? widest;
    const records = sourceRows.slice(hasHeader ? 1 : 0);
    const shortRows = records.filter(row => row.length < expected).length;
    const extraRows = records.filter(row => row.length > expected).length;
    return { widest, headerWidth, expected, records, shortRows, extraRows, mismatched: shortRows + extraRows };
  }

  function makeTable(stats) {
    const headers = hasHeader
      ? Array.from({ length: stats.widest }, (_, index) => sourceRows[0][index] || `Column ${index + 1}`)
      : Array.from({ length: stats.widest }, (_, index) => `Column ${index + 1}`);
    const records = hasHeader ? sourceRows.slice(1) : sourceRows;
    return `<div class="column-counter-table-wrap"><table><thead><tr>${headers.map(heading => `<th>${escapeHTML(heading)}</th>`).join("")}</tr></thead><tbody>${records.map(row => `<tr>${Array.from({ length: stats.widest }, (_, index) => `<td title="${escapeHTML(row[index] ?? "")}">${escapeHTML(row[index] ?? "")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, stats.widest)}" class="column-counter-empty">No data rows.</td></tr>`}</tbody></table></div>`;
  }

  function updateReport() {
    const stats = getStats();
    $("#columnCountWideNumber").textContent = stats.widest.toLocaleString();
    $("#columnCountHeaderNumber").textContent = hasHeader ? stats.headerWidth.toLocaleString() : "—";
    $("#columnCountShortNumber").textContent = stats.shortRows.toLocaleString();
    $("#columnCountExtraNumber").textContent = stats.extraRows.toLocaleString();
    $("#columnCountParsedNumber").textContent = sourceRows.length.toLocaleString();
    $("#columnCountExpectedNote").textContent = hasHeader ? `${stats.headerWidth} fields in header` : `${stats.widest} fields expected (widest record)`;
    $("#columnCountTableTitle").textContent = hasHeader ? "Parsed table · first record is the header" : "Parsed table · generated field labels";
    $("#columnCountTable").innerHTML = makeTable(stats);
    reportRows = [
      ["Metric", "Value"],
      ["Columns in widest record", String(stats.widest)],
      ["Columns in header", hasHeader ? String(stats.headerWidth) : "Not used"],
      ["Parsed records", String(sourceRows.length)],
      ["Data records", String(stats.records.length)],
      ["Rows with fewer fields than expected", String(stats.shortRows)],
      ["Rows with extra fields", String(stats.extraRows)],
      ["Header row included", hasHeader ? "Yes" : "No"]
    ];
    $("#columnCountStatus").textContent = stats.mismatched
      ? `${stats.widest} columns at maximum width. ${stats.shortRows} ${stats.shortRows === 1 ? "row has" : "rows have"} fewer fields and ${stats.extraRows} ${stats.extraRows === 1 ? "row has" : "rows have"} extra fields compared with the expected width.`
      : `All ${stats.records.length.toLocaleString()} data ${stats.records.length === 1 ? "row has" : "rows have"} the expected ${stats.expected} ${stats.expected === 1 ? "field" : "fields"}.`;
  }

  function renderWorkspace() {
    const stats = getStats();
    const bytes = fileBytes;
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="column-counter-workspace-card">
        <div class="column-counter-filebar"><div class="column-counter-file-info"><span class="column-counter-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${sourceRows.length.toLocaleString()} parsed records · widest row has ${stats.widest} fields · ${bytes.toLocaleString()} bytes</span></div></div><div class="column-counter-file-actions"><span id="columnCountActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="columnCountStartOver" type="button">Start over</button></div></div>
        <section class="column-counter-results" aria-labelledby="columnCountResultTitle"><div class="column-counter-results-head"><div><span class="column-counter-kicker">COLUMN CHECK</span><h2 id="columnCountResultTitle">Fields in your CSV</h2><p>The maximum width and row differences are calculated from parsed fields.</p></div><div class="column-counter-result-actions"><button class="viewer-edit" id="columnCountCopy" type="button">Copy column count</button><button class="viewer-primary" id="columnCountDownload" type="button">Download report</button></div></div><div class="column-counter-stat-grid"><div class="column-counter-stat column-counter-main-stat"><span>Columns in widest record</span><strong id="columnCountWideNumber">0</strong><small id="columnCountExpectedNote"></small></div><div class="column-counter-stat"><span>Fields in header</span><strong id="columnCountHeaderNumber">0</strong><small>First record, when used as headings</small></div><div class="column-counter-stat"><span>Rows with fewer fields</span><strong id="columnCountShortNumber">0</strong><small>Compared with expected width</small></div><div class="column-counter-stat"><span>Rows with extra fields</span><strong id="columnCountExtraNumber">0</strong><small>Compared with expected width</small></div></div><label class="column-counter-header-toggle"><input id="columnCountHasHeader" type="checkbox" checked><span><strong>First row contains column names</strong><small>Turn this off if the file starts directly with data.</small></span></label><p class="column-counter-parsed-note">Parsed records: <strong id="columnCountParsedNumber">0</strong></p><p id="columnCountStatus" class="column-counter-status" role="status" aria-live="polite"></p></section>
        <section class="column-counter-table-section"><div class="column-counter-table-head"><div><h2 id="columnCountTableTitle">CSV table</h2><p>Short rows are padded visually in the preview so each field lines up beneath a heading.</p></div></div><div id="columnCountTable">${makeTable(stats)}</div></section>
      </div>`;
    $("#columnCountHasHeader").onchange = event => { hasHeader = event.target.checked; updateReport(); };
    $("#columnCountCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(String(getStats().widest)); $("#columnCountActionStatus").textContent = "Column count copied."; }
      catch { $("#columnCountActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#columnCountDownload").onclick = () => {
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(reportRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-column-count.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#columnCountActionStatus").textContent = "Column report download started.";
    };
    $("#columnCountStartOver").onclick = () => {
      fileName = "data.csv"; fileBytes = 0; delimiter = ","; sourceRows = []; reportRows = null; hasHeader = true;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    updateReport();
  }

  function openData(text, name) {
    const input = String(text ?? ""), detected = detectDelimiter(input);
    try {
      sourceRows = parseDelimited(input, detected); fileBytes = new Blob([input]).size; delimiter = detected; fileName = name || "pasted-data.csv"; hasHeader = true;
      uploadCard.hidden = true; uploadStatus.textContent = ""; renderWorkspace();
      requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { uploadStatus.textContent = error.message || "Could not read this delimited file."; }
  }

  async function loadFile(file) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { uploadStatus.textContent = "Choose a CSV, TSV, or TXT file."; fileInput.value = ""; return; }
    if (file.size > maxBytes) { uploadStatus.textContent = "Choose a file no larger than 50 MB."; fileInput.value = ""; return; }
    try { openData(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read the selected file."; fileInput.value = ""; }
  }

  $("#columnCountBrowse").onclick = () => fileInput.click();
  const dropzone = $("#columnCountDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#columnCountUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#columnCountMenu").onclick = () => {
    const open = $("#columnCountNav").classList.toggle("open");
    $("#columnCountMenu").setAttribute("aria-expanded", String(open));
  };
})();
