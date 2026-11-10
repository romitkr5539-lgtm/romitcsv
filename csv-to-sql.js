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

const dialects={
  sqlite:{name:"SQLite",integer:"INTEGER",real:"REAL",text:"TEXT",boolean:"INTEGER",identifier:'"'},
  postgresql:{name:"PostgreSQL",integer:"INTEGER",real:"DOUBLE PRECISION",text:"TEXT",boolean:"BOOLEAN",identifier:'"'},
  mysql:{name:"MySQL",integer:"INT",real:"DOUBLE",text:"TEXT",boolean:"BOOLEAN",identifier:"`"}
};
const uploadCard=$("#sqlUploadCard");
const dropzone=$("#sqlDropzone");
const workspace=$("#sqlWorkspace");
let rows=[
  ["id","name","email","active"],
  ["001","Ada Lovelace","ada@example.com","true"],
  ["002","Grace Hopper","grace@example.com","true"],
  ["003","Alan Turing","alan@example.com","false"]
];
let fileName="sample_data.csv";
let dialect="sqlite";
let tableName="imported_data";
let hasHeader=true;
let emptyAsNull=true;
let dropTable=false;
let sqlOutput="";

function quoteIdentifier(name){
  const quote=dialects[dialect].identifier;
  return quote+String(name).replaceAll(quote,quote+quote)+quote;
}

function columnNames(){
  const source=hasHeader?(rows[0]||[]):Array.from({length:rows.reduce((max,row)=>Math.max(max,row.length),0)},(_,index)=>"column_"+(index+1));
  const seen=new Set();
  return source.map((value,index)=>{
    const base=String(value).trim()||"column_"+(index+1);
    let name=base,suffix=2;
    while(seen.has(name.toLowerCase())){name=base+"_"+suffix;suffix++}
    seen.add(name.toLowerCase());return name;
  });
}

function inferType(values){
  const nonEmpty=values.map(value=>String(value??"").trim()).filter(Boolean);
  if(!nonEmpty.length)return dialects[dialect].text;
  if(nonEmpty.every(value=>/^(true|false)$/i.test(value)))return dialects[dialect].boolean;
  if(nonEmpty.every(value=>/^-?(?:0|[1-9]\d*)$/.test(value)))return dialects[dialect].integer;
  if(nonEmpty.every(value=>/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)))return dialects[dialect].real;
  return dialects[dialect].text;
}

function sqlLiteral(value,type){
  const text=String(value??"");
  if(!text.trim()&&emptyAsNull)return "NULL";
  if(type===dialects[dialect].boolean&&/^(true|false)$/i.test(text.trim()))return text.trim().toUpperCase();
  if([dialects[dialect].integer,dialects[dialect].real].includes(type)&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.trim()))return text.trim();
  return "'"+text.replace(/'/g,"''")+"'";
}

function buildSQL(){
  const header=columnNames();
  const data=rows.slice(hasHeader?1:0).filter(row=>row.some(value=>String(value).trim()));
  const columnTypes=header.map((_,column)=>inferType(data.map(row=>row[column]??"")));
  const table=quoteIdentifier(tableName.trim()||"imported_data");
  const schema=header.map((name,index)=>"  "+quoteIdentifier(name)+" "+columnTypes[index]).join(",\n");
  const statements=[];
  if(dropTable)statements.push("DROP TABLE IF EXISTS "+table+";");
  statements.push("CREATE TABLE "+table+" (\n"+schema+"\n);");
  if(data.length){
    const columns=header.map(quoteIdentifier).join(", ");
    const values=data.map(row=>"  ("+header.map((_,column)=>sqlLiteral(row[column]??"",columnTypes[column])).join(", ")+")").join(",\n");
    statements.push("INSERT INTO "+table+" ("+columns+") VALUES\n"+values+";");
  }
  return {header,data,columnTypes,sql:statements.join("\n\n")};
}

function render(){
  const result=buildSQL();
  sqlOutput=result.sql;
  const previewRows=rows.slice(0,11);
  const typeNames={sqlite:"SQLite",postgresql:"PostgreSQL",mysql:"MySQL"};
  workspace.hidden=false;
  workspace.innerHTML=`
    <div class="sql-data-card">
      <div class="sql-filebar"><div class="viewer-fileinfo"><div class="viewer-fileicon"><span>SQL</span></div><div><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><span>${result.data.length.toLocaleString()} data rows · ${result.header.length} columns</span></div></div><button class="viewer-clear" id="clearSql" type="button">Clear</button></div>
      <div class="sql-options"><label>Database dialect<select id="sqlDialect"><option value="sqlite">SQLite</option><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option></select></label><label>Table name<input id="sqlTableName" type="text" value="${escapeHTML(tableName)}" maxlength="128"></label><label><input id="sqlHasHeader" type="checkbox" ${hasHeader?"checked":""}> First row contains column names</label><label><input id="sqlEmptyAsNull" type="checkbox" ${emptyAsNull?"checked":""}> Treat empty cells as NULL</label><label><input id="sqlDropTable" type="checkbox" ${dropTable?"checked":""}> Drop table before creating it</label><button class="viewer-download" id="downloadSQL" type="button">Download SQL</button></div>
      <div class="sql-types"><strong>${typeNames[dialect]} column types</strong><span>${result.header.map((column,index)=>escapeHTML(column)+": "+result.columnTypes[index]).join(" · ")}</span></div>
      <div class="sql-workbench"><section class="sql-preview-panel"><div class="sql-panel-heading"><h2>Data preview</h2><span>${Math.min(previewRows.length,11)} of ${rows.length} rows</span></div><div class="editor-table-wrap sql-table-wrap"><table><thead><tr>${(previewRows[0]||[]).map((value,index)=>`<th>${escapeHTML(hasHeader?value:"Column "+(index+1))}</th>`).join("")}</tr></thead><tbody>${previewRows.slice(hasHeader?1:0).map(row=>`<tr>${row.map(value=>`<td title="${escapeHTML(value)}">${escapeHTML(value)}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(1,result.header.length)}" class="no-results">No data rows.</td></tr>`}</tbody></table></div></section><section class="sql-output-panel"><div class="sql-panel-heading"><h2>SQL preview</h2><button class="viewer-edit" id="copySQL" type="button">Copy SQL</button></div><textarea id="sqlPreview" readonly spellcheck="false" aria-label="Generated SQL">${escapeHTML(sqlOutput)}</textarea><div class="sql-copy-status" id="sqlCopyStatus" role="status"></div></section></div>
    </div>`;
  $("#sqlDialect").value=dialect;
  $("#sqlDialect").onchange=event=>{dialect=event.target.value;render()};
  $("#sqlTableName").oninput=event=>{
    const selection=event.target.selectionStart;
    tableName=event.target.value;render();
    const input=$("#sqlTableName");input.focus();input.setSelectionRange(selection,selection);
  };
  $("#sqlHasHeader").onchange=event=>{hasHeader=event.target.checked;render()};
  $("#sqlEmptyAsNull").onchange=event=>{emptyAsNull=event.target.checked;render()};
  $("#sqlDropTable").onchange=event=>{dropTable=event.target.checked;render()};
  $("#downloadSQL").onclick=()=>{
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([sqlOutput],{type:"application/sql;charset=utf-8"}));link.download=fileName.replace(/\.(csv|tsv)$/i,"")+".sql";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  $("#copySQL").onclick=async()=>{
    try{await navigator.clipboard.writeText(sqlOutput);$("#sqlCopyStatus").textContent="SQL copied."}
    catch(error){$("#sqlCopyStatus").textContent="Clipboard access is unavailable in this browser."}
  };
  $("#clearSql").onclick=()=>{rows=[];workspace.hidden=true;uploadCard.hidden=false;$("#sqlFile").value="";$("#sqlStatus").textContent=""};
}

function openText(text,name){
  const parsed=parseCSV(text);
  if(!parsed.length||parsed.every(row=>row.every(value=>!value.trim()))){$("#sqlStatus").textContent="This CSV file is empty.";return}
  rows=parsed;fileName=name||"data.csv";uploadCard.hidden=true;render();
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

render();
$("#sqlBrowse").onclick=()=>$("#sqlFile").click();
$("#sqlFile").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#sqlStatus").textContent="This CSV file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#sqlStatus").textContent="Could not read this CSV file."}
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",async event=>{
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  if(file.size>50*1024*1024){$("#sqlStatus").textContent="This CSV file is larger than 50MB.";return}
  try{openText(await file.text(),file.name)}catch(error){$("#sqlStatus").textContent="Could not read this CSV file."}
});

const dark=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",dark);
$("#sqlTheme").setAttribute("aria-pressed",String(dark));
$("#sqlTheme").onclick=()=>{const nextDark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",nextDark);$("#sqlTheme").setAttribute("aria-pressed",String(nextDark));localStorage.setItem("romitcsv.theme.v2",nextDark?"dark":"light")};
$("#sqlMenu").onclick=()=>$("#sqlNav").classList.toggle("open");