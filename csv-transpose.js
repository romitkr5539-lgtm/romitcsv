(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#transposeUploadCard"), uploadStatus = $("#transposeUploadStatus");
  const fileInput = $("#transposeFile"), pasteInput = $("#transposePaste");
  const workspaceSection = $("#transposeWorkspaceSection"), workspace = $("#transposeWorkspace");
  const sample = "Metric,January,February,March\nSales,120,145,160\nReturns,4,3,5\nNew customers,18,22,20";
  const maxBytes = 50 * 1024 * 1024;
  let fileName = "data.csv", delimiter = ",", sourceRows = [], transposedRows = null;
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

  function matrixWidth(rows) { return rows.reduce((max, row) => Math.max(max, row.length), 0); }

  function makeGrid(rows, name) {
    const columns = matrixWidth(rows);
    const header = Array.from({ length: columns }, (_, index) => `${name} ${index + 1}`);
    return `<div class="transpose-table-wrap"><table><thead><tr>${header.map(value => `<th>${escapeHTML(value)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${Array.from({ length: columns }, (_, index) => `<td title="${escapeHTML(row[index] ?? "")}">${escapeHTML(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function transpose() {
    const inputColumns = matrixWidth(sourceRows);
    transposedRows = Array.from({ length: inputColumns }, (_, column) => sourceRows.map(row => row[column] ?? ""));
    const outputColumns = sourceRows.length;
    $("#transposeOutputDimensions").textContent = `${transposedRows.length.toLocaleString()} rows × ${outputColumns.toLocaleString()} columns`;
    $("#transposeOutputTable").innerHTML = makeGrid(transposedRows, "Output column");
    $("#transposeCopy").disabled = false;
    $("#transposeDownload").disabled = false;
    $("#transposeStatus").textContent = `Transposed ${sourceRows.length.toLocaleString()} rows and ${inputColumns.toLocaleString()} columns. Missing cells in shorter rows are blank in the result.`;
    $("#transposeOutputSection").hidden = false;
    requestAnimationFrame(() => $("#transposeOutputSection").scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function renderWorkspace() {
    const inputRows = sourceRows.length, inputColumns = matrixWidth(sourceRows);
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="transpose-workspace-card">
        <div class="transpose-filebar"><div class="transpose-file-info"><span class="transpose-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${inputRows.toLocaleString()} parsed rows · ${inputColumns.toLocaleString()} columns at maximum width · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="transpose-file-actions"><span id="transposeActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="transposeStartOver" type="button">Start over</button></div></div>
        <section class="transpose-controls"><div class="transpose-controls-head"><div><h2>Input table</h2><p>The entire grid is rotated, including its first row. The preview uses neutral labels to show every cell.</p></div><div class="transpose-control-actions"><button class="viewer-edit" id="transposeSample" type="button">Load sample</button><button class="viewer-primary" id="transposeRun" type="button">Transpose table</button></div></div><div class="transpose-dimensions"><span><small>Input</small><strong>${inputRows.toLocaleString()} × ${inputColumns.toLocaleString()}</strong><em>rows × columns</em></span><span class="transpose-arrow" aria-hidden="true">→</span><span><small>After transpose</small><strong>${inputColumns.toLocaleString()} × ${inputRows.toLocaleString()}</strong><em>rows × columns</em></span></div><div id="transposeInputTable">${makeGrid(sourceRows, "Input column")}</div></section>
        <section class="transpose-output" id="transposeOutputSection" hidden><div class="transpose-result-head"><div><span class="transpose-kicker">TRANSPOSED RESULT</span><h2>Rotated table</h2><p id="transposeOutputDimensions">${inputColumns} rows × ${inputRows} columns</p></div><div class="transpose-result-actions"><button class="viewer-edit" id="transposeCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="transposeDownload" type="button" disabled>Download CSV</button></div></div><div id="transposeOutputTable"></div><p id="transposeStatus" class="transpose-status" role="status" aria-live="polite"></p></section>
      </div>`;
    $("#transposeRun").onclick = transpose;
    $("#transposeSample").onclick = () => openData(sample, "sample-monthly-metrics.csv");
    $("#transposeCopy").onclick = async () => {
      if (!transposedRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(transposedRows)); $("#transposeActionStatus").textContent = "Transposed CSV copied to clipboard."; }
      catch { $("#transposeActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#transposeDownload").onclick = () => {
      if (!transposedRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(transposedRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-transposed.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#transposeActionStatus").textContent = "Transposed CSV download started.";
    };
    $("#transposeStartOver").onclick = () => {
      fileName = "data.csv"; delimiter = ","; sourceRows = []; transposedRows = null;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openData(text, name) {
    const input = String(text ?? ""), detected = detectDelimiter(input);
    try {
      sourceRows = parseDelimited(input, detected); delimiter = detected; fileName = name || "pasted-data.csv"; transposedRows = null;
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

  $("#transposeBrowse").onclick = () => fileInput.click();
  const dropzone = $("#transposeDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#transposeUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#transposeMenu").onclick = () => {
    const open = $("#transposeNav").classList.toggle("open");
    $("#transposeMenu").setAttribute("aria-expanded", String(open));
  };
})();
