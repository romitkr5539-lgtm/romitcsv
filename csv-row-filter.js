(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#rowFilterUploadCard"), uploadStatus = $("#rowFilterUploadStatus");
  const fileInput = $("#rowFilterFile"), pasteInput = $("#rowFilterPaste");
  const workspaceSection = $("#rowFilterWorkspaceSection"), workspace = $("#rowFilterWorkspace");
  const sample = "Order ID,Status,Amount,Email\nA-104,Open,125.50,alex@example.com\nA-105,Closed,0,blair@example.com\nA-106,Open,240.00,\nA-107,Pending,82.75,devon@example.com\nA-108,Open,45.00,casey@example.com";
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
    return `<div class="row-filter-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="row-filter-empty">No records in this result.</td></tr>`}</tbody></table></div>`;
  }

  function syncControls() {
    const condition = $("#rowFilterCondition").value;
    const needsValue = !["empty", "notEmpty"].includes(condition);
    const textCondition = ["contains", "equals"].includes(condition);
    $("#rowFilterValueLabel").hidden = !needsValue;
    $("#rowFilterValue").disabled = !needsValue;
    $("#rowFilterMatchCaseLabel").hidden = !textCondition;
    $("#rowFilterActionLabel").hidden = false;
    $("#rowFilterValueLabel").querySelector("span").textContent = condition === "greater" || condition === "less" ? "Number" : "Match value";
    $("#rowFilterValue").inputMode = condition === "greater" || condition === "less" ? "decimal" : "text";
    $("#rowFilterValue").placeholder = condition === "greater" || condition === "less" ? "For example, 100" : "Enter text to match";
  }

  function applyFilter() {
    const column = Number($("#rowFilterColumn").value);
    const condition = $("#rowFilterCondition").value;
    const value = $("#rowFilterValue").value;
    const matchCase = $("#rowFilterMatchCase").checked;
    const removeMatches = $("#rowFilterAction").value === "remove";
    if (!["empty", "notEmpty"].includes(condition) && !value.trim()) throw new Error("Enter a value for this condition.");
    const numericCondition = condition === "greater" || condition === "less";
    const targetNumber = Number(value.trim());
    if (numericCondition && !Number.isFinite(targetNumber)) throw new Error("Enter a valid number, such as 100 or 12.5.");
    const needle = matchCase ? value : value.toLocaleLowerCase();
    const matches = sourceRows.slice(1).filter(row => {
      const cell = String(row[column] ?? ""), trimmed = cell.trim();
      if (condition === "empty") return trimmed === "";
      if (condition === "notEmpty") return trimmed !== "";
      if (numericCondition) {
        if (!trimmed) return false;
        const number = Number(trimmed);
        if (!Number.isFinite(number)) return false;
        return condition === "greater" ? number > targetNumber : number < targetNumber;
      }
      const candidate = matchCase ? cell : cell.toLocaleLowerCase();
      if (condition === "contains") return candidate.includes(needle);
      if (condition === "equals") return candidate === needle;
      return false;
    });
    const matchingSet = new Set(matches);
    const output = removeMatches ? sourceRows.slice(1).filter(row => !matchingSet.has(row)) : matches;
    resultRows = [sourceRows[0].slice(), ...output.map(row => row.slice())];
    $("#rowFilterTable").innerHTML = makeTable(resultRows);
    $("#rowFilterResultTitle").textContent = removeMatches ? "Rows with matches removed" : "Matching rows";
    $("#rowFilterResultNote").textContent = `Showing ${output.length.toLocaleString()} of ${(sourceRows.length - 1).toLocaleString()} data rows. The header and source row order are preserved.`;
    $("#rowFilterCopy").disabled = false;
    $("#rowFilterDownload").disabled = false;
    const field = sourceRows[0][column] || `Column ${column + 1}`;
    $("#rowFilterStatus").textContent = `${matches.length.toLocaleString()} rows matched ${field}; ${output.length.toLocaleString()} rows are in the result.`;
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    const rowCount = sourceRows.length - 1;
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="row-filter-workspace-card">
        <div class="row-filter-filebar"><div class="row-filter-file-info"><span class="row-filter-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${rowCount.toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="row-filter-file-actions"><span id="rowFilterActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="rowFilterStartOver" type="button">Start over</button></div></div>
        <section class="row-filter-controls" aria-labelledby="rowFilterControlsTitle"><div class="row-filter-controls-head"><div><h2 id="rowFilterControlsTitle">Set a row condition</h2><p>Choose one field and decide whether to keep or remove matching records.</p></div><div class="row-filter-control-actions"><button class="viewer-edit" id="rowFilterSample" type="button">Load sample</button><button class="viewer-primary" id="rowFilterApply" type="button">Apply filter</button></div></div><div class="row-filter-options"><label>Column<select id="rowFilterColumn">${headers.map((heading, index) => `<option value="${index}">${escapeHTML(heading || `Column ${index + 1}`)}</option>`).join("")}</select></label><label>Condition<select id="rowFilterCondition"><option value="contains">Contains text</option><option value="equals">Equals text</option><option value="greater">Greater than</option><option value="less">Less than</option><option value="empty">Is empty</option><option value="notEmpty">Is not empty</option></select></label><label id="rowFilterValueLabel"><span>Match value</span><input id="rowFilterValue" type="text" placeholder="Enter text to match"></label><label id="rowFilterMatchCaseLabel" class="row-filter-check"><input id="rowFilterMatchCase" type="checkbox"> Match case</label><label id="rowFilterActionLabel">Action<select id="rowFilterAction"><option value="keep">Keep matching rows</option><option value="remove">Remove matching rows</option></select></label></div><p id="rowFilterStatus" class="row-filter-status" role="status" aria-live="polite">Set the condition and apply it to the records.</p></section>
        <section class="row-filter-result"><div class="row-filter-result-head"><div><h2 id="rowFilterResultTitle">Source data preview</h2><p id="rowFilterResultNote">The complete source table is shown below.</p></div><div class="row-filter-result-actions"><button class="viewer-edit" id="rowFilterCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="rowFilterDownload" type="button" disabled>Download CSV</button></div></div><div id="rowFilterTable">${makeTable(sourceRows)}</div></section>
      </div>`;
    syncControls();
    $("#rowFilterCondition").onchange = syncControls;
    $("#rowFilterApply").onclick = () => { try { applyFilter(); } catch (error) { $("#rowFilterStatus").textContent = error.message; } };
    $("#rowFilterSample").onclick = () => openData(sample, "sample-orders.csv");
    $("#rowFilterCopy").onclick = async () => {
      if (!resultRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(resultRows)); $("#rowFilterActionStatus").textContent = "Filtered CSV copied to clipboard."; }
      catch { $("#rowFilterActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#rowFilterDownload").onclick = () => {
      if (!resultRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-filtered.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#rowFilterActionStatus").textContent = "Filtered CSV download started.";
    };
    $("#rowFilterStartOver").onclick = () => {
      fileName = "data.csv"; delimiter = ","; sourceRows = []; resultRows = null;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openData(text, name) {
    const input = String(text ?? ""), detected = detectDelimiter(input);
    try {
      const parsed = parseDelimited(input, detected);
      delimiter = detected; sourceRows = parsed; fileName = name || "pasted-data.csv";
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

  $("#rowFilterBrowse").onclick = () => fileInput.click();
  const dropzone = $("#rowFilterDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#rowFilterUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#rowFilterMenu").onclick = () => {
    const open = $("#rowFilterNav").classList.toggle("open");
    $("#rowFilterMenu").setAttribute("aria-expanded", String(open));
  };
})();
