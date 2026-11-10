(function(){
  "use strict";
  var mode=document.body.dataset.validationTool||"",input=document.getElementById("validationFile"),status=document.getElementById("validationStatus"),output=document.getElementById("validationOutput"),summary=document.getElementById("validationSummary"),preview=document.getElementById("validationPreview"),download=document.getElementById("validationDownload"),schemaBox=document.getElementById("expectedHeaders");
  var fileInfo=null,reportRows=null,fileName="report.csv",maxBytes=50*1024*1024,dropzone=document.getElementById("syntaxDropzone"),runButton=document.getElementById("runValidation");
  var modes={"csv-syntax-checker":"syntax","csv-header-checker":"headers","csv-delimiter-detector":"delimiter","csv-encoding-detector":"encoding","csv-statistics-generator":"stats","csv-data-profiler":"profile","csv-missing-values-checker":"missing","csv-duplicate-checker":"duplicates","csv-schema-validator":"schema","csv-column-data-type-detector":"types","csv-data-quality-checker":"quality"};
  mode=modes[mode]||mode;
  function detectDelimiter(text){
    var line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(function(x){return x.trim()})||""),choices=[",","\t",";","|"];
    var counts=choices.map(function(d){var q=false,n=0;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"'){i++;continue}q=!q}else if(line[i]===d&&!q)n++}return [d,n]});
    counts.sort(function(a,b){return b[1]-a[1]});
    return {delimiter:counts[0][1]?counts[0][0]:",",counts:counts,found:counts[0][1]>0};
  }
  function parseCSV(text){
    text=String(text||"").replace(/^\uFEFF/,"");
    var detected=detectDelimiter(text),delimiter=detected.delimiter,rows=[],fieldCounts=[],errors=[],row=[],cell="",quoted=false,afterQuote=false,rowNo=1;
    function finishRow(){row.push(cell);rows.push(row);fieldCounts.push({row:rowNo,fields:row.length});row=[];cell="";afterQuote=false;rowNo++}
    for(var i=0;i<text.length;i++){
      var ch=text[i],next=text[i+1];
      if(quoted){
        if(ch==='"'&&next==='"'){cell+='"';i++}
        else if(ch==='"'){quoted=false;afterQuote=true}
        else cell+=ch;
      }else if(ch===delimiter){row.push(cell);cell="";afterQuote=false}
      else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&next==="\n")i++;finishRow()}
      else if(ch==='"'){
        if(cell===""){quoted=true}
        else{errors.push({row:rowNo,detail:"Quote found inside an unquoted field."});cell+=ch}
      }else{
        if(afterQuote&&ch.trim()!==""){errors.push({row:rowNo,detail:"Unexpected text after a closing quote."});afterQuote=false}
        cell+=ch;
      }
    }
    if(quoted)errors.push({row:rowNo,detail:"Quoted field is not closed before the end of the file."});
    if(cell!==""||row.length){finishRow()}
    return {rows:rows,fieldCounts:fieldCounts,errors:errors,delimiter:detected};
  }
  function serializeCSV(rows){return rows.map(function(row){return row.map(function(v){v=String(v==null?"":v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")}).join("\r\n")}
  function esc(v){return String(v==null?"":v).replace(/[&<>\"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]})}
  function decodeFile(buffer){
    var bytes=new Uint8Array(buffer),encoding="UTF-8",bom="No BOM",offset=0,utf8Valid=true;
    if(bytes.length>=3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191){encoding="UTF-8";bom="UTF-8 BOM";offset=3}
    else if(bytes.length>=2&&bytes[0]===255&&bytes[1]===254){encoding="UTF-16LE";bom="UTF-16 little-endian BOM";offset=2;utf8Valid=false}
    else if(bytes.length>=2&&bytes[0]===254&&bytes[1]===255){encoding="UTF-16BE";bom="UTF-16 big-endian BOM";offset=2;utf8Valid=false}
    else{
      try{new TextDecoder("utf-8",{fatal:true}).decode(bytes);encoding="UTF-8 (no BOM)"}
      catch(error){
        utf8Valid=false;
        var even=0,odd=0,total=0;for(var i=0;i<bytes.length;i++){if(bytes[i]===0){total++;if(i%2===0)even++;else odd++}}
        if(total>Math.max(2,bytes.length*0.08)){encoding=odd>even?"UTF-16LE (likely)":"UTF-16BE (likely)"}
        else encoding="Non-UTF-8 bytes (possible legacy encoding)";
      }
    }
    var text;
    try{text=new TextDecoder(encoding.indexOf("UTF-16LE")===0?"utf-16le":encoding.indexOf("UTF-16BE")===0?"utf-16be":"utf-8").decode(bytes.subarray(offset))}
    catch(error){text=new TextDecoder("utf-8").decode(bytes.subarray(offset))}
    return {text:text,encoding:encoding,bom:bom,utf8Valid:utf8Valid,bytes:bytes.length};
  }
  function typeOf(value){
    value=String(value||"").trim();if(value==="")return "Empty";
    if(/^(true|false|yes|no)$/i.test(value))return "Boolean";
    if(/^[+-]?\d+$/.test(value))return "Integer";
    if(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)&&Number.isFinite(Number(value)))return "Number";
    if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)&&Number.isFinite(Date.parse(value)))return "Date";
    return "Text";
  }
  function inferType(values){
    var types=Array.from(new Set(values.map(typeOf).filter(function(v){return v!=="Empty"})));
    if(!types.length)return "Empty";
    if(types.length===1)return types[0];
    if(types.every(function(v){return v==="Integer"||v==="Number"}))return "Number";
    return "Mixed";
  }
  function valueStats(rows,col){
    var vals=rows.slice(1).map(function(row){return String(row[col]||"")}),nonempty=vals.filter(function(v){return v.trim()!==""}),numeric=nonempty.map(function(v){return Number(v.trim())}).filter(Number.isFinite);
    return {total:vals.length,nonempty:nonempty.length,missing:vals.length-nonempty.length,unique:new Set(nonempty).size,numeric:numeric};
  }
  function headerFindings(rows){
    var findings=[],header=rows[0]||[],seen=new Map();
    if(!header.length)findings.push(["Missing header row","1","The file has no header row."]);
    header.forEach(function(value,i){
      var label=String(value||"").trim(),col=i+1;
      if(!label)findings.push(["Blank header","1","Column "+col+" has an empty heading."]);
      else{var key=label.toLocaleLowerCase();if(seen.has(key))findings.push(["Duplicate header","1","Columns "+seen.get(key)+" and "+col+" use the same heading: "+label]);else seen.set(key,col)}
      if(value!==String(value||"").trim())findings.push(["Header whitespace","1","Column "+col+" heading has leading or trailing whitespace."]);
    });
    return findings;
  }
  function run(parsed,info){
    var rows=parsed.rows,header=rows[0]||[],width=header.length,findings=[],outputRows=[],data=rows.slice(1);
    if(mode==="syntax"){
      if(!rows.length)findings.push(["Empty file",1,"No CSV records were found to check."]);
      parsed.errors.forEach(function(e){findings.push(["CSV syntax",e.row,e.detail])});
      parsed.fieldCounts.slice(1).forEach(function(item){if(item.fields!==width)findings.push(["Uneven row width",item.row,"Expected "+width+" fields but found "+item.fields+"."])});
      outputRows=findings.length?[["Issue","Row","Details"]].concat(findings):[["Status","Details"],["Valid CSV","No quote errors or uneven row widths were found."]];
      return {rows:outputRows,summary:findings.length?findings.length+" syntax or structure issue(s) found.":"CSV syntax and row widths look valid."};
    }
    if(mode==="headers"){
      findings=headerFindings(rows);
      outputRows=findings.length?[["Issue","Row","Details"]].concat(findings):[["Status","Details"],["Headers checked","No blank, duplicate, or padded header names found."]];
      return {rows:outputRows,summary:findings.length?findings.length+" header issue(s) found.":"Header row checked; no issues found."};
    }
    if(mode==="delimiter"){
      var d=parsed.delimiter,labels={",":"Comma", ";":"Semicolon","\t":"Tab","|":"Pipe"};
      var delimiterRows=[["Delimiter","Count in first non-empty line"]];
      d.counts.forEach(function(item){delimiterRows.push([labels[item[0]],item[1]])});
      delimiterRows.push(["Detected",d.found?labels[d.delimiter]:"No delimiter detected"]);
      return {rows:delimiterRows,summary:d.found?"Detected "+labels[d.delimiter]+" as the field delimiter.":"No common delimiter was detected; the file may contain one column."};
    }
    if(mode==="encoding"){
      return {rows:[["Property","Result"],["Detected encoding",info.encoding],["Byte order mark",info.bom],["File size (bytes)",info.bytes],["UTF-8 validation",info.utf8Valid?"Valid UTF-8":"Not valid UTF-8"]],summary:"Encoding check: "+info.encoding+" · "+info.bytes.toLocaleString()+" bytes."};
    }
    if(mode==="stats"||mode==="profile"||mode==="types"){
      var report=[["Column","Type","Non-empty","Missing","Unique","Min","Max","Average","Sample values"]];
      for(var c=0;c<Math.max(width,rows.reduce(function(n,r){return Math.max(n,r.length)},0));c++){
        var name=String(header[c]||("Column "+(c+1))),s=valueStats(rows,c),kind=inferType(rows.slice(1).map(function(r){return r[c]||""})),nums=s.numeric;
        report.push([name,kind,s.nonempty,s.missing,s.unique,nums.length?Math.min.apply(null,nums):"",nums.length?Math.max.apply(null,nums):"",nums.length?(nums.reduce(function(a,b){return a+b},0)/nums.length).toFixed(4):"",Array.from(new Set(rows.slice(1).map(function(r){return String(r[c]||"").trim()}).filter(Boolean))).slice(0,3).join(" | ")]);
      }
      if(mode==="types")report=[["Column","Detected data type","Non-empty values"]].concat(report.slice(1).map(function(r){return [r[0],r[1],r[2]]}));
      if(mode==="profile")report=[["Column","Inferred type","Non-empty","Missing","Unique","Sample values"]].concat(report.slice(1).map(function(r){return [r[0],r[1],r[2],r[3],r[4],r[8]]}));
      if(mode==="stats")report=[["Column","Non-empty","Missing","Unique","Numeric minimum","Numeric maximum","Numeric average"]].concat(report.slice(1).map(function(r){return [r[0],r[2],r[3],r[4],r[5],r[6],r[7]]}));
      return {rows:report,summary:(rows.length?rows.length-1:0).toLocaleString()+" data rows · "+width.toLocaleString()+" header columns · "+Math.max(0,width).toLocaleString()+" columns profiled."};
    }
    if(mode==="missing"){
      var missing=[["Column","Missing values","Rows with a missing value"]];
      var totalMissing=0;
      for(var c=0;c<width;c++){var rowNums=[],count=0;data.forEach(function(row,i){if(String(row[c]||"").trim()===""){count++;rowNums.push(i+2)}});totalMissing+=count;missing.push([header[c]||("Column "+(c+1)),count,rowNums.slice(0,100).join(", ")+(rowNums.length>100?" …":"")])}
      return {rows:missing,summary:totalMissing.toLocaleString()+" missing cell(s) across "+width+" columns. Row lists are capped at 100 per column."};
    }
    if(mode==="duplicates"){
      var first=new Map(),dupes=[["First occurrence row","Duplicate row"].concat(header)],dupeCount=0;
      data.forEach(function(row,i){var key=JSON.stringify(row);if(first.has(key)){dupeCount++;dupes.push([first.get(key),i+2].concat(row))}else first.set(key,i+2)});
      if(!dupeCount)dupes=[["Status","Details"],["No duplicate rows","Each complete data row appears once."]];
      else dupes[0]=["First occurrence row","Duplicate row"].concat(header);
      return {rows:dupes,summary:dupeCount.toLocaleString()+" duplicate row(s) found by comparing complete data rows."};
    }
    if(mode==="schema"){
      var expected=(schemaBox.value||"").split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean);
      if(!expected.length)throw new Error("Enter the expected column headings, one per line.");
      var actual=header.map(function(x){return String(x||"").trim()}),schema=[["Issue","Details"]];
      expected.forEach(function(name,i){if(actual.indexOf(name)<0)schema.push(["Missing expected column",name]);if(actual[i]!==name)schema.push(["Header order or name mismatch","Position "+(i+1)+": expected "+name+", found "+(actual[i]||"(missing)")])});
      actual.forEach(function(name){if(name&&expected.indexOf(name)<0)schema.push(["Unexpected column",name])});
      if(schema.length===1)schema.push(["Schema valid","Headers match the expected names and order."]);
      return {rows:schema,summary:schema.length===2&&schema[1][0]==="Schema valid"?"Schema matches.":(schema.length-1)+" schema issue(s) found."};
    }
    if(mode==="quality"){
      var quality=[["Issue","Row","Details"]];
      parsed.errors.forEach(function(e){quality.push(["CSV syntax",e.row,e.detail])});
      var seen=new Map(),blankRows=0,missingCells=0,spaceCells=0;
      data.forEach(function(row,i){
        var rowNum=i+2;
        if(row.every(function(v){return String(v||"").trim()===""})){blankRows++;quality.push(["Blank row",rowNum,"All fields are empty or whitespace."])}
        if(row.length!==width)quality.push(["Uneven row width",rowNum,"Expected "+width+" fields but found "+row.length+"."]);
        row.forEach(function(value,c){if(String(value||"").trim()===""){missingCells++;quality.push(["Missing value",rowNum,"Column "+(header[c]||c+1)+" is blank."])}else if(String(value)!==String(value).trim()){spaceCells++;quality.push(["Extra whitespace",rowNum,"Column "+(header[c]||c+1)+" has leading or trailing spaces."])}});
        var key=JSON.stringify(row);if(seen.has(key))quality.push(["Duplicate row",rowNum,"Same complete row as row "+seen.get(key)+"."]);else seen.set(key,rowNum);
      });
      if(quality.length===1)quality.push(["No issues","The checked rows have no detected missing values, duplicates, blank rows, or width differences."]);
      return {rows:quality,summary:quality.length===2&&quality[1][0]==="No issues"?"No common data quality issues found.":(quality.length-1)+" finding(s): "+blankRows+" blank rows, "+missingCells+" missing cells, "+spaceCells+" whitespace issues, plus any syntax, width, or duplicate findings."};
    }
    throw new Error("This analysis tool is not available.");
  }
  function setStatus(message,isError){status.textContent=message;status.classList.toggle("is-error",!!isError)}
  function renderReportTable(rows){
    var reportTable=document.getElementById("validationReportTable");
    if(!reportTable){reportTable=document.createElement("div");reportTable.id="validationReportTable";reportTable.className="validation-report-wrap";output.insertBefore(reportTable,preview)}
    var table=document.createElement("table"),thead=document.createElement("thead"),headRow=document.createElement("tr"),tbody=document.createElement("tbody");
    (rows[0]||[]).forEach(function(value){var th=document.createElement("th");th.scope="col";th.textContent=String(value==null?"":value);headRow.appendChild(th)});
    thead.appendChild(headRow);
    rows.slice(1).forEach(function(row){var tr=document.createElement("tr");row.forEach(function(value){var td=document.createElement("td");td.textContent=String(value==null?"":value);tr.appendChild(td)});tbody.appendChild(tr)});
    table.appendChild(thead);table.appendChild(tbody);reportTable.replaceChildren(table);preview.hidden=true;
  }
  function renderResult(result){
    reportRows=result.rows;summary.textContent=result.summary;
    var csv=serializeCSV(reportRows);preview.textContent=csv.slice(0,9000)+(csv.length>9000?"\n\nPreview shortened. Download the complete report.":"");
    renderReportTable(reportRows);
    output.hidden=false;download.disabled=false;
  }
  if(mode==="syntax"||mode==="headers"){
    var uploadCard=document.getElementById("syntaxUploadCard"),workspaceSection=document.getElementById("syntaxWorkspaceSection"),sourceName=document.getElementById("syntaxSourceName"),sourceDetails=document.getElementById("syntaxSourceDetails"),sourceTable=document.getElementById("syntaxSourceTable"),pasteInput=document.getElementById("syntaxPaste"),uploadStatus=document.getElementById("syntaxUploadStatus"),actionStatus=document.getElementById("syntaxActionStatus"),sampleButton=document.getElementById("syntaxLoadSample"),copyReport=document.getElementById("validationCopy"),sourceParsed=null;
    var isSyntax=mode==="syntax";
    function setUploadStatus(message,isError){uploadStatus.textContent=message;uploadStatus.classList.toggle("is-error",!!isError)}
    function renderSourceTable(rows,headerIssues){
      if(!rows.length){sourceTable.innerHTML='<p class="analysis-empty-table">The file contains no rows to preview.</p>';return}
      var head=rows[0]||[],width=Math.max(head.length,rows.reduce(function(n,row){return Math.max(n,row.length)},0));
      var headersMode=!isSyntax,html='<div class="'+(headersMode?'validator-table-wrap':'analysis-table-wrap')+'"><table><thead><tr'+(headersMode&&headerIssues?' class="has-issue"':'')+'>'+(headersMode?'<th class="row-num-head" scope="col">#</th>':'')+Array.from({length:width},function(_,i){var name=head[i]||("Column "+(i+1));return '<th scope="col"><span>'+esc(name)+'</span><small>'+(i+1)+'</small></th>'}).join("")+'</tr></thead><tbody>';
      rows.slice(1).forEach(function(row,rowIndex){html+="<tr>"+(headersMode?'<td class="row-number">'+(rowIndex+2)+'</td>':'');for(var i=0;i<width;i++){var value=String(row[i]==null?"":row[i]);html+='<td'+(value.trim()===""?' class="analysis-empty-cell"':"")+' title="'+esc(value)+'">'+(value.trim()===""?"(blank)":esc(value))+"</td>"}html+="</tr>"});
      html+="</tbody></table></div>";sourceTable.innerHTML=html;
    }
    function renderHeaderResult(result,rows){
      reportRows=result.rows;summary.textContent=result.summary;var findings=reportRows.length>1&&reportRows[0][0]==="Issue"?reportRows.slice(1):[],header=rows[0]||[],blanks=0,duplicates=0,padded=0;
      findings.forEach(function(item){if(item[0]==="Blank header")blanks++;else if(item[0]==="Duplicate header")duplicates++;else if(item[0]==="Header whitespace")padded++});
      document.getElementById("headersCheckedCount").textContent=header.length.toLocaleString();document.getElementById("headerIssueCount").textContent=findings.length.toLocaleString();document.getElementById("blankHeaderCount").textContent=blanks.toLocaleString();document.getElementById("duplicateHeaderCount").textContent=duplicates.toLocaleString();document.getElementById("paddedHeaderCount").textContent=padded.toLocaleString();document.getElementById("headerFindingCount").textContent=findings.length.toLocaleString();
      document.getElementById("headerIssueList").innerHTML=findings.map(function(item){var match=String(item[2]).match(/Columns? (\d+)(?: and (\d+))?/i),col=match?(match[2]?match[1]+" & "+match[2]:match[1]):"—";return '<div class="validator-issue error"><span>Column '+esc(col)+'</span><strong>Issue</strong><p>'+esc(item[2])+'</p></div>'}).join("")||'<p class="validator-empty">No blank, duplicate, or padded column headings found.</p>';
      output.hidden=false;download.disabled=false;copyReport.disabled=false;status.textContent=findings.length?"Header check complete. Review the highlighted heading and findings below.":"Header check complete. No blank, duplicate, or padded headings were found.";actionStatus.textContent="Checked in your browser";
    }
    function openSource(text,name,bytes){
      fileInfo={text:String(text||""),encoding:"Text",bom:"",bytes:bytes||new Blob([text||""]).size,utf8Valid:true};
      fileName=(name||"pasted-data.csv").replace(/\.(csv|tsv|txt)$/i,"")+(isSyntax?"-syntax-report.csv":"-header-report.csv");sourceParsed=parseCSV(fileInfo.text);reportRows=null;
      sourceName.textContent=name||"Pasted data";var rows=sourceParsed.rows,columns=rows.length?Math.max.apply(null,rows.map(function(row){return row.length})):0;
      sourceDetails.textContent=Math.max(0,rows.length-1).toLocaleString()+" data rows · "+columns.toLocaleString()+" columns · "+(sourceParsed.delimiter.delimiter==="\t"?"tab":sourceParsed.delimiter.delimiter)+" separated · "+fileInfo.bytes.toLocaleString()+" bytes";
      var headerIssues=isSyntax?0:headerFindings(rows).length;renderSourceTable(rows,headerIssues);uploadCard.hidden=true;workspaceSection.hidden=false;output.hidden=true;download.disabled=true;copyReport.disabled=true;runButton.disabled=false;status.textContent=isSyntax?"Source table loaded. Run the syntax check when ready.":"Checking column headings…";actionStatus.textContent="Processed in your browser";
      if(!isSyntax)renderHeaderResult(run(sourceParsed,fileInfo),rows);
      if(window.requestAnimationFrame)requestAnimationFrame(function(){workspaceSection.scrollIntoView({behavior:"smooth",block:"start"})});
    }
    function openFile(file){
      if(!file)return;
      if(!/\.(csv|tsv|txt)$/i.test(file.name)){setUploadStatus("Choose a CSV, TSV, or TXT file.",true);return}
      if(file.size>maxBytes){setUploadStatus("Choose a file no larger than 50 MB.",true);return}
      setUploadStatus("Reading "+file.name+"…");
      file.arrayBuffer().then(function(buffer){var decoded=decodeFile(buffer);openSource(decoded.text,file.name,decoded.bytes);setUploadStatus("");input.value=""}).catch(function(){setUploadStatus("Could not read this file. Try saving it as UTF-8 CSV and select it again.",true)});
    }
    document.getElementById("syntaxBrowse").addEventListener("click",function(){input.click()});
    input.addEventListener("change",function(){openFile(input.files&&input.files[0])});
    ["dragenter","dragover"].forEach(function(type){dropzone.addEventListener(type,function(event){event.preventDefault();dropzone.classList.add("drag")})});
    ["dragleave","drop"].forEach(function(type){dropzone.addEventListener(type,function(event){event.preventDefault();dropzone.classList.remove("drag")})});
    dropzone.addEventListener("drop",function(event){openFile(event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0])});
    document.getElementById("syntaxUsePaste").addEventListener("click",function(){if(!pasteInput.value.trim()){setUploadStatus("Paste CSV data first.",true);pasteInput.focus();return}try{openSource(pasteInput.value,"pasted-data.csv",new Blob([pasteInput.value]).size);setUploadStatus("")}catch(error){setUploadStatus(error.message||"Could not read the pasted data.",true)}});
    sampleButton.addEventListener("click",function(){pasteInput.value=isSyntax?'Name,Email,City\nAda,ada@example.com,London\nLin,lin@example.com\nSam,sam"oops@example.com,Paris':'Name,name, City ,\nAda,ada@example.com,London,';setUploadStatus(isSyntax?"Sample loaded. Select the syntax check button to inspect it.":"Sample added. Select Check pasted data to review the headers.")});
    runButton.addEventListener("click",function(){if(!sourceParsed){setStatus("Load a file or paste CSV data first.",true);return}runButton.disabled=true;status.textContent=isSyntax?"Checking quote syntax and row widths…":"Checking column headings…";try{if(isSyntax){renderResult(run(sourceParsed,fileInfo));copyReport.disabled=false;var issues=reportRows.length>1&&reportRows[0][0]==="Issue";status.textContent=issues?"Check complete. Review the findings in the report below.":"Check complete. No quote or row-width issues were found."}else renderHeaderResult(run(sourceParsed,fileInfo),sourceParsed.rows);if(window.requestAnimationFrame)requestAnimationFrame(function(){output.scrollIntoView({behavior:"smooth",block:"start"})})}catch(error){status.textContent=error.message||"Could not check this data.";status.classList.add("is-error")}finally{runButton.disabled=false}});
    copyReport.addEventListener("click",function(){if(!reportRows)return;if(!navigator.clipboard||!navigator.clipboard.writeText){actionStatus.textContent="Clipboard access is unavailable in this browser.";return}navigator.clipboard.writeText(serializeCSV(reportRows)).then(function(){actionStatus.textContent="Report copied to clipboard."}).catch(function(){actionStatus.textContent="Clipboard access is unavailable in this browser."})});
    download.addEventListener("click",function(){if(!reportRows)return;var link=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF",serializeCSV(reportRows)],{type:"text/csv;charset=utf-8"}));link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);actionStatus.textContent="Report download started."});
    document.getElementById("clearValidation").addEventListener("click",function(){input.value="";pasteInput.value="";fileInfo=null;sourceParsed=null;reportRows=null;output.hidden=true;workspaceSection.hidden=true;uploadCard.hidden=false;download.disabled=true;copyReport.disabled=true;runButton.disabled=true;sourceTable.replaceChildren();uploadStatus.classList.remove("is-error");setUploadStatus("Choose a file or paste delimited data to begin.");status.textContent="Ready when the source table is loaded.";status.classList.remove("is-error");actionStatus.textContent="";["headersCheckedCount","headerIssueCount","blankHeaderCount","duplicateHeaderCount","paddedHeaderCount","headerFindingCount"].forEach(function(id){document.getElementById(id).textContent="0"});document.getElementById("headerIssueList").replaceChildren();var reportTable=document.getElementById("validationReportTable");if(reportTable)reportTable.replaceChildren()});
    return;
  }
  input.addEventListener("change",function(){
    var file=input.files&&input.files[0];if(!file){fileInfo=null;if(runButton)runButton.disabled=true;return}
    fileInfo=null;if(runButton)runButton.disabled=true;output.hidden=true;download.disabled=true;reportRows=null;
    if(file.size>maxBytes){setStatus("This file is larger than 50 MB. Choose a smaller CSV file.",true);return}
    fileName=file.name.replace(/\.(csv|tsv|txt)$/i,"")+"-report.csv";
    file.arrayBuffer().then(function(buffer){fileInfo=decodeFile(buffer);if(runButton)runButton.disabled=false;if(mode==="schema")setStatus("Loaded "+file.name+". Enter the expected headers, one per line.");else setStatus("Ready to check "+file.name+".")}).catch(function(){setStatus("Could not read the selected file. Try saving it as UTF-8 CSV and choose it again.",true)});
  });
  runButton.addEventListener("click",function(){
    var file=input.files&&input.files[0];if(!file){setStatus("Choose a CSV file first.",true);return}
    if(file.size>maxBytes){setStatus("Choose a file no larger than 50 MB.",true);return}
    runButton.disabled=true;setStatus("Checking CSV syntax and row widths…");
    file.arrayBuffer().then(function(buffer){fileInfo=decodeFile(buffer);var parsed=parseCSV(fileInfo.text);renderResult(run(parsed,fileInfo));setStatus(reportRows.length>1&&reportRows[0][0]==="Issue"?"Check complete. Review the findings below and download the report if needed.":"Check complete. No quote or row-width issues were found.")}).catch(function(error){output.hidden=true;download.disabled=true;setStatus(error.message||"Could not analyze this CSV. Check that the file uses a supported text encoding.",true)}).finally(function(){runButton.disabled=false});
  });
  download.addEventListener("click",function(){if(!reportRows)return;var link=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF",serializeCSV(reportRows)],{type:"text/csv;charset=utf-8"}));link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)});
  document.getElementById("clearValidation").addEventListener("click",function(){input.value="";fileInfo=null;reportRows=null;output.hidden=true;preview.hidden=false;var reportTable=document.getElementById("validationReportTable");if(reportTable)reportTable.replaceChildren();download.disabled=true;runButton.disabled=true;if(dropzone)dropzone.hidden=false;if(fileCard)fileCard.hidden=true;setStatus("Choose a file or drop it into the upload area to begin.");if(schemaBox)schemaBox.value=""});
})();
