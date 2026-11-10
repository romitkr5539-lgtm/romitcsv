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
  const delimiter=detectDelimiter(text),rows=[],row=[];
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

const uploadCard=$("#jsonUploadCard");
const dropzone=$("#jsonDropzone");
const workspace=$("#jsonWorkspace");
let rows=[
  ["ID","Name","Email","City"],
  ["1","Ada Lovelace","ada@example.com","London"],
  ["2","Grace Hopper","grace@example.com","New York"],
  ["3","Alan Turing","alan@example.com","Manchester"]
];
let fileName="sample_data.csv";
let output="";
let pretty=true;
let format="objects";
let nullForEmpty=false;

function getHeaderKeys(header){
  const used=new Set();
  return header.map((value,index)=>{
    const base=value.trim()||"Column "+(index+1);
    let key=base,suffix=2;
    while(used.has(key)){key=base+"_"+suffix;suffix++}
    used.add(key);return key;
  });
}

function convert(){
  const valueFor=cell=>nullForEmpty&&cell===""?null:cell;
  if(format==="arrays")return [rows[0],...rows.slice(1).map(row=>row.map(valueFor))];
  const keys=getHeaderKeys(rows[0]||[]);
  return rows.slice(1).map(row=>Object.fromEntries(keys.map((key,index)=>[key,valueFor(row[index]??"")])));
}

function render(){
  const headers=rows[0]||[];
  const recordCount=Math.max(0,rows.length-1);
  const converted=convert();
  output=JSON.stringify(converted,null,pretty?2:0);
  const previewLimit=40000;
  const truncated=output.length>previewLimit;
  const preview=truncated?output.slice(0,previewLimit):output;
  const repeatedHeaders=new Set();
  headers.forEach((value,index)=>{
    const name=value.trim();
    if(name&&headers.slice(0,index).some(previous=>previous.trim()===name))repeatedHeaders.add(name);
  });
  workspace.hidden=false;
  workspace.innerHTML=`
    <div class="json-data-card">
      <div class="json-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>CSV</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${recordCount.toLocaleString()} records · ${headers.length} columns</span></div></div><button class="viewer-clear" id="clearJson" type="button">Clear</button></div>
      <div class="json-options"><label>JSON shape<select id="jsonFormat"><option value="objects">Array of objects</option><option value="arrays">Array of arrays with header</option></select></label><label class="json-null-option"><input id="jsonNulls" type="checkbox"> Convert empty cells to null</label><label class="json-pretty-option"><input id="jsonPretty" type="checkbox" checked> Pretty print</label><div class="json-actions"><button class="viewer-edit" id="copyJson" type="button">Copy JSON</button><button class="viewer-download" id="downloadJson" type="button">Download JSON</button></div></div>
      ${repeatedHeaders.size?`<p class="json-note">Repeated header names are made unique in object keys.</p>`:""}
      ${truncated?'<p class="json-note">Preview shortened for display. The downloaded file contains the full JSON output.</p>':""}
      <div class="json-preview-wrap"><pre id="jsonPreview">${escapeHTML(preview)}</pre></div>
      <div class="json-copy-status" id="jsonCopyStatus" role="status"></div>
    </div>`;
  $("#jsonFormat").value=format;
  $("#jsonNulls").checked=nullForEmpty;
  $("#jsonPretty").checked=pretty;
  $("#jsonFormat").onchange=event=>{format=event.target.value;render()};
  $("#jsonNulls").onchange=event=>{nullForEmpty=event.target.checked;render()};
  $("#jsonPretty").onchange=event=>{pretty=event.target.checked;render()};
  $("#copyJson").onclick=async()=>{
    try{await navigator.clipboard.writeText(output);$("#jsonCopyStatus").textContent="JSON copied."}
    catch(error){$("#jsonCopyStatus").textContent="Clipboard access is unavailable in this browser."}
  };
  $("#downloadJson").onclick=()=>{
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([output],{type:"application/json;charset=utf-8"}));link.download=fileName.replace(/\.(csv|tsv)$/i,"")+".json";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $("#clearJson").onclick=()=>{rows=[];output="";workspace.hidden=true;uploadCard.hidden=false;$("#jsonFile").value="";$("#jsonStatus").textContent=""};
}

function openText(text,name){
  const parsed=parseCSV(text);
  if(!parsed.length){$("#jsonStatus").textContent="This CSV file is empty.";return}
  rows=parsed;fileName=name||"data.csv";uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

render();
$("#jsonBrowse").onclick=()=>$("#jsonFile").click();
$("#jsonFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#jsonStatus").textContent="This CSV file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#jsonStatus").textContent="Could not read this CSV file."}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#jsonStatus").textContent="This CSV file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#jsonStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#jsonTheme").setAttribute("aria-pressed",String(dark));
$("#jsonTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#jsonTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#jsonMenu").onclick=()=>$("#jsonNav").classList.toggle("open");
