const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function detectDelimiter(text){
  const first=text.replace(/^\uFEFF/,"").split(/\r?\n/).find(line=>line.trim())||"";
  const candidates=[",",";","\t","|"];
  return candidates.map(delimiter=>{let count=0,quoted=false;for(let i=0;i<first.length;i++){const char=first[i];if(char==='"'){if(quoted&&first[i+1]==='"')i++;else quoted=!quoted}else if(char===delimiter&&!quoted)count++}return [delimiter,count]}).sort((a,b)=>b[1]-a[1])[0][0];
}

function parseCSV(text){
  text=String(text||"").replace(/^\uFEFF/,"");
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
      if(row.length)rows.push(row.slice());
      row.length=0;
    }else cell.push(char);
  }
  if(quoted)throw new Error("This file has an unfinished quoted field.");
  if(cell.length||row.length){
    row.push(cell.join(""));
    rows.push(row.slice());
  }
  const width=rows.reduce((max,current)=>Math.max(max,current.length),0);
  return rows.map(current=>Array.from({length:width},(_,index)=>current[index]??""));
}

function serializeCSV(rows){
  return rows.map(row=>row.map(value=>{
    value=String(value??"");
    return /[",\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
  }).join(",")).join("\r\n");
}

function cleanRows(source,options){
  let rows=source.map(row=>row.map(value=>options.trim?value.trim():value));
  let blankRowsRemoved=0,duplicateRowsRemoved=0,columnsRemoved=0;
  const header=rows[0]||[];
  let data=rows.slice(1);
  if(options.removeBlank){
    const kept=data.filter(row=>row.some(value=>value.trim()));
    blankRowsRemoved=data.length-kept.length;data=kept;
  }
  if(options.removeDuplicates){
    const seen=new Set();
    data=data.filter(row=>{
      const key=JSON.stringify(row);
      if(seen.has(key)){duplicateRowsRemoved++;return false}
      seen.add(key);return true;
    });
  }
  rows=[header,...data];
  if(options.removeEmptyColumns&&header.length){
    const dataRows=rows.slice(1);
    const keep=header.map((_,column)=>dataRows.some(row=>String(row[column]??"").trim()!==""));
    if(keep.some(Boolean)){
      columnsRemoved=keep.filter(value=>!value).length;
      rows=rows.map(row=>row.filter((_,column)=>keep[column]));
    }
  }
  return {rows,blankRowsRemoved,duplicateRowsRemoved,columnsRemoved};
}

const uploadCard=$("#cleanerUploadCard");
const dropzone=$("#cleanerDropzone");
const workspace=$("#cleanerWorkspace");
const options={trim:true,removeBlank:true,removeDuplicates:true,removeEmptyColumns:false};
let sourceRows=[
  ["Name","Email","City","Notes","Unused"],
  [" Ada Lovelace ","ada@example.com","London","  Trim this cell  ",""],
  ["Grace Hopper","grace@example.com","New York","Compiler pioneer",""],
  ["Grace Hopper","grace@example.com","New York","Compiler pioneer",""],
  ["   ","","","",""],
  ["Alan Turing","alan@example.com",""," ",""]
];
let cleanedRows=sourceRows.map(row=>row.slice());
let fileName="sample_data.csv";
let result=null;
let page=1;
const pageSize=10;

function render(){
  const shown=result?.rows||sourceRows;
  const totalRows=Math.max(0,shown.length-1);
  const totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
  page=Math.min(page,totalPages);
  const start=(page-1)*pageSize;
  const visible=shown.slice(start+1,start+1+pageSize);
  workspace.hidden=false;
  workspace.innerHTML=`
    <div class="cleaner-data-card">
      <div class="cleaner-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>CSV</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${Math.max(0,sourceRows.length-1).toLocaleString()} source rows · ${sourceRows[0]?.length||0} columns</span></div></div>
        <div class="cleaner-actions"><button class="viewer-primary" id="runClean" type="button">${result?"Clean Again":"Clean CSV"}</button><button class="viewer-download" id="downloadCleaned" type="button" ${result?"":"disabled"}>Download Cleaned CSV</button><button class="viewer-clear" id="clearCleaner" type="button">Clear</button></div>
      </div>
      <div class="cleaner-options" aria-label="Cleaning options">
        <label><input type="checkbox" data-option="trim" ${options.trim?"checked":""}> Trim cell whitespace</label>
        <label><input type="checkbox" data-option="removeBlank" ${options.removeBlank?"checked":""}> Remove blank rows</label>
        <label><input type="checkbox" data-option="removeDuplicates" ${options.removeDuplicates?"checked":""}> Remove duplicate rows</label>
        <label><input type="checkbox" data-option="removeEmptyColumns" ${options.removeEmptyColumns?"checked":""}> Remove empty columns</label>
      </div>
      ${result?`<div class="cleaner-stats"><div><strong>${(sourceRows.length-1).toLocaleString()}</strong><span>Rows before</span></div><div><strong>${(result.rows.length-1).toLocaleString()}</strong><span>Rows after</span></div><div><strong>${result.duplicateRowsRemoved.toLocaleString()}</strong><span>Duplicates removed</span></div><div><strong>${result.blankRowsRemoved.toLocaleString()}</strong><span>Blank rows removed</span></div><div><strong>${result.columnsRemoved.toLocaleString()}</strong><span>Empty columns removed</span></div></div>`:""}
      <div class="editor-table-wrap cleaner-table-wrap"><table><thead><tr><th class="row-num-head">#</th>${(shown[0]||[]).map(header=>`<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${visible.map((row,offset)=>`<tr><td class="row-number">${start+offset+1}</td>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${(shown[0]?.length||0)+1}" class="no-results">No rows to display.</td></tr>`}</tbody></table></div>
      <div class="viewer-pager"><span>Showing ${totalRows?start+1:0} to ${Math.min(start+visible.length,totalRows)} of ${totalRows.toLocaleString()} rows${result?" after cleaning":""}</span><div class="pager-buttons"><button id="cleanerPrev" type="button" ${page<=1?"disabled":""}>‹</button><b>Page ${page} of ${totalPages}</b><button id="cleanerNext" type="button" ${page>=totalPages?"disabled":""}>›</button></div></div>
    </div>`;

  workspace.querySelectorAll("[data-option]").forEach(input=>input.onchange=()=>{options[input.dataset.option]=input.checked;if(result){result=null;cleanedRows=sourceRows.map(row=>row.slice());page=1;render()}});
  $("#runClean").onclick=()=>{result=cleanRows(sourceRows,options);cleanedRows=result.rows;page=1;render()};
  $("#downloadCleaned").onclick=()=>{
    if(!result)return;
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([serializeCSV(cleanedRows)],{type:"text/csv;charset=utf-8"}));link.download=fileName.replace(/\.(csv|tsv)$/i,"")+"-cleaned.csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $("#clearCleaner").onclick=()=>{sourceRows=[];cleanedRows=[];result=null;fileName="data.csv";workspace.hidden=true;uploadCard.hidden=false;$("#cleanerFile").value="";$("#cleanerStatus").textContent=""};
  $("#cleanerPrev").onclick=()=>{if(page>1){page--;render()}};
  $("#cleanerNext").onclick=()=>{if(page<totalPages){page++;render()}};
}

function openText(text,name){
  const parsed=parseCSV(text);
  if(!parsed.length||parsed.every(row=>row.every(value=>!value.trim()))){$("#cleanerStatus").textContent="This CSV file is empty.";return}
  sourceRows=parsed;fileName=name||"data.csv";result=null;cleanedRows=sourceRows.map(row=>row.slice());page=1;uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

render();
$("#cleanerBrowse").onclick=()=>$("#cleanerFile").click();
$("#cleanerFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#cleanerStatus").textContent="This file is larger than 50MB.";return}if(!/\.(csv|tsv)$/i.test(file.name||"")&&!["text/csv","text/tab-separated-values","application/vnd.ms-excel"].includes(file.type)){$("#cleanerStatus").textContent="Choose a CSV or TSV file.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#cleanerStatus").textContent="Could not read this CSV file."}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#cleanerStatus").textContent="This file is larger than 50MB.";return}if(!/\.(csv|tsv)$/i.test(file.name||"")&&!["text/csv","text/tab-separated-values","application/vnd.ms-excel"].includes(file.type)){$("#cleanerStatus").textContent="Choose a CSV or TSV file.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#cleanerStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#cleanerTheme").setAttribute("aria-pressed",String(dark));
$("#cleanerTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#cleanerTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#cleanerMenu").onclick=()=>{const open=$("#cleanerNav").classList.toggle("open");$("#cleanerMenu").setAttribute("aria-expanded",String(open))};
