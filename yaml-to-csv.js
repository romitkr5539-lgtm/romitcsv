(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#yamlCsvUploadCard"), workspaceSection = $("#yamlCsvWorkspaceSection"), workspace = $("#yamlCsvWorkspace");
  const fileInput = $("#yamlCsvFile"), pasteInput = $("#yamlCsvPaste"), uploadStatus = $("#yamlCsvUploadStatus");
  const sample = `- name: Ada Lovelace\n  city: London\n  active: "true"\n- name: Grace Hopper\n  city: New York\n  active: "true"\n- name: Katherine Johnson\n  city: White Sulphur Springs\n  active: "false"`;
  let fileName = "data.yaml", sourceYAML = "", delimiter = ",", converted = null, output = "", dirty = false;
  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function splitPair(text) {
    let quote = "", escaped = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (escaped) { escaped = false; continue; }
      if (quote === '"' && char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === ":") return [text.slice(0, index), text.slice(index + 1)];
    }
    return null;
  }

  function removeInlineComment(raw) {
    let quote = "", escaped = false;
    for (let index = 0; index < raw.length; index++) {
      const char = raw[index];
      if (escaped) { escaped = false; continue; }
      if (quote === '"' && char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "#" && (index === 0 || /\s/.test(raw[index - 1]))) return raw.slice(0, index).trimEnd();
    }
    return raw;
  }

  function scalar(raw, lineNumber, label) {
    const text = removeInlineComment(raw).trim();
    if (!text) return "";
    if (text.startsWith('"')) {
      try { return JSON.parse(text); }
      catch { throw new Error(`Line ${lineNumber}: the quoted ${label} is not valid. Check its quotation marks and escapes.`); }
    }
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
    if ((text.startsWith("'") || text.endsWith("'")) || /^[|>][+-]?$/.test(text)) {
      throw new Error(`Line ${lineNumber}: this ${label} uses an unsupported quoted or block format.`);
    }
    if (/^[\[\]{}!&*]/.test(text)) throw new Error(`Line ${lineNumber}: nested collections, YAML tags, anchors, and aliases are not supported.`);
    return text;
  }

  function parseYAML(text) {
    const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
    const records = [];
    let current = null, fieldIndent = null, documentStarted = false, documentEnded = false;
    const addPair = (pair, record, lineNumber) => {
      if (!pair) throw new Error(`Line ${lineNumber}: expected a key followed by a colon and a value.`);
      const key = scalar(pair[0], lineNumber, "key");
      if (!key) throw new Error(`Line ${lineNumber}: record keys cannot be empty.`);
      if (record.has(key)) throw new Error(`Line ${lineNumber}: the key “${key}” appears more than once in this record.`);
      record.set(key, scalar(pair[1], lineNumber, "value"));
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index], number = index + 1;
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (documentEnded) throw new Error(`Line ${number}: this converter accepts one YAML document at a time.`);
      if (/^---\s*$/.test(line)) {
        if (documentStarted) throw new Error(`Line ${number}: this converter accepts one YAML document at a time.`);
        documentStarted = true;
        continue;
      }
      if (/^\.\.\.\s*$/.test(line)) { documentEnded = true; continue; }
      const start = line.match(/^-\s+(.+)$/);
      if (start) {
        const pair = splitPair(start[1]);
        if (!pair) throw new Error(`Line ${number}: list items must start with a key-value pair, such as “- name: Ada”.`);
        current = new Map(); records.push(current); fieldIndent = null; documentStarted = true;
        addPair(pair, current, number);
        continue;
      }
      if (/^\s*-/.test(line)) throw new Error(`Line ${number}: nested or indented lists are not supported. Start each record at the left edge.`);
      const match = line.match(/^( +)(.+)$/);
      const pair = match && splitPair(match[2]);
      if (!match || !pair || !current) throw new Error(`Line ${number}: expected an item in a top-level list with indented key-value fields.`);
      const indent = match[1].length;
      if (indent < 2) throw new Error(`Line ${number}: fields under a list item need at least two spaces of indentation.`);
      if (fieldIndent === null) fieldIndent = indent;
      if (indent !== fieldIndent) throw new Error(`Line ${number}: keep the same indentation for fields in a record. Nested fields are not supported.`);
      addPair(pair, current, number);
    }
    if (!records.length) throw new Error("No YAML list records were found. Add one or more items with key-value fields.");
    const headers = [];
    records.forEach(record => record.forEach((_, key) => { if (!headers.includes(key)) headers.push(key); }));
    if (!headers.length) throw new Error("No fields were found in the YAML records.");
    const rows = records.map(record => headers.map(key => record.get(key) ?? ""));
    return { headers, rows };
  }

  function quoteCell(value) {
    const text = String(value ?? "");
    return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function makeCSV(headers, rows) { return [headers, ...rows].map(row => row.map(quoteCell).join(delimiter)).join("\r\n"); }

  function tableMarkup(data) {
    if (!data) return "";
    return `<section class="yaml-csv-table-card"><div class="yaml-csv-section-heading"><div><h2>CSV table preview</h2><p>Every YAML record is represented as a row in this table.</p></div><span>${data.rows.length.toLocaleString()} rows · ${data.headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap yaml-csv-table-wrap"><table><thead><tr>${data.headers.map(header => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function render(error = "") {
    let message = error;
    converted = null; output = "";
    if (!message) {
      try { converted = parseYAML(sourceYAML); output = makeCSV(converted.headers, converted.rows); }
      catch (exception) { message = exception.message || "Could not convert this YAML file."; }
    }
    workspace.hidden = false; workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="yaml-csv-workspace-card">
        <div class="yaml-csv-filebar"><div class="yaml-csv-file-info"><span class="yaml-csv-file-icon">YAML</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${converted ? `${converted.rows.length.toLocaleString()} records · ${converted.headers.length.toLocaleString()} columns` : "Review or correct your YAML input"}</span></div></div><div class="yaml-csv-file-actions"><span id="yamlCsvActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="yamlCsvStartOver" type="button">Start over</button></div></div>
        ${message ? `<p class="yaml-csv-error" role="alert">${escapeHTML(message)}</p>` : ""}
        <div class="yaml-csv-workbench">
          <section class="yaml-csv-input-panel" aria-labelledby="yamlCsvInputTitle"><div class="yaml-csv-section-heading"><div><h2 id="yamlCsvInputTitle">YAML input</h2><p>Edit your data and convert again when ready.</p></div><button class="viewer-primary" id="yamlCsvConvert" type="button">Convert to CSV</button></div><textarea id="yamlCsvInput" spellcheck="false" aria-label="YAML input">${escapeHTML(sourceYAML)}</textarea><p class="yaml-csv-stale" id="yamlCsvStale" hidden>Input changed. Convert again to refresh the CSV and table preview.</p></section>
          <section class="yaml-csv-output-panel" aria-labelledby="yamlCsvOutputTitle"><div class="yaml-csv-section-heading"><div><h2 id="yamlCsvOutputTitle">CSV output</h2><p>Choose the separator for the copied or downloaded file.</p></div><div class="yaml-csv-output-actions"><label for="yamlCsvDelimiter">Separator</label><select id="yamlCsvDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="tab">Tab</option><option value="|">Pipe (|)</option></select><button class="viewer-edit" id="yamlCsvCopy" type="button" ${output && !dirty ? "" : "disabled"}>Copy CSV</button><button class="viewer-primary" id="yamlCsvDownload" type="button" ${output && !dirty ? "" : "disabled"}>Download CSV</button></div></div><textarea id="yamlCsvOutput" readonly spellcheck="false" aria-label="Generated CSV" placeholder="CSV output appears after conversion">${escapeHTML(output)}</textarea><div class="yaml-csv-copy-status" id="yamlCsvCopyStatus" role="status" aria-live="polite"></div></section>
        </div>${tableMarkup(converted)}
      </div>`;
    $("#yamlCsvDelimiter").value = delimiter === "\t" ? "tab" : delimiter;
    $("#yamlCsvInput").oninput = event => {
      sourceYAML = event.target.value; dirty = true; $("#yamlCsvStale").hidden = false;
      $("#yamlCsvCopy").disabled = true; $("#yamlCsvDownload").disabled = true;
    };
    $("#yamlCsvConvert").onclick = () => { sourceYAML = $("#yamlCsvInput").value; dirty = false; render(); };
    $("#yamlCsvDelimiter").onchange = event => {
      delimiter = event.target.value === "tab" ? "\t" : event.target.value; dirty = true;
      $("#yamlCsvStale").hidden = false; $("#yamlCsvCopy").disabled = true; $("#yamlCsvDownload").disabled = true;
    };
    $("#yamlCsvCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(output); $("#yamlCsvCopyStatus").textContent = "CSV copied to clipboard."; }
      catch { $("#yamlCsvCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#yamlCsvDownload").onclick = () => {
      if (!output || dirty) return;
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([output], { type: "text/csv;charset=utf-8" }));
      link.download = fileName.replace(/\.ya?ml$/i, "") + ".csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("#yamlCsvActionStatus").textContent = "CSV download started.";
    };
    $("#yamlCsvStartOver").onclick = () => {
      fileName = "data.yaml"; sourceYAML = ""; delimiter = ","; converted = null; output = ""; dirty = false;
      workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
      fileInput.value = ""; pasteInput.value = ""; uploadStatus.textContent = "";
      uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function openYAML(text, name) {
    sourceYAML = String(text ?? ""); fileName = name || "pasted-data.yaml"; delimiter = ","; dirty = false;
    uploadCard.hidden = true; uploadStatus.textContent = ""; render();
    requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function loadFile(file) {
    if (!/\.ya?ml$/i.test(file.name)) { uploadStatus.textContent = "Choose a .yaml or .yml file."; fileInput.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { uploadStatus.textContent = "This YAML file is larger than 50 MB."; fileInput.value = ""; return; }
    try { openYAML(await file.text(), file.name); fileInput.value = ""; }
    catch { uploadStatus.textContent = "Could not read this YAML file."; fileInput.value = ""; }
  }

  $("#yamlCsvBrowse").onclick = () => fileInput.click();
  const dropzone = $("#yamlCsvDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#yamlCsvUsePaste").onclick = () => {
    const text = pasteInput.value.trim();
    if (!text) { uploadStatus.textContent = "Paste YAML text first."; pasteInput.focus(); return; }
    openYAML(text, "pasted-data.yaml");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#formatMenu").onclick = () => $("#formatNav").classList.toggle("open");
})();
