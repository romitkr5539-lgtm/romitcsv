(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#filterUploadCard"), uploadStatus = $("#filterUploadStatus");
  const fileInput = $("#filterFile"), pasteInput = $("#filterPaste");
  const workspaceSection = $("#filterWorkspaceSection"), workspace = $("#filterWorkspace");
  const sample = "Name,Department,Status\nAda,Research,Active\nGrace,Engineering,On leave\nLinus,Research,Active\nMira,Support,";
  let fileName = "data.csv", sourceText = "", delimiter = ",", sourceRows = [], filteredRows = null;
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
        if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted field. Escape a quote by typing it twice inside a quoted field.");
        quoted = true;
      } else if (!quoted && char === separator) {
        row.push(cell); cell = ""; afterQuote = false;
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i++;
        finishRow();
      } else {
        if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a closing quote. Add a separator or line break.");
        cell += char;
      }
    }
    if (quoted) throw new Error("A quoted field is not closed. Add the missing quotation mark and try again.");
    if (cell.length || row.length) finishRow();
    if (!rows.length) throw new Error("The selected file is empty or contains no delimited rows.");
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
    return `<div class="filter-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="filter-empty">No matching data rows.</td></tr>`}</tbody></table></div>`;
  }

  function syncConditionControls() {
    const condition = $("#filterCondition").value, needsValue = !["empty", "notEmpty"].includes(condition);
    $("#filterValueLabel").hidden = !needsValue;
    $("#filterValue").disabled = !needsValue;
    $("#filterCaseLabel").hidden = !needsValue;
  }

  function applyFilter() {
    const column = Number($("#filterColumn").value), condition = $("#filterCondition").value;
    const value = $("#filterValue").value, matchCase = $("#filterCase").checked;
    if (!["empty", "notEmpty"].includes(condition) && !value) throw new Error("Enter a value to filter by.");
    const needle = matchCase ? value : value.toLocaleLowerCase();
    const matches = sourceRows.slice(1).filter(row => {
      const cell = String(row[column] ?? "");
      if (condition === "empty") return cell.trim() === "";
      if (condition === "notEmpty") return cell.trim() !== "";
      const candidate = matchCase ? cell : cell.toLocaleLowerCase();
      if (condition === "contains") return candidate.includes(needle);
      if (condition === "equals") return candidate === needle;
      if (condition === "starts") return candidate.startsWith(needle);
      return false;
    });
    filteredRows = [sourceRows[0].slice(), ...matches.map(row => row.slice())];
    $("#filterTable").innerHTML = makeTable(filteredRows);
    $("#filterResultTitle").textContent = "Filtered result";
    $("#filterResultNote").textContent = `Kept ${matches.length.toLocaleString()} of ${(sourceRows.length - 1).toLocaleString()} data rows.`;
    $("#filterCopy").disabled = false; $("#filterDownload").disabled = false;
    $("#filterStatus").textContent = matches.length ? `Filter complete: ${matches.length.toLocaleString()} matching rows.` : "No rows matched. The result still contains the header row.";
    requestAnimationFrame(() => $("#filterResultTitle").scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="filter-workspace-card">
        <div class="filter-filebar"><div class="filter-file-info"><span class="filter-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${(sourceRows.length - 1).toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="filter-file-actions"><span id="filterActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="filterStartOver" type="button">Start over</button></div></div>
        <section class="filter-controls" aria-labelledby="filterControlsTitle"><div class="filter-controls-head"><div><h2 id="filterControlsTitle">Filter options</h2><p>Set a condition for one column, then apply it to the data rows.</p></div><div class="filter-control-actions"><button class="viewer-edit" id="filterSample" type="button">Load sample</button><button class="viewer-primary" id="filterRun" type="button">Filter rows</button></div></div><div class="filter-options-grid"><label>Filter column<select id="filterColumn">${headers.map((heading, index) => `<option value="${index}">${escapeHTML(heading || `Column ${index + 1}`)}</option>`).join("")}</select></label><label>Condition<select id="filterCondition"><option value="contains">Contains</option><option value="equals">Equals</option><option value="starts">Starts with</option><option value="empty">Is empty</option><option value="notEmpty">Is not empty</option></select></label><label id="filterValueLabel">Value<input id="filterValue" type="text" placeholder="Enter text to match"></label><label id="filterCaseLabel" class="filter-case"><input type="checkbox" id="filterCase"> Match case</label></div><p id="filterStatus" class="filter-status" role="status" aria-live="polite">Choose a filter condition, then select Filter rows.</p></section>
        <section class="filter-result"><div class="filter-result-head"><div><h2 id="filterResultTitle">Data preview</h2><p id="filterResultNote">The full source table is shown below. The header row stays fixed when filtering.</p></div><div class="filter-result-actions"><button class="viewer-edit" id="filterCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="filterDownload" type="button" disabled>Download CSV</button></div></div><div id="filterTable">${makeTable(sourceRows)}</div></section>
      </div>`;
    syncConditionControls();
    $("#filterCondition").onchange = syncConditionControls;
    $("#filterRun").onclick = () => {
      try { applyFilter(); }
      catch (error) { $("#filterStatus").textContent = error.message || "Could not filter these rows."; }
    };
    $("#filterCopy").onclick = async () => {
      if (!filteredRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(filteredRows)); $("#filterActionStatus").textContent = "Filtered CSV copied to clipboard."; }
      catch { $("#filterActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#filterDownload").onclick = () => {
      if (!filteredRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(filteredRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-filtered.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#filterActionStatus").textContent = "Filtered CSV download started.";
    };
    $("#filterStartOver").onclick = () => {
      sourceText = ""; fileName = "data.csv"; sourceRows = []; filteredRows = null;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    $("#filterSample").onclick = () => openData(sample, "sample.csv");
  }

  function openData(text, name) {
    sourceText = String(text ?? ""); fileName = name || "pasted-data.csv"; delimiter = detectDelimiter(sourceText);
    try {
      sourceRows = parseDelimited(sourceText, delimiter);
      filteredRows = null; uploadCard.hidden = true; uploadStatus.textContent = ""; renderWorkspace();
      requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { uploadStatus.textContent = error.message || "Could not read this delimited file."; }
  }
  async function loadFile(file) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { uploadStatus.textContent = "Choose a CSV, TSV, or TXT file."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "Choose a file no larger than 50 MB."; fileInput.value = ""; return; }
    try { openData(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read the selected file."; fileInput.value = ""; }
  }

  $("#filterBrowse").onclick = () => fileInput.click();
  const dropzone = $("#filterDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#filterUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#filterMenu").onclick = () => $("#filterNav").classList.toggle("open");
})();
