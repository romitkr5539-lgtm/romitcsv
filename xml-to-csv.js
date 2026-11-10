const $ = selector => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>\"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[char]));
}

function parseXML(text) {
  const doc = new DOMParser().parseFromString(String(text ?? ""), "application/xml");
  if (!doc.documentElement || doc.querySelector("parsererror")) {
    throw new Error("This XML is not well formed. Check the tags and try again.");
  }
  const root = doc.documentElement;
  const records = Array.from(root.children);
  if (!records.length) throw new Error("No record elements were found under the XML root.");

  const headers = [];
  const fieldMaps = records.map(record => {
    const values = new Map();
    for (const field of Array.from(record.children)) {
      const name = field.tagName;
      if (values.has(name)) {
        throw new Error(`A record contains more than one <${name}> field. Use one field of each name per record.`);
      }
      values.set(name, field.textContent ?? "");
      if (!headers.includes(name)) headers.push(name);
    }
    return values;
  });
  if (!headers.length) throw new Error("No child elements were found inside the XML records.");
  const rows = fieldMaps.map(values => headers.map(name => values.get(name) ?? ""));
  return { rootName: root.tagName, headers, rows };
}

function quoteCsvCell(value, delimiter) {
  const text = String(value ?? "");
  const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp('["\\r\\n' + escapedDelimiter + ']');
  return pattern.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeCSV(headers, rows, delimiter) {
  return [headers, ...rows].map(row => row.map(value => quoteCsvCell(value, delimiter)).join(delimiter)).join("\r\n");
}

const uploadCard = $("#xmlCsvUploadCard");
const dropzone = $("#xmlCsvDropzone");
const workspace = $("#xmlCsvWorkspace");
const workspaceSection = $("#xmlCsvWorkspaceSection");
const fileInput = $("#xmlCsvFile");
let fileName = "data.xml";
let sourceXML = "";
let delimiter = ",";
let parsedData = { rootName: "", headers: [], rows: [] };
let csvOutput = "";
let parseError = "";
let dirty = false;

function render() {
  parsedData = { rootName: "", headers: [], rows: [] };
  csvOutput = "";
  parseError = "";
  if (sourceXML.trim()) {
    try {
      parsedData = parseXML(sourceXML);
      csvOutput = makeCSV(parsedData.headers, parsedData.rows, delimiter);
    } catch (error) {
      parseError = error.message || "Could not convert this XML file.";
    }
  }

  workspace.hidden = false;
  workspaceSection.hidden = false;
  workspace.innerHTML = `
    <div class="sql-data-card">
      <div class="sql-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>XML</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${parsedData.rows.length.toLocaleString()} records · ${parsedData.headers.length.toLocaleString()} fields · Root: ${escapeHTML(parsedData.rootName || "—")}</span></div></div>
        <div class="xml-csv-actions"><span id="xmlCsvActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="clearXmlCsv" type="button">Start over</button></div>
      </div>
      ${parseError ? `<p class="xml-csv-error" role="alert">${escapeHTML(parseError)}</p>` : ""}
      <div class="xml-csv-workbench">
        <section class="xml-csv-input-panel" aria-labelledby="xmlCsvInputTitle">
          <div class="xml-csv-panel-heading"><div><h2 id="xmlCsvInputTitle">XML input</h2><p>Edit the XML, then select Convert to refresh the CSV.</p></div><button class="viewer-primary" id="convertXmlCsv" type="button">Convert XML to CSV</button></div>
          <textarea id="xmlCsvInput" spellcheck="false" aria-label="XML input" placeholder="Paste XML data here">${escapeHTML(sourceXML)}</textarea>
          <p class="xml-csv-stale" id="xmlCsvStale" ${dirty ? "" : "hidden"}>The XML has changed. Convert again to update the CSV and table.</p>
        </section>
        <section class="xml-csv-output-panel" aria-labelledby="xmlCsvOutputTitle">
          <div class="xml-csv-panel-heading"><div><h2 id="xmlCsvOutputTitle">CSV output</h2><p>Choose the delimiter used in the copied or downloaded file.</p></div><div class="xml-csv-output-actions"><label for="xmlCsvDelimiter">Separator</label><select id="xmlCsvDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select><button class="viewer-edit" id="copyXmlCsv" type="button" ${csvOutput && !dirty ? "" : "disabled"}>Copy CSV</button><button class="viewer-primary" id="downloadXmlCsv" type="button" ${csvOutput && !dirty ? "" : "disabled"}>Download CSV</button></div></div>
          <textarea id="xmlCsvOutput" readonly spellcheck="false" aria-label="Generated CSV" placeholder="CSV output appears here after conversion">${escapeHTML(csvOutput)}</textarea>
          <div class="xml-csv-copy-status" id="xmlCsvCopyStatus" role="status" aria-live="polite"></div>
        </section>
      </div>
      <section class="xml-csv-table-preview"><div class="xml-csv-panel-heading"><div><h2>CSV table</h2><p>All records are included in this scrollable table.</p></div><span>${parsedData.rows.length.toLocaleString()} records · ${parsedData.headers.length.toLocaleString()} columns</span></div><div class="editor-table-wrap xml-csv-table-wrap"><table><thead><tr>${parsedData.headers.map(name => `<th>${escapeHTML(name)}</th>`).join("")}</tr></thead><tbody>${parsedData.rows.map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, parsedData.headers.length)}" class="no-results">${parseError ? "Fix the XML structure to see a table." : "No records to display."}</td></tr>`}</tbody></table></div></section>
    </div>`;

  $("#xmlCsvDelimiter").value = delimiter;
  $("#xmlCsvInput").oninput = event => {
    sourceXML = event.target.value;
    dirty = true;
    $("#xmlCsvStale").hidden = false;
    $("#copyXmlCsv").disabled = true;
    $("#downloadXmlCsv").disabled = true;
  };
  $("#convertXmlCsv").onclick = () => { sourceXML = $("#xmlCsvInput").value; dirty = false; render(); };
  $("#xmlCsvDelimiter").onchange = event => { delimiter = event.target.value; if (!dirty) render(); };
  $("#copyXmlCsv").onclick = async () => {
    try { await navigator.clipboard.writeText(csvOutput); $("#xmlCsvCopyStatus").textContent = "CSV copied to clipboard."; }
    catch { $("#xmlCsvCopyStatus").textContent = "Clipboard access is unavailable in this browser."; }
  };
  $("#downloadXmlCsv").onclick = () => {
    if (!csvOutput || dirty) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvOutput], { type: "text/csv;charset=utf-8" }));
    link.download = fileName.replace(/\.xml$/i, "") + ".csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $("#xmlCsvActionStatus").textContent = "CSV download started.";
  };
  $("#clearXmlCsv").onclick = () => {
    sourceXML = ""; fileName = "data.xml"; delimiter = ","; dirty = false; parsedData = { rootName: "", headers: [], rows: [] }; csvOutput = ""; parseError = "";
    workspace.hidden = true; workspaceSection.hidden = true; uploadCard.hidden = false;
    fileInput.value = ""; $("#xmlCsvPasteInput").value = ""; $("#xmlCsvStatus").textContent = "";
    uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

function openXML(text, name) {
  sourceXML = String(text ?? "");
  fileName = name || "pasted-xml.xml";
  dirty = false;
  uploadCard.hidden = true;
  render();
  requestAnimationFrame(() => workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function loadFile(file) {
  if (!file.name.toLowerCase().endsWith(".xml")) { $("#xmlCsvStatus").textContent = "Choose a file with a .xml extension."; fileInput.value = ""; return; }
  if (file.size > 50 * 1024 * 1024) { $("#xmlCsvStatus").textContent = "This XML file is larger than 50 MB."; fileInput.value = ""; return; }
  try { openXML(await file.text(), file.name); fileInput.value = ""; $("#xmlCsvStatus").textContent = ""; }
  catch { $("#xmlCsvStatus").textContent = "Could not read this XML file."; fileInput.value = ""; }
}

$("#xmlCsvBrowse").onclick = () => fileInput.click();
$("#xmlCsvPasteConvert").onclick = () => {
  const text = $("#xmlCsvPasteInput").value.trim();
  if (!text) { $("#xmlCsvStatus").textContent = "Paste XML text first."; $("#xmlCsvPasteInput").focus(); return; }
  openXML(text, "pasted-xml.xml");
};
fileInput.onchange = event => { const file = event.target.files?.[0]; return file ? loadFile(file) : undefined; };
$("#xmlCsvMenu").onclick = () => $("#xmlCsvNav").classList.toggle("open");
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
