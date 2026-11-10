(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#rowCountUploadCard"), uploadStatus = $("#rowCountUploadStatus");
  const fileInput = $("#rowCountFile"), pasteInput = $("#rowCountPaste");
  const workspaceSection = $("#rowCountWorkspaceSection"), workspace = $("#rowCountWorkspace");
  const sample = "Order ID,Status,Amount\nA-104,Open,125.50\nA-105,Closed,0\nA-106,Open,240.00\nA-107,Pending,82.75\nA-108,Open,45.00";
  const maxBytes = 50 * 1024 * 1024;
  let fileName = "data.csv", delimiter = ",", sourceRows = [], isHeader = true, resultRows = null;
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
    const width = rows.reduce((max, values) => Math.max(max, values.length), 0);
    return rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }

  function serializeCSV(rows) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\r\n");
  }

  function dataRowCount() { return Math.max(0, sourceRows.length - (isHeader ? 1 : 0)); }

  function makeTable() {
    const width = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = isHeader ? sourceRows[0] : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
    const records = isHeader ? sourceRows.slice(1) : sourceRows;
    return `<div class="row-counter-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${records.map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, width)}" class="row-counter-empty">No data records.</td></tr>`}</tbody></table></div>`;
  }

  function updateCount() {
    const dataRows = dataRowCount(), columns = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);
    $("#rowCountNumber").textContent = dataRows.toLocaleString();
    $("#rowCountColumnNumber").textContent = columns.toLocaleString();
    $("#rowCountParsedNumber").textContent = sourceRows.length.toLocaleString();
    $("#rowCountHeaderNote").textContent = isHeader ? "First row excluded as headings" : "No header row excluded";
    $("#rowCountTableTitle").textContent = isHeader ? "CSV table · first row used as headings" : "CSV table · generated column labels";
    $("#rowCountTable").innerHTML = makeTable();
    resultRows = [["Metric", "Value"], ["Data rows", String(dataRows)], ["Columns", String(columns)], ["Parsed records", String(sourceRows.length)], ["Header row excluded", isHeader ? "Yes" : "No"]];
    $("#rowCountStatus").textContent = `${dataRows.toLocaleString()} data ${dataRows === 1 ? "row" : "rows"} found across ${columns.toLocaleString()} ${columns === 1 ? "column" : "columns"}.`;
    $("#rowCountCopy").disabled = false;
    $("#rowCountDownload").disabled = false;
  }

  function renderWorkspace() {
    const bytes = new Blob([serializeCSV(sourceRows)]).size;
    const columns = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="row-counter-workspace-card">
        <div class="row-counter-filebar"><div class="row-counter-file-info"><span class="row-counter-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${sourceRows.length.toLocaleString()} parsed records · ${columns.toLocaleString()} columns · ${bytes.toLocaleString()} bytes</span></div></div><div class="row-counter-file-actions"><span id="rowCountActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="rowCountStartOver" type="button">Start over</button></div></div>
        <section class="row-counter-results" aria-labelledby="rowCountResultTitle"><div class="row-counter-results-head"><div><span class="row-counter-kicker">COUNT SUMMARY</span><h2 id="rowCountResultTitle">Records in your CSV</h2><p>The count updates when you change the header setting.</p></div><div class="row-counter-result-actions"><button class="viewer-edit" id="rowCountCopy" type="button">Copy count</button><button class="viewer-primary" id="rowCountDownload" type="button">Download count report</button></div></div><div class="row-counter-stat-grid"><div class="row-counter-stat row-counter-main-stat"><span>Data rows</span><strong id="rowCountNumber">0</strong><small id="rowCountHeaderNote"></small></div><div class="row-counter-stat"><span>Columns</span><strong id="rowCountColumnNumber">0</strong><small>Fields in each parsed record</small></div><div class="row-counter-stat"><span>Parsed records</span><strong id="rowCountParsedNumber">0</strong><small>Includes the first row, if present</small></div></div><label class="row-counter-header-toggle"><input id="rowCountHasHeader" type="checkbox" checked><span><strong>First row contains column names</strong><small>Turn this off if the file starts directly with data.</small></span></label><p id="rowCountStatus" class="row-counter-status" role="status" aria-live="polite"></p></section>
        <section class="row-counter-table-section"><div class="row-counter-table-head"><div><h2 id="rowCountTableTitle">CSV table</h2><p>Review the parsed records used for this count.</p></div></div><div id="rowCountTable"></div></section>
      </div>`;
    $("#rowCountHasHeader").onchange = event => { isHeader = event.target.checked; updateCount(); };
    $("#rowCountCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(String(dataRowCount())); $("#rowCountActionStatus").textContent = "Row count copied."; }
      catch { $("#rowCountActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#rowCountDownload").onclick = () => {
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-row-count.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#rowCountActionStatus").textContent = "Count report download started.";
    };
    $("#rowCountStartOver").onclick = () => {
      fileName = "data.csv"; delimiter = ","; sourceRows = []; resultRows = null; isHeader = true;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    updateCount();
  }

  function openData(text, name) {
    const input = String(text ?? ""), detected = detectDelimiter(input);
    try {
      const parsed = parseDelimited(input, detected);
      delimiter = detected; sourceRows = parsed; fileName = name || "pasted-data.csv"; isHeader = true;
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

  $("#rowCountBrowse").onclick = () => fileInput.click();
  const dropzone = $("#rowCountDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#rowCountUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#rowCountMenu").onclick = () => {
    const open = $("#rowCountNav").classList.toggle("open");
    $("#rowCountMenu").setAttribute("aria-expanded", String(open));
  };
})();
