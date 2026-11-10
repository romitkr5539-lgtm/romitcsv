(() => {
  const $ = selector => document.querySelector(selector);
  const uploadCard = $("#reorderUploadCard"), uploadStatus = $("#reorderUploadStatus");
  const fileInput = $("#reorderFile"), pasteInput = $("#reorderPaste");
  const workspaceSection = $("#reorderWorkspaceSection"), workspace = $("#reorderWorkspace");
  const sample = "Order ID,Created at,Email,First name,Last name,Total\n1001,2026-04-12,ada@example.com,Ada,Lovelace,48.50\n1002,2026-04-13,grace@example.com,Grace,Hopper,76.00\n1003,2026-04-14,linus@example.com,Linus,Torvalds,32.75";
  const maxBytes = 50 * 1024 * 1024;
  let fileName = "data.csv", delimiter = ",", sourceRows = [], order = [], resultRows = null;
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
    return `<div class="reorder-table-wrap"><table><thead><tr>${headers.map((heading, index) => `<th>${escapeHTML(heading || `Column ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(value => `<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="reorder-empty">No data rows.</td></tr>`}</tbody></table></div>`;
  }

  function moveColumn(from, to) {
    if (to < 0 || to >= order.length || from === to) return;
    const [column] = order.splice(from, 1);
    order.splice(to, 0, column);
    resultRows = null;
    renderOrderList();
    $("#reorderResultTitle").textContent = "Previous table preview";
    $("#reorderResultNote").textContent = "Your column list has changed. Apply the new order to refresh this table.";
    $("#reorderApplyStatus").textContent = "Order changed. Apply the new order to update the table preview.";
    $("#reorderCopy").disabled = true;
    $("#reorderDownload").disabled = true;
  }

  function renderOrderList() {
    const headers = sourceRows[0] || [];
    $("#reorderList").innerHTML = order.map((sourceIndex, position) => {
      const heading = headers[sourceIndex] || `Column ${sourceIndex + 1}`;
      return `<li class="reorder-item" draggable="true" data-source="${sourceIndex}"><span class="reorder-position">${position + 1}</span><span class="reorder-grip" aria-hidden="true">⠿</span><span class="reorder-item-copy"><strong title="${escapeHTML(heading)}">${escapeHTML(heading)}</strong><small>Original column ${sourceIndex + 1}</small></span><span class="reorder-move-actions"><button class="reorder-move" type="button" data-delta="-1" aria-label="Move ${escapeHTML(heading)} up" ${position === 0 ? "disabled" : ""}>↑</button><button class="reorder-move" type="button" data-delta="1" aria-label="Move ${escapeHTML(heading)} down" ${position === order.length - 1 ? "disabled" : ""}>↓</button></span></li>`;
    }).join("");
    $("#reorderPositionSummary").textContent = `${order.length} ${order.length === 1 ? "column" : "columns"} · drag a row or use its arrows`;
  }

  function applyOrder() {
    resultRows = [order.map(index => sourceRows[0][index] ?? ""), ...sourceRows.slice(1).map(row => order.map(index => row[index] ?? ""))];
    $("#reorderTable").innerHTML = makeTable(resultRows);
    $("#reorderResultTitle").textContent = "Reordered CSV";
    $("#reorderResultNote").textContent = `${order.length.toLocaleString()} columns · ${(resultRows.length - 1).toLocaleString()} data rows. The source row order is preserved.`;
    $("#reorderCopy").disabled = false;
    $("#reorderDownload").disabled = false;
    $("#reorderApplyStatus").textContent = "New column order applied. Review the table before downloading.";
  }

  function renderWorkspace() {
    const headers = sourceRows[0] || [];
    const rowCount = sourceRows.length - 1;
    order = headers.map((_, index) => index);
    resultRows = null;
    workspace.hidden = false;
    workspaceSection.hidden = false;
    workspace.innerHTML = `
      <div class="reorder-workspace-card">
        <div class="reorder-filebar"><div class="reorder-file-info"><span class="reorder-file-icon">CSV</span><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${rowCount.toLocaleString()} data rows · ${headers.length.toLocaleString()} columns · ${delimiter === "\t" ? "Tab" : delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : "Pipe"} separated</span></div></div><div class="reorder-file-actions"><span id="reorderActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="reorderStartOver" type="button">Start over</button></div></div>
        <section class="reorder-controls" aria-labelledby="reorderControlsTitle"><div class="reorder-controls-head"><div><h2 id="reorderControlsTitle">Set the column order</h2><p>Headings and their row values move together. The rows themselves stay in place.</p></div><div class="reorder-control-actions"><button class="viewer-edit" id="reorderSample" type="button">Load sample</button><button class="viewer-edit" id="reorderReset" type="button">Reset order</button><button class="viewer-primary" id="reorderApply" type="button">Apply order</button></div></div><div class="reorder-position-summary" id="reorderPositionSummary"></div><ol class="reorder-list" id="reorderList" aria-label="CSV column order"></ol><p id="reorderApplyStatus" class="reorder-status" role="status" aria-live="polite">Arrange the fields, then apply the order to update the preview.</p></section>
        <section class="reorder-result"><div class="reorder-result-head"><div><h2 id="reorderResultTitle">Source data preview</h2><p id="reorderResultNote">The complete source table is shown below. Apply a new order to update it.</p></div><div class="reorder-result-actions"><button class="viewer-edit" id="reorderCopy" type="button" disabled>Copy CSV</button><button class="viewer-primary" id="reorderDownload" type="button" disabled>Download CSV</button></div></div><div id="reorderTable">${makeTable(sourceRows)}</div></section>
      </div>`;
    renderOrderList();
    $("#reorderList").addEventListener("click", event => {
      const button = event.target.closest("button[data-delta]");
      if (!button) return;
      const item = button.closest(".reorder-item"), from = Array.from(item.parentElement.children).indexOf(item);
      moveColumn(from, from + Number(button.dataset.delta));
    });
    let dragFrom = null;
    $("#reorderList").addEventListener("dragstart", event => {
      const item = event.target.closest(".reorder-item");
      if (!item) return;
      dragFrom = Array.from(item.parentElement.children).indexOf(item);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(dragFrom));
      item.classList.add("is-dragging");
    });
    $("#reorderList").addEventListener("dragend", event => { event.target.closest(".reorder-item")?.classList.remove("is-dragging"); });
    $("#reorderList").addEventListener("dragover", event => { if (event.target.closest(".reorder-item")) event.preventDefault(); });
    $("#reorderList").addEventListener("drop", event => {
      const target = event.target.closest(".reorder-item");
      if (!target || dragFrom === null) return;
      event.preventDefault();
      const to = Array.from(target.parentElement.children).indexOf(target);
      moveColumn(dragFrom, to); dragFrom = null;
    });
    $("#reorderReset").onclick = () => {
      order = headers.map((_, index) => index); resultRows = null; renderOrderList();
      $("#reorderResultTitle").textContent = "Previous table preview";
      $("#reorderResultNote").textContent = "The original order is restored above. Apply it to refresh this table.";
      $("#reorderApplyStatus").textContent = "Original column order restored. Apply it to refresh the table preview.";
      $("#reorderCopy").disabled = true; $("#reorderDownload").disabled = true;
    };
    $("#reorderApply").onclick = applyOrder;
    $("#reorderSample").onclick = () => openData(sample, "sample-orders.csv");
    $("#reorderCopy").onclick = async () => {
      if (!resultRows) return;
      try { await navigator.clipboard.writeText(serializeCSV(resultRows)); $("#reorderActionStatus").textContent = "Reordered CSV copied to clipboard."; }
      catch { $("#reorderActionStatus").textContent = "Clipboard access is unavailable in this browser."; }
    };
    $("#reorderDownload").onclick = () => {
      if (!resultRows) return;
      const link = document.createElement("a"), blobURL = URL.createObjectURL(new Blob(["\uFEFF", serializeCSV(resultRows)], { type: "text/csv;charset=utf-8" }));
      link.href = blobURL; link.download = fileName.replace(/\.(csv|tsv|txt)$/i, "") + "-reordered.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
      $("#reorderActionStatus").textContent = "Reordered CSV download started.";
    };
    $("#reorderStartOver").onclick = () => {
      fileName = "data.csv"; delimiter = ","; sourceRows = []; order = []; resultRows = null;
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

  $("#reorderBrowse").onclick = () => fileInput.click();
  const dropzone = $("#reorderDropzone");
  dropzone.onclick = event => { if (!event.target.closest("button")) fileInput.click(); };
  $("#reorderUsePaste").onclick = () => {
    const text = pasteInput.value;
    if (!text.trim()) { uploadStatus.textContent = "Paste delimited text first."; pasteInput.focus(); return; }
    openData(text, "pasted-data.csv");
  };
  fileInput.onchange = event => { const file = event.target.files?.[0]; if (file) loadFile(file); };
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", event => { const file = event.dataTransfer?.files?.[0]; if (file) loadFile(file); });
  $("#reorderMenu").onclick = () => {
    const open = $("#reorderNav").classList.toggle("open");
    $("#reorderMenu").setAttribute("aria-expanded", String(open));
  };
})();
