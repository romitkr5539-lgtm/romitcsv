(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#txtUploadCard"), workspaceSection = $("#txtWorkspaceSection"), workspace = $("#txtWorkspace");
  const fileInput = $("#txtFile"), pasteInput = $("#txtPaste"), uploadStatus = $("#txtUploadStatus");
  const sample = "name,city\nAda Lovelace,London\nGrace Hopper,New York\nKatherine Johnson,White Sulphur Springs";
  let fileName = "data.csv", sourceCSV = "", delimiter = ",", converted = null, output = "", dirty = false;
  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function parseCSV(text, separator) {
    text = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], cell = "", quoted = false, afterQuote = false;
    const finishRow = () => {
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = []; cell = ""; afterQuote = false;
    };
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (quoted && char === '"') {
        if (next === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else if (!quoted && char === '"') {
        if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted cell. Escape a quote by typing it twice inside a quoted cell.");
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
    if (quoted) throw new Error("A quoted CSV field is not closed. Add the missing quotation mark and try again.");
    if (cell.length || row.length) finishRow();
    if (!rows.length) throw new Error("Add CSV data before converting to plain text.");
    const width = Math.max(...rows.map(values => values.length));
    return rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }

  function makeTXT(rows) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /["\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join("\t")).join("\r\n");
  }

  function tableMarkup(rows) {
    if (!rows) return "";
    const headers = rows[0];
    return `<section class="txt-table-card"><div class="txt-section-heading"><div><h2>CSV table preview</h2><p>All parsed rows are represented in the tab-separated output.</p></div><span>${Math.max(0, rows.length - 1).toLocaleString()} data rows · ${headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap txt-table-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="no-results">No data rows to display.</td></tr>`}</tbody></table></div></section>`;
  }

  function render(error = "") {
    let message = error;
    converted = null; output = "";
    if (!message) {
      try { converted = parseCSV(sourceCSV, delimiter); output = makeTXT(converted); }
      catch (exception) { message = exception.message || "Could not convert this CSV file."; }
    }
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="txt-workspace-card">
        <div class="txt-filebar"><div class="txt-file-info"><span class="txt-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${converted ? `${Math.max(0, converted.length - 1).toLocaleString()} data rows · ${converted[0].length.toLocaleString()} columns` : "Review or correct your CSV input"}</span></div></div><div class="txt-file-actions"><span id="txtActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="txtStartOver" type="button">Start over</button></div></div>
        ${message ? `<p class="txt-error" role="alert">${escapeHTML(message)}</p>` : ""}
        <div class="txt-workbench">
          <section class="txt-input-panel" aria-labelledby="txtInputTitle"><div class="txt-section-heading"><div><h2 id="txtInputTitle">CSV input</h2><p>Edit your data and convert again when ready.</p></div><div class="txt-input-actions"><label for="txtDelimiter">Input separator</label><select id="txtDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="tab">Tab</option><option value="|">Pipe (|)</option></select><button class="viewer-edit" id="txtSample" type="button">Load sample</button><button class="viewer-primary" id="txtConvert" type="button">Convert to plain text</button></div></div><textarea id="txtInput" spellcheck="false" aria-label="CSV input">${escapeHTML(sourceCSV)}</textarea><p class="txt-stale" id="txtStale" hidden>Input changed. Convert again to refresh the TXT and table preview.</p></section>
          <section class="txt-output-panel" aria-labelledby="txtOutputTitle"><div class="txt-section-heading"><div><h2 id="txtOutputTitle">TXT output</h2><p>Plain-text output with tab characters between columns.</p></div><div class="txt-output-actions"><button class="viewer-edit" id="txtCopy" type="button" ${output && !dirty ? "" : "disabled"}>Copy TXT</button><button class="viewer-primary" id="txtDownload" type="button" ${output && !dirty ? "" : "disabled"}>Download .txt</button></div></div><textarea id="txtOutput" readonly spellcheck="false" aria-label="Generated TXT" placeholder="TXT output appears after conversion">${escapeHTML(output)}</textarea><div class="txt-copy-status" id="txtCopyStatus" role="status" aria-live="polite"></div></section>
        </div>${tableMarkup(converted)}
      </div>`;
    $("#txtDelimiter").value = delimiter === "\t" ? "tab" : delimiter;
    $("#txtInput").oninput = event => {
      sourceCSV = event.target.value; dirty = true; $("#txtStale").hidden = false;
      $("#txtCopy").disabled = true; $("#txtDownload").disabled = true;
    };
    $("#txtDelimiter").onchange = event => {
      delimiter = event.target.value === "tab" ? "\t" : event.target.value; dirty = true;
      $("#txtStale").hidden = false; $("#txtCopy").disabled = true; $("#txtDownload").disabled = true;
    };
    $("#txtConvert").onclick = () => { sourceCSV = $("#txtInput").value; dirty = false; render(); };
    $("#txtSample").onclick = () => { sourceCSV = sample; dirty = false; render(); uploadCard.hidden = true; };
    $("#txtCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(output); $("#txtCopyStatus").textContent = "Text copied to clipboard."; }
      catch { $("#txtCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#txtDownload").onclick = () => {
      if (!output || dirty) return;
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
      link.download = fileName.replace(/\.csv$/i, "") + ".txt";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("#txtActionStatus").textContent = "Text file download started.";
    };
    $("#txtStartOver").onclick = () => {
      fileName = "data.csv"; sourceCSV = ""; delimiter = ","; converted = null; output = ""; dirty = false;
      workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openCSV(text, name) {
    sourceCSV = String(text ?? ""); fileName = name || "pasted-data.csv"; delimiter = ","; dirty = false;
    uploadCard.hidden = true; uploadStatus.textContent = ""; render();
    requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function loadFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) { uploadStatus.textContent = "Choose a file with a .csv extension."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "This CSV file is larger than 50 MB."; fileInput.value = ""; return; }
    try { openCSV(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read this CSV file."; fileInput.value = ""; }
  }

  $("#txtBrowse").onclick = () => fileInput.click();
  const dropzone = $("#txtDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#txtUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste CSV text first."; pasteInput.focus(); return; }
    openCSV(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#formatMenu").onclick = () => $("#formatNav").classList.toggle("open");
})();

