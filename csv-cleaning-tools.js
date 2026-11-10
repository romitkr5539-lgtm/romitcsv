(function(){
  "use strict";
  var tool=document.body.dataset.cleaningTool||"";
  var hasTablePreview=tool==="find-and-replace-csv"||tool==="remove-duplicate-columns";
  var input=document.getElementById("csvInput"),fileInput=document.getElementById("csvFile"),dropzone=document.getElementById("csvDropzone"),fileName="cleaned.csv",resultRows=null,maxBytes=50*1024*1024;
  var status=document.getElementById("cleaningStatus"),output=document.getElementById("cleaningOutput"),summary=document.getElementById("cleaningSummary"),preview=document.getElementById("cleaningPreview"),previewTable=document.getElementById("cleaningTableWrap"),previewNote=document.getElementById("cleaningPreviewNote"),previewTitle=document.getElementById("cleaningPreviewTitle"),inputLabel=document.getElementById("csvInputLabel"),editCsvText=document.getElementById("editCsvText");
  var loadedFileBar=document.getElementById("loadedFileBar"),loadedFileName=document.getElementById("loadedFileName"),changeFile=document.getElementById("changeFile"),columnReport=document.getElementById("cleaningDetails"),columnReportData=[];
  var configs={"remove-duplicate-rows":"duplicates","remove-empty-rows":"emptyRows","remove-empty-columns":"emptyColumns","remove-blank-cells":"blankCells","trim-csv-whitespace":"trim","remove-special-characters-csv":"special","remove-extra-spaces-csv":"extraSpaces","fix-csv-formatting":"format","csv-data-cleaner":"clean","normalize-csv-data":"normalize","find-and-replace-csv":"replace","remove-duplicate-columns":"duplicateColumns"};
  function detectDelimiter(text){
    var line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(function(x){return x.trim()})||"");
    var choices=[",","\t",";","|"];
    var counts=choices.map(function(d){var quoted=false,count=0;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue}quoted=!quoted}else if(line[i]===d&&!quoted)count++}return [d,count]});
    counts.sort(function(a,b){return b[1]-a[1]});return counts[0][0];
  }
  function parseCSV(text){
    text=String(text||"").replace(/^\uFEFF/,"");
    var delimiter=detectDelimiter(text),rows=[],row=[],cell="",quoted=false;
    for(var i=0;i<text.length;i++){var ch=text[i],next=text[i+1];
      if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++}else quoted=!quoted}
      
      else if(ch===delimiter&&!quoted){row.push(cell);cell=""}
      else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&next==="\n")i++;row.push(cell);cell="";if(row.length>1||row[0]!=="")rows.push(row);row=[]}
      else cell+=ch;
    }
    if(quoted)throw new Error("The file has an unclosed quoted field. Check the CSV formatting and try again.");
    if(cell!==""||row.length){row.push(cell);rows.push(row)}return rows;
  }
  function serializeCSV(rows){return rows.map(function(row){return row.map(function(value){value=String(value==null?"":value);return /[",\r\n]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value}).join(",")}).join("\r\n")}
  function removeEmptyRows(rows){return rows.filter(function(row,index){return index===0||row.some(function(v){return String(v).trim()!==""})})}
  function removeEmptyColumns(rows){if(!rows.length)return rows;var keep=rows[0].map(function(_,i){return rows.slice(1).some(function(row){return String(row[i]||"").trim()!==""})});return rows.map(function(row){return row.filter(function(_,i){return keep[i]})})}
  function removeDuplicates(rows){if(rows.length<2)return rows;var seen=new Set();return [rows[0]].concat(rows.slice(1).filter(function(row){var key=JSON.stringify(row);if(seen.has(key))return false;seen.add(key);return true}))}
  function removeDuplicateColumns(rows,ignoreHeadings){if(!rows.length||(ignoreHeadings&&rows.length<2))return {rows:rows,removed:[]};var keep=[],seen=new Map(),removed=[],width=rows.reduce(function(n,row){return Math.max(n,row.length)},0),start=ignoreHeadings?1:0;for(var col=0;col<width;col++){var key=JSON.stringify(rows.slice(start).map(function(row){return String(row[col]||"")}));if(seen.has(key)){var keptCol=seen.get(key);removed.push({index:col,keptIndex:keptCol,name:rows[0][col]||"Column "+(col+1),keptName:rows[0][keptCol]||"Column "+(keptCol+1)})}else{seen.set(key,col);keep.push(col)}}return {rows:rows.map(function(row){return keep.map(function(col){return row[col]||""})}),removed:removed}}
  function transform(rows){
    var action=configs[tool],out=rows.map(function(row){return row.slice()});columnReportData=[];
    if(action==="duplicates")out=removeDuplicates(out);
    if(action==="emptyRows")out=removeEmptyRows(out);
    if(action==="emptyColumns")out=removeEmptyColumns(out);
    if(action==="blankCells")out=out.filter(function(row,index){return index===0||row.every(function(v){return String(v).trim()!==""})});
    if(action==="trim")out=out.map(function(row){return row.map(function(v){return String(v).trim()})});
    if(action==="special")out=out.map(function(row){return row.map(function(v){return String(v).replace(/[^\p{L}\p{N}\s.,@_-]/gu,"")})});
    if(action==="extraSpaces")out=out.map(function(row){return row.map(function(v){return String(v).replace(/ {2,}/g," ")})});
    if(action==="format")out=out.map(function(row){return row.map(function(v){return String(v)})});
    if(action==="clean"){out=out.map(function(row){return row.map(function(v){return String(v).trim()})});out=removeEmptyRows(out);out=removeDuplicates(out);out=removeEmptyColumns(out)}
    if(action==="normalize")out=out.map(function(row){return row.map(function(v){return String(v).normalize("NFC").replace(/\s+/gu," ").trim()})});
    if(action==="replace"){
      var find=document.getElementById("findText").value,replacement=document.getElementById("replaceText").value;
      if(!find)throw new Error("Enter the text you want to find.");
      var sensitive=document.getElementById("caseSensitive").checked,matcher=new RegExp(find.replace(/[.*+?^$()|[\]\\]/g,"\\$&"),sensitive?"g":"gi");
      out=out.map(function(row){return row.map(function(v){return String(v).replace(matcher,function(){return replacement})})});
    }
    if(action==="duplicateColumns"){var columnResult=removeDuplicateColumns(out,document.getElementById("ignoreColumnHeadings").checked);out=columnResult.rows;columnReportData=columnResult.removed}return out;
  }
  function setStatus(message,isError){status.textContent=message;status.classList.toggle("is-error",!!isError)}
  function renderTable(rows,isResult){
    var maxColumns=40,maxDataRows=200,width=rows.reduce(function(max,row){return Math.max(max,row.length)},0),visibleWidth=Math.min(width,maxColumns),visibleRows=rows.slice(0,maxDataRows+1),table=document.createElement("table"),thead=document.createElement("thead"),headRow=document.createElement("tr"),numberHead=document.createElement("th");
    table.className="find-replace-result-table";table.setAttribute("aria-label","Updated CSV data");numberHead.textContent="#";numberHead.scope="col";numberHead.className="find-replace-row-index";headRow.appendChild(numberHead);
    for(var col=0;col<visibleWidth;col++){var th=document.createElement("th"),heading=rows[0]&&rows[0][col];th.scope="col";th.textContent=heading==null||heading===""?"Column "+(col+1):String(heading);headRow.appendChild(th)}
    thead.appendChild(headRow);table.appendChild(thead);var tbody=document.createElement("tbody");
    for(var rowIndex=1;rowIndex<visibleRows.length;rowIndex++){var tr=document.createElement("tr"),rowNumber=document.createElement("th");rowNumber.scope="row";rowNumber.className="find-replace-row-index";rowNumber.textContent=String(rowIndex);tr.appendChild(rowNumber);for(var cellIndex=0;cellIndex<visibleWidth;cellIndex++){var td=document.createElement("td"),value=visibleRows[rowIndex][cellIndex];td.textContent=value==null?"":String(value);tr.appendChild(td)}tbody.appendChild(tr)}
    table.appendChild(tbody);previewTable.replaceChildren(table);var clippedRows=rows.length-1>maxDataRows,clippedColumns=width>maxColumns;
    previewNote.textContent=(clippedRows||clippedColumns?"Preview limited to "+Math.min(rows.length-1,maxDataRows).toLocaleString()+" rows and "+visibleWidth+" columns. ":"Showing all rows and columns. ")+(isResult?"The download contains the complete result.":tool==="remove-duplicate-columns"?"Run the tool to remove identical columns.":"Run Find and Replace to update this table.");output.hidden=false;input.hidden=true;inputLabel.hidden=true;
  }
  function renderColumnReport(){if(!columnReport)return;columnReport.replaceChildren();columnReport.hidden=false;var heading=document.createElement("strong"),message=document.createElement("p");if(!columnReportData.length){heading.textContent="No duplicate columns found";message.textContent="All columns are unique using the selected comparison rule.";columnReport.classList.add("is-empty");columnReport.append(heading,message);return}heading.textContent=columnReportData.length+" duplicate "+(columnReportData.length===1?"column":"columns")+" removed";columnReport.classList.remove("is-empty");var list=document.createElement("ul");columnReportData.forEach(function(item){var line=document.createElement("li");line.textContent="Column "+(item.index+1)+" (“"+item.name+"”) was removed as a duplicate of column "+(item.keptIndex+1)+" (“"+item.keptName+"”).";list.appendChild(line)});columnReport.append(heading,list)}
  if(tool==="find-and-replace-csv")document.getElementById("toolOptions").innerHTML='<div class="cleaning-option-grid"><label>Find text<input id="findText" type="text" autocomplete="off"></label><label>Replace with<input id="replaceText" type="text" autocomplete="off"></label></div><label class="cleaning-check"><input id="caseSensitive" type="checkbox"> Match case</label>';
  if(tool==="remove-duplicate-columns")document.getElementById("toolOptions").innerHTML='<label class="cleaning-check duplicate-columns-ignore-label"><input id="ignoreColumnHeadings" type="checkbox"><span><strong>Ignore column headings</strong><small>Compare data values only, even when headings differ.</small></span></label>';
  if(tool==="remove-duplicate-columns")document.getElementById("ignoreColumnHeadings").addEventListener("change",function(){if(!resultRows)return;resultRows=null;document.getElementById("downloadResult").disabled=true;columnReportData=[];columnReport.replaceChildren();columnReport.hidden=true;try{var sourceRows=parseCSV(input.value);renderTable(sourceRows,false);summary.textContent=Math.max(0,sourceRows.length-1).toLocaleString()+" data rows · "+sourceRows.reduce(function(max,row){return Math.max(max,row.length)},0).toLocaleString()+" columns";previewTitle.textContent="CSV table preview";setStatus("Comparison option changed. Run Remove Duplicate Columns again to update the table.")}catch(error){output.hidden=true;input.hidden=false;inputLabel.hidden=false;setStatus(error.message||"Could not refresh the CSV preview.",true)}});
  function run(){
    setStatus("");var text=input.value;if(!text.trim()){setStatus("Choose a CSV file or paste CSV data first.",true);return}
    try{var rows=parseCSV(text);if(!rows.length){setStatus("The file is empty.",true);return}
      resultRows=transform(rows);
      output.hidden=false;var rowCount=function(list){return Math.max(0,list.length-1)};
      if(tool==="remove-duplicate-columns"){var beforeColumns=rows.reduce(function(max,row){return Math.max(max,row.length)},0),afterColumns=resultRows.reduce(function(max,row){return Math.max(max,row.length)},0);summary.textContent=rowCount(rows).toLocaleString()+" data rows · "+beforeColumns.toLocaleString()+" columns → "+afterColumns.toLocaleString()+" columns";renderColumnReport()}
      else summary.textContent=rowCount(rows).toLocaleString()+" data rows → "+rowCount(resultRows).toLocaleString()+" data rows · "+(rows[0]?rows[0].length:0).toLocaleString()+" columns → "+(resultRows[0]?resultRows[0].length:0).toLocaleString()+" columns";
      var csv=serializeCSV(resultRows);
      if(hasTablePreview){renderTable(resultRows,true);previewTitle.textContent=tool==="remove-duplicate-columns"?"CSV preview after removing duplicate columns":"Updated CSV preview"}
      else preview.textContent=csv.slice(0,7000)+(csv.length>7000?"\n\nPreview shortened. Download the result to get the complete CSV.":"");
      setStatus("Done. Review the preview, then download the CSV.");document.getElementById("downloadResult").disabled=false;
    }catch(error){resultRows=null;document.getElementById("downloadResult").disabled=true;if(hasTablePreview){try{var sourceRows=parseCSV(text);if(sourceRows.length){renderTable(sourceRows,false);previewTitle.textContent="CSV table preview"}}catch(ignore){output.hidden=true;input.hidden=false;inputLabel.hidden=false}}else output.hidden=true;setStatus(error.message||"Could not process this CSV file.",true)}
  }
function loadFile(file){
    if(!file)return;
    if(file.size>maxBytes){setStatus("This file is larger than 50 MB.",true);return}
    if(!/\.(csv|tsv|txt)$/i.test(file.name||"")&&!["text/csv","text/tab-separated-values","text/plain","application/vnd.ms-excel"].includes(file.type)){setStatus("Choose a CSV, TSV, or text file.",true);return}
    resultRows=null;output.hidden=true;input.hidden=false;inputLabel.hidden=false;document.getElementById("downloadResult").disabled=true;if(tool==="remove-duplicate-columns"){columnReport.replaceChildren();columnReport.hidden=true}
    fileName=file.name.replace(/\.(csv|tsv|txt)$/i,"")+".csv";
    var actionLabel=tool==="remove-duplicate-rows"?"remove duplicate rows":tool==="remove-empty-rows"?"remove empty rows":"run the tool";file.text().then(function(text){input.value=text;if(hasTablePreview){dropzone.hidden=true;loadedFileName.textContent=file.name;loadedFileBar.hidden=false;try{var loadedRows=parseCSV(text);if(!loadedRows.length)throw new Error("The file is empty.");renderTable(loadedRows,false);summary.textContent=Math.max(0,loadedRows.length-1).toLocaleString()+" data rows · "+(loadedRows[0]?loadedRows[0].length:0).toLocaleString()+" columns";previewTitle.textContent="CSV table preview";setStatus(tool==="remove-duplicate-columns"?"Loaded "+file.name+". Review the table, then remove duplicate columns.":"Loaded "+file.name+". Enter the text to find and replace, then review the updated table.")}catch(error){output.hidden=true;setStatus("Loaded "+file.name+", but could not show the table: "+(error.message||"check the CSV formatting."),true)}}else setStatus("Loaded "+file.name+". Review the data, then "+actionLabel+".")}).catch(function(){setStatus("Could not read this file.",true)});
  }
  if(dropzone){
    document.getElementById("csvBrowse").addEventListener("click",function(){fileInput.click()});
    if(hasTablePreview)changeFile.addEventListener("click",function(){fileInput.value="";fileInput.click()});
    fileInput.addEventListener("change",function(){loadFile(fileInput.files&&fileInput.files[0])});
    ["dragenter","dragover"].forEach(function(type){dropzone.addEventListener(type,function(event){event.preventDefault();dropzone.classList.add("drag")})});
    ["dragleave","drop"].forEach(function(type){dropzone.addEventListener(type,function(event){event.preventDefault();dropzone.classList.remove("drag")})});
    dropzone.addEventListener("drop",function(event){loadFile(event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0])});
  }else{
    fileInput.addEventListener("change",function(){var file=fileInput.files&&fileInput.files[0];if(!file)return;if(file.size>maxBytes){setStatus("This file is larger than 50 MB.",true);return}fileName=file.name.replace(/\.(csv|tsv|txt)$/i,"")+".csv";file.text().then(function(text){input.value=text;setStatus("Loaded "+file.name+". Choose the action to process it.")}).catch(function(){setStatus("Could not read this file.",true)})});
  }
  input.addEventListener("input",function(){if(resultRows){resultRows=null;output.hidden=true;document.getElementById("downloadResult").disabled=true;setStatus("Input changed. Run the tool again to update the result.")}else if(hasTablePreview&&!output.hidden){output.hidden=true;setStatus("CSV text changed. Run the tool again to refresh the table preview.")}});
  document.getElementById("runTool").addEventListener("click",run);
  document.getElementById("downloadResult").addEventListener("click",function(){if(!resultRows)return;var link=document.createElement("a"),blob=new Blob(["\uFEFF",serializeCSV(resultRows)],{type:"text/csv;charset=utf-8"});link.href=URL.createObjectURL(blob);link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(link.href)},1000)});
  if(hasTablePreview)editCsvText.addEventListener("click",function(){resultRows=null;document.getElementById("downloadResult").disabled=true;output.hidden=true;input.hidden=false;inputLabel.hidden=false;setStatus("Edit the CSV text, then run the tool to refresh the table.")});
  document.getElementById("clearTool").addEventListener("click",function(){input.value="";fileInput.value="";resultRows=null;output.hidden=true;input.hidden=false;if(inputLabel)inputLabel.hidden=false;document.getElementById("downloadResult").disabled=true;fileName="cleaned.csv";if(tool==="remove-duplicate-columns"){columnReport.replaceChildren();columnReport.hidden=true;document.getElementById("ignoreColumnHeadings").checked=false}if(hasTablePreview){dropzone.hidden=false;loadedFileBar.hidden=true;loadedFileName.textContent="CSV file"}setStatus("")});
})();
