(()=>{
  const input=document.getElementById("quickCsvInput"),output=document.getElementById("quickCsvOutput"),tool=document.getElementById("quickCsvTool"),message=document.getElementById("quickCsvMessage"),options=document.getElementById("quickCsvOptions"),fileInput=document.getElementById("quickCsvFile");
  if(!input||!output||!tool||!message||!options)return;
  const MAX_FILE=25*1024*1024,MAX_PASTE=2*1024*1024,MAX_PREVIEW=120000;
  let sourceName="quick-data.csv",lastResult=null,isFileInput=false,optionTimer=0,parsedCache=null;
  const sample='id,name,notes,score\r\n1,"Ada Lovelace","Uses commas, safely",95\r\n2,"Grace Hopper","First line\nSecond line",99\r\n3,Alan Turing,,88';
  const $=id=>document.getElementById(id),outTitle=$("quickCsvOutputTitle"),meter=$("quickCsvMeter"),tablePreview=$("quickCsvTablePreview"),tableMount=$("quickCsvTableMount"),tableMeta=$("quickCsvTableMeta"),tableTitle=$("quickCsvTableTitle");
  function detectDelimiter(text){
    text=String(text).replace(/^\uFEFF/,"");const counts=new Map([[",",0],[";",0],["\t",0],["|",0]]);let quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(quoted&&n==='"')i++;else quoted=!quoted}else if(!quoted&&counts.has(c))counts.set(c,counts.get(c)+1);else if(!quoted&&(c==='\n'||c==='\r'))break}
    return [...counts].reduce((best,item)=>item[1]>best[1]?item:best,[",",-1])[0];
  }
  function parseCSV(text,choice="auto"){
    text=String(text??"").replace(/^\uFEFF/,"");const delimiter=choice==="auto"?detectDelimiter(text):({comma:",",semicolon:";",tab:"\t",pipe:"|"}[choice]||",");
    const rows=[],lineNumbers=[];let row=[],cell="",quoted=false,afterQuote=false,line=1,recordLine=1;
    function endRow(){row.push(cell);cell="";if(row.length>1||row.some(v=>v.trim())){rows.push(row);lineNumbers.push(recordLine)}row=[];recordLine=line+1;afterQuote=false}
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(quoted){if(c==='"'&&n==='"'){cell+='"';i++}else if(c==='"'){quoted=false;afterQuote=true}else{cell+=c;if(c==='\n')line++;else if(c==='\r'){if(n==='\n'){cell+='\n';i++}line++}};continue}
      if(afterQuote){if(c===delimiter){row.push(cell);cell="";afterQuote=false}else if(c==='\r'||c==='\n'){if(c==='\r'&&n==='\n')i++;endRow();line++;recordLine=line}else if(c===' '||c==='\t'){}else throw new Error(`Unexpected character after a closing quote near line ${line}.`);continue}
      if(c==='"'){if(cell.length===0)quoted=true;else throw new Error(`A quote appears inside an unquoted value near line ${line}.`)}
      else if(c===delimiter){row.push(cell);cell=""}
      else if(c==='\r'||c==='\n'){if(c==='\r'&&n==='\n')i++;endRow();line++;recordLine=line}
      else cell+=c;
    }
    if(quoted)throw new Error(`A quoted field opened near line ${recordLine} is not closed.`);
    if(cell.length||row.length||afterQuote){row.push(cell);if(row.length>1||row.some(v=>v.trim())){rows.push(row);lineNumbers.push(recordLine)}}
    return {rows,delimiter,lineNumbers};
  }
  function getParsed(){const choice=selectedDelimiter();if(parsedCache&&parsedCache.text===input.value&&parsedCache.choice===choice)return parsedCache.parsed;const parsed=parseCSV(input.value,choice);parsedCache={text:input.value,choice,parsed};return parsed}
  function escapeHTML(value){return String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
  function serialize(rows,delimiter=","){
    return rows.map(row=>row.map(value=>{value=String(value??"");return value.includes('"')||value.includes(delimiter)||/[\r\n]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value}).join(delimiter)).join("\r\n");
  }
  function selectedDelimiter(){return $("quickDelimiter")?.value||"auto"}
  function names(rows,hasHeader){
    const width=rows.reduce((m,r)=>Math.max(m,r.length),0),raw=hasHeader?(rows[0]||[]):[];const used=new Set();
    const headers=Array.from({length:width},(_,i)=>{let base=String(raw[i]??"").trim()||`Column ${i+1}`,name=base,suffix=2;while(used.has(name)){name=`${base}_${suffix++}`}used.add(name);return name});
    return {headers,data:hasHeader?rows.slice(1):rows,width};
  }
  function headerFlag(){return $("quickHasHeader")?.checked!==false}
  function previewLimit(){return tool.value==="preview"?Number($("quickPreviewRows")?.value)||25:100}
  function hideTablePreview(){if(tablePreview)tablePreview.hidden=true;if(tableMount)tableMount.textContent="";if(tableMeta)tableMeta.textContent=""}
  function showTablePreview(rows,hasHeader,limit=100,title="CSV data as rows and columns"){
    if(!tablePreview||!rows.length){hideTablePreview();return}
    const {headers,data}=names(rows,hasHeader),shown=data.slice(0,limit);
    tableTitle.textContent=title;
    tableMeta.textContent=`${data.length.toLocaleString()} rows · ${headers.length} columns · showing ${shown.length.toLocaleString()}`;
    tableMount.innerHTML=`<table class="quick-data-table"><thead><tr><th scope="col">Row</th>${headers.map(h=>`<th scope="col">${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${shown.map((row,i)=>`<tr><th scope="row">${i+1}</th>${headers.map((h,c)=>`<td>${escapeHTML(row[c]??"")}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${headers.length+1}" class="quick-empty-row">No data rows.</td></tr>`}</tbody></table>`;
    tablePreview.hidden=false;
  }
  function refreshTablePreview(){if(!input.value||new Blob([input.value]).size>MAX_PASTE){hideTablePreview();return}try{const parsed=getParsed();showTablePreview(parsed.rows,headerFlag(),previewLimit())}catch(e){hideTablePreview()}}
  function safeBase(){return sourceName.replace(/\.(csv|tsv)$/i,"")||"quick-data"}
  function setOptions(){
    const common=`<label class="quick-option"><span>Input separator</span><select id="quickDelimiter"><option value="auto">Auto-detect</option><option value="comma">Comma (,)</option><option value="semicolon">Semicolon (;)</option><option value="tab">Tab</option><option value="pipe">Pipe (|)</option></select></label>`;
    const header=`<label class="quick-check"><input id="quickHasHeader" type="checkbox" checked> First row contains headings</label>`;
    const trim=`<label class="quick-check"><input id="quickTrim" type="checkbox" checked> Trim surrounding spaces</label>`;
    const outputSep=`<label class="quick-option"><span>Output separator</span><select id="quickOutputDelimiter"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select></label>`;
    const mode=tool.value;let extra="";
    if(["json","validate","normalize","dedupe","empty","sort","filter","tsv","html","transpose","summary","preview"].includes(mode))extra+=header;
    if(["normalize","dedupe","empty"].includes(mode))extra+=trim;
    if(mode==="json")extra+=`<label class="quick-option"><span>JSON shape</span><select id="quickJsonShape"><option value="objects">Array of objects</option><option value="arrays">Array of arrays</option></select></label><label class="quick-check"><input id="quickNulls" type="checkbox"> Empty cells as null</label>`;
    if(mode==="normalize")extra+=outputSep+`<label class="quick-check"><input id="quickPad" type="checkbox" checked> Pad short rows to match the widest row</label>`;
    if(mode==="tsv")extra+=`<p class="quick-option-note">The output will use tab separators and a .tsv filename.</p>`;
    if(mode==="dedupe")extra+=`<label class="quick-option"><span>Remove duplicates by</span><select id="quickDedupeBy"><option value="row">Entire row</option></select></label>`;
    if(mode==="sort")extra+=`<label class="quick-option"><span>Sort column</span><select id="quickColumn"></select></label><label class="quick-option"><span>Order</span><select id="quickOrder"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label class="quick-check"><input id="quickNumeric" type="checkbox" checked> Sort numeric values numerically</label>`;
    if(mode==="filter")extra+=`<label class="quick-option"><span>Keep rows containing</span><input id="quickQuery" type="search" placeholder="Search text"></label>`;
    if(mode==="html")extra+=`<label class="quick-option"><span>Optional table caption</span><input id="quickCaption" type="text" maxlength="120" placeholder="Table caption"></label>`;
    if(mode==="transpose")extra+=`<p class="quick-option-note">Transpose swaps rows and columns. Very wide outputs may be hard to read.</p>`;
    if(mode==="preview")extra+=`<label class="quick-option"><span>Preview rows</span><select id="quickPreviewRows"><option>10</option><option selected>25</option><option>50</option><option>100</option></select></label>`;
    options.innerHTML=`<div class="quick-options-head"><strong>Options</strong><span>Set how input is read and output is prepared.</span></div><div class="quick-options-grid">${common}${extra}</div>`;
    const delimiterControl=$("quickDelimiter"),headerControl=$("quickHasHeader");
    if(delimiterControl)delimiterControl.addEventListener("change",refreshColumnOptions);
    if(headerControl)headerControl.addEventListener("change",refreshColumnOptions);
  }
  function updateColumns(parsed){
    const {headers,width}=names(parsed.rows,headerFlag());
    const col=$("quickColumn");if(col){const old=col.value;col.innerHTML=headers.map((h,i)=>`<option value="${i}">${escapeHTML(h)}</option>`).join("");if([...col.options].some(o=>o.value===old))col.value=old}
    const key=$("quickDedupeBy");if(key){const old=key.value;key.innerHTML='<option value="row">Entire row</option>'+headers.map((h,i)=>`<option value="${i}">${escapeHTML(h)}</option>`).join("");if([...key.options].some(o=>o.value===old))key.value=old}
  }
  function refreshColumnOptions(){if(!["sort","dedupe"].includes(tool.value)||!input.value)return;try{updateColumns(getParsed())}catch(e){}}
  function setOutput(title,text,ext,mime,status){
    lastResult={text,ext,mime};outTitle.textContent=title;const shortened=text.length>MAX_PREVIEW;output.textContent=shortened?text.slice(0,MAX_PREVIEW)+"\n\n… Preview shortened. Copy or download to get the complete result.":text;message.textContent=status+(shortened?" Output preview is shortened; copy and download include the full result.":"");
  }
  function invalidateResult(note="Input or options changed. Run the tool again to refresh the result."){lastResult=null;output.textContent="Run the tool to see a result.";outTitle.textContent="RESULT";message.textContent=note}
  function validate(parsed,hasHeader){
    const {rows,lineNumbers}=parsed;if(!rows.length)throw new Error("No non-empty CSV rows were found.");const expected=rows[0].length,issues=[];
    rows.slice(hasHeader?1:0).forEach((r,i)=>{if(r.length!==expected)issues.push(`Record at line ${lineNumbers[i+(hasHeader?1:0)]||i+1} has ${r.length} fields; expected ${expected}.`)});
    if(hasHeader){const raw=rows[0].map(x=>x.trim()),blank=raw.filter(x=>!x).length,duplicates=raw.filter((x,i)=>x&&raw.indexOf(x)!==i);if(blank)issues.push(`${blank} heading(s) are blank.`);if(duplicates.length)issues.push(`Duplicate heading(s): ${[...new Set(duplicates)].join(", ")}.`)}
    return issues.length?`CSV needs attention.\n${issues.join("\n")}\n\n${rows.length-(hasHeader?1:0)} data record(s), ${expected} expected column(s).`:`CSV structure looks consistent.\n${rows.length-(hasHeader?1:0)} data record(s), ${expected} column(s). Quoted fields were parsed successfully.`;
  }
  function run(){
    try{
      if(!isFileInput&&new Blob([input.value]).size>MAX_PASTE)throw new Error("Pasted text is over 2 MB. Use Open CSV for files up to 25 MB.");
      const parsed=getParsed(),rows=parsed.rows;if(!rows.length)throw new Error("Paste or open CSV data first.");
      const mode=tool.value,hasHeader=headerFlag();updateColumns(parsed);const {headers,data,width}=names(rows,hasHeader);let result="",ext="csv",mime="text/csv;charset=utf-8",title="CSV RESULT",status=`Processed ${rows.length.toLocaleString()} row(s) using ${parsed.delimiter==="\t"?"tab":parsed.delimiter} separators.`;
      showTablePreview(rows,hasHeader,previewLimit(),"Input CSV as rows and columns");
      if(mode==="json"){
        const nulls=$("quickNulls").checked,shape=$("quickJsonShape").value;const value=v=>nulls&&v===""?null:v;
        const json=shape==="arrays"?[...(hasHeader?[rows[0]]:[]),...data.map(r=>r.map(value))]:data.map(r=>Object.fromEntries(headers.map((h,i)=>[h,value(r[i]??"")])));
        result=JSON.stringify(json,null,2);ext="json";mime="application/json;charset=utf-8";title="JSON OUTPUT";status=`Converted ${data.length.toLocaleString()} data row(s) to JSON.`;
      }else if(mode==="validate"){
        result=validate(parsed,hasHeader);ext="txt";mime="text/plain;charset=utf-8";title="VALIDATION RESULT";status="CSV structure check complete.";
      }else if(mode==="normalize"||mode==="tsv"){
        let table=rows.map(r=>r.slice());const doTrim=mode==="tsv"?false:$("quickTrim").checked; if(doTrim)table=table.map(r=>r.map(v=>v.trim()));
        if(mode==="normalize"&&$("quickPad").checked)table=table.map(r=>Array.from({length:width},(_,i)=>r[i]??""));
        const sep=mode==="tsv"?"\t":$("quickOutputDelimiter").value;result=serialize(table,sep);ext=sep==="\t"?"tsv":"csv";mime=ext==="tsv"?"text/tab-separated-values;charset=utf-8":"text/csv;charset=utf-8";title=mode==="tsv"?"TSV OUTPUT":"NORMALIZED CSV";status=`Prepared ${table.length.toLocaleString()} row(s) with ${width} column(s).`;
      }else if(mode==="dedupe"){
        const by=$("quickDedupeBy").value,doTrim=$("quickTrim").checked,seen=new Set(),kept=[];for(const row of data){const values=by==="row"?row:[row[Number(by)]??""];const key=JSON.stringify(values.map(v=>doTrim?v.trim():v));if(!seen.has(key)){seen.add(key);kept.push(row)}}
        result=serialize([...(hasHeader?[rows[0]]:[]),...kept]);status=`Removed ${data.length-kept.length} duplicate row(s). ${kept.length.toLocaleString()} data row(s) remain.`;title="DEDUPLICATED CSV";
      }else if(mode==="empty"){
        const doTrim=$("quickTrim").checked,kept=data.filter(r=>!r.every(v=>(doTrim?v.trim():v)===""));result=serialize([...(hasHeader?[rows[0]]:[]),...kept]);status=`Removed ${data.length-kept.length} empty row(s). ${kept.length.toLocaleString()} data row(s) remain.`;title="CSV WITHOUT EMPTY ROWS";
      }else if(mode==="sort"){
        const col=Number($("quickColumn").value),desc=$("quickOrder").value==="desc",numeric=$("quickNumeric").checked;const sorted=data.map((r,i)=>({r,i})).sort((a,b)=>{const av=String(a.r[col]??""),bv=String(b.r[col]??""),an=Number(av),bn=Number(bv),cmp=numeric&&av.trim()!==""&&bv.trim()!==""&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:av.localeCompare(bv,undefined,{numeric:true,sensitivity:"base"});return cmp===0?a.i-b.i:cmp*(desc?-1:1)}).map(x=>x.r);result=serialize([...(hasHeader?[rows[0]]:[]),...sorted]);status=`Sorted ${sorted.length.toLocaleString()} row(s) by ${headers[col]||`Column ${col+1}`} (${desc?"descending":"ascending"}).`;title="SORTED CSV";
      }else if(mode==="filter"){
        const query=$("quickQuery").value.toLocaleLowerCase(),kept=data.filter(r=>r.some(v=>String(v).toLocaleLowerCase().includes(query)));result=serialize([...(hasHeader?[rows[0]]:[]),...kept]);status=`Found ${kept.length.toLocaleString()} matching row(s) out of ${data.length.toLocaleString()}.`;title="FILTERED CSV";
      }else if(mode==="html"){
        const caption=$("quickCaption").value.trim(),tag=(row,cell)=>`<tr>${row.map(v=>`<${cell}>${escapeHTML(v)}</${cell}>`).join("")}</tr>`,head=hasHeader?rows[0]:headers;result=`<table>\n${caption?`  <caption>${escapeHTML(caption)}</caption>\n`:""}  <thead>${tag(head,"th")}</thead>\n  <tbody>\n${data.map(r=>"    "+tag(r,"td")).join("\n")}\n  </tbody>\n</table>`;ext="html";mime="text/html;charset=utf-8";title="HTML TABLE";status=`Created an HTML table with ${data.length.toLocaleString()} data row(s).`;
      }else if(mode==="transpose"){
        if(rows.length*width>200000)throw new Error("This transpose would create more than 200,000 cells. Use a smaller dataset.");const matrix=Array.from({length:width},(_,c)=>rows.map(r=>r[c]??""));result=serialize(matrix);status=`Transposed ${rows.length} row(s) × ${width} column(s).`;title="TRANSPOSED CSV";
      }else if(mode==="summary"){
        const lines=[`Rows: ${data.length}`,`Columns: ${width}`,`Input separator: ${parsed.delimiter==="\t"?"tab":parsed.delimiter}`,"","Column summary:"];
        headers.forEach((h,c)=>{const vals=data.map(r=>String(r[c]??"")),nonblank=vals.filter(v=>v.trim()!==""),unique=new Set(nonblank);lines.push(`${h}: ${nonblank.length} filled · ${vals.length-nonblank.length} blank · ${unique.size} distinct`) });result=lines.join("\n");ext="txt";mime="text/plain;charset=utf-8";title="DATA SUMMARY";status="Summary ready.";
      }else if(mode==="preview"){
        const limit=Number($("quickPreviewRows").value)||25;result=serialize([...(hasHeader?[rows[0]]:[]),...data.slice(0,limit)]);title="CSV PREVIEW";status=`Showing the first ${Math.min(limit,data.length)} of ${data.length.toLocaleString()} data row(s).`;
      }
      if((ext==="csv"||ext==="tsv")&&new Blob([result]).size<=MAX_PASTE){const resultRows=parseCSV(result,"auto").rows;showTablePreview(resultRows,hasHeader,previewLimit(),"Result as rows and columns")}
      setOutput(title,result,ext,mime,status);
    }catch(e){lastResult=null;hideTablePreview();outTitle.textContent="RESULT";output.textContent="";message.textContent=e.message||"Could not process this CSV."}
  }
  setOptions();tool.onchange=()=>{setOptions();refreshColumnOptions();invalidateResult();refreshTablePreview()};options.addEventListener("change",()=>{invalidateResult();refreshTablePreview()});
  $("quickCsvRun").onclick=run;
  $("quickCsvSample").onclick=()=>{input.value=sample;sourceName="quick-data.csv";isFileInput=false;parsedCache=null;refreshColumnOptions();refreshTablePreview();meter.textContent=`${input.value.length.toLocaleString()} characters · pasted input limit 2 MB`;invalidateResult("Sample CSV loaded. Choose a tool and run it.")};
  $("quickCsvClear").onclick=()=>{input.value="";output.textContent="Your result will appear here.";outTitle.textContent="RESULT";message.textContent="";sourceName="quick-data.csv";isFileInput=false;parsedCache=null;lastResult=null;hideTablePreview();if(fileInput)fileInput.value="";if(meter)meter.textContent="Paste up to 2 MB of CSV text, or open a file up to 25 MB."};
  $("quickCsvCopy").onclick=async()=>{if(!lastResult)return;try{await navigator.clipboard.writeText(lastResult.text);message.textContent="Complete result copied."}catch{message.textContent="Copy is unavailable in this browser."}};
  $("quickCsvDownload").onclick=()=>{if(!lastResult)return;const blob=new Blob([lastResult.text],{type:lastResult.mime}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`${safeBase()}-result.${lastResult.ext}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $("quickCsvBrowse").onclick=()=>fileInput.click();
  fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;if(file.size>MAX_FILE){message.textContent="Quick Workspace accepts files up to 25 MB. Use the Large CSV Viewer for files up to 50 MB.";fileInput.value="";return}if(!/\.(csv|tsv)$/i.test(file.name)&&!["text/csv","text/tab-separated-values"].includes(file.type)){message.textContent="Choose a .csv or .tsv file.";fileInput.value="";return}try{input.value=await file.text();sourceName=file.name;isFileInput=true;parsedCache=null;refreshColumnOptions();refreshTablePreview();invalidateResult(`Loaded ${file.name} locally. Choose a tool and run it.`);if(meter)meter.textContent=`${file.size.toLocaleString()} bytes · ${input.value.length.toLocaleString()} characters`;input.focus()}catch(e){hideTablePreview();message.textContent=e.message||"Could not read this file in your browser."}};
  const panel=$("quickCsvInput").closest(".editor-panel");panel.addEventListener("dragover",e=>{e.preventDefault();panel.classList.add("drag")});["dragleave","drop"].forEach(t=>panel.addEventListener(t,e=>{e.preventDefault();panel.classList.remove("drag")}));panel.addEventListener("drop",async e=>{const file=e.dataTransfer?.files?.[0];if(!file)return;if(file.size>MAX_FILE){message.textContent="Quick Workspace accepts files up to 25 MB.";return}if(!/\.(csv|tsv)$/i.test(file.name)){message.textContent="Choose a .csv or .tsv file.";return}try{input.value=await file.text();sourceName=file.name;isFileInput=true;parsedCache=null;refreshColumnOptions();refreshTablePreview();invalidateResult(`Loaded ${file.name} locally. Choose a tool and run it.`);if(meter)meter.textContent=`${file.size.toLocaleString()} bytes · ${input.value.length.toLocaleString()} characters`}catch(e){hideTablePreview();message.textContent=e.message||"Could not read this file in your browser."}});
  input.addEventListener("input",()=>{parsedCache=null;if(meter)meter.textContent=`${input.value.length.toLocaleString()} characters · pasted input limit 2 MB`;invalidateResult();hideTablePreview();clearTimeout(optionTimer);optionTimer=setTimeout(()=>{refreshColumnOptions();refreshTablePreview()},250)});
  if(meter)meter.textContent="Paste up to 2 MB of CSV text, or open a file up to 25 MB.";
})();
