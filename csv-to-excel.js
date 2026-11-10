const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function detectDelimiter(text){
  const first=text.replace(/^\uFEFF/,"").split(/\r?\n/).find(line=>line.trim())||"";
  return [",",";","\t","|"].map(delimiter=>[delimiter,first.split(delimiter).length-1]).sort((a,b)=>b[1]-a[1])[0][0];
}

function parseCSV(text,preferredDelimiter="auto"){
  text=String(text||"").replace(/^\uFEFF/,"");
  const delimiter=preferredDelimiter==="auto"?detectDelimiter(text):preferredDelimiter,rows=[],row=[];
  let cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(char==='"'){
      if(quoted&&next==='"'){cell+='"';i++}
      else quoted=!quoted;
    }else if(char===delimiter&&!quoted){row.push(cell);cell=""}
    else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&next==="\n")i++;
      row.push(cell);cell="";
      if(row.some(value=>value.trim()))rows.push(row.slice());
      row.length=0;
    }else cell+=char;
  }
  if(cell.length||row.length){row.push(cell);if(row.some(value=>value.trim()))rows.push(row.slice())}
  const width=rows.reduce((max,current)=>Math.max(max,current.length),0);
  return rows.map(current=>Array.from({length:width},(_,index)=>current[index]??""));
}

const uploadCard=$("#excelUploadCard");
const dropzone=$("#excelDropzone");
const workspace=$("#excelWorkspace");
const workspaceSection=$("#excelWorkspaceSection");
let rows=[];
let fileName="data.csv";
let firstRowHeaders=true;
let convertNumbers=false;
let sheetName="Data";
let conversionError="";
let delimiterMode="auto";
let sourceText="";

function render(){
  const headers=rows[0]||[];
  const previewHeaders=firstRowHeaders?headers:Array.from({length:headers.length},(_,index)=>`Column ${index+1}`);
  const previewRows=firstRowHeaders?rows.slice(1):rows;
  const recordCount=Math.max(0,rows.length-(firstRowHeaders?1:0));
  workspace.hidden=false;
  workspaceSection.hidden=false;
  workspace.innerHTML=`
    <div class="excel-data-card">
      <div class="excel-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>XLSX</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${recordCount.toLocaleString()} rows · ${headers.length} columns</span></div></div><button class="viewer-clear" id="clearExcel" type="button">Clear</button></div>
      <div class="excel-options"><label>Worksheet name <input id="sheetName" type="text" maxlength="31" value="${escapeHTML(sheetName)}"></label><label>CSV separator <select id="excelDelimiter"><option value="auto">Auto-detect</option><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select></label><label><input id="firstRowHeaders" type="checkbox" ${firstRowHeaders?"checked":""}> First row contains headers</label><label><input id="convertNumbers" type="checkbox" ${convertNumbers?"checked":""}> Convert number-like cells to numbers</label><button class="viewer-download" id="downloadExcel" type="button">Download Excel (.xlsx)</button></div>
      ${conversionError?`<p class="excel-error" role="alert">${escapeHTML(conversionError)}</p>`:""}
      <div class="excel-table-heading"><div><h2>CSV table</h2><p>Review all parsed rows before downloading.</p></div><span>${recordCount.toLocaleString()} ${recordCount===1?"row":"rows"}</span></div>
      <div class="editor-table-wrap excel-table-wrap"><table><thead><tr>${previewHeaders.map(value=>`<th>${escapeHTML(value)}</th>`).join("")}</tr></thead><tbody>${previewRows.map(row=>`<tr>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(1,headers.length)}" class="no-results">No rows to preview.</td></tr>`}</tbody></table></div>
      <div class="excel-preview-footer">All ${recordCount.toLocaleString()} ${recordCount===1?"data row is":"data rows are"} shown in the scrollable table</div>
    </div>`;
  $("#excelDelimiter").value=delimiterMode;
  $("#excelDelimiter").onchange=event=>{delimiterMode=event.target.value;const parsed=parseCSV(sourceText,delimiterMode);if(parsed.length)rows=parsed;render()};
  $("#sheetName").oninput=event=>{sheetName=event.target.value};
  $("#firstRowHeaders").onchange=event=>{firstRowHeaders=event.target.checked;render()};
  $("#convertNumbers").onchange=event=>{convertNumbers=event.target.checked};
  $("#clearExcel").onclick=()=>{rows=[];sourceText="";fileName="data.csv";sheetName="Data";firstRowHeaders=true;convertNumbers=false;delimiterMode="auto";conversionError="";workspace.hidden=true;workspaceSection.hidden=true;uploadCard.hidden=false;$("#excelFile").value="";$("#excelPasteInput").value="";$("#excelStatus").textContent="";uploadCard.scrollIntoView({behavior:"smooth",block:"center"})};
  $("#downloadExcel").onclick=downloadExcel;
}

function openText(text,name){
  sourceText=String(text||"");
  const parsed=parseCSV(sourceText,delimiterMode);
  if(!parsed.length||parsed.every(row=>row.every(value=>!value.trim()))){$("#excelStatus").textContent="This CSV file is empty.";$("#excelFile").value="";return}
  rows=parsed;fileName=name||"data.csv";conversionError="";uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

function validateUpload(file){
  if(!/\.(csv|tsv)$/i.test(file.name)){
    $("#excelStatus").textContent="Choose a file with a .csv or .tsv extension.";
    return false;
  }
  if(file.size>50*1024*1024){
    $("#excelStatus").textContent="This CSV or TSV file is larger than 50 MB.";
    return false;
  }
  return true;
}

function excelValue(value){
  if(!convertNumbers||!value.trim())return value;
  if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))return value;
  const number=Number(value);
  return Number.isFinite(number)?number:value;
}

function downloadExcel(){
  if(!window.XLSX){conversionError="Excel workbook support could not load. Check your internet connection and reload this page.";render();return}
  try{
    const columnCount=rows.reduce((max,row)=>Math.max(max,row.length),0);
    if(rows.length>1048576){conversionError="This file has more rows than one Excel worksheet can hold (1,048,576). Split it into smaller CSV files and try again.";render();return}
    if(columnCount>16384){conversionError="This file has more columns than one Excel worksheet can hold (16,384). Remove columns and try again.";render();return}
    sheetName=$("#sheetName").value;
    const values=rows.map(row=>row.map(excelValue));
    const workbook=XLSX.utils.book_new();
    const worksheet=XLSX.utils.aoa_to_sheet(values);
    const safeName=(sheetName.trim()||"Data").replace(/[\\/?*\[\]:]/g,"_").slice(0,31)||"Data";
    if(firstRowHeaders&&rows.length>1)worksheet["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:(rows[0]?.length||1)-1}})};
    worksheet["!cols"]=(rows[0]||[]).map((_,column)=>({wch:Math.min(42,Math.max(12,...rows.slice(0,101).map(row=>String(row[column]??"").length+2)))}));
    XLSX.utils.book_append_sheet(workbook,worksheet,safeName);
    const data=XLSX.write(workbook,{bookType:"xlsx",type:"array",compression:true});
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));link.download=fileName.replace(/\.(csv|tsv)$/i,"")+".xlsx";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    conversionError="";
  }catch(error){console.error(error);conversionError="Could not create the Excel workbook.";render()}
}

$("#excelBrowse").onclick=()=>$("#excelFile").click();
$("#excelPasteConvert").onclick=()=>{
  const text=$("#excelPasteInput").value.trim();
  if(!text){$("#excelStatus").textContent="Paste CSV or delimited text first.";$("#excelPasteInput").focus();return}
  openText(text,"pasted-data.csv");
};
$("#excelFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!validateUpload(file)){event.target.value="";return}
  try{openText(await file.text(),file.name)}catch(error){$("#excelStatus").textContent="Could not read this CSV file.";event.target.value=""}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(!validateUpload(file))return;
  try{openText(await file.text(),file.name)}catch(error){$("#excelStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#excelTheme").setAttribute("aria-pressed",String(dark));
$("#excelTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#excelTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#excelMenu").onclick=()=>$("#excelNav").classList.toggle("open");
