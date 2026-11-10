(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#tsvcsvUploadCard"), workspaceSection = $("#tsvcsvWorkspaceSection"), workspace = $("#tsvcsvWorkspace");
  const fileInput = $("#tsvcsvFile"), pasteInput = $("#tsvcsvPaste"), uploadStatus = $("#tsvcsvUploadStatus");
  const sample = "name\tcity\nAda Lovelace\tLondon\nGrace Hopper\tNew York\nKatherine Johnson\tWhite Sulphur Springs";
  let fileName = "data.tsv", sourceTSV = "", converted = null, output = "", dirty = false;
  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function parseTSV(text) {
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
      } else if (!quoted && char === "\t") {
        row.push(cell); cell = ""; afterQuote = false;
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i++;
        finishRow();
      } else {
        if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a closing quote. Add a tab or line break after the quoted field.");
        cell += char;
      }
    }
    if (quoted) throw new Error("A quoted TSV field is not closed. Add the missing quotation mark and try again.");
    if (cell.length || row.length) finishRow();
    if (!rows.length) throw new Error("Add tab-separated data before converting to CSV.");
    const width = Math.max(...rows.map(values => values.length));
    return rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }

  function makeCSV(rows) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\r\n");
  }

  function tableMarkup(rows) {
    if (!rows) return "";
    const headers = rows[0];
    return `<section class="tsvcsv-table-card"><div class="tsvcsv-section-heading"><div><h2>TSV table preview</h2><p>All parsed records appear in the CSV output.</p></div><span>${Math.max(0, rows.length - 1).toLocaleString()} data rows · ${headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap tsvcsv-table-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="no-results">No data rows to display.</td></tr>`}</tbody></table></div></section>`;
  }

  function render(error = "") {
    let message = error;
    converted = null; output = "";
    if (!message) {
      try { converted = parseTSV(sourceTSV); output = makeCSV(converted); }
      catch (exception) { message = exception.message || "Could not convert this TSV file."; }
    }
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="tsvcsv-workspace-card">
        <div class="tsvcsv-filebar"><div class="tsvcsv-file-info"><span class="tsvcsv-file-icon">TSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${converted ? `${Math.max(0, converted.length - 1).toLocaleString()} data rows · ${converted[0].length.toLocaleString()} columns` : "Review or correct your TSV input"}</span></div></div><div class="tsvcsv-file-actions"><span id="tsvcsvActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="tsvcsvStartOver" type="button">Start over</button></div></div>
        ${message ? `<p class="tsvcsv-error" role="alert">${escapeHTML(message)}</p>` : ""}
        <div class="tsvcsv-workbench">
          <section class="tsvcsv-input-panel" aria-labelledby="tsvcsvInputTitle"><div class="tsvcsv-section-heading"><div><h2 id="tsvcsvInputTitle">TSV input</h2><p>Tabs separate columns. Edit the data and convert again as needed.</p></div><div class="tsvcsv-input-actions"><button class="viewer-edit" id="tsvcsvSample" type="button">Load sample</button><button class="viewer-primary" id="tsvcsvConvert" type="button">Convert to CSV</button></div></div><textarea id="tsvcsvInput" spellcheck="false" aria-label="TSV input">${escapeHTML(sourceTSV)}</textarea><p class="tsvcsv-stale" id="tsvcsvStale" hidden>Input changed. Convert again to refresh the CSV and table preview.</p></section>
          <section class="tsvcsv-output-panel" aria-labelledby="tsvcsvOutputTitle"><div class="tsvcsv-section-heading"><div><h2 id="tsvcsvOutputTitle">CSV output</h2><p>Comma-separated values with quoted fields where needed.</p></div><div class="tsvcsv-output-actions"><button class="viewer-edit" id="tsvcsvCopy" type="button" ${output && !dirty ? "" : "disabled"}>Copy CSV</button><button class="viewer-primary" id="tsvcsvDownload" type="button" ${output && !dirty ? "" : "disabled"}>Download .csv</button></div></div><textarea id="tsvcsvOutput" readonly spellcheck="false" aria-label="Generated CSV" placeholder="CSV output appears after conversion">${escapeHTML(output)}</textarea><div class="tsvcsv-copy-status" id="tsvcsvCopyStatus" role="status" aria-live="polite"></div></section>
        </div>${tableMarkup(converted)}
      </div>`;
    $("#tsvcsvInput").oninput = event => {
      sourceTSV = event.target.value; dirty = true; $("#tsvcsvStale").hidden = false;
      $("#tsvcsvCopy").disabled = true; $("#tsvcsvDownload").disabled = true;
    };
    $("#tsvcsvConvert").onclick = () => { sourceTSV = $("#tsvcsvInput").value; dirty = false; render(); };
    $("#tsvcsvSample").onclick = () => { sourceTSV = sample; dirty = false; render(); uploadCard.hidden = true; };
    $("#tsvcsvCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(output); $("#tsvcsvCopyStatus").textContent = "CSV copied to clipboard."; }
      catch { $("#tsvcsvCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#tsvcsvDownload").onclick = () => {
      if (!output || dirty) return;
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([output], { type: "text/csv;charset=utf-8" }));
      link.download = fileName.replace(/\.tsv$/i, "") + ".csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("#tsvcsvActionStatus").textContent = "CSV download started.";
    };
    $("#tsvcsvStartOver").onclick = () => {
      fileName = "data.tsv"; sourceTSV = ""; converted = null; output = ""; dirty = false;
      workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openTSV(text, name) {
    sourceTSV = String(text ?? ""); fileName = name || "pasted-data.tsv"; dirty = false;
    uploadCard.hidden = true; uploadStatus.textContent = ""; render();
    requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function loadFile(file) {
    if (!file.name.toLowerCase().endsWith(".tsv")) { uploadStatus.textContent = "Choose a file with a .tsv extension."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "This TSV file is larger than 50 MB."; fileInput.value = ""; return; }
    try { openTSV(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read this TSV file."; fileInput.value = ""; }
  }

  $("#tsvcsvBrowse").onclick = () => fileInput.click();
  const dropzone = $("#tsvcsvDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#tsvcsvUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste TSV text first."; pasteInput.focus(); return; }
    openTSV(text, "pasted-data.tsv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#formatMenu").onclick = () => $("#formatNav").classList.toggle("open");
})();
