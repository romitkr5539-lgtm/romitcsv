"use strict";

const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
const uploadCard=$("#validatorUploadCard"),dropzone=$("#validatorDropzone"),workspace=$("#validatorWorkspace"),fileInput=$("#validatorFile"),pasteInput=$("#validatorPaste"),uploadStatus=$("#validatorStatus");
const maxFileBytes=50*1024*1024;
let parsed={records:[],issues:[]},report={header:[],issues:[],blankRows:0,duplicateRows:0,whitespaceRows:0,emptyCells:0,dataRows:0},fileName="",severity="all";

function detectDelimiter(text){
  const first=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(line=>line.trim())||"";
  const choices=[",",";","\t","|"],counts=choices.map(delimiter=>{
    let quoted=false,count=0;
    for(let i=0;i<first.length;i++){
      const char=first[i],next=first[i+1];
      if(char==='"'){if(quoted&&next==='"'){i++;continue}quoted=!quoted}
      else if(char===delimiter&&!quoted)count++;
    }
    return [delimiter,count];
  });
  counts.sort((a,b)=>b[1]-a[1]);
  return counts[0][1]?counts[0][0]:",";
}

function parseCSV(text){
  text=String(text||"").replace(/^\uFEFF/,"");
  const delimiter=detectDelimiter(text),records=[],issues=[];
  let row=[],cell="",quoted=false,afterQuote=false,fieldStarted=false,line=1,rowLine=1;
  function finishCell(){row.push(cell);cell="";afterQuote=false;fieldStarted=false}
  function finishRow(){finishCell();records.push({cells:row,line:rowLine});row=[];line++;rowLine=line}
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(quoted){
      if(char==='"'&&next==='"'){cell+='"';i++}
      else if(char==='"'){quoted=false;afterQuote=true}
      else if(char==='\r'&&next==='\n'){cell+="\r\n";i++;line++}
      else{cell+=char;if(char==='\n'||char==='\r')line++}
      continue;
    }
    if(char===delimiter){finishCell();continue}
    if(char==='\n'||char==='\r'){
      if(char==='\r'&&next==='\n')i++;
      finishRow();continue;
    }
    if(char==='"'){
      if(afterQuote){issues.push({severity:"error",line:rowLine,message:"Unexpected quote after a closing quoted field."});cell+=char;afterQuote=false;fieldStarted=true}
      else if(!fieldStarted&&cell===""){quoted=true;fieldStarted=true}
      else{issues.push({severity:"error",line:rowLine,message:"Quote appears inside an unquoted field."});cell+=char;fieldStarted=true}
      continue;
    }
    if(afterQuote&&char.trim()!==""){
      issues.push({severity:"error",line:rowLine,message:"Unexpected text after a closing quoted field."});afterQuote=false;
    }
    cell+=char;fieldStarted=true;
  }
  if(quoted)issues.push({severity:"error",line:rowLine,message:"Quoted field is not closed."});
  if(fieldStarted||cell.length||row.length||quoted)finishRow();
  return {records,issues,delimiter};
}

function validateCSV(source){
  const records=source.records,header=records[0]?.cells||[],expected=header.length,issues=[...source.issues],headerNames=new Map();
  header.forEach((value,index)=>{
    const name=value.trim(),line=records[0]?.line||1;
    if(!name)issues.push({severity:"error",line,message:"Column "+(index+1)+" has an empty header."});
    const key=name.toLocaleLowerCase();
    if(name&&headerNames.has(key))issues.push({severity:"error",line,message:"Duplicate header '"+name+"' in columns "+(headerNames.get(key)+1)+" and "+(index+1)+"."});
    else if(name)headerNames.set(key,index);
    if(value!==name)issues.push({severity:"warning",line,message:"Header in column "+(index+1)+" has leading or trailing whitespace."});
  });
  let blankRows=0,duplicateRows=0,whitespaceRows=0,emptyCells=0;
  const seen=new Map();
  records.slice(1).forEach(record=>{
    const cells=record.cells;
    if(cells.every(value=>!value.trim())){blankRows++;issues.push({severity:"warning",line:record.line,message:"Blank row."});return}
    if(cells.length!==expected)issues.push({severity:"error",line:record.line,message:"Expected "+expected+" columns but found "+cells.length+"."});
    const trimmed=cells.map(value=>value.trim()),spaceCount=cells.filter((value,index)=>value!==trimmed[index]).length;
    if(spaceCount){whitespaceRows++;issues.push({severity:"warning",line:record.line,message:spaceCount+" cell(s) contain leading or trailing whitespace."})}
    emptyCells+=Math.max(0,expected-cells.length)+cells.filter(value=>!value.trim()).length;
    const key=JSON.stringify(trimmed);
    if(seen.has(key)){duplicateRows++;issues.push({severity:"warning",line:record.line,message:"Duplicate data row; matches row "+seen.get(key)+"."})}
    else seen.set(key,record.line);
  });
  return {header,issues,blankRows,duplicateRows,whitespaceRows,emptyCells,dataRows:Math.max(0,records.length-1)};
}

function render(){
  const header=report.header,rows=parsed.records.slice(1),width=Math.max(header.length,...parsed.records.map(record=>record.cells.length)),filtered=report.issues.filter(issue=>severity==="all"||issue.severity===severity),rowIssueLines=new Set(report.issues.map(issue=>issue.line));
  const errors=report.issues.filter(issue=>issue.severity==="error").length,warnings=report.issues.length-errors;
  const tableHeader=Array.from({length:width},(_,column)=>`<th scope="col"><span>${escapeHTML(header[column]||("Column "+(column+1)))}</span><small>${column+1}</small></th>`).join("");
  const tableRows=rows.map(record=>`<tr class="${rowIssueLines.has(record.line)?"has-issue":""}"><td class="row-number">${record.line}</td>${Array.from({length:width},(_,column)=>{const value=record.cells[column]??"";return `<td title="${escapeHTML(value)}"${value.trim()?"":" class=\"analysis-empty-cell\""}>${value.trim()?escapeHTML(value):"(blank)"}</td>`}).join("")}</tr>`).join("");
  const issueItems=filtered.map(issue=>`<div class="validator-issue ${issue.severity}"><span>Row ${issue.line}</span><strong>${issue.severity==="error"?"Error":"Warning"}</strong><p>${escapeHTML(issue.message)}</p></div>`).join("")||'<p class="validator-empty">No issues found for this filter.</p>';
  const totalColumns=width||header.length;
  workspace.hidden=false;
  workspace.innerHTML=`<div class="validator-data-card">
    <div class="validator-filebar"><div class="analysis-file-info"><span class="analysis-file-icon">CSV</span><span><strong title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</strong><small>${report.dataRows.toLocaleString()} data rows · ${header.length.toLocaleString()} header columns · ${parsed.delimiter==="\t"?"tab":parsed.delimiter} separated</small></span></div><div class="analysis-file-actions"><span id="validatorActionStatus" role="status" aria-live="polite">Checked locally in your browser</span><button class="viewer-clear" id="clearValidator" type="button">Start over</button></div></div>
    <section class="validator-source"><div class="analysis-section-head"><div><span class="analysis-kicker">SOURCE DATA</span><h2>Your CSV table</h2><p>Rows with findings are highlighted. Scroll to review the complete source.</p></div></div><div class="editor-table-wrap validator-table-wrap"><table><thead><tr class="${rowIssueLines.has(parsed.records[0]?.line||1)?"has-issue":""}"><th class="row-num-head" scope="col">#</th>${tableHeader}</tr></thead><tbody>${tableRows||`<tr><td colspan="${Math.max(1,totalColumns+1)}" class="no-results">No data rows.</td></tr>`}</tbody></table></div></section>
    <div class="validator-stats"><div><strong>${report.dataRows.toLocaleString()}</strong><span>Rows checked</span></div><div><strong>${errors.toLocaleString()}</strong><span>Errors</span></div><div><strong>${warnings.toLocaleString()}</strong><span>Warnings</span></div><div><strong>${report.blankRows.toLocaleString()}</strong><span>Blank rows</span></div><div><strong>${report.emptyCells.toLocaleString()}</strong><span>Empty cells</span></div></div>
    <section class="validator-findings"><div class="validator-findings-head"><div><span class="analysis-kicker">VALIDATION REPORT</span><h2>Findings <span>${filtered.length.toLocaleString()}</span></h2></div><label>Show <select id="severityFilter"><option value="all" ${severity==="all"?"selected":""}>All findings</option><option value="error" ${severity==="error"?"selected":""}>Errors</option><option value="warning" ${severity==="warning"?"selected":""}>Warnings</option></select></label></div><div class="validator-issue-list">${issueItems}</div></section>
  </div>`;
  $("#severityFilter").onchange=event=>{severity=event.target.value;render()};
  $("#clearValidator").onclick=()=>resetValidator();
}

function openText(text,name){
  const next=parseCSV(text);
  if(!next.records.length||next.records.every(record=>record.cells.every(value=>!value.trim()))&&!next.issues.length){uploadStatus.textContent="This CSV file is empty. Choose another file or paste data.";return}
  parsed=next;report=validateCSV(parsed);fileName=name||"pasted-data.csv";severity="all";uploadCard.hidden=true;render();
  if(window.requestAnimationFrame)requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}

function resetValidator(){
  parsed={records:[],issues:[]};report={header:[],issues:[],blankRows:0,duplicateRows:0,whitespaceRows:0,emptyCells:0,dataRows:0};fileName="";severity="all";workspace.innerHTML="";workspace.hidden=true;uploadCard.hidden=false;fileInput.value="";pasteInput.value="";uploadStatus.textContent="Choose a file or paste delimited data to begin.";uploadStatus.classList.remove("is-error");
}

async function openFile(file){
  if(!file)return;
  if(!/\.(csv|tsv|txt)$/i.test(file.name)){uploadStatus.textContent="Choose a CSV, TSV, or TXT file.";uploadStatus.classList.add("is-error");return}
  if(file.size>maxFileBytes){uploadStatus.textContent="Choose a file no larger than 50 MB.";uploadStatus.classList.add("is-error");return}
  uploadStatus.classList.remove("is-error");uploadStatus.textContent="Reading "+file.name+"…";
  try{openText(await file.text(),file.name);if(!workspace.hidden){uploadStatus.textContent="";fileInput.value=""}}
  catch(error){uploadStatus.textContent="Could not read this file. Try saving it as UTF-8 CSV and choose it again.";uploadStatus.classList.add("is-error")}
}

$("#validatorBrowse").onclick=()=>fileInput.click();
fileInput.onchange=event=>openFile(event.target.files?.[0]);
$("#validatorUsePaste").onclick=()=>{
  const text=pasteInput.value;
  if(!text.trim()){uploadStatus.textContent="Paste CSV data first.";uploadStatus.classList.add("is-error");pasteInput.focus();return}
  uploadStatus.classList.remove("is-error");openText(text,"pasted-data.csv");
};
$("#validatorLoadSample").onclick=()=>{
  pasteInput.value='id,name,email\n1, Ada Lovelace ,ada@example.com\n2,Grace Hopper,grace@example.com\n2,Grace Hopper,grace@example.com\n3,Alan Turing,alan@example.com,extra\n,,\n';
  uploadStatus.textContent="Sample loaded. Choose Validate pasted data to view the issues.";uploadStatus.classList.remove("is-error");
};
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",event=>openFile(event.dataTransfer?.files?.[0]));

const useDarkTheme=localStorage.getItem("romitcsv.theme.v2")!=="light";
document.body.classList.toggle("dark",useDarkTheme);
$("#validatorTheme").setAttribute("aria-pressed",String(useDarkTheme));
$("#validatorTheme").onclick=()=>{const dark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",dark);$("#validatorTheme").setAttribute("aria-pressed",String(dark));localStorage.setItem("romitcsv.theme.v2",dark?"dark":"light")};
$("#validatorMenu").onclick=()=>$("#validatorNav").classList.toggle("open");
