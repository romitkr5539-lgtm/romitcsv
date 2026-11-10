const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function detectDelimiter(text){
  const first=text.replace(/^\uFEFF/,"").split(/\r?\n/).find(line=>line.trim())||"";
  return [",",";","\t","|"].map(delimiter=>[delimiter,first.split(delimiter).length-1]).sort((a,b)=>b[1]-a[1])[0][0];
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
      if(row.some(value=>value.trim()))rows.push(row.slice());
      row.length=0;
    }else cell.push(char);
  }
  if(cell.length||row.length){
    row.push(cell.join(""));
    if(row.some(value=>value.trim()))rows.push(row.slice());
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

function downloadCSV(name,rows){
  const link=document.createElement("a");
  link.href=URL.createObjectURL(new Blob([serializeCSV(rows)],{type:"text/csv;charset=utf-8"}));
  link.download=name.replace(/\.(csv|tsv)$/i,"")+".csv";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}

const uploadCard=$("#editorUploadCard");
const dropzone=$("#editorDropzone");
const workspace=$("#editorWorkspace");
let rows=[
  ["ID","Name","Email","Age","City"],
  ["1","John Doe","john@example.com","28","New York"],
  ["2","Jane Smith","jane@example.com","32","London"],
  ["3","Mike Johnson","mike@example.com","24","Paris"],
  ["4","Emily Brown","emily@example.com","29","Berlin"],
  ["5","David Wilson","david@example.com","33","Tokyo"]
];
let fileName="sample_data.csv";
let page=1;
const pageSize=25;

function render(){
  const headers=rows[0]||[];
  const totalRows=Math.max(0,rows.length-1);
  const totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
  page=Math.min(page,totalPages);
  const start=(page-1)*pageSize;
  const visible=rows.slice(start+1,start+1+pageSize);
  workspace.hidden=false;
  workspace.innerHTML=`
    <div class="editor-data-card">
      <div class="editor-filebar">
        <div class="viewer-fileinfo">
          <div class="viewer-fileicon"><span>CSV</span></div>
          <div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${totalRows.toLocaleString()} rows · ${headers.length} columns</span></div>
        </div>
        <div class="editor-actions">
          <button class="viewer-download" id="saveEditedCsv" type="button">Download CSV</button>
          <button class="viewer-edit" id="addEditorRow" type="button">Add row</button>
          <button class="viewer-edit" id="addEditorColumn" type="button">Add column</button>
          <button class="viewer-clear" id="clearEditor" type="button">Clear</button>
        </div>
      </div>
      <div class="editor-table-wrap">
        <table>
          <thead><tr><th class="row-num-head">#</th>${headers.map((header,column)=>`<th><div class="csv-heading-editor"><textarea class="csv-cell" data-row="0" data-col="${column}" rows="1" aria-label="Column ${column+1} name">${escapeHTML(header)}</textarea><button class="delete-column" data-col="${column}" type="button" aria-label="Delete column ${column+1}" ${headers.length===1?"disabled":""}>×</button></div></th>`).join("")}<th class="row-action-head">Actions</th></tr></thead>
          <tbody>${visible.map((row,offset)=>{
            const rowIndex=start+offset+1;
            return `<tr><td class="row-number">${rowIndex}</td>${row.map((value,column)=>`<td><textarea class="csv-cell" data-row="${rowIndex}" data-col="${column}" rows="1" aria-label="Row ${rowIndex}, column ${column+1}">${escapeHTML(value)}</textarea></td>`).join("")}<td class="row-action"><button class="delete-row" data-row="${rowIndex}" type="button" aria-label="Delete row ${rowIndex}">×</button></td></tr>`;
          }).join("")||`<tr><td colspan="${headers.length+2}" class="no-results">No data rows. Add a row to begin editing.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="viewer-pager"><span>Showing ${totalRows?start+1:0} to ${Math.min(start+visible.length,totalRows)} of ${totalRows.toLocaleString()} rows</span><div class="pager-buttons"><button id="editorPrev" type="button" ${page<=1?"disabled":""}>‹</button><b>${page}</b><button id="editorNext" type="button" ${page>=totalPages?"disabled":""}>›</button></div></div>
    </div>`;

  workspace.querySelectorAll(".csv-cell").forEach(input=>{
    const resize=()=>{input.style.height="auto";input.style.height=input.scrollHeight+"px"};
    resize();
    input.oninput=()=>{
      rows[Number(input.dataset.row)][Number(input.dataset.col)]=input.value;
      resize();
    };
  });
  $("#saveEditedCsv").onclick=()=>downloadCSV(fileName,rows);
  $("#clearEditor").onclick=()=>{
    rows=[["Column 1"]];fileName="data.csv";page=1;
    workspace.hidden=true;uploadCard.hidden=false;$("#editorFile").value="";$("#editorStatus").textContent="";
  };
  $("#addEditorRow").onclick=()=>{rows.push(Array(headers.length).fill(""));page=Math.max(1,Math.ceil((rows.length-1)/pageSize));render()};
  $("#addEditorColumn").onclick=()=>{rows[0].push("Column "+(headers.length+1));rows.slice(1).forEach(row=>row.push(""));render()};
  workspace.querySelectorAll(".delete-row").forEach(button=>button.onclick=()=>{rows.splice(Number(button.dataset.row),1);page=Math.min(page,Math.max(1,Math.ceil((rows.length-1)/pageSize)));render()});
  workspace.querySelectorAll(".delete-column").forEach(button=>button.onclick=()=>{const column=Number(button.dataset.col);rows.forEach(row=>row.splice(column,1));render()});
  $("#editorPrev").onclick=()=>{if(page>1){page--;render()}};
  $("#editorNext").onclick=()=>{if(page<totalPages){page++;render()}};
}

function openText(text,name){
  const parsed=parseCSV(text);
  if(!parsed.length||parsed.length===1&&parsed[0].length===1&&!parsed[0][0].trim()){
    $("#editorStatus").textContent="This CSV file is empty.";
    return;
  }
  rows=parsed;fileName=name||"data.csv";page=1;
  uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

const transferred=sessionStorage.getItem("romitcsv.editorData");
if(transferred){
  try{
    const parsed=JSON.parse(transferred);
    if(Array.isArray(parsed)&&parsed.length&&parsed.every(Array.isArray)){
      rows=parsed.map(row=>row.map(value=>String(value??"")));
      fileName=sessionStorage.getItem("romitcsv.editorFileName")||"data.csv";
      uploadCard.hidden=true;
    }
  }catch(error){console.error(error)}
  sessionStorage.removeItem("romitcsv.editorData");
  sessionStorage.removeItem("romitcsv.editorFileName");
  sessionStorage.removeItem("romitcsv.editorFileBytes");
}
render();

$("#editorBrowse").onclick=()=>$("#editorFile").click();
$("#editorFile").onchange=async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  if(file.size>50*1024*1024){$("#editorStatus").textContent="This file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#editorStatus").textContent="Could not read this CSV file."}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];
  if(!file)return;
  if(file.size>50*1024*1024){$("#editorStatus").textContent="This file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#editorStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#editorTheme").setAttribute("aria-pressed",String(dark));
$("#editorTheme").onclick=()=>{
  const nextDark=!document.body.classList.contains("dark");
  document.body.classList.toggle("dark",nextDark);
  $("#editorTheme").setAttribute("aria-pressed",String(nextDark));
  localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light");
};
$("#editorMenu").onclick=()=>{const open=$("#editorNav").classList.toggle("open");$("#editorMenu").setAttribute("aria-expanded",String(open))};
