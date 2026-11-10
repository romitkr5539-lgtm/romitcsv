const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function detectDelimiter(text){
  const line=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(value=>value.trim())||"";
  const delimiters=[",",";","\t","|"];
  return delimiters.map(delimiter=>{
    let quoted=false,count=0;
    for(let i=0;i<line.length;i++){
      if(line[i]==='"'){
        if(quoted&&line[i+1]==='"'){i++;continue}
        quoted=!quoted;
      }else if(line[i]===delimiter&&!quoted)count++;
    }
    return [delimiter,count];
  }).sort((a,b)=>b[1]-a[1])[0][0];
}

function parseCSV(text){
  text=String(text||"").replace(/^\uFEFF/,"");
  if(!text.trim())return [];
  const delimiter=detectDelimiter(text),rows=[],row=[],cell=[];
  let quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(char==='"'){
      if(quoted&&next==='"'){cell.push('"');i++}
      else quoted=!quoted;
    }else if(char===delimiter&&!quoted){
      row.push(cell.join(""));cell.length=0;
    }else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&next==="\n")i++;
      row.push(cell.join(""));cell.length=0;
      rows.push(row.slice());
      row.length=0;
    }else cell.push(char);
  }
  if(quoted)throw new Error("A file has an unclosed quoted field. Check its CSV formatting.");
  if(cell.length||row.length){row.push(cell.join(""));rows.push(row.slice())}
  const width=rows.reduce((max,current)=>Math.max(max,current.length),0);
  return rows.map(current=>Array.from({length:width},(_,index)=>current[index]??""));
}

function serializeCSV(rows){
  return rows.map(row=>row.map(value=>{
    value=String(value??"");
    return /[",\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
  }).join(",")).join("\r\n");
}

const $mergerUploadCard=$("#mergerUploadCard");
const $mergerDropzone=$("#mergerDropzone");
const $mergerWorkspace=$("#mergerWorkspace");
const $mergerStatus=$("#mergerStatus");
const $alignByHeader=$("#alignByHeader");
const maxFileBytes=50*1024*1024;
const pageSize=10;
let sourceTables=[];
let mergedRows=[];
let fileName="merged.csv";
let page=1;

function setStatus(message,isError=false){
  $mergerStatus.textContent=message;
  $mergerStatus.classList.toggle("is-error",isError);
}

function makeHeaderKeys(headers){
  const counts=new Map();
  return headers.map((raw,index)=>{
    const name=String(raw??"");
    const base=name===""?"\u0000blank-column-"+index:name;
    const occurrence=counts.get(base)||0;
    counts.set(base,occurrence+1);
    return {key:base+"\u0001"+occurrence,label:name||"Column "+(index+1)};
  });
}

function combineSourceTables(tables){
  if(!tables.length)return [];
  if(!$alignByHeader.checked){
    const width=tables.reduce((max,file)=>file.rows.reduce((fileWidth,row)=>Math.max(fileWidth,row.length),max),0);
    const firstHeader=tables[0].rows[0]||[];
    const header=Array.from({length:width},(_,column)=>firstHeader[column]||"Column "+(column+1));
    const combined=[header];
    tables.forEach(file=>file.rows.slice(1).forEach(row=>combined.push(Array.from({length:width},(_,column)=>row[column]??""))));
    return combined;
  }
  const descriptors=tables.map(file=>makeHeaderKeys(file.rows[0]||[]));
  const headerPositions=new Map(),headers=[];
  descriptors.forEach(columns=>columns.forEach(column=>{
    if(!headerPositions.has(column.key)){headerPositions.set(column.key,headers.length);headers.push(column.label)}
  }));
  const combined=[headers];
  tables.forEach((file,fileIndex)=>{
    const positions=descriptors[fileIndex].map(column=>headerPositions.get(column.key));
    file.rows.slice(1).forEach(row=>{
      const output=Array(headers.length).fill("");
      positions.forEach((target,index)=>{output[target]=row[index]??""});
      combined.push(output);
    });
  });
  return combined;
}

function rowsIn(file){return Math.max(0,file.rows.length-1)}

function render(){
  if(!sourceTables.length){$mergerWorkspace.hidden=true;return}
  mergedRows=combineSourceTables(sourceTables);
  const totalRows=Math.max(0,mergedRows.length-1);
  const totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
  page=Math.min(page,totalPages);
  const start=(page-1)*pageSize;
  const visible=mergedRows.slice(start+1,start+1+pageSize);
  const canDownload=sourceTables.length>=2;
  const alignment=$alignByHeader.checked?"Columns matched by exact heading text. New headings are added in first-seen order; missing values stay blank.":"Columns combined by position. The first file supplies the headings.";
  $mergerUploadCard.hidden=true;
  $mergerWorkspace.hidden=false;
  $mergerWorkspace.innerHTML=`
    <div class="merger-data-card">
      <div class="merger-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>CSV</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${sourceTables.length} ${sourceTables.length===1?"file":"files"} · ${totalRows.toLocaleString()} rows · ${mergedRows[0]?.length||0} columns</span></div></div>
        <div class="merger-actions"><button class="viewer-edit" id="addMoreFiles" type="button">Add more files</button><input id="mergerMoreFiles" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" multiple hidden><button class="viewer-download" id="mergeDownload" type="button" ${canDownload?"":"disabled title=\"Add at least one more file to enable download\""}>Download Merged CSV</button><button class="viewer-clear" id="clearMerger" type="button">Clear</button></div>
      </div>
      <div class="merger-sources" aria-label="Files included in the merge">${sourceTables.map((source,index)=>`<span class="merger-source"><span title="${escapeHTML(source.name)}">${escapeHTML(source.name)} · ${rowsIn(source).toLocaleString()} rows</span><button class="merger-remove-source" type="button" data-source-index="${index}" aria-label="Remove ${escapeHTML(source.name)} from the merge">×</button></span>`).join("")}</div>
      <div class="merger-alignment-note"><strong>${canDownload?"Merge preview":"One file loaded"}</strong><span>${canDownload?escapeHTML(alignment):"Add at least one more file to combine data and enable the download."}</span></div>
      <div class="editor-table-wrap merger-table-wrap" role="region" aria-label="Merged CSV table preview" tabindex="0"><table><thead><tr><th class="row-num-head" scope="col">#</th>${(mergedRows[0]||[]).map(header=>`<th scope="col">${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${visible.map((row,offset)=>`<tr><th scope="row" class="row-number">${start+offset+1}</th>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${(mergedRows[0]?.length||0)+1}" class="no-results">No data rows to display.</td></tr>`}</tbody></table></div>
      <div class="viewer-pager"><span>Showing ${totalRows?start+1:0} to ${Math.min(start+visible.length,totalRows)} of ${totalRows.toLocaleString()} rows</span><div class="pager-buttons"><button id="mergerPrev" type="button" ${page<=1?"disabled":""} aria-label="Previous page">‹</button><b>Page ${page} of ${totalPages}</b><button id="mergerNext" type="button" ${page>=totalPages?"disabled":""} aria-label="Next page">›</button></div></div>
    </div>`;
  $("#addMoreFiles").onclick=()=>$("#mergerMoreFiles").click();
  $("#mergerMoreFiles").onchange=event=>mergeFiles([...event.target.files],true);
  $("#mergeDownload").onclick=()=>{
    if(!canDownload)return;
    const link=document.createElement("a"),blob=new Blob(["\uFEFF",serializeCSV(mergedRows)],{type:"text/csv;charset=utf-8"});
    link.href=URL.createObjectURL(blob);link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $("#clearMerger").onclick=()=>{sourceTables=[];mergedRows=[];fileName="merged.csv";page=1;$mergerWorkspace.hidden=true;$mergerUploadCard.hidden=false;$("#mergerFiles").value="";setStatus("")};
  $mergerWorkspace.querySelectorAll(".merger-remove-source").forEach(button=>button.addEventListener("click",()=>{
    const index=Number(button.dataset.sourceIndex);sourceTables.splice(index,1);page=1;
    if(!sourceTables.length){mergedRows=[];fileName="merged.csv";$mergerWorkspace.hidden=true;$mergerUploadCard.hidden=false;$("#mergerFiles").value="";setStatus("")}
    else{fileName=sourceTables[0].name.replace(/\.(csv|tsv|txt)$/i,"")+"-merged.csv";render();if(sourceTables.length===1)setStatus("One file remains. Add another file to merge.")}
  }));
  $("#mergerPrev").onclick=()=>{if(page>1){page--;render()}};
  $("#mergerNext").onclick=()=>{if(page<totalPages){page++;render()}};
}

async function mergeFiles(files,append=false){
  if(!files.length)return;
  if(files.some(file=>file.size>maxFileBytes)){setStatus("Each file must be 50 MB or smaller.",true);return}
  if(files.some(file=>!(/\.(csv|tsv|txt)$/i.test(file.name||"")||["text/csv","text/tab-separated-values","text/plain"].includes(file.type)))){setStatus("Choose CSV, TSV, or text files only.",true);return}
  try{
    const parsed=await Promise.all(files.map(async file=>({name:file.name,rows:parseCSV(await file.text())})));
    if(parsed.some(file=>!file.rows.length)){setStatus("One or more selected files are empty.",true);return}
    sourceTables=append?[...sourceTables,...parsed]:parsed;
    fileName=sourceTables[0].name.replace(/\.(csv|tsv|txt)$/i,"")+"-merged.csv";
    page=1;render();
    setStatus(sourceTables.length<2?"One file loaded. Add at least one more file to merge.":sourceTables.length+" files combined. Review the preview before downloading.");
    $("#mergerFiles").value="";
    requestAnimationFrame(()=>$mergerWorkspace.scrollIntoView({behavior:"smooth",block:"start"}));
  }catch(error){console.error(error);setStatus(error.message||"Could not read one or more CSV files.",true)}
}

$mergerWorkspace.hidden=true;
$("#mergerBrowse").onclick=()=>$("#mergerFiles").click();
$("#mergerFiles").onchange=event=>mergeFiles([...event.target.files],sourceTables.length>0);
$mergerDropzone.addEventListener("click",event=>{if(event.target===$mergerDropzone)$("#mergerFiles").click()});
["dragenter","dragover"].forEach(type=>$mergerDropzone.addEventListener(type,event=>{event.preventDefault();$mergerDropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>$mergerDropzone.addEventListener(type,event=>{event.preventDefault();$mergerDropzone.classList.remove("drag")}));
$mergerDropzone.addEventListener("drop",event=>mergeFiles([...event.dataTransfer.files]));
$mergerWorkspace.addEventListener("dragenter",event=>{if(Array.from(event.dataTransfer?.types||[]).includes("Files")){event.preventDefault();$mergerWorkspace.classList.add("merger-drop-active")}});
$mergerWorkspace.addEventListener("dragover",event=>{if(Array.from(event.dataTransfer?.types||[]).includes("Files")){event.preventDefault();event.dataTransfer.dropEffect="copy";$mergerWorkspace.classList.add("merger-drop-active")}});
$mergerWorkspace.addEventListener("dragleave",event=>{if(!$mergerWorkspace.contains(event.relatedTarget))$mergerWorkspace.classList.remove("merger-drop-active")});
$mergerWorkspace.addEventListener("drop",event=>{event.preventDefault();$mergerWorkspace.classList.remove("merger-drop-active");const files=[...event.dataTransfer.files];if(files.length)mergeFiles(files,true)});
$alignByHeader.addEventListener("change",()=>{if(sourceTables.length){page=1;render();setStatus("Column matching changed. Review the updated merge preview.")}});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#mergerTheme").setAttribute("aria-pressed",String(dark));
$("#mergerTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#mergerTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#mergerMenu").onclick=()=>{const nav=$("#mergerNav"),open=nav.classList.toggle("open");$("#mergerMenu").setAttribute("aria-expanded",String(open))};
