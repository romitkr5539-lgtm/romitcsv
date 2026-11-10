(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#renameUploadCard"), uploadStatus = $("#renameUploadStatus");
  const fileInput = $("#renameFile"), pasteInput = $("#renamePaste");
  const workspaceSection = $("#renameWorkspaceSection"), workspace = $("#renameWorkspace");
  const sample = "cust_id,f_name,email_addr,signup_source\n1042,Ada,ada@example.com,Website\n1043,Grace,grace@example.com,Referral\n1044,Linus,linus@example.com,Import";
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
    return `<div class="renamer-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="renamer-empty">No data rows.</td></tr>`}</tbody></table></div>`;
  }

  function currentHeaders() {
    return Array.from(document.querySelectorAll(".renamer-input"), input => input.value);
  }

  function markChanged() {
    resultRows = null;
    $("#renameCopy").disabled = true;
    $("#renameDownload").disabled = true;
    $("#renameResultTitle").textContent = "Previous table preview";
    $("#renameResultNote").textContent = "Header edits are not applied yet. Apply them to refresh the table.";
    $("#renameStatus").textContent = "Header edits are ready. Apply changes to update the preview.";
  }

  function applyRenames() {
    const headers = currentHeaders();
    resultRows = [headers, ...sourceRows.slice(1).map(row => row.slice())];
    $("#renameTable").innerHTML = makeTable(resultRows);
    $("#renameResultTitle").textContent = "Updated CSV";
    $("#renameResultNote").textContent = `${headers.length.toLocaleString()} headings updated or kept · ${(resultRows.length - 1).toLocaleString()} data rows unchanged.`;
    $("#renameCopy").disabled = false;
    $("#renameDownload").disabled = false;
    $("#renameStatus").textContent = "Header changes applied. Review the table before copying or downloading.";
  }

  function resetHeaders() {
    document.querySelectorAll(".renamer-input").forEach((input, index) => { input.value = sourceRows[0][index] ?? ""; });
    markChanged();
    $("#renameStatus").textContent = "Original headings restored. Apply changes to refresh the table.";
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    const rowCount = sourceRows.length - 1;
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="renamer-workspace-card">
        <div class="renamer-filebar"><div class="renamer-file-info"><span class="renamer-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${rowCount.toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="renamer-file-actions"><span id="renameActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="renameStartOver" type="button">Start over</button></div></div>
        <section class="renamer-controls" aria-labelledby="renameControlsTitle"><div class="renamer-controls-head"><div><h2 id="renameControlsTitle">Edit column headings</h2><p>Only the first row changes. Values and column order are preserved.</p></div><div class="renamer-control-actions"><button class="viewer-edit" id="renameSample" type="button">Load sample</button><button class="viewer-edit" id="renameReset" type="button">Restore original names</button><button class="viewer-primary" id="renameApply" type="button">Apply names</button></div></div><div class="renamer-heading-grid">${headers.map((heading, index) => `<label class="renamer-heading-card"><span class="renamer-heading-top"><strong>Column ${index + 1}</strong><small>Original: ${escapeHTML(heading || "(blank heading)")}</small></span><span class="renamer-heading-label">New heading</span><input class="renamer-input" type="text" value="${escapeHTML(heading)}" placeholder="Enter a heading" aria-label="New heading for column ${index + 1}"></label>`).join("")}</div><p id="renameStatus" class="renamer-status" role="status" aria-live="polite">Edit any headings, then select Apply names to update the table.</p></section>
        <section class="renamer-result"><div class="renamer-result-head"><div><h2 id="renameResultTitle">Source data preview</h2><p id="renameResultNote">The complete source table is shown below. Applied heading changes will appear here.</p></div><div class="renamer-result-actions"><button class="viewer-edit" id="renameCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="renameDownload" type="button" disabled>Download CSV</button></div></div><div id="renameTable">${makeTable(sourceRows)}</div></section>
      </div>`;
    document.querySelectorAll(".renamer-input").forEach(input => input.addEventListener("input", markChanged));
    $("#renameApply").onclick = applyRenames;
    $("#renameReset").onclick = resetHeaders;
    $("#renameSample").onclick = () => openData(sample, "sample-contacts.csv");
    $("#renameCopy").onclick = async () => {
      if (!resultRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(resultRows)); $("#renameActionStatus").textContent = "Updated CSV copied to clipboard."; }
      catch { $("#renameActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#renameDownload").onclick = () => {
      if (!resultRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-renamed.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#renameActionStatus").textContent = "Renamed CSV download started.";
    };
    $("#renameStartOver").onclick = () => {
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

  $("#renameBrowse").onclick = () => fileInput.click();
  const dropzone = $("#renameDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#renameUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#renameMenu").onclick = () => {
    const open = $("#renameNav").classList.toggle("open");
    $("#renameMenu").setAttribute("aria-expanded", String(open));
  };
})();
