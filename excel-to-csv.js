const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function csvEscape(value,delimiter){
  value=String(value??"");
  const pattern=new RegExp('["\\r\\n'+delimiter.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+']');
  return pattern.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
}

const uploadCard=$("#excelCsvUploadCard");
const dropzone=$("#excelCsvDropzone");
const workspace=$("#excelCsvWorkspace");
const workspaceSection=$("#excelCsvWorkspaceSection");
let workbook=null;
let sheetNames=[];
let selectedSheet="";
let rows=[];
let fileName="workbook.xlsx";
let delimiter=",";
let csvOutput="";

function readSheet(name){
  if(!workbook||!workbook.Sheets[name])return [];
  const data=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:"",raw:false,blankrows:false});
  const width=data.reduce((max,row)=>Math.max(max,row.length),0);
  return data.map(row=>Array.from({length:width},(_,index)=>row[index]??""));
}

function serializeRows(data){
  return data.map(row=>row.map(value=>csvEscape(value,delimiter)).join(delimiter)).join("\r\n");
}

function render(){
  csvOutput=serializeRows(rows);
  const rowCount=rows.length;
  const columnCount=rows.reduce((max,row)=>Math.max(max,row.length),0);
  const dataRows=rows.slice(1);
  const delimiterOptions=[[",","Comma (,)"],[";","Semicolon (;)"],["\t","Tab"],["|","Pipe (|)"]];
  workspace.hidden=false;
  workspaceSection.hidden=false;
  workspace.innerHTML=`
    <div class="excel-csv-data-card">
      <div class="excel-csv-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>XLSX</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${sheetNames.length} worksheet${sheetNames.length===1?"":"s"} · ${rowCount.toLocaleString()} rows · ${columnCount.toLocaleString()} columns</span></div></div>
        <div class="excel-to-csv-file-actions"><span id="excelCsvCopyStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="clearExcelCsv" type="button">Start over</button></div>
      </div>
      <div class="excel-to-csv-controls">
        <label><span>Worksheet</span><select id="worksheetSelect">${sheetNames.map(name=>`<option value="${escapeHTML(name)}" ${name===selectedSheet?"selected":""}>${escapeHTML(name)}</option>`).join("")}</select></label>
        <label><span>CSV delimiter</span><select id="csvDelimiter">${delimiterOptions.map(([value,label])=>`<option value="${escapeHTML(value)}" ${value===delimiter?"selected":""}>${label}</option>`).join("")}</select></label>
        <div class="excel-to-csv-actions"><button class="viewer-edit" id="copyExcelCsv" type="button">Copy CSV</button><button class="viewer-primary" id="downloadExcelCsv" type="button">Download CSV</button></div>
      </div>
      <div class="excel-to-csv-table-heading"><div><h2>Worksheet data</h2><p>The first row is included in your CSV output.</p></div><span>${rowCount.toLocaleString()} ${rowCount===1?"row":"rows"}</span></div>
      <div class="editor-table-wrap excel-csv-table-wrap"><table><thead><tr>${(rows[0]||[]).map(value=>`<th>${escapeHTML(value)}</th>`).join("")}</tr></thead><tbody>${dataRows.map(row=>`<tr>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(1,columnCount)}" class="no-results">${rowCount?"This worksheet contains a header row but no data rows.":"No rows in this worksheet."}</td></tr>`}</tbody></table></div>
      <div class="excel-to-csv-footer">All ${rowCount.toLocaleString()} worksheet rows are included in the CSV.</div>
    </div>`;
  $("#worksheetSelect").onchange=event=>{selectedSheet=event.target.value;rows=readSheet(selectedSheet);render()};
  $("#csvDelimiter").onchange=event=>{delimiter=event.target.value;render()};
  $("#copyExcelCsv").onclick=async()=>{
    try{await navigator.clipboard.writeText(csvOutput);$("#excelCsvCopyStatus").textContent="CSV copied to clipboard."}
    catch(error){$("#excelCsvCopyStatus").textContent="Clipboard access is unavailable in this browser."}
  };
  $("#downloadExcelCsv").onclick=()=>{
    const safeSheetName=selectedSheet.replace(/[\\/?*\[\]:]/g,"_")||"Sheet";
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csvOutput],{type:"text/csv;charset=utf-8"}));link.download=fileName.replace(/\.(xlsx|xlsm?|xlsb|ods)$/i,"")+"-"+safeSheetName+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    $("#excelCsvCopyStatus").textContent="CSV download started.";
  };
  $("#clearExcelCsv").onclick=()=>{
    workbook=null;sheetNames=[];selectedSheet="";rows=[];csvOutput="";fileName="workbook.xlsx";delimiter=",";workspace.hidden=true;workspaceSection.hidden=true;uploadCard.hidden=false;$("#excelCsvFile").value="";$("#excelCsvStatus").textContent="";uploadCard.scrollIntoView({behavior:"smooth",block:"center"});
  };
}

function validateWorkbook(file){
  if(!/\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(file.name)){
    $("#excelCsvStatus").textContent="Choose an XLSX, XLS, XLSM, XLSB, or ODS workbook.";
    return false;
  }
  if(file.size>50*1024*1024){
    $("#excelCsvStatus").textContent="This workbook is larger than 50 MB.";
    return false;
  }
  return true;
}

async function openWorkbook(file){
  if(!validateWorkbook(file)){$("#excelCsvFile").value="";return}
  if(!window.XLSX){$("#excelCsvStatus").textContent="Excel workbook support could not load. Check your internet connection and reload this page.";$("#excelCsvFile").value="";return}
  try{
    const parsedWorkbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
    const names=parsedWorkbook.SheetNames||[];
    if(!names.length)throw new Error("This workbook has no worksheets.");
    workbook=parsedWorkbook;sheetNames=names;selectedSheet=sheetNames[0];fileName=file.name;delimiter=",";rows=readSheet(selectedSheet);$("#excelCsvFile").value="";$("#excelCsvStatus").textContent="";uploadCard.hidden=true;render();
    requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
  }catch(error){console.error(error);$("#excelCsvStatus").textContent="Could not read this Excel workbook. Check that the file is valid and not password-protected.";$("#excelCsvFile").value=""}
}

$("#excelCsvBrowse").onclick=()=>$("#excelCsvFile").click();
$("#excelCsvFile").onchange=event=>{const file=event.target.files?.[0];if(file)openWorkbook(file)};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",event=>{const file=event.dataTransfer?.files?.[0];if(file)openWorkbook(file)});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#excelCsvTheme").setAttribute("aria-pressed",String(dark));
$("#excelCsvTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#excelCsvTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#excelCsvMenu").onclick=()=>$("#excelCsvNav").classList.toggle("open");
