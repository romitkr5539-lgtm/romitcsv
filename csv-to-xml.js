const $ = selector => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>\"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[char]));
}

function detectDelimiter(text) {
  const firstLine = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).find(line => line.trim()) || "";
  return [",", ";", "\t", "|"].map(delimiter => [delimiter, firstLine.split(delimiter).length - 1])
    .sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSV(text, preferredDelimiter = "auto") {
  text = String(text ?? "").replace(/^\uFEFF/, "");
  const delimiter = preferredDelimiter === "auto" ? detectDelimiter(text) : preferredDelimiter, rows = [], row = [];
  let cell = "", quoted = false, afterQuote = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (quoted && char === '"') {
      if (next === '"') { cell += '"'; index++; }
      else { quoted = false; afterQuote = true; }
    } else if (!quoted && char === '"') {
      if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted field. Double quotes inside a field to escape them.");
      quoted = true;
    } else if (!quoted && char === delimiter) {
      row.push(cell); cell = ""; afterQuote = false;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell); cell = ""; afterQuote = false;
      if (row.some(value => value.trim())) rows.push(row.slice());
      row.length = 0;
    } else {
      if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a quoted field. Add a separator or newline after its closing quote.");
      cell += char;
    }
  }
  if (quoted) throw new Error("A quoted field was not closed. Add the missing quote and try again.");
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row.slice());
  }
  const width = rows.reduce((maximum, current) => Math.max(maximum, current.length), 0);
  return rows.map(current => Array.from({ length: width }, (_, index) => current[index] ?? ""));
}

function xmlEscape(value) {
  const validText = [...String(value ?? "")].filter(character => {
    const code = character.codePointAt(0);
    return code === 0x9 || code === 0xA || code === 0xD || (code >= 0x20 && code <= 0xD7FF) ||
      (code >= 0xE000 && code <= 0xFFFD) || (code >= 0x10000 && code <= 0x10FFFF);
  }).join("");
  return validText.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function makeUniqueNames(names, normalize) {
  const used = new Set();
  return names.map((value, index) => {
    const base = normalize(value, index);
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    return name;
  });
}

function xmlElementName(value, index) {
  let name = String(value ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!/^[A-Za-z_]/.test(name)) name = `column_${index + 1}`;
  if (/^xml/i.test(name)) name = `column_${name}`;
  return name || `column_${index + 1}`;
}

const uploadCard = $("#xmlUploadCard");
const dropzone = $("#xmlDropzone");
const workspace = $("#xmlWorkspace");
const workspaceSection = $("#xmlWorkspaceSection");
const fileInput = $("#xmlFile");
let rows = [];
let sourceText = "";
let delimiterMode = "auto";
let fileName = "data.csv";
let hasHeader = true;
let rootName = "records";
let recordName = "record";
let xmlOutput = "";
let conversionError = "";
let parseError = "";

function buildXML() {
  if (!rows.length) throw new Error("Load or paste CSV data before converting.");
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (!columnCount) throw new Error("The CSV does not contain any columns.");
  const headers = hasHeader ? rows[0] : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const elementNames = makeUniqueNames(headers, xmlElementName);
  const records = rows.slice(hasHeader ? 1 : 0).filter(row => row.some(value => value.trim()));
  const root = rootName.trim() || "records";
  const record = recordName.trim() || "record";
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(root) || /^xml/i.test(root)) {
    throw new Error("Use a valid XML root name that starts with a letter or underscore.");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(record) || /^xml/i.test(record)) {
    throw new Error("Use a valid XML record name that starts with a letter or underscore.");
  }
  if (!records.length) throw new Error("Add at least one data row below the CSV headings.");
  const body = records.map(row => `  <${record}>\n${elementNames.map((name, index) =>
    `    <${name}>${xmlEscape(row[index] ?? "")}</${name}>`).join("\n")}\n  </${record}>`).join("\n");
  return {
    headers,
    elementNames,
    records,
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`
  };
}

function render() {
  let result;
  if (parseError) conversionError = parseError;
  else {
    try { result = buildXML(); conversionError = ""; }
    catch (error) { conversionError = error.message || "Could not create XML from this CSV."; }
  }
  xmlOutput = parseError ? "" : (result?.xml || "");
  const columns = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const dataRows = rows.slice(hasHeader ? 1 : 0);
  const dataCount = dataRows.filter(row => row.some(value => value.trim())).length;
  const headerValues = hasHeader ? (rows[0] || []) : Array.from({ length: columns }, (_, index) => `Column ${index + 1}`);
  const visibleHeaders = result?.elementNames || makeUniqueNames(headerValues, xmlElementName);
  const tableRows = dataRows;
  const delimiterOptions = [["auto", "Auto-detect"], [",", "Comma (,)"], [";", "Semicolon (;)"], ["\t", "Tab"], ["|", "Pipe (|)"]];
  const tableMarkup = tableRows.map(row => `<tr>${Array.from({ length: columns }, (_, index) => `<td title="${escapeHTML(row[index] ?? "")}">${escapeHTML(row[index] ?? "")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, columns)}" class="no-results">No data rows to display.</td></tr>`;

  workspace.hidden = false;
  workspaceSection.hidden = false;
  workspace.innerHTML = `
    <div class="sql-data-card">
      <div class="sql-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>XML</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${dataCount.toLocaleString()} data rows · ${columns.toLocaleString()} columns</span></div></div><div class="xml-file-actions"><span id="xmlActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="clearXML" type="button">Start over</button></div></div>
      <div class="sql-options xml-options"><label><span>CSV separator</span><select id="xmlDelimiter">${delimiterOptions.map(([value, label]) => `<option value="${escapeHTML(value)}" ${value === delimiterMode ? "selected" : ""}>${label}</option>`).join("")}</select></label><label><span>Root element</span><input id="xmlRootName" type="text" value="${escapeHTML(rootName)}" maxlength="80"></label><label><span>Record element</span><input id="xmlRecordName" type="text" value="${escapeHTML(recordName)}" maxlength="80"></label><label class="xml-header-toggle"><input id="xmlHasHeader" type="checkbox" ${hasHeader ? "checked" : ""}> First row contains column names</label><button class="viewer-primary" id="downloadXML" type="button">Download XML</button></div>
      ${conversionError ? `<p class="excel-error" role="alert">${escapeHTML(conversionError)}</p>` : ""}
      <div class="xml-workbench"><section class="xml-table-panel"><div class="xml-panel-heading"><div><h2>CSV table</h2><p>All ${dataCount.toLocaleString()} data rows are shown.</p></div><span>${columns.toLocaleString()} columns</span></div><div class="editor-table-wrap xml-table-wrap"><table><thead><tr>${visibleHeaders.map(name => `<th>${escapeHTML(name)}</th>`).join("")}</tr></thead><tbody>${tableMarkup}</tbody></table></div></section><section class="xml-output-panel"><div class="xml-panel-heading"><div><h2>XML output</h2><p>${xmlOutput ? "Ready to copy or download" : "Fix the tag settings to generate XML"}</p></div><button class="viewer-edit" id="copyXML" type="button" ${xmlOutput ? "" : "disabled"}>Copy XML</button></div><textarea id="xmlPreview" readonly spellcheck="false" aria-label="Generated XML">${escapeHTML(xmlOutput)}</textarea><div class="sql-copy-status" id="xmlCopyStatus" role="status" aria-live="polite"></div></section></div>
    </div>`;

  $("#xmlDelimiter").onchange = event => {
    delimiterMode = event.target.value;
    try { rows = parseCSV(sourceText, delimiterMode); parseError = ""; conversionError = ""; }
    catch (error) { parseError = error.message; rows = []; }
    render();
  };
  $("#xmlHasHeader").onchange = event => { hasHeader = event.target.checked; render(); };
  $("#xmlRootName").onchange = event => { rootName = event.target.value; render(); };
  $("#xmlRecordName").onchange = event => { recordName = event.target.value; render(); };
  $("#downloadXML").onclick = () => {
    if (!xmlOutput) { $("#xmlActionStatus").textContent = conversionError || "There is no XML output to download."; return; }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([xmlOutput], { type: "application/xml;charset=utf-8" }));
    link.download = fileName.replace(/\.(csv|tsv)$/i, "") + ".xml";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $("#xmlActionStatus").textContent = "XML download started.";
  };
  $("#copyXML").onclick = async () => {
    try { await navigator.clipboard.writeText(xmlOutput); $("#xmlCopyStatus").textContent = "XML copied to clipboard."; }
    catch { $("#xmlCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
  };
  $("#clearXML").onclick = () => {
    rows = []; sourceText = ""; delimiterMode = "auto"; fileName = "data.csv"; hasHeader = true; rootName = "records"; recordName = "record"; xmlOutput = ""; conversionError = ""; parseError = ""; workspace.hidden = true; workspaceSection.hidden = true;
    uploadCard.hidden = false; fileInput.value = ""; $("#xmlPasteInput").value = ""; $("#xmlStatus").textContent = ""; uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

function openText(text, name) {
  sourceText = String(text ?? "");
  const parsed = parseCSV(sourceText, delimiterMode);
  if (!parsed.length) throw new Error("This CSV file is empty.");
  rows = parsed; fileName = name || "data.csv"; conversionError = ""; parseError = "";
  uploadCard.hidden = true; render();
  requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function loadFile(file) {
  if (!/\.(csv|tsv)$/i.test(file.name)) { $("#xmlStatus").textContent = "Choose a CSV or TSV file."; fileInput.value = ""; return; }
  if (file.size > 50 * 1024 * 1024) { $("#xmlStatus").textContent = "This file is larger than 50 MB."; fileInput.value = ""; return; }
  try { openText(await file.text(), file.name); fileInput.value = ""; }
  catch (error) { $("#xmlStatus").textContent = error.message || "Could not read this CSV file."; fileInput.value = ""; }
}

$("#xmlBrowse").onclick = () => fileInput.click();
$("#xmlPasteConvert").onclick = () => {
  const text = $("#xmlPasteInput").value.trim();
  if (!text) { $("#xmlStatus").textContent = "Paste CSV or delimited text first."; $("#xmlPasteInput").focus(); return; }
  try { openText(text, "pasted-data.csv"); }
  catch (error) { $("#xmlStatus").textContent = error.message || "Could not read this CSV text."; }
};
$("#xmlFile").onchange = event => {
  const file = event.target.files?.[0];
  return file ? loadFile(file) : undefined;
};
$("#xmlMenu").onclick = () => $("#xmlNav").classList.toggle("open");
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.add("drag");
}));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.remove("drag");
}));
dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file);
});
