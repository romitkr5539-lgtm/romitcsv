(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#csvYamlUploadCard");
  const workspaceSection = $("#csvYamlWorkspaceSection");
  const workspace = $("#csvYamlWorkspace");
  const fileInput = $("#csvYamlFile");
  const pasteInput = $("#csvYamlPaste");
  const uploadStatus = $("#csvYamlUploadStatus");
  const sample = "name,city,active\nAda Lovelace,London,true\nGrace Hopper,New York,true\nKatherine Johnson,White Sulphur Springs,false";
  let fileName = "data.csv";
  let sourceCSV = "";
  let delimiter = ",";
  let converted = null;
  let output = "";
  let dirty = false;

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
    if (quoted) throw new Error("A quoted cell is not closed. Add the missing quotation mark and convert again.");
    if (cell.length || row.length) finishRow();
    if (rows.length < 2) throw new Error("Add a header row and at least one data row to create YAML.");
    const width = Math.max(...rows.map(values => values.length));
    const padded = rows.map(values => Array.from({ length: width }, (_, index) => values[index] ?? ""));
    const headers = padded[0].map(value => value.trim());
    if (headers.some(value => !value)) throw new Error("Give every column a heading before converting to YAML.");
    const uniqueHeaders = [];
    const seen = new Set();
    for (const header of headers) {
      let name = header, suffix = 2;
      while (seen.has(name.toLowerCase())) name = `${header}_${suffix++}`;
      seen.add(name.toLowerCase());
      uniqueHeaders.push(name);
    }
    const dataRows = padded.slice(1).map(values => values.slice(0, width));
    return { headers: uniqueHeaders, rows: dataRows };
  }

  function yamlString(value) {
    // JSON double-quoted strings are valid YAML scalars and preserve CSV values as strings.
    return JSON.stringify(String(value ?? ""));
  }

  function makeYAML(headers, rows) {
    return rows.map(row => `- ${headers.map((header, index) => `${yamlString(header)}: ${yamlString(row[index])}`).join("\n  ")}`).join("\n");
  }

  function tableMarkup(data) {
    if (!data) return "";
    return `<section class="csv-yaml-table-card"><div class="csv-yaml-section-heading"><div><h2>CSV table preview</h2><p>Review every row used to create the YAML list.</p></div><span>${data.rows.length.toLocaleString()} rows · ${data.headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap csv-yaml-table-wrap"><table><thead><tr>${data.headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function render(error = "") {
    let message = error;
    converted = null;
    output = "";
    if (!message) {
      try { converted = parseCSV(sourceCSV, delimiter); output = makeYAML(converted.headers, converted.rows); }
      catch (exception) { message = exception.message || "Could not convert this CSV file."; }
    }
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="csv-yaml-workspace-card">
        <div class="csv-yaml-filebar"><div class="csv-yaml-file-info"><span class="csv-yaml-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${converted ? `${converted.rows.length.toLocaleString()} rows · ${converted.headers.length.toLocaleString()} columns` : "Review or correct your CSV input"}</span></div></div><div class="csv-yaml-file-actions"><span id="csvYamlActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="csvYamlStartOver" type="button">Start over</button></div></div>
        ${message ? `<p class="csv-yaml-error" role="alert">${escapeHTML(message)}</p>` : ""}
        <div class="csv-yaml-workbench">
          <section class="csv-yaml-input-panel" aria-labelledby="csvYamlInputTitle"><div class="csv-yaml-section-heading"><div><h2 id="csvYamlInputTitle">CSV input</h2><p>Edit your data and convert again when ready.</p></div><div class="csv-yaml-input-actions"><label for="csvYamlDelimiter">Separator</label><select id="csvYamlDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="tab">Tab</option><option value="|">Pipe (|)</option></select><button class="viewer-edit" id="csvYamlSample" type="button">Load sample</button><button class="viewer-primary" id="csvYamlConvert" type="button">Convert to YAML</button></div></div><textarea id="csvYamlInput" spellcheck="false" aria-label="CSV input">${escapeHTML(sourceCSV)}</textarea><p class="csv-yaml-stale" id="csvYamlStale" hidden>Input changed. Convert again to refresh the YAML and table preview.</p></section>
          <section class="csv-yaml-output-panel" aria-labelledby="csvYamlOutputTitle"><div class="csv-yaml-section-heading"><div><h2 id="csvYamlOutputTitle">YAML output</h2><p>Flat list of records with values preserved as strings.</p></div><div class="csv-yaml-output-actions"><button class="viewer-edit" id="csvYamlCopy" type="button" ${output && !dirty ? "" : "disabled"}>Copy YAML</button><button class="viewer-primary" id="csvYamlDownload" type="button" ${output && !dirty ? "" : "disabled"}>Download .yaml</button></div></div><textarea id="csvYamlOutput" readonly spellcheck="false" aria-label="Generated YAML" placeholder="YAML output appears after conversion">${escapeHTML(output)}</textarea><div class="csv-yaml-copy-status" id="csvYamlCopyStatus" role="status" aria-live="polite"></div></section>
        </div>
        ${tableMarkup(converted)}
      </div>`;
    $("#csvYamlDelimiter").value = delimiter === "\t" ? "tab" : delimiter;
    $("#csvYamlInput").oninput = event => {
      sourceCSV = event.target.value; dirty = true;
      $("#csvYamlStale").hidden = false;
      $("#csvYamlCopy").disabled = true; $("#csvYamlDownload").disabled = true;
    };
    $("#csvYamlDelimiter").onchange = event => {
      delimiter = event.target.value === "tab" ? "\t" : event.target.value; dirty = true;
      $("#csvYamlStale").hidden = false;
      $("#csvYamlCopy").disabled = true; $("#csvYamlDownload").disabled = true;
    };
    $("#csvYamlConvert").onclick = () => { sourceCSV = $("#csvYamlInput").value; dirty = false; render(); };
    $("#csvYamlSample").onclick = () => { sourceCSV = sample; dirty = false; render(); uploadCard.hidden = true; };
    $("#csvYamlCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(output); $("#csvYamlCopyStatus").textContent = "YAML copied to clipboard."; }
      catch { $("#csvYamlCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#csvYamlDownload").onclick = () => {
      if (!output || dirty) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([output], { type: "text/yaml;charset=utf-8" }));
      link.download = fileName.replace(/\.csv$/i, "") + ".yaml";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("#csvYamlActionStatus").textContent = "YAML download started.";
    };
    $("#csvYamlStartOver").onclick = () => {
      fileName = "data.csv"; sourceCSV = ""; delimiter = ","; converted = null; output = ""; dirty = false;
      workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openCSV(text, name) {
    sourceCSV = String(text ?? ""); fileName = name || "pasted-data.csv"; delimiter = ","; dirty = false;
    uploadCard.hidden = true; uploadStatus.textContent = "";
    render();
    requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function loadFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) { uploadStatus.textContent = "Choose a file with a .csv extension."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "This CSV file is larger than 50 MB."; fileInput.value = ""; return; }
    try { openCSV(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read this CSV file."; fileInput.value = ""; }
  }

  $("#csvYamlBrowse").onclick = () => fileInput.click();
  $("#csvYamlDropzone").onclick = event => { if (event.target.closest("button")) return; fileInput.click(); };
  $("#csvYamlDropzone").onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); } };
  $("#csvYamlUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste CSV text first."; pasteInput.focus(); return; }
    openCSV(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  const dropzone = $("#csvYamlDropzone");
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#formatMenu").onclick = () => $("#formatNav").classList.toggle("open");
})();
