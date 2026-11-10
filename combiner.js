const $=selector=>document.querySelector(selector);

function escapeHTML(value){return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]))}

function detectDelimiter(text){
  const line=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(value=>value.trim())||"";
  return [",","\t",";","|"].map(delimiter=>{let quoted=false,count=0;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue}quoted=!quoted}else if(line[i]===delimiter&&!quoted)count++}return [delimiter,count]}).sort((a,b)=>b[1]-a[1])[0][0];
}

function parseCSV(text){
  text=String(text||"").replace(/^\uFEFF/,"");if(!text.trim())return [];
  const delimiter=detectDelimiter(text),rows=[],row=[],cell=[];let quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i],next=text[i+1];
    if(char==='"'){if(quoted&&next==='"'){cell.push('"');i++}else quoted=!quoted}
    else if(char===delimiter&&!quoted){row.push(cell.join(""));cell.length=0}
    else if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&next==="\n")i++;row.push(cell.join(""));cell.length=0;rows.push(row.slice());row.length=0}
    else cell.push(char);
  }
  if(quoted)throw new Error("A file has an unclosed quoted field. Check its CSV formatting.");
  if(cell.length||row.length){row.push(cell.join(""));rows.push(row.slice())}
  const width=rows.reduce((max,current)=>Math.max(max,current.length),0);
  return rows.map(current=>Array.from({length:width},(_,index)=>current[index]??""));
}

function serializeCSV(rows){return rows.map(row=>row.map(value=>{value=String(value??"");return /[",\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value}).join(",")).join("\r\n")}

const $uploadCard=$("#combinerUploadCard"),$dropzone=$("#combinerDropzone"),$workspace=$("#combinerWorkspace"),$status=$("#combinerStatus"),$fileInput=$("#combinerFiles");
const maxFileBytes=50*1024*1024,pageSize=10;let sourceTables=[],combinedRows=[],fileName="combined.csv",page=1;
function setStatus(message,isError=false){$status.textContent=message;$status.classList.toggle("is-error",isError)}
function baseName(name){return String(name||"data.csv").replace(/\.(csv|tsv|txt)$/i,"").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_")||"data"}
function rowsIn(source){return Math.max(0,source.rows.length-1)}

function mergeTables(tables){
  const headers=[],positionsByFile=[];
  tables.forEach(source=>{
    const counts=new Map(),positions=[];
    (source.rows[0]||[]).forEach((raw,index)=>{
      const label=String(raw??""),base=label===""?"\u0000blank-column-"+index:label,occurrence=counts.get(base)||0;counts.set(base,occurrence+1);
      const key=base+"\u0001"+occurrence;let target=headers.findIndex(item=>item.key===key);
      if(target<0){target=headers.length;headers.push({key,label:label||"Column "+(index+1)})}positions[index]=target;
    });
    positionsByFile.push(positions);
  });
  if(!headers.length)throw new Error("The selected files do not contain a header row.");
  const output=[headers.map(item=>item.label)];
  tables.forEach((source,fileIndex)=>source.rows.slice(1).forEach(row=>{const result=Array(headers.length).fill("");positionsByFile[fileIndex].forEach((target,index)=>{result[target]=row[index]??""});output.push(result)}));
  return output;
}

function render(){
  if(!sourceTables.length){$workspace.hidden=true;return}
  combinedRows=mergeTables(sourceTables);const totalRows=Math.max(0,combinedRows.length-1),totalPages=Math.max(1,Math.ceil(totalRows/pageSize));page=Math.min(page,totalPages);
  const start=(page-1)*pageSize,visible=combinedRows.slice(start+1,start+1+pageSize),columns=combinedRows[0]||[];
  $uploadCard.hidden=true;$workspace.hidden=false;
  $workspace.innerHTML=`<div class="merger-data-card">
    <div class="merger-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>CSV</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${sourceTables.length} files · ${totalRows.toLocaleString()} rows · ${columns.length} columns</span></div></div>
      <div class="merger-actions"><button class="viewer-edit" id="combinerAddFiles" type="button">Add more files</button><input id="combinerMoreFiles" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" multiple hidden><button class="viewer-download" id="combinerDownload" type="button" ${sourceTables.length<2?'disabled title="Add at least one more file to enable download"':''}>Download Combined CSV</button><button class="viewer-clear" id="combinerClear" type="button">Clear</button></div></div>
    <div class="merger-sources" aria-label="Files included in the combined CSV">${sourceTables.map((source,index)=>`<span class="merger-source"><span title="${escapeHTML(source.name)}">${escapeHTML(source.name)} · ${rowsIn(source).toLocaleString()} rows</span><button class="merger-remove-source" type="button" data-source-index="${index}" aria-label="Remove ${escapeHTML(source.name)} from the combined result">×</button></span>`).join("")}</div>
    <div class="merger-alignment-note"><strong>Combined preview</strong><span>Columns matched by exact heading text. New headings are added in first-seen order; missing fields stay blank.</span></div>
    <div class="editor-table-wrap merger-table-wrap" role="region" aria-label="Combined CSV table preview" tabindex="0"><table><thead><tr><th class="row-num-head" scope="col">#</th>${columns.map(header=>`<th scope="col">${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${visible.map((row,offset)=>`<tr><th scope="row" class="row-number">${start+offset+1}</th>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${columns.length+1}" class="no-results">No data rows to display.</td></tr>`}</tbody></table></div>
    <div class="viewer-pager"><span>Showing ${totalRows?start+1:0} to ${Math.min(start+visible.length,totalRows)} of ${totalRows.toLocaleString()} rows</span><div class="pager-buttons"><button id="combinerPrev" type="button" ${page<=1?"disabled":""} aria-label="Previous page">‹</button><b>Page ${page} of ${totalPages}</b><button id="combinerNext" type="button" ${page>=totalPages?"disabled":""} aria-label="Next page">›</button></div></div>
    </div>`;
  $("#combinerAddFiles").onclick=()=>$("#combinerMoreFiles").click();$("#combinerMoreFiles").onchange=event=>addFiles([...event.target.files]);
  $("#combinerDownload").onclick=()=>{if(sourceTables.length<2)return;const blob=new Blob(["\uFEFF",serializeCSV(combinedRows)],{type:"text/csv;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
  $("#combinerClear").onclick=()=>{sourceTables=[];combinedRows=[];fileName="combined.csv";page=1;$workspace.hidden=true;$uploadCard.hidden=false;$fileInput.value="";setStatus("")};
  $workspace.querySelectorAll(".merger-remove-source").forEach(button=>button.addEventListener("click",()=>{sourceTables.splice(Number(button.dataset.sourceIndex),1);page=1;if(!sourceTables.length){combinedRows=[];fileName="combined.csv";$workspace.hidden=true;$uploadCard.hidden=false;$fileInput.value="";setStatus("")}else{fileName=baseName(sourceTables[0].name)+"-combined.csv";render();setStatus(sourceTables.length<2?"One file remains. Add another file to combine.":"Source removed. Review the updated combined table.")}}));
  $("#combinerPrev").onclick=()=>{if(page>1){page--;render()}};$("#combinerNext").onclick=()=>{if(page<totalPages){page++;render()}};
}

async function addFiles(files){
  if(!files.length)return;
  if(files.some(file=>file.size>maxFileBytes)){setStatus("Each file must be 50 MB or smaller.",true);return}
  if(files.some(file=>!(/\.(csv|tsv|txt)$/i.test(file.name||"")||["text/csv","text/tab-separated-values","text/plain"].includes(file.type)))){setStatus("Choose CSV, TSV, or text files only.",true);return}
  setStatus("Reading files…");
  try{const parsed=await Promise.all(files.map(async file=>({name:file.name,rows:parseCSV(await file.text())})));if(parsed.some(file=>!file.rows.length))throw new Error("One or more selected files are empty.");sourceTables=[...sourceTables,...parsed];fileName=baseName(sourceTables[0].name)+"-combined.csv";page=1;render();setStatus(sourceTables.length<2?"One file loaded. Add at least one more file to combine.":sourceTables.length+" files combined. Review the table before downloading.");$fileInput.value="";requestAnimationFrame(()=>$workspace.scrollIntoView({behavior:"smooth",block:"start"}))}catch(error){setStatus(error.message||"Could not read one or more files.",true)}
}

$workspace.hidden=true;$("#combinerBrowse").onclick=()=>$fileInput.click();$fileInput.onchange=event=>addFiles([...event.target.files]);
$dropzone.addEventListener("click",event=>{if(event.target===$dropzone) $fileInput.click()});
["dragenter","dragover"].forEach(type=>$dropzone.addEventListener(type,event=>{event.preventDefault();$dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>$dropzone.addEventListener(type,event=>{event.preventDefault();$dropzone.classList.remove("drag")}));$dropzone.addEventListener("drop",event=>addFiles([...event.dataTransfer.files]));
$workspace.addEventListener("dragenter",event=>{if(Array.from(event.dataTransfer?.types||[]).includes("Files")){event.preventDefault();$workspace.classList.add("merger-drop-active")}});
$workspace.addEventListener("dragover",event=>{if(Array.from(event.dataTransfer?.types||[]).includes("Files")){event.preventDefault();event.dataTransfer.dropEffect="copy";$workspace.classList.add("merger-drop-active")}});
$workspace.addEventListener("dragleave",event=>{if(!$workspace.contains(event.relatedTarget))$workspace.classList.remove("merger-drop-active")});
$workspace.addEventListener("drop",event=>{event.preventDefault();$workspace.classList.remove("merger-drop-active");if(event.dataTransfer.files.length)addFiles([...event.dataTransfer.files])});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";document.body.classList.toggle("dark",dark);$("#combinerTheme")?.setAttribute("aria-pressed",String(dark));$("#combinerTheme")?.addEventListener("click",()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#combinerTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")});
$("#combinerMenu").onclick=()=>{const nav=$("#mainNav"),open=nav.classList.toggle("open");$("#combinerMenu").setAttribute("aria-expanded",String(open))};
