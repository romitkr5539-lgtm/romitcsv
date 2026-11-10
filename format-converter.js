(() => {
  const $ = selector => document.querySelector(selector);
  const tool = document.body.dataset.converter;
  const inputEl = $("#formatInput");
  const outputEl = $("#formatOutput");
  const statusEl = $("#formatStatus");
  const dropzone = $("#formatDropzone");
  const outputType = document.body.dataset.outputType;
  const outputExtension = document.body.dataset.outputExt || outputType;
  const acceptedExtensions = (document.body.dataset.inputExt || "").split(",").filter(Boolean);

  const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  function parseDelimited(text, delimiter) {
    text = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [], row = [];
    let cell = "", quoted = false, afterQuote = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (quoted && char === '"') {
        if (next === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else if (!quoted && char === '"') {
        if (cell.length || afterQuote) throw new Error("A quote appeared inside an unquoted field. Escape quotes inside a field by doubling them.");
        quoted = true;
      } else if (!quoted && char === delimiter) { row.push(cell); cell = ""; afterQuote = false; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(value => value.trim())) rows.push(row.slice());
        row.length = 0; afterQuote = false;
      } else {
        if (afterQuote && !/\s/.test(char)) throw new Error("Unexpected text after a quoted field. Add a separator or newline after the closing quote.");
        cell += char;
      }
    }
    if (quoted) throw new Error("A quoted field was not closed. Add the missing quote and try again.");
    if (cell.length || row.length) { row.push(cell); if (row.some(value => value.trim())) rows.push(row.slice()); }
    const width = rows.reduce((max, values) => Math.max(max, values.length), 0);
    return rows.map(values => Array.from({length: width}, (_, index) => values[index] ?? ""));
  }

  function stringifyDelimited(rows, delimiter) {
    return rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(delimiter)).join("\r\n");
  }

  function xmlEscape(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  }

  function safeXmlName(name, index) {
    let clean = String(name || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!/^[A-Za-z_]/.test(clean)) clean = `column_${index + 1}`;
    return clean || `column_${index + 1}`;
  }

  function uniqueNames(names, normalize) {
    const seen = new Set();
    return names.map((name, index) => {
      const base = normalize(name, index), key = base.toLowerCase();
      let unique = base, suffix = 2;
      while (seen.has(unique.toLowerCase())) unique = `${base}_${suffix++}`;
      seen.add(unique.toLowerCase());
      return unique;
    });
  }

  function csvToXml(rows) {
    if (rows.length < 2) throw new Error("Add a header row and at least one data row to create XML.");
    const headers = uniqueNames(rows[0], safeXmlName);
    const body = rows.slice(1).map(row => `  <record>\n${headers.map((name, index) => `    <${name}>${xmlEscape(row[index])}</${name}>`).join("\n")}\n  </record>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<records>\n${body}\n</records>`;
  }

  function xmlToCsv(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror") || !doc.documentElement) throw new Error("The XML is not well formed. Check the tags and try again.");
    const root = doc.documentElement;
    const records = Array.from(root.children);
    if (!records.length) throw new Error("No record elements were found under the XML root.");
    const headers = [];
    records.forEach(record => Array.from(record.children).forEach(child => { if (!headers.includes(child.tagName)) headers.push(child.tagName); }));
    if (!headers.length) throw new Error("No child elements were found inside the XML records.");
    const rows = [headers, ...records.map(record => headers.map(name => {
      const child = Array.from(record.children).find(element => element.tagName === name);
      return child?.textContent ?? "";
    }))];
    return stringifyDelimited(rows, ",");
  }

  function yamlScalar(value) {
    const text = String(value ?? "");
    if (text === "") return '""';
    if (/^[A-Za-z_][A-Za-z0-9_ .@/-]*$/.test(text) && !/^(null|true|false|yes|no|on|off)$/i.test(text)) return text;
    return JSON.stringify(text);
  }

  function csvToYaml(rows) {
    if (rows.length < 2) throw new Error("Add a header row and at least one data row to create YAML.");
    if (rows[0].some(header => !String(header ?? "").trim())) throw new Error("Give every column a heading before converting it to YAML.");
    const headers = uniqueNames(rows[0], (header, index) => String(header ?? "").trim() || `column_${index + 1}`);
    return rows.slice(1).map(row => `- ${headers.map((header, index) => `${yamlScalar(header)}: ${yamlScalar(row[index])}`).join("\n  ")}`).join("\n");
  }

  function parseYamlScalar(raw) {
    const text = raw.trim();
    if (!text) return "";
    if (text.startsWith('"')) {
      try { return JSON.parse(text); } catch { throw new Error(`Could not read the quoted YAML value: ${text}`); }
    }
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
    if (/^[|>][+-]?$/.test(text)) throw new Error("Block-style YAML values are not supported. Use single-line values or quoted strings.");
    return text;
  }

  function splitYamlPair(text) {
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

  function yamlToCsv(text) {
    const lines = String(text ?? "").split(/\r?\n/), records = [];
    let current = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const start = line.match(/^\s*-\s+(.+)$/);
      const startPair = start && splitYamlPair(start[1]);
      if (startPair) {
        if (current) records.push(current);
        current = {};
        current[parseYamlScalar(startPair[0])] = parseYamlScalar(startPair[1]);
        continue;
      }
      const field = line.match(/^\s{2,}(.+)$/);
      const fieldPair = field && splitYamlPair(field[1]);
      if (fieldPair && current) { current[parseYamlScalar(fieldPair[0])] = parseYamlScalar(fieldPair[1]); continue; }
      throw new Error(`Line ${index + 1} is outside the supported YAML list-of-objects format.`);
    }
    if (current) records.push(current);
    if (!records.length) throw new Error("No YAML list items were found. Use a list of flat objects with key-value pairs.");
    const headers = [];
    records.forEach(record => Object.keys(record).forEach(key => { if (!headers.includes(key)) headers.push(key); }));
    return stringifyDelimited([headers, ...records.map(record => headers.map(key => record[key] ?? ""))], ",");
  }

  function csvToMarkdown(rows) {
    if (!rows.length) throw new Error("Add a header row to create a Markdown table.");
    const cell = value => String(value ?? "").replace(/\|/g,"\\|").replace(/\r?\n/g,"<br>");
    const headers = rows[0];
    return [
      `| ${headers.map(cell).join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.slice(1).map(row => `| ${headers.map((_, index) => cell(row[index])).join(" | ")} |`)
    ].join("\n");
  }

  function convert(input) {
    if (!String(input ?? "").trim()) throw new Error("Paste or load some data before converting.");
    let result;
    switch (tool) {
      case "csv-xml": result = csvToXml(parseDelimited(input, ",")); break;
      case "xml-csv": result = xmlToCsv(input); break;
      case "csv-yaml": result = csvToYaml(parseDelimited(input, ",")); break;
      case "yaml-csv": result = yamlToCsv(input); break;
      case "csv-markdown": result = csvToMarkdown(parseDelimited(input, ",")); break;
      case "csv-tsv": result = stringifyDelimited(parseDelimited(input, ","), "\t"); break;
      case "tsv-csv": result = stringifyDelimited(parseDelimited(input, "\t"), ","); break;
      case "csv-txt": result = stringifyDelimited(parseDelimited(input, ","), "\t"); break;
      default: throw new Error("This converter is not configured.");
    }
    if (!result) throw new Error("No non-empty rows were found in the input.");
    return result;
  }

  function showOutput() {
    const text = outputEl.value;
    if (!text) { statusEl.textContent = "Convert some data first."; return; }
    const blob = new Blob([text], {type: outputType === "xml" ? "application/xml;charset=utf-8" : outputType === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8"});
    if (this.id === "formatCopy") {
      if (!navigator.clipboard?.writeText) { statusEl.textContent = "Clipboard access is unavailable in this browser."; return; }
      navigator.clipboard.writeText(text).then(() => { statusEl.textContent = "Copied to clipboard."; }).catch(() => { statusEl.textContent = "Clipboard access is unavailable in this browser."; });
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `converted.${outputExtension}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      statusEl.textContent = `Downloaded converted.${outputExtension}.`;
    }
  }

  function validateFile(file) {
    if (acceptedExtensions.length && !acceptedExtensions.some(extension => file.name.toLowerCase().endsWith(extension))) {
      statusEl.textContent = `Choose a supported file (${acceptedExtensions.join(" or ")}).`;
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      statusEl.textContent = "This file is larger than 50 MB.";
      return false;
    }
    return true;
  }

  $("#formatConvert").addEventListener("click", () => {
    try { outputEl.value = convert(inputEl.value); statusEl.textContent = "Conversion complete. Review the result, then copy or download it."; }
    catch (error) { outputEl.value = ""; statusEl.textContent = error.message || "Could not convert this data."; }
  });
  $("#formatCopy").addEventListener("click", showOutput);
  $("#formatDownload").addEventListener("click", showOutput);
  $("#formatClear").addEventListener("click", () => { inputEl.value = ""; outputEl.value = ""; statusEl.textContent = ""; $("#formatFile").value = ""; });
  $("#formatSample").addEventListener("click", () => { inputEl.value = $("#sampleData").textContent.trim(); statusEl.textContent = "Example loaded. Select Convert to see the result."; });
  $("#formatFile").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!validateFile(file)) { event.target.value = ""; return; }
    try { inputEl.value = await file.text(); statusEl.textContent = `${file.name} loaded in your browser.`; }
    catch { statusEl.textContent = "Could not read this file."; event.target.value = ""; }
  });
  $("#formatInput").addEventListener("dragover", event => event.preventDefault());
  $("#formatInput").addEventListener("drop", async event => {
    event.preventDefault(); const file = event.dataTransfer?.files?.[0]; if (!file) return;
    if (!validateFile(file)) return;
    try { inputEl.value = await file.text(); statusEl.textContent = `${file.name} loaded in your browser.`; }
    catch { statusEl.textContent = "Could not read this file."; }
  });
  if (dropzone) {
    ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.add("drag");
    }));
    ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.remove("drag");
    }));
    dropzone.addEventListener("drop", async event => {
      const file = event.dataTransfer?.files?.[0]; if (!file) return;
      if (!validateFile(file)) return;
      try { inputEl.value = await file.text(); statusEl.textContent = `${file.name} loaded in your browser.`; }
      catch { statusEl.textContent = "Could not read this file."; }
    });
  }
  $("#formatBrowse").addEventListener("click", () => $("#formatFile").click());
  $("#formatMenu").addEventListener("click", () => $("#formatNav").classList.toggle("open"));
})();
