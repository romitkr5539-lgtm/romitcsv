(function(){
  "use strict";
  var tool=document.body.dataset.dataTool||"";
  var input=document.getElementById("dataFile"),options=document.getElementById("dataOptions"),status=document.getElementById("dataStatus"),output=document.getElementById("dataOutput"),summary=document.getElementById("dataSummary"),preview=document.getElementById("dataPreview"),download=document.getElementById("dataDownload");
  var fileName="data.csv",resultRows=null,maxBytes=50*1024*1024;
  var modes={"csv-sorter":"sort","csv-filter":"filter","csv-column-extractor":"extract","csv-column-reorder":"reorder","csv-column-renamer":"rename","csv-row-filter":"rowFilter","csv-row-counter":"rowCount","csv-column-counter":"columnCount","csv-transpose":"transpose","csv-search-tool":"search","csv-group-by":"group","csv-pivot-table":"pivot","csv-data-aggregator":"aggregate","csv-unique-values-extractor":"unique"};
  var mode=modes[tool]||"";
  function esc(value){return String(value==null?"":value).replace(/[&<>\"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]})}
  function detectDelimiter(text){
    var line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(function(x){return x.trim()})||""),choices=[",","\t",";","|"];
    var counts=choices.map(function(d){var q=false,n=0;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"'){i++;continue}q=!q}else if(line[i]===d&&!q)n++}return [d,n]});
    counts.sort(function(a,b){return b[1]-a[1]});return counts[0][0];
  }
  function parseCSV(text){
    text=String(text||"").replace(/^\uFEFF/,"");var delimiter=detectDelimiter(text),rows=[],row=[],cell="",quoted=false;
    for(var i=0;i<text.length;i++){var ch=text[i],next=text[i+1];
      if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++}else quoted=!quoted}
      else if(ch===delimiter&&!quoted){row.push(cell);cell=""}
      else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&next==="\n")i++;row.push(cell);cell="";if(row.length>1||row[0]!=="")rows.push(row);row=[]}
      else cell+=ch;
    }
    if(quoted)throw new Error("This file has an unclosed quoted field. Check its CSV formatting.");
    if(cell!==""||row.length){row.push(cell);rows.push(row)}return rows;
  }
  function serializeCSV(rows){return rows.map(function(row){return row.map(function(v){v=String(v==null?"":v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")}).join("\r\n")}
  function width(rows){return rows.reduce(function(n,row){return Math.max(n,row.length)},0)}
  function headerOptions(rows){var w=Math.max(width(rows),1),header=rows[0]||[];return Array.from({length:w},function(_,i){return '<option value="'+i+'">'+esc(header[i]||("Column "+(i+1)))+'</option>'}).join("")}
  function selectField(id,label,rows){return '<label>'+label+'<select id="'+id+'">'+headerOptions(rows)+'</select></label>'}
  function buildOptions(rows){
    var fields="";
    if(mode==="sort")fields='<div class="data-options-grid">'+selectField("sortCol","Sort by column",rows)+'<label>Order<select id="sortDirection"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label class="data-check"><input type="checkbox" id="sortNumeric"> Sort as numbers when possible</label></div>';
    if(mode==="filter")fields='<div class="data-options-grid">'+selectField("filterCol","Filter column",rows)+'<label>Condition<select id="filterCondition"><option value="contains">Contains</option><option value="equals">Equals</option><option value="starts">Starts with</option><option value="empty">Is empty</option><option value="notEmpty">Is not empty</option></select></label><label>Value<input type="text" id="filterValue"></label><label class="data-check"><input type="checkbox" id="filterCase"> Match case</label></div>';
    if(mode==="extract")fields='<p>Select columns to keep:</p><div class="data-check-grid">'+Array.from({length:Math.max(width(rows),1)},function(_,i){var h=(rows[0]||[])[i]||("Column "+(i+1));return '<label><input type="checkbox" class="extractCol" value="'+i+'" checked> '+esc(h)+'</label>'}).join("")+'</div>';
    if(mode==="reorder")fields='<label>Column order (enter column numbers, separated by commas)<input id="columnOrder" type="text" value="'+Array.from({length:width(rows)},function(_,i){return i+1}).join(",")+'"><small>Use each column number once. For example: 3, 1, 2</small></label>';
    if(mode==="rename")fields='<div class="data-rename-grid">'+Array.from({length:width(rows)},function(_,i){var original=(rows[0]||[])[i]||"",label=original||("Column "+(i+1));return '<label>'+esc(label)+'<input class="renameHeader" data-column="'+i+'" type="text" value="'+esc(original)+'"></label>'}).join("")+'</div>';
    if(mode==="rowFilter")fields='<div class="data-options-grid">'+selectField("rowFilterCol","Column",rows)+'<label>Condition<select id="rowFilterCondition"><option value="notEmpty">Is not empty</option><option value="empty">Is empty</option><option value="contains">Contains</option><option value="equals">Equals</option><option value="greater">Greater than</option><option value="less">Less than</option></select></label><label>Value<input type="text" id="rowFilterValue"></label></div>';
    if(mode==="search")fields='<label>Search all columns<input id="searchValue" type="text" placeholder="Enter a value or phrase"></label><label class="data-check"><input type="checkbox" id="searchCase"> Match case</label>';
    if(mode==="group")fields='<div class="data-options-grid">'+selectField("groupCol","Group rows by",rows)+'<label>Calculate<select id="groupOperation"><option value="count">Count rows</option><option value="sum">Sum values</option><option value="average">Average values</option></select></label>'+selectField("groupValueCol","Value column (for sum or average)",rows)+'</div>';
    if(mode==="pivot")fields='<div class="data-options-grid">'+selectField("pivotRowCol","Row categories",rows)+selectField("pivotColumnCol","Column categories",rows)+selectField("pivotValueCol","Values",rows)+'<label>Calculate<select id="pivotOperation"><option value="count">Count rows</option><option value="sum">Sum</option><option value="average">Average</option></select></label></div>';
    if(mode==="aggregate")fields='<div class="data-options-grid">'+selectField("aggregateCol","Column to aggregate",rows)+'<label>Calculation<select id="aggregateOperation"><option value="count">Count non-empty values</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label></div>';
    if(mode==="unique")fields=selectField("uniqueCol","Extract unique values from",rows);
    options.innerHTML=fields;
  }
  function numberValues(rows,col){return rows.slice(1).map(function(row){var value=String(row[col]||"").trim();return value===""?NaN:Number(value)}).filter(Number.isFinite)}
  function numericSummary(values,operation){
    if(operation==="count")return values.length;
    if(!values.length)return "";
    if(operation==="sum")return values.reduce(function(a,b){return a+b},0);
    if(operation==="average")return values.reduce(function(a,b){return a+b},0)/values.length;
    if(operation==="min")return Math.min.apply(null,values);
    if(operation==="max")return Math.max.apply(null,values);
    return "";
  }
  function run(rows){
    if(!rows.length)throw new Error("The selected file is empty.");
    var header=rows[0].slice(),data=rows.slice(1),col,result,op;
    if(mode==="sort"){
      col=Number(document.getElementById("sortCol").value);var numeric=document.getElementById("sortNumeric").checked,dir=document.getElementById("sortDirection").value==="desc"?-1:1;
      data=data.map(function(row,index){return {row:row,index:index}}).sort(function(a,b){var x=String(a.row[col]||""),y=String(b.row[col]||"");var nx=Number(x),ny=Number(y),cmp=numeric&&x.trim()!==""&&y.trim()!==""&&Number.isFinite(nx)&&Number.isFinite(ny)?nx-ny:x.localeCompare(y,undefined,{numeric:true,sensitivity:"base"});return cmp?cmp*dir:a.index-b.index}).map(function(item){return item.row});
      return {rows:[header].concat(data),summary:"Sorted "+data.length+" data rows by "+(header[col]||("Column "+(col+1)))+"."};
    }
    if(mode==="filter"||mode==="rowFilter"){
      var isRow=mode==="rowFilter";col=Number(document.getElementById(isRow?"rowFilterCol":"filterCol").value);
      var condition=document.getElementById(isRow?"rowFilterCondition":"filterCondition").value;
      var value=document.getElementById(isRow?"rowFilterValue":"filterValue").value;
      var matchCase=document.getElementById("filterCase")?document.getElementById("filterCase").checked:false;
      var filtered=data.filter(function(row){
        var cell=String(row[col]||""),left=matchCase?cell:cell.toLocaleLowerCase(),right=matchCase?value:value.toLocaleLowerCase();
        if(condition==="empty")return cell.trim()==="";
        if(condition==="notEmpty")return cell.trim()!=="";
        if(condition==="contains")return left.indexOf(right)>=0;
        if(condition==="starts")return left.indexOf(right)===0;
        if(condition==="equals")return left===right;
        if(condition==="greater"||condition==="less"){var a=Number(cell),b=Number(value);return cell.trim()!==""&&value.trim()!==""&&Number.isFinite(a)&&Number.isFinite(b)&&(condition==="greater"?a>b:a<b)}
        return false;
      });
      return {rows:[header].concat(filtered),summary:"Kept "+filtered.length+" of "+data.length+" data rows."};
    }
    if(mode==="extract"){
      var selected=Array.from(document.querySelectorAll(".extractCol:checked")).map(function(el){return Number(el.value)}).sort(function(a,b){return a-b});
      if(!selected.length)throw new Error("Select at least one column.");
      return {rows:[selected.map(function(i){return header[i]||""})].concat(data.map(function(row){return selected.map(function(i){return row[i]||""})})),summary:"Extracted "+selected.length+" columns and "+data.length+" data rows."};
    }
    if(mode==="reorder"){
      var order=document.getElementById("columnOrder").value.split(",").map(function(v){return Number(v.trim())-1});
      if(order.some(function(i){return !Number.isInteger(i)||i<0||i>=width(rows)})||new Set(order).size!==order.length||order.length!==width(rows))throw new Error("Enter every column number once, from 1 to "+width(rows)+".");
      return {rows:[order.map(function(i){return header[i]||""})].concat(data.map(function(row){return order.map(function(i){return row[i]||""})})),summary:"Reordered "+order.length+" columns."};
    }
    if(mode==="rename"){
      var inputs=Array.from(document.querySelectorAll(".renameHeader"));
      var renamed=header.slice();inputs.forEach(function(el){renamed[Number(el.dataset.column)]=el.value});
      return {rows:[renamed].concat(data),summary:"Renamed "+inputs.length+" column headings."};
    }
    if(mode==="rowCount")return {rows:[["Metric","Value"],["Data rows",data.length]],summary:"This file contains "+data.length.toLocaleString()+" data rows."};
    if(mode==="columnCount")return {rows:[["Metric","Value"],["Columns",width(rows)]],summary:"This file contains "+width(rows).toLocaleString()+" columns."};
    if(mode==="transpose"){
      var w=width(rows),transposed=Array.from({length:w},function(_,c){return rows.map(function(row){return row[c]||""})});
      return {rows:transposed,summary:"Transposed "+rows.length+" rows and "+w+" columns."};
    }
    if(mode==="search"){
      var query=document.getElementById("searchValue").value;if(!query)throw new Error("Enter a search term.");
      var sensitive=document.getElementById("searchCase").checked,needle=sensitive?query:query.toLocaleLowerCase();
      var found=data.filter(function(row){return row.some(function(v){var value=sensitive?String(v):String(v).toLocaleLowerCase();return value.indexOf(needle)>=0})});
      return {rows:[header].concat(found),summary:"Found "+found.length+" matching rows out of "+data.length+"."};
    }
    if(mode==="group"){
      var groupCol=Number(document.getElementById("groupCol").value),valueCol=Number(document.getElementById("groupValueCol").value),operation=document.getElementById("groupOperation").value;
      var groups=new Map();data.forEach(function(row){var key=String(row[groupCol]||"");if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)});
      var groupRows=Array.from(groups.entries()).map(function(entry){var values=entry[1].map(function(row){var n=Number(String(row[valueCol]||"").trim());return String(row[valueCol]||"").trim()!==""&&Number.isFinite(n)?n:NaN}).filter(Number.isFinite);return [entry[0],operation==="count"?entry[1].length:numericSummary(values,operation)]});
      return {rows:[[header[groupCol]||"Group",operation==="count"?"Count":operation==="sum"?"Sum":"Average"]].concat(groupRows),summary:"Grouped "+data.length+" rows into "+groupRows.length+" groups."};
    }
    if(mode==="pivot"){
      var rowCol=Number(document.getElementById("pivotRowCol").value),colCol=Number(document.getElementById("pivotColumnCol").value),valueCol=Number(document.getElementById("pivotValueCol").value),pivotOp=document.getElementById("pivotOperation").value;
      var rowKeys=[],colKeys=[],cells=new Map();
      data.forEach(function(row){var rk=String(row[rowCol]||""),ck=String(row[colCol]||"");if(rowKeys.indexOf(rk)<0)rowKeys.push(rk);if(colKeys.indexOf(ck)<0)colKeys.push(ck);var key=JSON.stringify([rk,ck]);if(!cells.has(key))cells.set(key,{sum:0,count:0});var cell=cells.get(key);if(pivotOp==="count")cell.count++;else{var n=Number(String(row[valueCol]||"").trim());if(String(row[valueCol]||"").trim()!==""&&Number.isFinite(n)){cell.sum+=n;cell.count++}}});
      if(colKeys.length>50)throw new Error("This pivot has more than 50 column categories. Filter the CSV first, then try again.");
      var pivotRows=[[header[rowCol]||"Row",...colKeys.map(function(k){return k||"(blank)"})]];
      rowKeys.forEach(function(rk){var out=[rk];colKeys.forEach(function(ck){var cell=cells.get(JSON.stringify([rk,ck]));out.push(!cell?"":pivotOp==="count"?cell.count:cell.count?(pivotOp==="average"?cell.sum/cell.count:cell.sum):"")});pivotRows.push(out)});
      return {rows:pivotRows,summary:"Created a pivot with "+rowKeys.length+" row categories and "+colKeys.length+" column categories."};
    }
    if(mode==="aggregate"){
      col=Number(document.getElementById("aggregateCol").value);op=document.getElementById("aggregateOperation").value;
      var vals=numberValues(rows,col),value=op==="count"?data.map(function(row){return row[col]}).filter(function(v){return String(v||"").trim()!==""}).length:numericSummary(vals,op);
      return {rows:[["Calculation","Value"],[op, value]],summary:op+" result: "+value};
    }
    if(mode==="unique"){
      col=Number(document.getElementById("uniqueCol").value);var seen=new Set(),unique=[];
      data.forEach(function(row){var value=String(row[col]||"");if(value.trim()!==""&&!seen.has(value)){seen.add(value);unique.push([value])}});
      return {rows:[[header[col]||"Value"]].concat(unique),summary:"Extracted "+unique.length+" unique non-empty values."};
    }
    throw new Error("This tool is not available.");
  }
  function setStatus(text,error){status.textContent=text;status.classList.toggle("is-error",!!error)}
  input.addEventListener("change",function(){
    var file=input.files&&input.files[0];if(!file){setStatus("");return}
    if(file.size>maxBytes){setStatus("Choose a file no larger than 50 MB.",true);return}
    fileName=file.name.replace(/\.(csv|tsv|txt)$/i,"")+".csv";
    file.text().then(function(text){try{var rows=parseCSV(text);buildOptions(rows);setStatus("Loaded "+file.name+". Set options, then run the tool.");output.hidden=true}catch(error){setStatus(error.message,true)}}).catch(function(){setStatus("Could not read the selected file.",true)});
  });
  document.getElementById("runDataTool").addEventListener("click",function(){
    var file=input.files&&input.files[0];if(!file){setStatus("Choose a CSV file first.",true);return}
    if(file.size>maxBytes){setStatus("Choose a file no larger than 50 MB.",true);return}
    setStatus("Reading file…");
    file.text().then(function(text){var result=run(parseCSV(text));resultRows=result.rows;summary.textContent=result.summary;var csv=serializeCSV(resultRows);preview.textContent=csv.slice(0,7000)+(csv.length>7000?"\n\nPreview shortened. Download the result for the complete CSV.":"");output.hidden=false;download.disabled=false;setStatus("Done. Review the preview and download the result.")}).catch(function(error){output.hidden=true;download.disabled=true;setStatus(error.message||"Could not process this CSV.",true)});
  });
  download.addEventListener("click",function(){if(!resultRows)return;var link=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF",serializeCSV(resultRows)],{type:"text/csv;charset=utf-8"}));link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)});
  document.getElementById("clearDataTool").addEventListener("click",function(){input.value="";options.innerHTML="";output.hidden=true;download.disabled=true;resultRows=null;fileName="data.csv";setStatus("")});
})();