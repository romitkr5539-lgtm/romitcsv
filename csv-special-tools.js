(()=>{
  const $=s=>document.querySelector(s);
  const root=$("#specialTool"); if(!root)return;
  const kind=root.dataset.kind, status=$("#specialStatus"), upload=$("#specialUpload"), workspace=$("#toolWorkspace"), fileInput=$("#specialFile");
  let rows=[], fileName="data.csv", rawText="", fileBytes=0, page=1, selectedRow=-1, columnPage=1;
  const maxBytes=50*1024*1024, pageSize=50;
  const escapeHTML=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function delimiter(text){
    const line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(x=>x.trim())||"");
    const counts=new Map([[",",0],[";",0],["\t",0],["|",0]]);let quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"')i++;else quoted=!quoted}else if(!quoted&&counts.has(c))counts.set(c,counts.get(c)+1)}
    return [...counts].reduce((best,item)=>item[1]>best[1]?item:best,[",",-1])[0];
  }
  function parse(text){
    text=String(text||"").replace(/^\uFEFF/,"");const sep=delimiter(text),out=[],row=[],cell=[];let quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
      if(c==='"'){if(quoted&&n==='"'){cell.push('"');i++}else if(quoted)quoted=false;else if(cell.length===0)quoted=true;else cell.push(c)}
      else if(c===sep&&!quoted){row.push(cell.join(""));cell.length=0}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell.join(""));cell.length=0;if(row.some(v=>v.trim()))out.push(row.slice());row.length=0}
      else cell.push(c)
    }
    if(quoted)throw new Error("This file has an unfinished quoted field.");
    if(cell.length||row.length){row.push(cell.join(""));if(row.some(v=>v.trim()))out.push(row.slice())}
    const width=out.reduce((m,r)=>Math.max(m,r.length),0);return out.map(r=>Array.from({length:width},(_,i)=>r[i]??""));
  }
  function csv(data){return data.map(r=>r.map(v=>{v=String(v??"");return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")).join("\r\n")}
  function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function showError(error){status.textContent=error}
  async function parseLargeFile(file){
    if(!file.stream)return parse(await file.text());
    const reader=file.stream().getReader(),decoder=new TextDecoder("utf-8"),out=[];
    let row=[],cell="",quoted=false,separator=null,buffer="",probe="";
    function consume(text,final=false){
      buffer+=text;
      const limit=final?buffer.length:Math.max(0,buffer.length-1);
      for(let i=0;i<limit;i++){
        const c=buffer[i],n=buffer[i+1];
        if(c==='"'){
          if(quoted&&n==='"'){cell+='"';i++}
          else if(quoted)quoted=false;
          else if(cell.length===0)quoted=true;
          else cell+='"';
        }else if(c===separator&&!quoted){row.push(cell);cell=""}
        else if((c==='\n'||c==='\r')&&!quoted){
          if(c==='\r'&&n==='\n')i++;
          row.push(cell);cell="";
          if(row.some(value=>value.trim()))out.push(row);
          row=[];
        }else cell+=c;
      }
      buffer=buffer.slice(limit);
    }
    while(true){
      const {value,done}=await reader.read();
      const chunk=decoder.decode(value,{stream:!done});
      if(separator===null){
        probe+=chunk;
        if(/[\r\n]/.test(probe)||probe.length>=65536||done){
          separator=delimiter(probe);
          consume(probe,done);
          probe="";
        }
      }else consume(chunk,done);
      if(done)break;
    }
    if(separator===null){separator=delimiter(probe);consume(probe,true)}
    if(quoted)throw new Error("This file has an unfinished quoted field.");
    if(cell.length||row.length){row.push(cell);if(row.some(value=>value.trim()))out.push(row)}
    const width=out.reduce((max,values)=>Math.max(max,values.length),0);
    if(out.length)out[0]=Array.from({length:width},(_,i)=>out[0][i]??"");return out;
  }
  async function openFile(file){
    if(!file)return;
    if(file.size>maxBytes){showError("This file is larger than 50 MB.");return}
    const supportedExtension=/\.(csv|tsv)$/i.test(file.name||"");
    const supportedMime=["text/csv","text/tab-separated-values","application/vnd.ms-excel"].includes(file.type);
    if(!supportedExtension&&!supportedMime){showError("Choose a CSV or TSV file.");return}
    status.textContent=kind==="large"?"Reading and preparing your file…":"Reading your file…";
    try{
      fileName=file.name||"data.csv";
      fileBytes=file.size;
      if(kind==="reader"){
        rawText=await file.text();
        rows=[];
      }else if(kind==="large"){
        rawText="";
        rows=await parseLargeFile(file);
        if(!rows.length)throw new Error("This file is empty.");
      }else{
        const text=await file.text();
        rawText="";
        rows=parse(text);
        if(!rows.length)throw new Error("This file is empty.");
      }
      status.textContent="";
      upload.hidden=true;
      workspace.hidden=false;
      render();
    }catch(error){showError(error.message||"Could not read this file.")}
  }  $("#specialBrowse").onclick=()=>fileInput.click();fileInput.onchange=e=>openFile(e.target.files?.[0]);
  const dz=$("#specialDropzone");["dragenter","dragover"].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add("drag")}));
  ["dragleave","drop"].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove("drag")}));
  dz.addEventListener("drop",e=>openFile(e.dataTransfer?.files?.[0]));
  function openPastedText(text){try{rawText=text;fileBytes=new Blob([text]).size;rows=parse(text);if(!rows.length)throw new Error("Paste CSV text or choose a file first.");fileName="pasted-data.csv";status.textContent="";upload.hidden=true;workspace.hidden=false;render()}catch(e){showError(e.message||"Could not read this CSV text.")}}
  if(kind==="viewer"){
    const pasteBox=$("#pasteCsvText"),pasteButton=$("#openPastedCsv");
    if(pasteButton)pasteButton.onclick=()=>openPastedText(pasteBox.value);
  }  function makeShell(subtitle,body){
    workspace.innerHTML=`<div class="special-data-card"><div class="special-filebar"><div class="special-file-info"><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${kind==="reader"?`${rawText.split(/\r\n|\n|\r/).length.toLocaleString()} lines · ${fileBytes.toLocaleString()} bytes`:`${Math.max(0,rows.length-1).toLocaleString()} rows · ${(rows[0]||[]).length} columns`}</span></div><div class="special-file-actions">${kind==="viewer"?'<button class="viewer-edit" id="specialEdit" type="button">Edit cells</button><button class="viewer-download" id="specialDownload" type="button">Download CSV</button>':''}<button class="viewer-clear" id="specialClear" type="button">Open another file</button></div></div><div class="special-controls"><h2>${subtitle}</h2>${body}</div><div id="specialResult"></div></div>`;
    const downloadButton=$("#specialDownload");
    if(downloadButton)downloadButton.onclick=()=>download(fileName.replace(/\.(csv|tsv)$/i,".csv"),csv(rows),"text/csv;charset=utf-8");
    $("#specialClear").onclick=()=>{rows=[];workspace.hidden=true;upload.hidden=false;status.textContent="";fileInput.value=""};
  }function renderColumn(){
    const heads=rows[0]||[],header=heads.map((h,i)=>String(h).trim()||`Column ${i+1}`),bodyRows=rows.slice(1);
    makeShell("Explore values in one column",`<div class="column-tools-grid">
      <label class="column-field" for="columnSelect"><span>Choose a column</span><select id="columnSelect">${header.map((h,i)=>`<option value="${i}">${escapeHTML(h)}</option>`).join("")}</select></label>
      <label class="column-field" for="columnSearch"><span>Search in this column</span><span class="column-search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="columnSearch" type="search" placeholder="Find a value…"></span></label>
    </div><div class="column-export-row"><div class="column-export-copy"><strong>Take this column with you</strong><span>Copy or download all values, including those hidden by search.</span></div><div class="special-actions column-export-actions"><button id="copyColumn" class="secondary-btn" type="button"><span aria-hidden="true">⧉</span>Copy column</button><button id="downloadColumn" class="viewer-download" type="button"><span aria-hidden="true">↓</span>Download CSV</button></div></div><div id="columnValues" class="column-results" aria-live="polite"></div>`);
    const select=$("#columnSelect"),search=$("#columnSearch");
    function paint(){
      const ix=Number(select.value),q=search.value.trim().toLocaleLowerCase();
      const matched=bodyRows.map((r,i)=>({v:r[ix]??"",i:i+1})).filter(x=>String(x.v).toLocaleLowerCase().includes(q));
      const pages=Math.max(1,Math.ceil(matched.length/pageSize));columnPage=Math.min(columnPage,pages);
      const view=matched.slice((columnPage-1)*pageSize,columnPage*pageSize);
      const countText=q?`${matched.length.toLocaleString()} matching values`:`${matched.length.toLocaleString()} values`;
      $("#columnValues").innerHTML=`<div class="column-results-head"><div><span>${q?"SEARCH RESULTS":"COLUMN VALUES"}</span><strong>${countText}</strong></div><span class="column-selected-name">${escapeHTML(header[ix])}</span></div><div class="special-table-wrap column-values-table-wrap"><table class="special-table"><thead><tr><th scope="col" class="column-row-head">Row</th><th scope="col">${escapeHTML(header[ix])}</th></tr></thead><tbody>${view.map(x=>`<tr><td class="column-row-number">${x.i}</td><td title="${escapeHTML(x.v)}">${escapeHTML(x.v)}</td></tr>`).join("")||`<tr><td colspan="2" class="no-results"><strong>${q?"No matching values":"No values in this column"}</strong><span>${q?"Try a different search term.":"Choose another column to inspect its values."}</span></td></tr>`}</tbody></table></div><div class="viewer-pager"><span>Showing ${view.length?((columnPage-1)*pageSize+1):0}–${Math.min((columnPage-1)*pageSize+view.length,matched.length)} of ${matched.length.toLocaleString()} values</span><div class="pager-buttons"><button id="columnPrev" type="button" aria-label="Previous page" ${columnPage<=1?"disabled":""}>‹</button><b>Page ${columnPage} of ${pages}</b><button id="columnNext" type="button" aria-label="Next page" ${columnPage>=pages?"disabled":""}>›</button></div></div>`;
      $("#columnPrev").onclick=()=>{if(columnPage>1){columnPage--;paint()}};
      $("#columnNext").onclick=()=>{if(columnPage<pages){columnPage++;paint()}};
    }
    select.onchange=()=>{columnPage=1;paint()};search.oninput=()=>{columnPage=1;paint()};
    $("#copyColumn").onclick=async()=>{const ix=Number(select.value),button=$("#copyColumn");try{await navigator.clipboard.writeText([header[ix],...bodyRows.map(r=>r[ix]??"")].join("\n"));button.innerHTML='<span aria-hidden="true">✓</span>Copied';button.classList.add("is-copied");setTimeout(()=>{button.innerHTML='<span aria-hidden="true">⧉</span>Copy column';button.classList.remove("is-copied")},1800)}catch(e){showError("Clipboard access is unavailable in this browser.")}};
    $("#downloadColumn").onclick=()=>{const ix=Number(select.value);download(`column-${ix+1}.csv`,csv([[header[ix]],...bodyRows.map(r=>[r[ix]??""])]),"text/csv;charset=utf-8")};
    paint();
  }function renderRow(){
    const headers=(rows[0]||[]).map((h,i)=>String(h).trim()||`Column ${i+1}`),data=rows.slice(1);
    page=1;selectedRow=data.length?1:-1;
    makeShell("Search records and inspect every field",`<div class="row-tools"><label class="row-search-field" for="rowSearch"><span>Search all rows</span><span class="row-search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="rowSearch" type="search" placeholder="Search any value…" autocomplete="off"></span></label><p class="row-search-hint">Find a value in any column, then select a result to inspect the full record.</p></div><div id="rowResults" class="row-results" aria-live="polite"></div><section id="rowDetails" class="row-detail-panel" aria-live="polite"></section>`);
    const search=$("#rowSearch");
    function emptyDetails(){$("#rowDetails").innerHTML=`<div class="row-detail-empty"><span aria-hidden="true">⌕</span><strong>Select a row to inspect its fields</strong><p>Choose a result above to view every column and its value.</p></div>`}
    function showRow(i){const r=data[i-1];if(!r){emptyDetails();return}$("#rowDetails").innerHTML=`<div class="row-detail-heading"><div><span>SELECTED RECORD</span><h3>Row ${i.toLocaleString()}</h3></div><div class="special-actions row-detail-actions"><button type="button" class="secondary-btn" id="copyRow"><span aria-hidden="true">⧉</span>Copy row</button><button type="button" class="viewer-download" id="downloadRow"><span aria-hidden="true">↓</span>Download row</button></div></div><div class="row-fields-wrap"><table class="special-table row-fields-table"><thead><tr><th scope="col">Column</th><th scope="col">Value</th></tr></thead><tbody>${headers.map((h,c)=>`<tr><th scope="row">${escapeHTML(h)}</th><td title="${escapeHTML(r[c]??"")}">${escapeHTML(r[c]??"")||'<span class="row-empty-value">Empty</span>'}</td></tr>`).join("")}</tbody></table></div>`;$("#downloadRow").onclick=()=>download(`row-${i}.csv`,csv([rows[0],r]),"text/csv;charset=utf-8");$("#copyRow").onclick=async()=>{const b=$("#copyRow");try{await navigator.clipboard.writeText(csv([rows[0],r]));b.innerHTML='<span aria-hidden="true">✓</span>Copied';b.classList.add("is-copied");setTimeout(()=>{if(b.isConnected){b.innerHTML='<span aria-hidden="true">⧉</span>Copy row';b.classList.remove("is-copied")}},1800)}catch(e){showError("Clipboard access is unavailable in this browser.")}}}
    function paint(){const q=search.value.trim().toLocaleLowerCase(),matches=data.map((r,i)=>({r,i:i+1})).filter(x=>x.r.some(v=>String(v).toLocaleLowerCase().includes(q))),pages=Math.max(1,Math.ceil(matches.length/pageSize));page=Math.min(page,pages);if(selectedRow>0&&!matches.some(x=>x.i===selectedRow)){selectedRow=-1;emptyDetails()}const view=matches.slice((page-1)*pageSize,page*pageSize),first=view.length?(page-1)*pageSize+1:0,last=Math.min((page-1)*pageSize+view.length,matches.length),heads=headers.slice(0,5),extra=headers.length>5,cols=Math.max(1,heads.length+1+(extra?1:0));$("#rowResults").innerHTML=`<div class="row-results-head"><div><span>${q?"SEARCH RESULTS":"CSV ROWS"}</span><strong>${matches.length.toLocaleString()} ${matches.length===1?"row":"rows"}${q?" found":""}</strong></div><span class="row-results-range">${matches.length?`Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${matches.length.toLocaleString()}`:"No records to display"}</span></div><div class="special-table-wrap row-table-wrap"><table class="special-table row-table"><thead><tr><th scope="col" class="row-index-head">Row</th>${heads.map(h=>`<th scope="col">${escapeHTML(h)}</th>`).join("")}${extra?'<th scope="col" class="row-more-head">More</th>':''}</tr></thead><tbody>${view.map(x=>`<tr class="${selectedRow===x.i?"is-selected":""}"><td class="row-index-cell"><button type="button" class="row-select" data-row="${x.i}" aria-label="Inspect row ${x.i}" aria-pressed="${selectedRow===x.i}">${x.i}</button></td>${x.r.slice(0,5).map(v=>`<td title="${escapeHTML(v)}">${escapeHTML(v)}</td>`).join("")}${extra?`<td class="row-more-cell">+${headers.length-5}</td>`:""}</tr>`).join("")||`<tr><td colspan="${cols}" class="no-results"><strong>${q?"No matching rows":"No data rows found"}</strong><span>${q?"Try a different search term.":"Choose a CSV file that contains data rows."}</span></td></tr>`}</tbody></table></div><div class="viewer-pager row-pager"><span>${matches.length?`Rows ${first.toLocaleString()}–${last.toLocaleString()} of ${matches.length.toLocaleString()}`:"0 rows"}</span><div class="pager-buttons"><button id="rowPrev" type="button" aria-label="Previous page" ${page<=1?"disabled":""}>‹</button><b>Page ${page} of ${pages}</b><button id="rowNext" type="button" aria-label="Next page" ${page>=pages?"disabled":""}>›</button></div></div>`;$("#rowPrev").onclick=()=>{if(page>1){page--;paint()}};$("#rowNext").onclick=()=>{if(page<pages){page++;paint()}};workspace.querySelectorAll(".row-select").forEach(btn=>btn.onclick=()=>{selectedRow=Number(btn.dataset.row);paint();showRow(selectedRow)})}
    search.oninput=()=>{page=1;paint()};paint();if(selectedRow>0)showRow(selectedRow);else emptyDetails();
  }function renderHTML(){const headers=rows[0]||[],data=rows.slice(1);makeShell("Create an HTML table from CSV",`<label class="special-label" for="tableCaption">Optional table caption</label><input id="tableCaption" type="text" maxlength="120" placeholder="Add a caption"><label class="special-check"><input id="includeStyle" type="checkbox" checked> Include basic inline table styling</label><div class="special-actions"><button id="copyHtml" class="secondary-btn" type="button">Copy HTML</button><button id="downloadHtml" class="viewer-download" type="button">Download HTML file</button></div><p id="htmlStatus" class="special-note" role="status"></p><label class="special-label" for="htmlOutput">HTML code</label><textarea id="htmlOutput" class="special-code" readonly rows="12"></textarea><h3>Table preview</h3><div id="htmlPreview" class="special-preview"></div>`);
    function generate(){const caption=$("#tableCaption").value.trim(),style=$("#includeStyle").checked?'<style>table{border-collapse:collapse;width:100%;font:14px Arial,sans-serif}th,td{border:1px solid #d6dde5;padding:8px;text-align:left}thead{background:#f2f5f8}caption{text-align:left;font-weight:bold;padding:8px}</style>':"";const cells=(r,tag)=>`<tr>${r.map(v=>`<${tag}>${escapeHTML(v)}</${tag}>`).join("")}</tr>`;const markup=`<table>${caption?`\n  <caption>${escapeHTML(caption)}</caption>`:""}\n  <thead>\n    ${cells(headers,"th")}\n  </thead>\n  <tbody>\n    ${data.map(r=>cells(r,"td")).join("\n    ")}\n  </tbody>\n</table>`;const full=`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHTML(caption||"CSV Table")}</title>\n${style}\n</head>\n<body>\n${markup}\n</body>\n</html>`;$("#htmlOutput").value=full;$("#htmlPreview").innerHTML=markup;return full}
    $("#tableCaption").oninput=generate;$("#includeStyle").onchange=generate;generate();
    $("#copyHtml").onclick=async()=>{try{await navigator.clipboard.writeText($("#htmlOutput").value);$("#htmlStatus").textContent="HTML copied."}catch(e){$("#htmlStatus").textContent="Clipboard access is unavailable in this browser."}};
    $("#downloadHtml").onclick=()=>download(fileName.replace(/\.(csv|tsv)$/i,"")+".html",$("#htmlOutput").value,"text/html;charset=utf-8");
  }
  function renderViewer(){
    const headers=(rows[0]||[]).map((h,i)=>String(h).trim()||`Column ${i+1}`),data=rows.slice(1);
    makeShell("Browse, search, and sort the table",`<label class="special-label" for="viewerSearch">Search all cells</label><input id="viewerSearch" type="search" placeholder="Search this CSV"><p class="special-note viewer-table-summary" id="viewerSummary"></p><div class="viewer-table-wrap special-table-wrap" id="viewerRows"></div><div class="viewer-pager" id="viewerPager"></div>`);
    let sortCol=-1,sortDir=1,editing=false;
    const editButton=$("#specialEdit");
    function paint(){
      const q=$("#viewerSearch").value.trim().toLocaleLowerCase();
      let found=data.map((r,i)=>({r,i})).filter(x=>x.r.some(v=>String(v).toLocaleLowerCase().includes(q)));
      if(sortCol>=0)found.sort((a,b)=>String(a.r[sortCol]??"").localeCompare(String(b.r[sortCol]??""),undefined,{numeric:true,sensitivity:"base"})*sortDir);
      const pages=Math.max(1,Math.ceil(found.length/pageSize));
      page=Math.min(page,pages);
      const view=found.slice((page-1)*pageSize,page*pageSize);
      $("#viewerSummary").textContent=`${found.length.toLocaleString()} matching rows · Page ${page} of ${pages}`;
      $("#viewerRows").innerHTML=`<table class="special-table"><thead><tr><th class="row-num-head" scope="col">#</th>${headers.map((h,i)=>`<th scope="col"><button class="sort-heading" type="button" data-col="${i}" aria-label="Sort by ${escapeHTML(h)}">${escapeHTML(h)}${sortCol===i?(sortDir===1?" ↑":" ↓"):" ↕"}</button></th>`).join("")}</tr></thead><tbody>${view.map(x=>`<tr><td class="row-number">${x.i+1}</td>${headers.map((h,i)=>`<td class="editable-cell" data-row="${x.i+1}" data-col="${i}" title="${escapeHTML(x.r[i]??"")}">${escapeHTML(x.r[i]??"")}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${headers.length+1}" class="no-results">No matching rows.</td></tr>`}</tbody></table>`;
      $("#viewerPager").innerHTML=`<span>Showing ${view.length?((page-1)*pageSize+1):0}–${Math.min((page-1)*pageSize+view.length,found.length)} of ${found.length.toLocaleString()} rows</span><div class="pager-buttons"><button id="viewPrev" type="button" ${page<=1?"disabled":""}>‹</button><b>${page}</b><button id="viewNext" type="button" ${page>=pages?"disabled":""}>›</button></div>`;
      editButton.textContent=editing?"Save edits":"Edit cells";
      editButton.setAttribute("aria-pressed",String(editing));
      workspace.querySelectorAll(".editable-cell").forEach(cell=>{
        cell.contentEditable=String(editing);
        cell.spellcheck=false;
        cell.oninput=()=>{rows[Number(cell.dataset.row)][Number(cell.dataset.col)]=cell.textContent;cell.title=cell.textContent};
      });
      workspace.querySelectorAll(".sort-heading").forEach(button=>button.onclick=()=>{const col=Number(button.dataset.col);sortDir=sortCol===col?-sortDir:1;sortCol=col;page=1;paint()});
      $("#viewPrev").onclick=()=>{if(page>1){page--;paint()}};
      $("#viewNext").onclick=()=>{if(page<pages){page++;paint()}};
    }
    $("#viewerSearch").oninput=()=>{page=1;paint()};
    editButton.onclick=()=>{editing=!editing;paint()};
    paint();
  }function renderReader(){
    const lines=rawText.split(/\r\n|\n|\r/).length;
    makeShell("Original file contents",`<div class="reader-intro"><p>Inspect the decoded text as it appears in the file. Separators and line breaks stay visible.</p><span class="reader-readonly-tag">Read only</span></div><div class="reader-actions"><button id="copyRaw" class="secondary-btn" type="button">Copy file text</button><button id="downloadRaw" class="viewer-download" type="button">Download text copy</button><p id="readerStatus" class="reader-status" role="status" aria-live="polite"></p></div><div class="reader-text-panel"><div class="reader-text-heading"><span>Plain-text view</span><span>Horizontal scroll enabled</span></div><textarea id="rawReadout" class="special-code reader-raw-text" rows="18" wrap="off" readonly spellcheck="false" aria-label="Original CSV file text"></textarea></div>`);
    $("#rawReadout").value=rawText;
    $("#copyRaw").onclick=async()=>{try{await navigator.clipboard.writeText(rawText);$("#readerStatus").textContent="File text copied to clipboard."}catch(e){$("#readerStatus").textContent="Clipboard access is unavailable in this browser."}};
    $("#downloadRaw").onclick=()=>download(fileName,rawText,"text/plain;charset=utf-8");
  }function renderLarge(){
    const headers=(rows[0]||[]).map((h,i)=>String(h).trim()||`Column ${i+1}`),size=100;
    makeShell("Search and inspect a large CSV",`<p class="special-note">${fileBytes.toLocaleString()} bytes · ${Math.max(0,rows.length-1).toLocaleString()} data rows · ${headers.length} columns. The table displays up to 100 rows at a time.</p><label class="special-label" for="largeSearch">Search all rows</label><input id="largeSearch" type="search" placeholder="Find a value anywhere in the file"><div id="largeRows"></div>`);
    function paint(){
      const q=$("#largeSearch").value.trim().toLocaleLowerCase();
      let matches=null;
      if(q){
        matches=[];
        for(let i=1;i<rows.length;i++)if(rows[i].some(value=>String(value).toLocaleLowerCase().includes(q)))matches.push(i);
      }
      const total=matches?matches.length:Math.max(0,rows.length-1);
      const pages=Math.max(1,Math.ceil(total/size));
      page=Math.min(page,pages);
      const start=(page-1)*size;
      const view=matches?matches.slice(start,start+size).map(index=>({r:rows[index],i:index-1})):rows.slice(start+1,start+size+1).map((r,index)=>({r,i:start+index}));
      $("#largeRows").innerHTML=`<p class="special-note">${q?`${total.toLocaleString()} matching rows`:`Showing all ${total.toLocaleString()} rows`} · Page ${page} of ${pages}</p><div class="special-table-wrap"><table class="special-table"><thead><tr><th scope="col" class="row-num-head">Row</th>${headers.map(h=>`<th scope="col">${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${view.map(x=>`<tr><td class="row-number">${x.i+1}</td>${headers.map((h,i)=>`<td title="${escapeHTML(x.r[i]??"")}">${escapeHTML(x.r[i]??"")}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${headers.length+1}" class="no-results">No matching rows.</td></tr>`}</tbody></table></div><div class="viewer-pager"><span>Showing ${view.length?start+1:0}–${Math.min(start+view.length,total)} of ${total.toLocaleString()} rows</span><div class="pager-buttons"><button id="largePrev" type="button" aria-label="Previous page" ${page<=1?"disabled":""}>‹</button><b>${page}</b><button id="largeNext" type="button" aria-label="Next page" ${page>=pages?"disabled":""}>›</button></div></div>`;
      $("#largePrev").onclick=()=>{if(page>1){page--;paint()}};
      $("#largeNext").onclick=()=>{if(page<pages){page++;paint()}};
    }
    $("#largeSearch").oninput=()=>{page=1;paint()};
    paint();
  }function renderPreview(){const headers=rows[0]||[],data=rows.slice(1),limit=25;makeShell("Preview the first rows before working with the file",`<p class="special-note">${fileName}: ${data.length.toLocaleString()} data rows · ${headers.length} columns · ${fileBytes.toLocaleString()} bytes. This preview shows up to the first ${limit} data rows.</p><div class="special-table-wrap"><table class="special-table"><thead><tr><th>Row</th>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${data.slice(0,limit).map((r,i)=>`<tr><td>${i+1}</td>${headers.map((h,c)=>`<td>${escapeHTML(r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="special-note">Need to explore or change the full dataset? Open the <a href="csv-table-viewer.html">CSV Table Viewer</a> or <a href="csv-editor.html">CSV Editor</a>.</p>`)
  }  function render(){page=1;columnPage=1;selectedRow=-1;({column:renderColumn,row:renderRow,html:renderHTML,viewer:renderViewer,reader:renderReader,large:renderLarge,preview:renderPreview})[kind]?.()}
})();


