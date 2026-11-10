(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#extractUploadCard"), uploadStatus = $("#extractUploadStatus");
  const fileInput = $("#extractFile"), pasteInput = $("#extractPaste");
  const workspaceSection = $("#extractWorkspaceSection"), workspace = $("#extractWorkspace");
  const sample = "Order ID,Customer,Email,Item,Quantity,Internal note\n1001,Ada Lovelace,ada@example.com,Notebook,2,Priority customer\n1002,Grace Hopper,grace@example.com,Pen set,1,Gift wrap\n1003,Linus Torvalds,linus@example.com,Desk lamp,1,";
  const maxBytes = 50 * 1024 * 1024;
  let fileName = "data.csv", delimiter = ",", sourceRows = [], resultRows = null;
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
    let row = [], cell = "", quoted = false, afterQuote = false;
    const finishRow = () => {
      row.push(cell);
      if (row.length > 1 || row.some(value => value.trim() !== "")) rows.push(row);
      row = []; cell = ""; afterQuote = false;
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (quoted && char === '"') {
        if (next === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else if (!quoted && char === '"') {
        if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted field. Escape quotation marks by doubling them inside a quoted field.");
        quoted = true;
      } else if (!quoted && char === separator) {
        row.push(cell); cell = ""; afterQuote = false;
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i++;
        finishRow();
      } else {
        if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a closing quotation mark. Add a separator or line break.");
        cell += char;
      }
    }
    if (quoted) throw new Error("A quoted field is not closed. Add the missing quotation mark and try again.");
    if (cell.length || row.length) finishRow();
    if (!rows.length) throw new Error("This file is empty or contains no delimited rows.");
    const width = Math.max(...rows.map(values => values.length));
    return rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }

  function serializeCSV(rows) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\r\n");
  }

  function makeTable(rows) {
    if (!rows?.length) return "";
    const headers = rows[0];
    return `<div class="extractor-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="extractor-empty">No data rows.</td></tr>`}</tbody></table></div>`;
  }

  function selectedColumns() {
    return Array.from(document.querySelectorAll(".extractor-column:checked"), input => Number(input.value)).sort((a, b) => a - b);
  }

  function extractColumns() {
    const columns = selectedColumns();
    if (!columns.length) throw new Error("Select at least one column to keep.");
    resultRows = [columns.map(index => sourceRows[0][index] ?? ""), ...sourceRows.slice(1).map(row => columns.map(index => row[index] ?? ""))];
    $("#extractTable").innerHTML = makeTable(resultRows);
    $("#extractResultTitle").textContent = "Extracted columns";
    $("#extractResultNote").textContent = `Showing ${columns.length.toLocaleString()} selected columns and ${(resultRows.length - 1).toLocaleString()} data rows.`;
    $("#extractCopy").disabled = false;
    $("#extractDownload").disabled = false;
    $("#extractStatus").textContent = `Extraction complete: ${columns.length.toLocaleString()} columns kept.`;
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    const count = sourceRows.length - 1;
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="extractor-workspace-card">
        <div class="extractor-filebar"><div class="extractor-file-info"><span class="extractor-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${count.toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="extractor-file-actions"><span id="extractActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="extractStartOver" type="button">Start over</button></div></div>
        <section class="extractor-controls" aria-labelledby="extractControlsTitle"><div class="extractor-controls-head"><div><h2 id="extractControlsTitle">Choose columns to keep</h2><p>Selected columns stay in their original left-to-right order.</p></div><div class="extractor-control-actions"><button class="viewer-edit" id="extractSelectAll" type="button">Select all</button><button class="viewer-edit" id="extractClearSelection" type="button">Clear selection</button><button class="viewer-primary" id="extractRun" type="button">Extract columns</button></div></div><div class="extractor-selection-summary"><span><strong id="extractSelectedCount">${headers.length}</strong> of ${headers.length} columns selected</span><span>Choose at least one column</span></div><div class="extractor-column-grid">${headers.map((heading, index) => `<label class="extractor-column-card"><input class="extractor-column" type="checkbox" value="${index}" checked><span class="extractor-column-check" aria-hidden="true"></span><span class="extractor-column-copy"><strong>${escapeHTML(heading || `Column ${index + 1}`)}</strong><small>Column ${index + 1}</small></span></label>`).join("")}</div><p id="extractStatus" class="extractor-status" role="status" aria-live="polite">Select the fields you want to include, then choose Extract columns.</p></section>
        <section class="extractor-result"><div class="extractor-result-head"><div><h2 id="extractResultTitle">Source data preview</h2><p id="extractResultNote">The full source table is shown below. Extracted columns will appear here.</p></div><div class="extractor-result-actions"><button class="viewer-edit" id="extractCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="extractDownload" type="button" disabled>Download CSV</button></div></div><div id="extractTable">${makeTable(sourceRows)}</div></section>
      </div>`;
    const checkboxes = Array.from(document.querySelectorAll(".extractor-column"));
    const updateCount = () => { $("#extractSelectedCount").textContent = selectedColumns().length.toLocaleString(); };
    checkboxes.forEach(input => input.addEventListener("change", updateCount));
    $("#extractSelectAll").onclick = () => { checkboxes.forEach(input => { input.checked = true; }); updateCount(); };
    $("#extractClearSelection").onclick = () => { checkboxes.forEach(input => { input.checked = false; }); updateCount(); };
    $("#extractRun").onclick = () => { try { extractColumns(); } catch (error) { $("#extractStatus").textContent = error.message; } };
    $("#extractCopy").onclick = async () => {
      if (!resultRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(resultRows)); $("#extractActionStatus").textContent = "Extracted CSV copied to clipboard."; }
      catch { $("#extractActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#extractDownload").onclick = () => {
      if (!resultRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-columns.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#extractActionStatus").textContent = "Extracted CSV download started.";
    };
    $("#extractStartOver").onclick = () => {
      fileName = "data.csv"; delimiter = ","; sourceRows = []; resultRows = null;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openData(text, name) {
    const input = String(text ?? "");
    delimiter = detectDelimiter(input);
    try {
      sourceRows = parseDelimited(input, delimiter);
      fileName = name || "pasted-data.csv"; resultRows = null;
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

  $("#extractBrowse").onclick = () => fileInput.click();
  const dropzone = $("#extractDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#extractUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#extractMenu").onclick = () => {
    const open = $("#extractNav").classList.toggle("open");
    $("#extractMenu").setAttribute("aria-expanded", String(open));
  };
})();
