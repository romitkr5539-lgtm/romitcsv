(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#sorterUploadCard"), uploadStatus = $("#sorterUploadStatus");
  const fileInput = $("#sorterFile"), pasteInput = $("#sorterPaste");
  const workspaceSection = $("#sorterWorkspaceSection"), workspace = $("#sorterWorkspace");
  const sample = "Name,Department,Score\nAda,Research,92\nGrace,Engineering,88\nAlan,Research,95\nLinus,Engineering,90";
  let fileName = "data.csv", sourceText = "", delimiter = ",", sourceRows = [], sortedRows = null;
  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function detectDelimiter(text) {
    const choices = [",", "\t", ";", "|"];
    const counts = new Map(choices.map(choice => [choice, 0]));
    let quoted = false, lines = 0;
    for (let i = 0; i < text.length && lines < 8; i++) {
      const char = text[i], next = text[i + 1];
      if (char === '"') {
        if (quoted && next === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
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
    return `<div class="sorter-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="sorter-empty">No data rows are present.</td></tr>`}</tbody></table></div>`;
  }

  function getSortKey(row, column) { return String(row[column] ?? ""); }
  function compareRows(a, b, column, numeric) {
    const left = getSortKey(a.row, column), right = getSortKey(b.row, column);
    if (numeric && left.trim() !== "" && right.trim() !== "") {
      const leftNumber = Number(left.trim()), rightNumber = Number(right.trim());
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="sorter-workspace-card">
        <div class="sorter-filebar"><div class="sorter-file-info"><span class="sorter-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${(sourceRows.length - 1).toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="sorter-file-actions"><span id="sorterActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="sorterStartOver" type="button">Start over</button></div></div>
        <section class="sorter-controls" aria-labelledby="sorterControlsTitle"><div class="sorter-controls-head"><div><h2 id="sorterControlsTitle">Sort options</h2><p>Choose a column and set the order for the data rows.</p></div><div class="sorter-control-actions"><button class="viewer-edit" id="sorterSample" type="button">Load sample</button><button class="viewer-primary" id="sorterRun" type="button">Sort rows</button></div></div><div class="sorter-options-grid"><label>Sort by column<select id="sorterColumn">${headers.map((heading, index) => `<option value="${index}">${escapeHTML(heading || `Column ${index + 1}`)}</option>`).join("")}</select></label><label>Order<select id="sorterDirection"><option value="asc">Ascending (A to Z / low to high)</option><option value="desc">Descending (Z to A / high to low)</option></select></label><label class="sorter-numeric"><input type="checkbox" id="sorterNumeric"> Compare numeric values as numbers</label></div><p id="sorterStatus" class="sorter-status" role="status" aria-live="polite">Choose your options and select Sort rows. The header remains at the top.</p></section>
        <section class="sorter-result"><div class="sorter-result-head"><div><h2 id="sorterResultTitle">Data preview</h2><p id="sorterResultNote">The complete table is shown below. Sorting keeps all columns together.</p></div><div class="sorter-result-actions"><button class="viewer-edit" id="sorterCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="sorterDownload" type="button" disabled>Download CSV</button></div></div><div id="sorterTable">${makeTable(sourceRows)}</div></section>
      </div>`;

    $("#sorterRun").onclick = () => {
      const column = Number($("#sorterColumn").value), direction = $("#sorterDirection").value === "desc" ? -1 : 1, numeric = $("#sorterNumeric").checked;
      const rows = sourceRows.slice(1).map((row, index) => ({ row, index }));
      rows.sort((a, b) => (compareRows(a, b, column, numeric) * direction) || (a.index - b.index));
      sortedRows = [sourceRows[0].slice(), ...rows.map(item => item.row.slice())];
      $("#sorterTable").innerHTML = makeTable(sortedRows);
      $("#sorterResultTitle").textContent = "Sorted result";
      $("#sorterResultNote").textContent = `Sorted ${(sortedRows.length - 1).toLocaleString()} rows by ${headers[column] || `Column ${column + 1}`} in ${direction === 1 ? "ascending" : "descending"} order.`;
      $("#sorterCopy").disabled = false; $("#sorterDownload").disabled = false;
      $("#sorterStatus").textContent = "Sorted. Review the full result table, then copy or download the CSV.";
      requestAnimationFrame(() => $("#sorterResultTitle").scrollIntoView({ behavior: "smooth", block: "nearest" }));
    };
    $("#sorterCopy").onclick = async () => {
      if (!sortedRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(sortedRows)); $("#sorterActionStatus").textContent = "Sorted CSV copied to clipboard."; }
      catch { $("#sorterActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#sorterDownload").onclick = () => {
      if (!sortedRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(sortedRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-sorted.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#sorterActionStatus").textContent = "Sorted CSV download started.";
    };
    $("#sorterStartOver").onclick = () => {
      sourceText = ""; fileName = "data.csv"; sourceRows = []; sortedRows = null;
      workspace.innerHTML = ""; workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    $("#sorterSample").onclick = () => openData(sample, "sample.csv");
  }

  function openData(text, name) {
    sourceText = String(text ?? "");
    fileName = name || "pasted-data.csv";
    delimiter = detectDelimiter(sourceText);
    try {
      sourceRows = parseDelimited(sourceText, delimiter);
      if (sourceRows[0].length < 1) throw new Error("No columns were found in the data.");
      sortedRows = null; uploadCard.hidden = true; uploadStatus.textContent = "";
      renderWorkspace();
      requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { uploadStatus.textContent = error.message || "Could not read this delimited file."; }
  }

  async function loadFile(file) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { uploadStatus.textContent = "Choose a CSV, TSV, or TXT file."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "Choose a file no larger than 50 MB."; fileInput.value = ""; return; }
    try { openData(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read the selected file."; fileInput.value = ""; }
  }

  $("#sorterBrowse").onclick = () => fileInput.click();
  const dropzone = $("#sorterDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#sorterUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#sorterMenu").onclick = () => $("#sorterNav").classList.toggle("open");
})();
