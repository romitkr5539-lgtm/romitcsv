(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const tool = document.body.dataset.analysisTool;
  const uploadCard = $("#analysisUploadCard"), fileInput = $("#analysisFile"), pasteInput = $("#analysisPaste");
  const uploadStatus = $("#analysisUploadStatus"), workspaceSection = $("#analysisWorkspaceSection"), workspace = $("#analysisWorkspace") || workspaceSection;
  const sample = "Region,Product,Quarter,Revenue\nNorth,Desk,Q1,240\nSouth,Chair,Q1,180\nNorth,Chair,Q2,210\nSouth,Desk,Q2,160\nNorth,Desk,Q2,300";
  const maxBytes = 50 * 1024 * 1024;
  const toolDetails = {
    search: { panel: "Search this CSV", action: "Search rows", result: "Matching rows", suffix: "-search-results" },
    group: { panel: "Group and summarize", action: "Group rows", result: "Group summary", suffix: "-grouped" },
    pivot: { panel: "Build a pivot table", action: "Create pivot", result: "Pivot table", suffix: "-pivot" },
    aggregate: { panel: "Aggregate a column", action: "Calculate", result: "Column summary", suffix: "-summary" },
    unique: { panel: "Extract distinct values", action: "Extract values", result: "Unique values", suffix: "-unique-values" }
  };
  let fileName = "data.csv", delimiter = ",", rows = [], resultRows = null;

  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  function detectDelimiter(text) {
    const counts = new Map([[",", 0], ["\t", 0], [";", 0], ["|", 0]]);
    let quoted = false, lines = 0;
    for (let i = 0; i < text.length && lines < 8; i++) {
      const char = text[i], next = text[i + 1];
      if (char === '"') { if (quoted && next === '"') i++; else quoted = !quoted; }
      else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
      else if (!quoted && (char === "\n" || char === "\r")) { lines++; if (char === "\r" && next === "\n") i++; }
    }
    return Array.from(counts).reduce((best, item) => item[1] > counts.get(best) ? item[0] : best, ",");
  }
  function parseDelimited(text, separator) {
    text = String(text ?? "").replace(/^\uFEFF/, "");
    const parsed = [];
    let row = [], cell = "", quoted = false, afterQuote = false, hasRecordSyntax = false;
    const finishRow = () => { row.push(cell); if (hasRecordSyntax) parsed.push(row); row = []; cell = ""; afterQuote = false; hasRecordSyntax = false; };
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (quoted && char === '"') { if (next === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else if (!quoted && char === '"') { if (cell.length || afterQuote) throw new Error("A quotation mark appears inside an unquoted field. Escape quotes by doubling them inside a quoted field."); quoted = true; hasRecordSyntax = true; }
      else if (!quoted && char === separator) { row.push(cell); cell = ""; afterQuote = false; hasRecordSyntax = true; }
      else if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && next === "\n") i++; finishRow(); }
      else { if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a closing quotation mark. Add a separator or line break."); cell += char; if (!/\s/.test(char)) hasRecordSyntax = true; }
    }
    if (quoted) throw new Error("A quoted field is not closed. Add its missing quotation mark and try again.");
    if (cell.length || row.length || hasRecordSyntax) finishRow();
    if (!parsed.length) throw new Error("This file is empty or has no delimited records.");
    return parsed;
  }
  const matrixWidth = matrix => matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const fieldValue = (row, index) => String(row[index] ?? "");
  function csvText(matrix) {
    return matrix.map(row => row.map(value => { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }).join(",")).join("\r\n");
  }
  function headerNames(matrix) {
    const width = Math.max(1, matrixWidth(matrix)), header = matrix[0] || [];
    return Array.from({ length: width }, (_, i) => String(header[i] ?? "").trim() || `Column ${i + 1}`);
  }
  function selectMarkup(id, label, names) {
    return `<label class="analysis-field">${label}<select id="${id}">${names.map((name, i) => `<option value="${i}">${escapeHTML(name)}</option>`).join("")}</select></label>`;
  }
  function makeTable(matrix, names, showRowNumbers = false, wrapClass = "analysis-table-wrap") {
    const width = Math.max(names.length, matrixWidth(matrix));
    const headers = Array.from({ length: width }, (_, i) => names[i] || `Column ${i + 1}`);
    const rowNumberHead = showRowNumbers ? '<th class="analysis-row-number" scope="col">#</th>' : "";
    const body = matrix.map((row, rowIndex) => `<tr>${showRowNumbers ? `<th class="analysis-row-number" scope="row">${rowIndex + 2}</th>` : ""}${Array.from({ length: width }, (_, i) => `<td title="${escapeHTML(fieldValue(row, i))}">${escapeHTML(fieldValue(row, i)) || '<span class="analysis-empty-cell">—</span>'}</td>`).join("")}</tr>`).join("");
    return `<div class="${wrapClass}"><table><thead><tr>${rowNumberHead}${headers.map((name, i) => `<th scope="col"><span>${escapeHTML(name)}</span><small>${i + 1}</small></th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${width + (showRowNumbers ? 1 : 0)}" class="analysis-no-rows">No data rows.</td></tr>`}</tbody></table></div>`;
  }
  function getControlMarkup() {
    const names = headerNames(rows);
    if (tool === "search") return `<div class="analysis-controls analysis-search-controls"><label class="analysis-field analysis-query">Search for<input id="analysisQuery" type="search" placeholder="For example: North or 240" autocomplete="off"></label>${selectMarkup("analysisSearchColumn", "Search in", ["All columns", ...names])}<label class="analysis-check"><input id="analysisMatchCase" type="checkbox"><span><strong>Match case</strong><small>By default, upper and lowercase letters are treated alike.</small></span></label></div>`;
    if (tool === "group") return `<div class="analysis-controls">${selectMarkup("analysisGroupColumn", "Group rows by", names)}<label class="analysis-field">Calculate<select id="analysisOperation"><option value="count">Count rows</option><option value="sum">Sum values</option><option value="average">Average values</option></select></label>${selectMarkup("analysisValueColumn", "Numeric value column", names)}</div><p class="analysis-hint">Sum and average include cells that contain valid numbers; blank or non-numeric cells are skipped.</p>`;
    if (tool === "pivot") return `<div class="analysis-controls analysis-pivot-controls">${selectMarkup("analysisRowColumn", "Row categories", names)}${selectMarkup("analysisColumnColumn", "Column categories", names)}<label class="analysis-field">Calculate<select id="analysisOperation"><option value="count">Count rows</option><option value="sum">Sum values</option><option value="average">Average values</option></select></label>${selectMarkup("analysisValueColumn", "Numeric value column", names)}</div><p class="analysis-hint">Each cell summarizes one row-category and column-category combination. Numeric calculations skip blank and non-numeric cells; at most 50 distinct column categories are supported.</p>`;
    if (tool === "aggregate") return `<div class="analysis-controls">${selectMarkup("analysisValueColumn", "Column to summarize", names)}<label class="analysis-field">Calculation<select id="analysisOperation"><option value="count">Count non-empty values</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label></div><p class="analysis-hint">Count includes non-empty cells. Other calculations use valid numbers and skip blanks or text.</p>`;
    if (tool === "unique") return `<div class="analysis-controls">${selectMarkup("analysisValueColumn", "Extract values from", names)}</div><p class="analysis-hint">The first occurrence of each non-empty value is kept. Matching is case-sensitive, so North and north are treated as different values.</p>`;
    return "";
  }
  function drawWorkspace() {
    const names = headerNames(rows), data = rows.slice(1), label = delimiter === "\t" ? "Tab" : delimiter === ";" ? "Semicolon" : delimiter === "|" ? "Pipe" : "Comma";
    const details = toolDetails[tool];
    workspace.hidden = false; workspaceSection.hidden = false;
    const uniqueTool = tool === "unique";
    workspace.innerHTML = `<section class="${uniqueTool ? "validator-data-card" : "analysis-workspace-card"}"><div class="${uniqueTool ? "validator-filebar analysis-filebar" : "analysis-filebar"}"><div class="analysis-file-info"><span class="analysis-file-icon">CSV</span><span><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><small>${data.length.toLocaleString()} data rows · ${names.length.toLocaleString()} columns · ${label} separated</small></span></div><div class="analysis-file-actions"><span id="analysisActionStatus" role="status" aria-live="polite">Loaded in your browser</span><button class="viewer-clear" id="analysisStartOver" type="button">Start over</button></div></div><section class="${uniqueTool ? "validator-source analysis-source" : "analysis-source"}"><div class="analysis-section-head"><div><span class="analysis-kicker">SOURCE DATA</span><h2>Your CSV table</h2><p>Review the original records before working with them.</p></div></div>${makeTable(data, names, uniqueTool, uniqueTool ? "validator-table-wrap" : "analysis-table-wrap")}</section><section class="analysis-tool-panel"><div class="analysis-section-head"><div><span class="analysis-kicker">${tool === "search" ? "FIND MATCHING ROWS" : tool === "group" ? "SUMMARIZE BY CATEGORY" : tool === "pivot" ? "CROSS-TABULATE CATEGORIES" : tool === "aggregate" ? "CALCULATE A COLUMN SUMMARY" : "COLLECT DISTINCT VALUES"}</span><h2>${details.panel}</h2><p>${tool === "search" ? "Find a phrase in any field or limit the search to one column." : tool === "group" ? "Choose a category and calculate a count, sum, or average." : tool === "pivot" ? "Choose the row and column categories, then select a calculation." : tool === "aggregate" ? "Select a field and calculate a concise numeric summary." : "Choose a field to list its distinct non-empty values."}</p></div><button class="viewer-primary" id="analysisRun" type="button">${details.action}</button></div>${getControlMarkup()}<p id="analysisStatus" class="analysis-status" role="status" aria-live="polite"></p></section><section class="analysis-result" id="analysisResult" hidden><div class="analysis-section-head analysis-result-head"><div><span class="analysis-kicker">RESULT</span><h2>${details.result}</h2><p id="analysisSummary"></p></div><div class="analysis-result-actions"><button class="viewer-edit" id="analysisCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="analysisDownload" type="button" disabled>Download CSV</button></div></div><div id="analysisResultTable"></div></section></section>`;
    const operation = $("#analysisOperation", workspace);
    if (operation) {
      const valueSelect = $("#analysisValueColumn", workspace).closest("label");
      const updateValueSelect = () => { valueSelect.hidden = operation.value === "count"; };
      operation.addEventListener("change", updateValueSelect); updateValueSelect();
    }
    $("#analysisRun", workspace).onclick = runTool;
    $("#analysisStartOver", workspace).onclick = reset;
    $("#analysisCopy", workspace).onclick = async () => {
      if (!resultRows) return;
      try { await navigator.clipboard.writeText(csvText(resultRows)); $("#analysisActionStatus", workspace).textContent = "CSV result copied."; }
      catch { $("#analysisActionStatus", workspace).textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#analysisDownload", workspace).onclick = () => {
      if (!resultRows) return;
      const link = document.createElement("a"), url = URL.createObjectURL(new Blob(["\uFEFF", csvText(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = url; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + details.suffix + ".csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("#analysisActionStatus", workspace).textContent = "Download started.";
    };
  }
  function numeric(value) { const text = String(value ?? "").trim(); if (!text) return null; const number = Number(text); return Number.isFinite(number) ? number : null; }
  function summarize(values, operation) {
    if (operation === "count") return values.length;
    if (!values.length) return "";
    if (operation === "min") return Math.min(...values);
    if (operation === "max") return Math.max(...values);
    const sum = values.reduce((total, value) => total + value, 0);
    return operation === "average" ? sum / values.length : sum;
  }
  function runTool() {
    const headers = headerNames(rows), data = rows.slice(1);
    let outputRows = [], outputHeaders = [], message = "";
    try {
      if (tool === "search") {
        const query = $("#analysisQuery", workspace).value;
        if (!query.trim()) throw new Error("Enter a word, phrase, or value to search for.");
        const selected = Number($("#analysisSearchColumn", workspace).value), matchCase = $("#analysisMatchCase", workspace).checked;
        const needle = matchCase ? query : query.toLocaleLowerCase();
        outputRows = data.filter(row => (selected === 0 ? row : [row[selected - 1]]).some(value => {
          const cell = String(value ?? ""); return (matchCase ? cell : cell.toLocaleLowerCase()).includes(needle);
        }));
        outputHeaders = Array.from({ length: headers.length }, (_, i) => fieldValue(rows[0] || [], i)); message = `Found ${outputRows.length.toLocaleString()} matching rows out of ${data.length.toLocaleString()}.`;
      } else if (tool === "group") {
        const groupCol = Number($("#analysisGroupColumn", workspace).value), valueCol = Number($("#analysisValueColumn", workspace).value), operation = $("#analysisOperation", workspace).value;
        const groups = new Map();
        data.forEach(row => { const key = String(row[groupCol] ?? ""); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); });
        const label = headers[groupCol], resultLabel = operation === "count" ? "Row count" : operation === "sum" ? `Sum of ${headers[valueCol]}` : `Average of ${headers[valueCol]}`;
        outputHeaders = [label, resultLabel];
        outputRows = Array.from(groups, ([key, groupRows]) => {
          const values = operation === "count" ? [] : groupRows.map(row => numeric(row[valueCol])).filter(value => value !== null);
          return [key, operation === "count" ? groupRows.length : summarize(values, operation)];
        });
        message = `Grouped ${data.length.toLocaleString()} rows into ${groups.size.toLocaleString()} categories. Empty category values form their own group.`;
      } else if (tool === "pivot") {
        const rowCol = Number($("#analysisRowColumn", workspace).value), columnCol = Number($("#analysisColumnColumn", workspace).value), valueCol = Number($("#analysisValueColumn", workspace).value), operation = $("#analysisOperation", workspace).value;
        if (rowCol === columnCol) throw new Error("Choose different fields for row categories and column categories.");
        const rowKeys = [], columnKeys = [], rowSeen = new Set(), columnSeen = new Set(), cells = new Map();
        data.forEach(row => {
          const rowKey = String(row[rowCol] ?? ""), columnKey = String(row[columnCol] ?? "");
          if (!rowSeen.has(rowKey)) { rowSeen.add(rowKey); rowKeys.push(rowKey); }
          if (!columnSeen.has(columnKey)) { columnSeen.add(columnKey); columnKeys.push(columnKey); }
          const key = JSON.stringify([rowKey, columnKey]);
          if (!cells.has(key)) cells.set(key, []);
          if (operation === "count") cells.get(key).push(1);
          else { const value = numeric(row[valueCol]); if (value !== null) cells.get(key).push(value); }
        });
        if (columnKeys.length > 50) throw new Error("This pivot has more than 50 column categories. Filter the source data or choose a different column field, then try again.");
        outputHeaders = [headers[rowCol], ...columnKeys.map(key => key || "(blank)")];
        outputRows = rowKeys.map(rowKey => [rowKey, ...columnKeys.map(columnKey => {
          const values = cells.get(JSON.stringify([rowKey, columnKey])) || [];
          return values.length ? summarize(values, operation) : "";
        })]);
        message = `Created ${rowKeys.length.toLocaleString()} row categories by ${columnKeys.length.toLocaleString()} column categories.`;
      } else if (tool === "aggregate") {
        const valueCol = Number($("#analysisValueColumn", workspace).value), operation = $("#analysisOperation", workspace).value;
        const values = data.map(row => numeric(row[valueCol])).filter(value => value !== null);
        const value = operation === "count" ? data.filter(row => fieldValue(row, valueCol).trim() !== "").length : summarize(values, operation);
        const label = operation === "count" ? "Non-empty count" : operation[0].toUpperCase() + operation.slice(1);
        outputHeaders = ["Calculation", "Column", "Result"];
        outputRows = [[label, headers[valueCol], value]];
        message = operation === "count" ? `Counted ${value.toLocaleString()} non-empty values in ${headers[valueCol]}.` : `${label} of ${headers[valueCol]}: ${value === "" ? "no numeric values" : value}.`;
      } else {
        const valueCol = Number($("#analysisValueColumn", workspace).value), seen = new Set();
        outputHeaders = [fieldValue(rows[0] || [], valueCol) || headers[valueCol]];
        outputRows = [];
        data.forEach(row => { const value = fieldValue(row, valueCol); if (value.trim() !== "" && !seen.has(value)) { seen.add(value); outputRows.push([value]); } });
        message = `Found ${outputRows.length.toLocaleString()} unique non-empty values in ${headers[valueCol]}. Values retain their first-seen order.`;
      }
      resultRows = [outputHeaders, ...outputRows];
      $("#analysisSummary", workspace).textContent = message;
      $("#analysisResultTable", workspace).innerHTML = makeTable(outputRows, outputHeaders, false, tool === "unique" ? "validator-table-wrap" : "analysis-table-wrap");
      $("#analysisResult", workspace).hidden = false;
      $("#analysisCopy", workspace).disabled = false; $("#analysisDownload", workspace).disabled = false;
      $("#analysisStatus", workspace).textContent = "Done. Review the result table, then copy or download it.";
      requestAnimationFrame(() => $("#analysisResult", workspace).scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { $("#analysisStatus", workspace).textContent = error.message || "Could not process these rows."; }
  }
  function openData(text, name) {
    try {
      const source = String(text ?? ""), detected = detectDelimiter(source);
      rows = parseDelimited(source, detected); delimiter = detected; fileName = name || "pasted-data.csv"; resultRows = null;
      uploadStatus.textContent = ""; uploadCard.hidden = true; drawWorkspace();
      requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { uploadStatus.textContent = error.message || "Could not read this delimited file."; }
  }
  async function loadFile(file) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { uploadStatus.textContent = "Choose a CSV, TSV, or TXT file."; return; }
    if (file.size > maxBytes) { uploadStatus.textContent = "Choose a file no larger than 50 MB."; return; }
    try { openData(await file.text(), file.name); fileInput.value = ""; } catch { uploadStatus.textContent = "Could not read this file."; }
  }
  function reset() {
    rows = []; resultRows = null; fileName = "data.csv"; fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
    workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
    uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("#analysisBrowse").onclick = () => fileInput.click();
  $("#analysisDropzone").onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#analysisUsePaste").onclick = () => { if (!pasteInput.value.trim()) { uploadStatus.textContent = "Paste delimited data first."; pasteInput.focus(); return; } openData(pasteInput.value, "pasted-data.csv"); };
  $("#analysisLoadSample").onclick = () => openData(sample, "sample-sales.csv");
  $("#analysisMenu").onclick = () => {
    const open = $("#analysisNav").classList.toggle("open");
    $("#analysisMenu").setAttribute("aria-expanded", String(open));
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => $("#analysisDropzone").addEventListener(type, event => { event.preventDefault(); $("#analysisDropzone").classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => $("#analysisDropzone").addEventListener(type, event => { event.preventDefault(); $("#analysisDropzone").classList.remove("drag"); }));
  $("#analysisDropzone").addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
})();
