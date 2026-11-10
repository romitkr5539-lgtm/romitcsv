const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function detectDelimiter(text){
  const first=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(line=>line.trim())||"";
  return [",",";","\t","|"].map(delimiter=>{
    let quoted=false,count=0;
    for(let i=0;i<first.length;i++){
      if(first[i]==='"'){
        if(quoted&&first[i+1]==='"'){i++;continue}
        quoted=!quoted;
      }else if(first[i]===delimiter&&!quoted)count++;
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
      row.push(cell.join(""));cell.length=0;rows.push(row.slice());row.length=0;
    }else cell.push(char);
  }
  if(quoted)throw new Error("The CSV has an unclosed quoted field. Check the file formatting and try again.");
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

function makeParts(rows,rowLimit,repeatHeader){
  const header=rows[0]||[],data=rows.slice(1),parts=[];
  for(let start=0;start<data.length;start+=rowLimit){
    const chunk=data.slice(start,start+rowLimit),includeHeader=start===0||repeatHeader;
    parts.push({start:start+1,dataRows:chunk.length,includeHeader,rows:includeHeader?[header,...chunk]:chunk});
  }
  return parts;
}

function crc32(bytes){
  let crc=0xffffffff;
  for(let i=0;i<bytes.length;i++){
    crc^=bytes[i];
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

function createZip(files){
  const encoder=new TextEncoder(),localChunks=[],centralChunks=[];
  let offset=0;
  files.forEach(file=>{
    const name=encoder.encode(file.name),data=encoder.encode("\uFEFF"+serializeCSV(file.rows)),checksum=crc32(data);
    const local=new Uint8Array(30+name.length+data.length),localView=new DataView(local.buffer);
    localView.setUint32(0,0x04034b50,true);localView.setUint16(4,20,true);localView.setUint16(6,0x0800,true);localView.setUint16(8,0,true);localView.setUint16(10,0,true);localView.setUint16(12,0x0021,true);localView.setUint32(14,checksum,true);localView.setUint32(18,data.length,true);localView.setUint32(22,data.length,true);localView.setUint16(26,name.length,true);localView.setUint16(28,0,true);local.set(name,30);local.set(data,30+name.length);localChunks.push(local);
    const central=new Uint8Array(46+name.length),centralView=new DataView(central.buffer);
    centralView.setUint32(0,0x02014b50,true);centralView.setUint16(4,20,true);centralView.setUint16(6,20,true);centralView.setUint16(8,0x0800,true);centralView.setUint16(10,0,true);centralView.setUint16(12,0,true);centralView.setUint16(14,0x0021,true);centralView.setUint32(16,checksum,true);centralView.setUint32(20,data.length,true);centralView.setUint32(24,data.length,true);centralView.setUint16(28,name.length,true);centralView.setUint16(30,0,true);centralView.setUint16(32,0,true);centralView.setUint16(34,0,true);centralView.setUint16(36,0,true);centralView.setUint32(38,0,true);centralView.setUint32(42,offset,true);central.set(name,46);centralChunks.push(central);
    offset+=local.length;
  });
  const centralSize=centralChunks.reduce((sum,chunk)=>sum+chunk.length,0),end=new Uint8Array(22),endView=new DataView(end.buffer);
  endView.setUint32(0,0x06054b50,true);endView.setUint16(4,0,true);endView.setUint16(6,0,true);endView.setUint16(8,files.length,true);endView.setUint16(10,files.length,true);endView.setUint32(12,centralSize,true);endView.setUint32(16,offset,true);endView.setUint16(20,0,true);
  return new Blob([...localChunks,...centralChunks,end],{type:"application/zip"});
}

const $splitterUploadCard=$("#splitterUploadCard"),$splitterDropzone=$("#splitterDropzone"),$splitterWorkspace=$("#splitterWorkspace"),$splitterStatus=$("#splitterStatus");
const maxFileBytes=50*1024*1024,maxParts=10000,previewLimit=100;
let rows=[],fileName="data.csv",rowLimit=10000,repeatHeader=true,parts=[],currentPart=0;

function setStatus(message,isError=false){$splitterStatus.textContent=message;$splitterStatus.classList.toggle("is-error",isError)}
function csvBaseName(name){return String(name||"data.csv").replace(/\.(csv|tsv|txt)$/i,"").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_")||"data"}

function render(){
  if(!parts.length){$splitterWorkspace.hidden=true;return}
  currentPart=Math.min(currentPart,parts.length-1);
  const part=parts[currentPart],header=rows[0]||[],previewRows=(part.includeHeader?part.rows.slice(1):part.rows).slice(0,previewLimit),dataCount=Math.max(0,rows.length-1),previewStart=Math.min(part.dataRows,previewLimit);
  $splitterWorkspace.hidden=false;
  $splitterWorkspace.innerHTML=`
    <div class="splitter-data-card">
      <div class="splitter-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>CSV</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${dataCount.toLocaleString()} data rows · ${header.length} columns · ${parts.length.toLocaleString()} ${parts.length===1?"part":"parts"}</span></div></div>
        <div class="splitter-actions"><button class="viewer-edit" id="changeSplitterFile" type="button">Choose another file</button><button class="viewer-clear" id="clearSplitter" type="button">Clear</button></div>
      </div>
      <div class="splitter-controls">
        <label>Data rows per part <input id="rowsPerPart" type="number" min="1" step="1" value="${rowLimit}" inputmode="numeric"></label>
        <label class="splitter-header-option"><input id="repeatHeader" type="checkbox" ${repeatHeader?"checked":""}> Repeat header in later parts</label>
        <button class="viewer-primary" id="runSplit" type="button">Split CSV</button>
        <span id="splitterError" class="splitter-error" role="status" hidden></span>
      </div>
      <div class="splitter-partbar">
        <label>Preview part
          <select id="partSelect">${parts.map((item,index)=>`<option value="${index}" ${index===currentPart?"selected":""}>Part ${index+1} · ${item.dataRows.toLocaleString()} rows</option>`).join("")}</select>
        </label>
        <span>Data rows ${part.start}–${part.start+part.dataRows-1} of ${dataCount.toLocaleString()}</span>
        <div class="splitter-downloads"><button class="viewer-download" id="downloadPart" type="button">Download Part ${currentPart+1}</button><button class="viewer-primary" id="downloadAllParts" type="button">Download all parts (ZIP)</button></div>
      </div>
      <p class="splitter-preview-note">Showing ${previewStart.toLocaleString()} of ${part.dataRows.toLocaleString()} data rows in this part. The downloads include every row.</p>
      <div class="editor-table-wrap splitter-table-wrap" role="region" aria-label="Part ${currentPart+1} CSV table preview" tabindex="0"><table><thead><tr><th class="row-num-head" scope="col">#</th>${header.map((column,index)=>`<th scope="col">${escapeHTML(column||"Column "+(index+1))}</th>`).join("")}</tr></thead><tbody>${previewRows.map((row,index)=>`<tr><th scope="row" class="row-number">${part.start+index}</th>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${header.length+1}" class="no-results">This part contains no data rows.</td></tr>`}</tbody></table></div>
      <div class="viewer-pager"><span>Part ${currentPart+1} of ${parts.length}</span><div class="pager-buttons"><button id="splitterPrev" type="button" ${currentPart<=0?"disabled":""} aria-label="Previous part">‹</button><b>${currentPart+1}</b><button id="splitterNext" type="button" ${currentPart>=parts.length-1?"disabled":""} aria-label="Next part">›</button></div></div>
    </div>`;
  $("#rowsPerPart").value=String(rowLimit);
  $("#rowsPerPart").onchange=event=>{rowLimit=Number(event.target.value)};
  $("#repeatHeader").onchange=event=>{repeatHeader=event.target.checked};
  $("#runSplit").onclick=()=>{
    const requested=Number($("#rowsPerPart").value),error=$("#splitterError");
    if(!Number.isInteger(requested)||requested<1){error.textContent="Enter a whole-number row limit of at least 1.";error.hidden=false;return}
    if(Math.ceil(dataCount/requested)>maxParts){error.textContent="This would create more than 10,000 parts. Increase the rows per part.";error.hidden=false;return}
    error.hidden=true;rowLimit=requested;repeatHeader=$("#repeatHeader").checked;parts=makeParts(rows,rowLimit,repeatHeader);currentPart=0;render();
    setStatus("Split into "+parts.length.toLocaleString()+" "+(parts.length===1?"part":"parts")+". Review a part or download the ZIP.");
  };
  $("#partSelect").onchange=event=>{currentPart=Number(event.target.value);render()};
  $("#downloadPart").onclick=()=>{
    const link=document.createElement("a"),blob=new Blob(["\uFEFF",serializeCSV(part.rows)],{type:"text/csv;charset=utf-8"});
    link.href=URL.createObjectURL(blob);link.download=csvBaseName(fileName)+"-part-"+String(currentPart+1).padStart(3,"0")+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $("#downloadAllParts").onclick=()=>{
    if(parts.length>65535){setStatus("This ZIP format supports up to 65,535 files.",true);return}
    const zip=createZip(parts.map((item,index)=>({name:csvBaseName(fileName)+"-part-"+String(index+1).padStart(3,"0")+".csv",rows:item.rows}))),link=document.createElement("a");
    link.href=URL.createObjectURL(zip);link.download=csvBaseName(fileName)+"-parts.zip";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1500);
  };
  $("#changeSplitterFile").onclick=()=>{$("#splitterFile").value="";$("#splitterFile").click()};
  $("#clearSplitter").onclick=()=>{rows=[];parts=[];fileName="data.csv";rowLimit=10000;repeatHeader=true;currentPart=0;$splitterWorkspace.hidden=true;$splitterUploadCard.hidden=false;$("#splitterFile").value="";setStatus("")};
  $("#splitterPrev").onclick=()=>{if(currentPart>0){currentPart--;render()}};
  $("#splitterNext").onclick=()=>{if(currentPart<parts.length-1){currentPart++;render()}};
}

function openText(text,name){
  const parsed=parseCSV(text);
  if(!parsed.length)throw new Error("This file is empty.");
  if(parsed.length<2)throw new Error("This file has a header but no data rows to split.");
  const dataCount=parsed.length-1,minRowsPerPart=Math.ceil(dataCount/maxParts);
  rowLimit=Math.max(minRowsPerPart,Math.min(rowLimit,dataCount));
  rows=parsed;fileName=name||"data.csv";parts=makeParts(rows,rowLimit,repeatHeader);currentPart=0;$splitterUploadCard.hidden=true;render();
  setStatus("Loaded "+fileName+". Choose the rows per part, then select Split CSV.");
  requestAnimationFrame(()=> $splitterWorkspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

async function loadFile(file){
  if(!file)return;
  if(file.size>50*1024*1024){setStatus("This file is larger than 50 MB.",true);return}
  if(!(/\.(csv|tsv|txt)$/i.test(file.name||"")||["text/csv","text/tab-separated-values","text/plain"].includes(file.type))){setStatus("Choose a CSV, TSV, or text file.",true);return}
  try{openText(await file.text(),file.name)}catch(error){setStatus(error.message||"Could not read this CSV file.",true)}
}

$splitterWorkspace.hidden=true;
$("#splitterBrowse").onclick=()=>$("#splitterFile").click();
$("#splitterFile").onchange=event=>{const file=event.target.files?.[0];if(file)loadFile(file)};
["dragenter","dragover"].forEach(type=>$splitterDropzone.addEventListener(type,event=>{event.preventDefault();$splitterDropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>$splitterDropzone.addEventListener(type,event=>{event.preventDefault();$splitterDropzone.classList.remove("drag")}));
$splitterDropzone.addEventListener("drop",event=>loadFile(event.dataTransfer?.files?.[0]));

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#splitterTheme").setAttribute("aria-pressed",String(dark));
$("#splitterTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#splitterTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#splitterMenu").onclick=()=>{const nav=$("#splitterNav"),open=nav.classList.toggle("open");$("#splitterMenu").setAttribute("aria-expanded",String(open))};
