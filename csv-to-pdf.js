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

const uploadCard=$("#pdfUploadCard");
const dropzone=$("#pdfDropzone");
const workspace=$("#pdfWorkspace");
const workspaceSection=$("#pdfWorkspaceSection");
let rows=[];
let fileName="data.csv";
let orientation="landscape";
let pageSize="a4";
let includeHeader=true;
let fontSize=9;
let generationError="";
let delimiterMode="auto";
let sourceText="";

function render(){
  const columnCount=rows.reduce((max,row)=>Math.max(max,row.length),0);
  const dataRows=rows.slice(includeHeader?1:0);
  const headers=includeHeader?(rows[0]||[]):Array.from({length:columnCount},(_,index)=>"Column "+(index+1));
  const tableRows=includeHeader?rows.slice(1):rows;
  const tableMarkup=tableRows.map(row=>`<tr>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(1,headers.length)}" class="no-results">No data rows to display.</td></tr>`;
  workspace.hidden=false;
  workspaceSection.hidden=false;
  workspace.innerHTML=`
    <div class="pdf-data-card">
      <div class="pdf-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>PDF</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${dataRows.length.toLocaleString()} data rows · ${columnCount.toLocaleString()} columns</span></div></div><div class="pdf-file-actions"><span id="pdfActionStatus" role="status" aria-live="polite"></span><button class="viewer-clear" id="clearPdf" type="button">Start over</button></div></div>
      <div class="pdf-options">
        <label><span>Paper size</span><select id="pdfPageSize"><option value="a4">A4</option><option value="letter">Letter</option></select></label>
        <label><span>Page orientation</span><select id="pdfOrientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
        <label><span>Table text</span><select id="pdfFontSize"><option value="7">Small</option><option value="9">Regular</option><option value="11">Large</option></select></label>
        <label><span>CSV separator</span><select id="pdfDelimiter"><option value="auto">Auto-detect</option><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select></label>
        <label class="pdf-header-toggle"><input id="pdfIncludeHeader" type="checkbox" ${includeHeader?"checked":""}> First row contains column names</label>
        <button class="viewer-primary" id="downloadPdf" type="button">Download PDF</button>
      </div>
      ${generationError?`<p class="pdf-error" role="alert">${escapeHTML(generationError)}</p>`:""}
      <div class="pdf-table-heading"><div><h2>CSV table</h2><p>All parsed rows are included in the PDF.</p></div><span>${dataRows.length.toLocaleString()} ${dataRows.length===1?"data row":"data rows"}</span></div>
      <div class="editor-table-wrap pdf-table-wrap"><table><thead><tr>${headers.map(header=>`<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${tableMarkup}</tbody></table></div>
      <div class="pdf-preview-footer">${rows.length.toLocaleString()} source rows shown${includeHeader&&rows.length?" · first row is used as the table heading":""}</div>
    </div>`;
  $("#pdfPageSize").value=pageSize;
  $("#pdfOrientation").value=orientation;
  $("#pdfFontSize").value=String(fontSize);
  $("#pdfDelimiter").value=delimiterMode;
  $("#pdfPageSize").onchange=event=>{pageSize=event.target.value};
  $("#pdfOrientation").onchange=event=>{orientation=event.target.value};
  $("#pdfFontSize").onchange=event=>{fontSize=Number(event.target.value)};
  $("#pdfDelimiter").onchange=event=>{delimiterMode=event.target.value;rows=parseCSV(sourceText,delimiterMode);generationError="";render()};
  $("#pdfIncludeHeader").onchange=event=>{includeHeader=event.target.checked;render()};
  $("#clearPdf").onclick=()=>{rows=[];sourceText="";fileName="data.csv";orientation="landscape";pageSize="a4";includeHeader=true;fontSize=9;delimiterMode="auto";generationError="";workspace.hidden=true;workspaceSection.hidden=true;uploadCard.hidden=false;$("#pdfFile").value="";$("#pdfPasteInput").value="";$("#pdfStatus").textContent="";uploadCard.scrollIntoView({behavior:"smooth",block:"center"})};
  $("#downloadPdf").onclick=downloadPDF;
}

function downloadPDF(){
  const PdfConstructor=window.jspdf?.jsPDF;
  if(!PdfConstructor){generationError="PDF support could not load. Check your internet connection and reload this page.";render();return}
  try{
    const dataRows=rows.slice(includeHeader?1:0);
    const columnCount=rows.reduce((max,row)=>Math.max(max,row.length),0);
    const headers=includeHeader?(rows[0]||[]):Array.from({length:columnCount},(_,index)=>"Column "+(index+1));
    const documentPDF=new PdfConstructor({orientation,unit:"mm",format:pageSize});
    const title=fileName.replace(/\.(csv|tsv)$/i,"");
    documentPDF.setFontSize(14);documentPDF.text(title,12,13);
    documentPDF.autoTable({
      head:[headers],
      body:dataRows.map(row=>Array.from({length:columnCount},(_,index)=>String(row[index]??""))),
      startY:19,
      margin:{top:12,right:10,bottom:14,left:10},
      styles:{fontSize,cellPadding:2,overflow:"linebreak"},
      headStyles:{fillColor:[28,49,68],textColor:[255,255,255]},
      didDrawPage:context=>{
        documentPDF.setFontSize(8);
        documentPDF.text("Page "+context.pageNumber,documentPDF.internal.pageSize.getWidth()-12,documentPDF.internal.pageSize.getHeight()-5,{align:"right"});
      }
    });
    documentPDF.save(title+".pdf");
    generationError="";$("#pdfActionStatus").textContent="PDF download started.";
  }catch(error){console.error(error);generationError="Could not create the PDF. Try a smaller font size or a narrower table.";render()}
}

function openText(text,name){
  sourceText=String(text||"");
  const parsed=parseCSV(sourceText,delimiterMode);
  if(!parsed.length||parsed.every(row=>row.every(value=>!value.trim()))){$("#pdfStatus").textContent="This CSV text is empty.";return false}
  rows=parsed;fileName=name||"data.csv";generationError="";$("#pdfStatus").textContent="";uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
  return true;
}

function validateFile(file){
  if(!/\.(csv|tsv)$/i.test(file.name)){$("#pdfStatus").textContent="Choose a CSV or TSV file.";return false}
  if(file.size>50*1024*1024){$("#pdfStatus").textContent="This CSV or TSV file is larger than 50 MB.";return false}
  return true;
}

$("#pdfBrowse").onclick=()=>$("#pdfFile").click();
$("#pdfPasteConvert").onclick=()=>{
  const text=$("#pdfPasteInput").value.trim();
  if(!text){$("#pdfStatus").textContent="Paste CSV or delimited text first.";$("#pdfPasteInput").focus();return}
  openText(text,"pasted-data.csv");
};
$("#pdfFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!validateFile(file)){event.target.value="";return}
  try{openText(await file.text(),file.name);event.target.value=""}catch(error){$("#pdfStatus").textContent="Could not read this CSV file.";event.target.value=""}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(!validateFile(file))return;
  try{await openText(await file.text(),file.name)}catch(error){$("#pdfStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#pdfTheme").setAttribute("aria-pressed",String(dark));
$("#pdfTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#pdfTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#pdfMenu").onclick=()=>$("#pdfNav").classList.toggle("open");
