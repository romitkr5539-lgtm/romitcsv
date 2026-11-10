(function(){
  "use strict";
  var action=document.body.dataset.mergeSplitTool||"";
  var input=document.getElementById("csvFiles"),status=document.getElementById("msStatus"),options=document.getElementById("msOptions"),output=document.getElementById("msOutput"),preview=document.getElementById("msPreview"),summary=document.getElementById("msSummary"),downloads=document.getElementById("msDownloads");
  var urls=[];
  var modes={"csv-combiner":"combine","csv-joiner":"join","split-csv-by-rows":"rows","split-csv-by-columns":"columns","split-csv-by-size":"size","merge-multiple-csv-files":"merge","append-csv-files":"append","compare-csv-files":"compare"};
  var mode=modes[action]||"";
  if(mode==="rows"||mode==="columns"||mode==="size")input.removeAttribute("multiple");
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
    if(quoted)throw new Error("A file has an unclosed quoted field. Check its CSV formatting.");
    if(cell!==""||row.length){row.push(cell);rows.push(row)}
    return rows;
  }
  function serializeCSV(rows){return rows.map(function(row){return row.map(function(v){v=String(v==null?"":v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")}).join("\r\n")}
  function setStatus(text,error){status.textContent=text;status.classList.toggle("is-error",!!error)}
  function safeName(name){return name.replace(/\.(csv|tsv|txt)$/i,"").replace(/[<>:"/\\|?*]/g,"-").slice(0,80)||"data"}
  function revokeURLs(){urls.forEach(function(url){URL.revokeObjectURL(url)});urls=[]}
  function renderFiles(files,summaryText){
    revokeURLs();output.hidden=false;summary.textContent=summaryText;downloads.innerHTML="";
    var tableArea=document.getElementById("msPreviewTables");if(tableArea){tableArea.innerHTML="";tableArea.hidden=true}
    files.forEach(function(file){
      var csv=serializeCSV(file.rows),blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob);urls.push(url);
      var link=document.createElement("a");link.className="ms-download-link";link.href=url;link.download=file.name;link.textContent="Download "+file.name;downloads.appendChild(link);
    });
    var sample=files.length?serializeCSV(files[0].rows):"";
    preview.textContent=sample.slice(0,5000)+(sample.length>5000?"\n\nPreview shortened. Use the download links for complete files.":"");
    if(tableArea&&mode==="compare"){
      files.forEach(function(file){
        var section=document.createElement("section"),title=document.createElement("h4"),wrap=document.createElement("div"),table=document.createElement("table"),thead=document.createElement("thead"),tbody=document.createElement("tbody"),rows=file.rows||[],headers=rows[0]||[];
        section.className="ms-table-section";title.textContent=file.name;wrap.className="ms-result-table-wrap";table.className="ms-result-table";table.setAttribute("aria-label",file.name+" preview");
        var headRow=document.createElement("tr");headers.forEach(function(value){var th=document.createElement("th");th.scope="col";th.textContent=String(value==null?"":value);headRow.appendChild(th)});thead.appendChild(headRow);
        rows.slice(1).forEach(function(row){var tr=document.createElement("tr");for(var i=0;i<headers.length;i++){var td=document.createElement("td");td.textContent=String(row[i]==null?"":row[i]);tr.appendChild(td)}tbody.appendChild(tr)});
        table.appendChild(thead);table.appendChild(tbody);wrap.appendChild(table);section.appendChild(title);section.appendChild(wrap);tableArea.appendChild(section);
      });
      tableArea.hidden=false;preview.hidden=true;
    }else if(preview)preview.hidden=false;
  }
  function readAll(files){return Promise.all(files.map(function(file){return file.text().then(function(text){return {name:file.name,rows:parseCSV(text)}})}))}
  function unionMerge(files){
    var headers=[];
    files.forEach(function(file){(file.rows[0]||[]).forEach(function(header){if(headers.indexOf(header)<0)headers.push(header)})});
    if(!headers.length)throw new Error("The selected files do not contain a header row.");
    var rows=[headers];
    files.forEach(function(file){
      var map=(file.rows[0]||[]).map(function(h){return headers.indexOf(h)});
      file.rows.slice(1).forEach(function(row){var out=headers.map(function(){return ""});map.forEach(function(index,i){out[index]=row[i]||""});rows.push(out)});
    });
    return rows;
  }
  function appendRows(files){
    var header=files[0].rows[0]||[];
    if(!header.length)throw new Error("The first file must contain a header row.");
    files.slice(1).forEach(function(file){if(JSON.stringify(file.rows[0]||[])!==JSON.stringify(header))throw new Error("Append requires the same column headings in the same order in every file.")});
    return [header].concat.apply([header],files.map(function(file){return file.rows.slice(1)}));
  }
  function splitRows(rows,size){
    var header=rows[0]||[],data=rows.slice(1),parts=[];
    for(var i=0;i<data.length;i+=size)parts.push([header].concat(data.slice(i,i+size)));
    if(!parts.length)parts.push([header]);return parts;
  }
  function splitColumns(rows,size){
    var width=rows.reduce(function(n,row){return Math.max(n,row.length)},0),parts=[];
    for(var start=0;start<width;start+=size)parts.push(rows.map(function(row){return row.slice(start,start+size)}));
    if(!parts.length)parts.push(rows);return parts;
  }
  function splitBySize(rows,maxBytes){
    var header=rows[0]||[],parts=[],current=[header],currentBytes=new TextEncoder().encode(serializeCSV([header])).length+2;
    rows.slice(1).forEach(function(row){
      var rowBytes=new TextEncoder().encode(serializeCSV([row])).length+2;
      if(current.length>1&&currentBytes+rowBytes>maxBytes){parts.push(current);current=[header];currentBytes=new TextEncoder().encode(serializeCSV([header])).length+2}
      current.push(row);currentBytes+=rowBytes;
    });
    if(current.length>1||!parts.length)parts.push(current);return parts;
  }
  function compareRows(a,b){
    var counts=new Map();
    b.rows.slice(1).forEach(function(row){var key=JSON.stringify(row);counts.set(key,(counts.get(key)||0)+1)});
    var onlyA=[];
    a.rows.slice(1).forEach(function(row){var key=JSON.stringify(row),count=counts.get(key)||0;if(count)counts.set(key,count-1);else onlyA.push(row)});
    var onlyB=[],left=new Map();
    a.rows.slice(1).forEach(function(row){var key=JSON.stringify(row);left.set(key,(left.get(key)||0)+1)});
    b.rows.slice(1).forEach(function(row){var key=JSON.stringify(row),count=left.get(key)||0;if(count)left.set(key,count-1);else onlyB.push(row)});
    return {onlyA:onlyA,onlyB:onlyB};
  }
  function populateJoinKeys(files){
    if(mode!=="join"||files.length!==2)return;
    readAll(files).then(function(parsed){
      var selectA=document.getElementById("joinKeyA"),selectB=document.getElementById("joinKeyB");
      [selectA,selectB].forEach(function(select,index){select.innerHTML="";(parsed[index].rows[0]||[]).forEach(function(header,col){var option=document.createElement("option");option.value=String(col);option.textContent=header||("Column "+(col+1));select.appendChild(option)})});
      setStatus("Choose the matching columns and join type, then run the tool.");
    }).catch(function(error){setStatus(error.message,true)});
  }
  function joinFiles(a,b){
    var indexA=Number(document.getElementById("joinKeyA").value),indexB=Number(document.getElementById("joinKeyB").value),kind=document.getElementById("joinKind").value;
    var leftHeader=a.rows[0]||[],rightHeader=b.rows[0]||[];
    if(indexA>=leftHeader.length||indexB>=rightHeader.length)throw new Error("Choose a matching column in each file.");
    var rightKeep=rightHeader.map(function(_,i){return i!==indexB?i:-1}).filter(function(i){return i>=0});
    var rightMap=new Map();
    b.rows.slice(1).forEach(function(row,offset){var key=String(row[indexB]||"");if(key.trim()!==""){if(!rightMap.has(key))rightMap.set(key,[]);rightMap.get(key).push({row:row,index:offset})}});
    var matched=new Set(),resultHeader=leftHeader.concat(rightKeep.map(function(i){return rightHeader[i]})),result=[resultHeader];
    a.rows.slice(1).forEach(function(row){
      var key=String(row[indexA]||""),matches=key.trim()===""?[]:(rightMap.get(key)||[]);
      if(matches.length){matches.forEach(function(item){matched.add(item.index);result.push(row.concat(rightKeep.map(function(i){return item.row[i]||""})) )})}
      else if(kind==="left"||kind==="full")result.push(row.concat(rightKeep.map(function(){return ""})));
    });
    if(kind==="full")b.rows.slice(1).forEach(function(row,index){if(!matched.has(index)){var left=leftHeader.map(function(){return ""});left[indexA]=row[indexB]||"";result.push(left.concat(rightKeep.map(function(i){return row[i]||""}))) }});
    return result;
  }
  function selectedFiles(){return Array.from(input.files||[])}
  function run(){
    var files=selectedFiles();
    if(mode==="join"||mode==="compare"){if(files.length!==2){setStatus("Choose exactly two CSV files.",true);return}}
    else if(mode==="combine"||mode==="merge"||mode==="append"){if(files.length<2){setStatus("Choose at least two CSV files.",true);return}}
    else if(files.length!==1){setStatus("Choose one CSV file.",true);return}
    if(files.some(function(file){return file.size>50*1024*1024})){setStatus("Each file must be 50 MB or smaller.",true);return}
    setStatus("Reading files…");
    readAll(files).then(function(parsed){
      var outputFiles=[],summaryText="";
      if(mode==="combine"||mode==="merge"){
        var rows=unionMerge(parsed);outputFiles=[{name:safeName(parsed[0].name)+"-combined.csv",rows:rows}];summaryText=(parsed.length+" files combined · "+Math.max(0,rows.length-1)+" data rows · "+rows[0].length+" columns");
      }else if(mode==="append"){
        var appended=appendRows(parsed);outputFiles=[{name:safeName(parsed[0].name)+"-appended.csv",rows:appended}];summaryText=(parsed.length+" files appended · "+Math.max(0,appended.length-1)+" data rows");
      }else if(mode==="rows"){
        var rowSize=Number(document.getElementById("rowsPerPart").value);if(!Number.isInteger(rowSize)||rowSize<1)throw new Error("Enter a positive number of rows per file.");
        var rowParts=splitRows(parsed[0].rows,rowSize);outputFiles=rowParts.map(function(rows,i){return {name:safeName(parsed[0].name)+"-part-"+String(i+1).padStart(2,"0")+".csv",rows:rows}});summaryText="Split into "+rowParts.length+" files with up to "+rowSize+" data rows each.";
      }else if(mode==="columns"){
        var colSize=Number(document.getElementById("columnsPerPart").value);if(!Number.isInteger(colSize)||colSize<1)throw new Error("Enter a positive number of columns per file.");
        var colParts=splitColumns(parsed[0].rows,colSize);outputFiles=colParts.map(function(rows,i){return {name:safeName(parsed[0].name)+"-columns-"+String(i+1).padStart(2,"0")+".csv",rows:rows}});summaryText="Split into "+colParts.length+" files with up to "+colSize+" columns each.";
      }else if(mode==="size"){
        var kb=Number(document.getElementById("maxKb").value);if(!Number.isFinite(kb)||kb<1)throw new Error("Enter a maximum size of at least 1 KB.");
        var sizeParts=splitBySize(parsed[0].rows,Math.floor(kb*1024));outputFiles=sizeParts.map(function(rows,i){return {name:safeName(parsed[0].name)+"-part-"+String(i+1).padStart(2,"0")+".csv",rows:rows}});
        var largest=Math.max.apply(null,sizeParts.map(function(rows){return new TextEncoder().encode(serializeCSV(rows)).length}));
        summaryText="Split into "+sizeParts.length+" files · largest part is "+(largest/1024).toFixed(1)+" KB. A header or single row may exceed the requested size.";
      }else if(mode==="compare"){
        var diff=compareRows(parsed[0],parsed[1]);outputFiles=[{name:safeName(parsed[0].name)+"-only.csv",rows:[parsed[0].rows[0]||[]].concat(diff.onlyA)},{name:safeName(parsed[1].name)+"-only.csv",rows:[parsed[1].rows[0]||[]].concat(diff.onlyB)}];
        summaryText=diff.onlyA.length+" rows occur only in "+parsed[0].name+" · "+diff.onlyB.length+" rows occur only in "+parsed[1].name+". Comparison includes duplicate row counts.";
      }else if(mode==="join"){
        var joined=joinFiles(parsed[0],parsed[1]);outputFiles=[{name:safeName(parsed[0].name)+"-joined.csv",rows:joined}];summaryText="Joined "+parsed[0].name+" and "+parsed[1].name+" · "+Math.max(0,joined.length-1)+" output rows.";
      }
      renderFiles(outputFiles,summaryText);setStatus("Done. Download the result file or files below.");
    }).catch(function(error){setStatus(error.message||"Could not process the selected files.",true)});
  }
  input.addEventListener("change",function(){
    var files=selectedFiles();
    if(!files.length){setStatus("");return}
    if(files.some(function(file){return file.size>50*1024*1024})){setStatus("Each file must be 50 MB or smaller.",true);return}
    setStatus(files.length+" file"+(files.length===1?"":"s")+" selected.");
    populateJoinKeys(files);
  });
  document.getElementById("runMsTool").addEventListener("click",run);
  document.getElementById("clearMsTool").addEventListener("click",function(){revokeURLs();input.value="";output.hidden=true;downloads.innerHTML="";var tableArea=document.getElementById("msPreviewTables");if(tableArea){tableArea.innerHTML="";tableArea.hidden=true}preview.hidden=false;setStatus("");if(mode==="join"){document.getElementById("joinKeyA").innerHTML="";document.getElementById("joinKeyB").innerHTML=""}});
})();
