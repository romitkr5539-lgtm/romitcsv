(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#markdownUploadCard"), workspaceSection = $("#markdownWorkspaceSection"), workspace = $("#markdownWorkspace");
  const fileInput = $("#markdownFile"), pasteInput = $("#markdownPaste"), uploadStatus = $("#markdownUploadStatus");
  const sample = "Feature,Status\nCSV upload,Ready\nMarkdown export,Ready\nTable preview,Available";
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
    if (!rows.length) throw new Error("Add a CSV header row before converting to Markdown.");
    const width = Math.max(...rows.map(values => values.length));
    return rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
  }

  function markdownCell(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\\/g, "\\\\").replace(/\|/g, "\\|")
      .replace(/\r\n|\r|\n/g, "<br>");
  }

  function makeMarkdown(rows) {
    const headers = rows[0];
    const formatRow = row => `| ${row.map(markdownCell).join(" | ")} |`;
    return [formatRow(headers), formatRow(headers.map(() => "---")), ...rows.slice(1).map(formatRow)].join("\n");
  }

  function tableMarkup(rows) {
    if (!rows) return "";
    const headers = rows[0];
    return `<section class="markdown-table-card"><div class="markdown-section-heading"><div><h2>CSV table preview</h2><p>All parsed rows are included in the Markdown output.</p></div><span>${Math.max(0, rows.length - 1).toLocaleString()} rows · ${headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap markdown-table-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="no-results">No data rows; the output contains the heading and separator rows.</td></tr>`}</tbody></table></div></section>`;
  }

  function render(error = "") {
    let message = error;
    converted = null; output = "";
    if (!message) {
      try { converted = parseCSV(sourceCSV, delimiter); output = makeMarkdown(converted); }
      catch (exception) { message = exception.message || "Could not convert this CSV file."; }
    }
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="markdown-workspace-card">
        <div class="markdown-filebar"><div class="markdown-file-info"><span class="markdown-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${converted ? `${Math.max(0, converted.length - 1).toLocaleString()} data rows · ${converted[0].length.toLocaleString()} columns` : "Review or correct your CSV input"}</span></div></div><div class="markdown-file-actions"><span id="markdownActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="markdownStartOver" type="button">Start over</button></div></div>
        ${message ? `<p class="markdown-error" role="alert">${escapeHTML(message)}</p>` : ""}
        <div class="markdown-workbench">
          <section class="markdown-input-panel" aria-labelledby="markdownInputTitle"><div class="markdown-section-heading"><div><h2 id="markdownInputTitle">CSV input</h2><p>Edit your data and convert again when ready.</p></div><div class="markdown-input-actions"><label for="markdownDelimiter">Input separator</label><select id="markdownDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="tab">Tab</option><option value="|">Pipe (|)</option></select><button class="viewer-edit" id="markdownSample" type="button">Load sample</button><button class="viewer-primary" id="markdownConvert" type="button">Convert to Markdown</button></div></div><textarea id="markdownInput" spellcheck="false" aria-label="CSV input">${escapeHTML(sourceCSV)}</textarea><p class="markdown-stale" id="markdownStale" hidden>Input changed. Convert again to refresh the Markdown and table preview.</p></section>
          <section class="markdown-output-panel" aria-labelledby="markdownOutputTitle"><div class="markdown-section-heading"><div><h2 id="markdownOutputTitle">Markdown output</h2><p>Copy this source into your Markdown document.</p></div><div class="markdown-output-actions"><button class="viewer-edit" id="markdownCopy" type="button" ${output && !dirty ? "" : "disabled"}>Copy Markdown</button><button class="viewer-primary" id="markdownDownload" type="button" ${output && !dirty ? "" : "disabled"}>Download .md</button></div></div><textarea id="markdownOutput" readonly spellcheck="false" aria-label="Generated Markdown" placeholder="Markdown table source appears after conversion">${escapeHTML(output)}</textarea><div class="markdown-copy-status" id="markdownCopyStatus" role="status" aria-live="polite"></div></section>
        </div>${tableMarkup(converted)}
      </div>`;
    $("#markdownDelimiter").value = delimiter === "\t" ? "tab" : delimiter;
    $("#markdownInput").oninput = event => {
      sourceCSV = event.target.value; dirty = true; $("#markdownStale").hidden = false;
      $("#markdownCopy").disabled = true; $("#markdownDownload").disabled = true;
    };
    $("#markdownDelimiter").onchange = event => {
      delimiter = event.target.value === "tab" ? "\t" : event.target.value; dirty = true;
      $("#markdownStale").hidden = false; $("#markdownCopy").disabled = true; $("#markdownDownload").disabled = true;
    };
    $("#markdownConvert").onclick = () => { sourceCSV = $("#markdownInput").value; dirty = false; render(); };
    $("#markdownSample").onclick = () => { sourceCSV = sample; dirty = false; render(); uploadCard.hidden = true; };
    $("#markdownCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(output); $("#markdownCopyStatus").textContent = "Markdown copied to clipboard."; }
      catch { $("#markdownCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#markdownDownload").onclick = () => {
      if (!output || dirty) return;
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([output], { type: "text/markdown;charset=utf-8" }));
      link.download = fileName.replace(/\.csv$/i, "") + ".md";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("#markdownActionStatus").textContent = "Markdown download started.";
    };
    $("#markdownStartOver").onclick = () => {
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

  $("#markdownBrowse").onclick = () => fileInput.click();
  const dropzone = $("#markdownDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#markdownUsePaste").onclick = () => {
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
