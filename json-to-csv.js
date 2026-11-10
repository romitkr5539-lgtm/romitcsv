const $=selector=>document.querySelector(selector);

function escapeHTML(value){
  return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
}

function csvEscape(value){
  value=String(value??"");
  return /[",\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
}

const uploadCard=$("#jsonCsvUploadCard");
const dropzone=$("#jsonCsvDropzone");
const workspace=$("#jsonCsvWorkspace");
const workspaceSection=$("#jsonCsvWorkspaceSection");
let inputText="";
let fileName="data.json";
let output="";
let lastError="";
let workspaceMessage="";
let includeHeader=true;
let nullAsEmpty=true;
let stringifyNested=true;
let dirty=false;

function cellValue(value,serializeNested,emptyAsNull){
  if(value===null)return emptyAsNull?"":"null";
  if(typeof value==="object")return serializeNested?JSON.stringify(value):String(value);
  return String(value);
}

function convertJSON(){
  const parsed=JSON.parse(inputText);
  const records=Array.isArray(parsed)?parsed:[parsed];
  if(!records.length)throw new Error("The JSON array is empty. Add at least one object to convert.");
  if(!records.every(value=>value&&typeof value==="object"&&!Array.isArray(value)))throw new Error("Use one JSON object or an array containing only JSON objects.");
  const fields=[...new Set(records.flatMap(record=>Object.keys(record)))];
  if(!fields.length)throw new Error("No object fields were found. Add named properties to the JSON object.");
  const data=records.map(record=>fields.map(field=>cellValue(record[field]??null,stringifyNested,nullAsEmpty)));
  const csvRows=includeHeader?[fields,...data]:data;
  return {fields,records,csvRows,csv:csvRows.map(row=>row.map(csvEscape).join(",")).join("\r\n")};
}

function render(){
  let result;
  try{result=convertJSON();lastError=""}catch(error){lastError=error instanceof SyntaxError?"This is not valid JSON. Check the commas, quotes, brackets, and braces.":error.message;result={fields:[],records:[],csvRows:[],csv:""}}
  output=result.csv;
  const previewRows=includeHeader?result.csvRows.slice(1):result.csvRows;
  workspace.hidden=false;
  workspaceSection.hidden=false;
  workspace.innerHTML=`
    <div class="json-csv-card">
      <div class="json-csv-filebar">
        <div class="viewer-fileinfo"><div class="viewer-fileicon"><span>JSON</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${result.records.length.toLocaleString()} records · ${result.fields.length.toLocaleString()} fields</span></div></div>
        <div class="json-csv-file-actions"><span class="json-csv-live-status" id="jsonCsvWorkspaceStatus" role="status" aria-live="polite">${escapeHTML(workspaceMessage)}</span><button class="viewer-clear" id="clearJsonCsv" type="button">Start over</button></div>
      </div>
      <div class="json-csv-workbench">
        <section class="json-csv-input" aria-labelledby="jsonCsvInputHeading">
          <div class="json-csv-panel-heading"><div><span class="json-csv-step">STEP 1</span><h2 id="jsonCsvInputHeading">JSON input</h2></div><button class="viewer-edit" id="convertJsonCsv" type="button">Convert data</button></div>
          <textarea id="jsonCsvText" spellcheck="false" aria-label="JSON input">${escapeHTML(inputText)}</textarea>
          <p class="json-csv-stale" id="jsonCsvStale" ${dirty?"":"hidden"}>Input changed. Select Convert data to update the CSV preview.</p>
          <div class="json-csv-options" aria-label="CSV options">
            <label><input id="includeHeader" type="checkbox" ${includeHeader?"checked":""}> Include a header row</label>
            <label><input id="nullAsEmpty" type="checkbox" ${nullAsEmpty?"checked":""}> Write null values as empty cells</label>
            <label><input id="stringifyNested" type="checkbox" ${stringifyNested?"checked":""}> Keep nested values as JSON text</label>
          </div>
          ${lastError?`<p class="json-csv-error" role="alert">${escapeHTML(lastError)}</p>`:""}
        </section>
        <section class="json-csv-output" aria-labelledby="jsonCsvOutputHeading">
          <div class="json-csv-panel-heading"><div><span class="json-csv-step">STEP 2</span><h2 id="jsonCsvOutputHeading">CSV preview</h2></div><div class="json-actions"><button class="viewer-edit" id="copyJsonCsv" type="button" ${lastError||dirty?"disabled":""}>Copy CSV</button><button class="viewer-download" id="downloadJsonCsv" type="button" ${lastError||dirty?"disabled":""}>Download CSV</button></div></div>
          <div class="editor-table-wrap json-csv-table-wrap"><table><thead><tr>${result.fields.map(field=>`<th>${escapeHTML(field)}</th>`).join("")}</tr></thead><tbody>${previewRows.map(row=>`<tr>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(1,result.fields.length)}" class="no-results">${lastError?"Fix the JSON input to see a preview.":"No rows to display."}</td></tr>`}</tbody></table></div>
          <div class="json-csv-output-footer">${lastError?"":`All ${previewRows.length.toLocaleString()} ${previewRows.length===1?"record is":"records are"} shown in the scrollable table`}</div>
        </section>
      </div>
    </div>`;

  $("#jsonCsvText").oninput=event=>{inputText=event.target.value;dirty=true;$("#copyJsonCsv").disabled=true;$("#downloadJsonCsv").disabled=true;$("#jsonCsvStale").hidden=false};
  $("#convertJsonCsv").onclick=()=>{inputText=$("#jsonCsvText").value;workspaceMessage="";dirty=false;render()};
  $("#includeHeader").onchange=event=>{inputText=$("#jsonCsvText").value;includeHeader=event.target.checked;workspaceMessage="";dirty=false;render()};
  $("#nullAsEmpty").onchange=event=>{inputText=$("#jsonCsvText").value;nullAsEmpty=event.target.checked;workspaceMessage="";dirty=false;render()};
  $("#stringifyNested").onchange=event=>{inputText=$("#jsonCsvText").value;stringifyNested=event.target.checked;workspaceMessage="";dirty=false;render()};
  $("#copyJsonCsv").onclick=async()=>{
    try{await navigator.clipboard.writeText(output);workspaceMessage="CSV copied to clipboard."}
    catch(error){workspaceMessage="Clipboard access is unavailable in this browser."}
    $("#jsonCsvWorkspaceStatus").textContent=workspaceMessage;
  };
  $("#downloadJsonCsv").onclick=()=>{
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([output],{type:"text/csv;charset=utf-8"}));link.download=fileName.replace(/\.json$/i,"")+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    workspaceMessage="CSV download started.";$("#jsonCsvWorkspaceStatus").textContent=workspaceMessage;
  };
  $("#clearJsonCsv").onclick=()=>{inputText="";output="";dirty=false;lastError="";workspaceMessage="";workspace.hidden=true;workspaceSection.hidden=true;uploadCard.hidden=false;$("#jsonCsvStatus").textContent="";$("#jsonCsvFile").value="";$("#jsonCsvPasteInput").value="";fileName="data.json";uploadCard.scrollIntoView({behavior:"smooth",block:"center"})};
}

function openJSON(text,name){
  inputText=text;fileName=name||"pasted-data.json";workspaceMessage="";uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

$("#jsonCsvBrowse").onclick=()=>$("#jsonCsvFile").click();
$("#jsonCsvPasteConvert").onclick=()=>{
  const text=$("#jsonCsvPasteInput").value.trim();
  if(!text){$("#jsonCsvStatus").textContent="Paste JSON text first.";$("#jsonCsvPasteInput").focus();return}
  openJSON(text,"pasted-data.json");
};
$("#jsonCsvFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#jsonCsvStatus").textContent="This JSON file is larger than 50 MB.";event.target.value="";return}
  try{openJSON(await file.text(),file.name)}catch(error){$("#jsonCsvStatus").textContent="Could not read this JSON file."}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#jsonCsvStatus").textContent="This JSON file is larger than 50 MB.";return}
  try{openJSON(await file.text(),file.name)}catch(error){$("#jsonCsvStatus").textContent="Could not read this JSON file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#jsonCsvTheme").setAttribute("aria-pressed",String(dark));
$("#jsonCsvTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#jsonCsvTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#jsonCsvMenu").onclick=()=>$("#jsonCsvNav").classList.toggle("open");
