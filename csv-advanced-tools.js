(function(){
 "use strict";
 var mode=document.body.dataset.advancedTool||"",input=document.getElementById("advancedFiles"),options=document.getElementById("advOptions"),status=document.getElementById("advStatus"),output=document.getElementById("advOutput"),summary=document.getElementById("advSummary"),preview=document.getElementById("advPreview"),visual=document.getElementById("advVisual"),download=document.getElementById("advDownload"),copy=document.getElementById("advCopy");
 var currentRows=[],currentFiles=[],resultText="",resultName="result.csv",resultMime="text/csv;charset=utf-8",resultBytes=null,maxBytes=50*1024*1024;
 var generator=mode==="csv-random-data-generator"||mode==="csv-template-generator"||mode==="csv-sample-data-generator";
 if(generator)input.closest("label").hidden=true;
 if(mode==="csv-diff-checker")input.multiple=true;
 function detectDelimiter(text){
   var line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(function(x){return x.trim()})||""),ds=[",","\t",";","|"];
   var counts=ds.map(function(d){var q=false,n=0;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"'){i++;continue}q=!q}else if(line[i]===d&&!q)n++}return [d,n]});
   counts.sort(function(a,b){return b[1]-a[1]});return counts[0][1]?counts[0][0]:",";
 }
 function parseCSV(text,delimiter){
   text=String(text||"").replace(/^\uFEFF/,"");var d=delimiter||detectDelimiter(text),rows=[],row=[],cell="",quoted=false;
   for(var i=0;i<text.length;i++){var ch=text[i],next=text[i+1];
    if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++}else quoted=!quoted}
    else if(ch===d&&!quoted){row.push(cell);cell=""}
    else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&next==="\n")i++;row.push(cell);cell="";if(row.length>1||row[0]!=="")rows.push(row);row=[]}
    else cell+=ch;
   }
   if(quoted)throw new Error("A quoted field is not closed.");
   if(cell!==""||row.length){row.push(cell);rows.push(row)}return rows;
 }
 function serializeCSV(rows,delimiter){
   var d=delimiter||",";
   return rows.map(function(row){return row.map(function(v){v=String(v==null?"":v);return (v.indexOf(d)>=0||/[\"\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v}).join(d)}).join("\r\n");
 }
 function esc(v){return String(v==null?"":v).replace(/[&<>\"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]})}
 function width(rows){return rows.reduce(function(n,r){return Math.max(n,r.length)},0)}
 function headers(rows){var h=rows[0]||[],used=new Set();return Array.from({length:width(rows)},function(_,i){var base=String(h[i]||"").trim()||("Column "+(i+1)),name=base,n=2;while(used.has(name)){name=base+"_"+n;n++}used.add(name);return name})}
 function optionsFor(rows){return headers(rows).map(function(h,i){return '<option value="'+i+'">'+esc(h)+'</option>'}).join("")}
 function setStatus(text,error){status.textContent=text;status.classList.toggle("is-error",!!error)}
 function showText(text,name,mime,summaryText){
   resultText=text;resultName=name;resultMime=mime||"text/plain;charset=utf-8";resultBytes=null;
   preview.textContent=text.slice(0,10000)+(text.length>10000?"\n\nPreview shortened. Download the complete result.":"");
   visual.innerHTML="";visual.hidden=true;preview.hidden=false;output.hidden=false;summary.textContent=summaryText;download.disabled=false;copy.disabled=false;
 }
 function renderResultTable(rows){
   visual.innerHTML="";var wrap=document.createElement("div"),table=document.createElement("table"),thead=document.createElement("thead"),tbody=document.createElement("tbody"),head=rows[0]||[];
   wrap.className="adv-result-table-wrap";table.className="adv-result-table";table.setAttribute("aria-label","CSV result table");
   var tr=document.createElement("tr");head.forEach(function(value){var th=document.createElement("th");th.scope="col";th.textContent=String(value==null?"":value);tr.appendChild(th)});thead.appendChild(tr);
   rows.slice(1).forEach(function(row){var line=document.createElement("tr");for(var i=0;i<head.length;i++){var td=document.createElement("td");td.textContent=String(row[i]==null?"":row[i]);line.appendChild(td)}tbody.appendChild(line)});
   table.appendChild(thead);table.appendChild(tbody);wrap.appendChild(table);visual.appendChild(wrap);visual.hidden=false;
 }
 function showRows(rows,name,summaryText){showText("\uFEFF"+serializeCSV(rows),name||"result.csv","text/csv;charset=utf-8",summaryText);renderResultTable(rows);preview.hidden=true}
 function addSelect(id,label,rows){return '<label>'+label+'<select id="'+id+'">'+optionsFor(rows)+'</select></label>'}
 function buildOptions(rows){
   currentRows=rows;var fields="";
   if(mode==="csv-to-chart")fields='<div class="adv-grid">'+addSelect("chartX","Category column",rows)+addSelect("chartY","Numeric value column",rows)+'<label>Chart style<select id="chartKind"><option value="bar">Bar chart</option><option value="line">Line chart</option></select></label></div>';
   if(mode==="csv-graph-generator")fields='<div class="adv-grid">'+addSelect("graphX","X axis (numeric)",rows)+addSelect("graphY","Y axis (numeric)",rows)+'</div>';
   if(mode==="csv-data-visualizer")fields='<p>Creates a missing-versus-filled cell chart for each column.</p>';
   if(mode==="csv-anonymizer")fields='<p>Select columns to anonymize. Repeated values receive the same replacement.</p><div class="adv-check-grid">'+headers(rows).map(function(h,i){return '<label><input type="checkbox" class="anonCol" value="'+i+'"> '+esc(h)+'</label>'}).join("")+'</div>';
   if(mode==="csv-column-mapper")fields='<label>Target columns (one per line)<textarea id="targetColumns" rows="5">'+headers(rows).map(esc).join("\n")+'</textarea></label><div id="mappingFields"></div>';
   if(mode==="csv-formula-generator")fields='<div class="adv-grid"><label>New column heading<input id="formulaHeader" type="text" value="Calculated"></label><label>Formula template<input id="formulaText" type="text" value="=A{row}+B{row}"><small>Use {row} for the spreadsheet row number. The CSV header is row 1.</small></label></div>';
   if(mode==="csv-encoding-converter")fields='<div class="adv-grid"><label>Source encoding<select id="sourceEncoding"><option value="auto">Auto detect</option><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="utf-16le">UTF-16 little-endian</option><option value="utf-16be">UTF-16 big-endian</option></select></label><label>Output encoding<select id="targetEncoding"><option value="utf8">UTF-8</option><option value="utf8bom">UTF-8 with BOM</option><option value="utf16le">UTF-16 little-endian</option></select></label></div>';
   if(mode==="csv-delimiter-converter")fields='<div class="adv-grid"><label>Output delimiter<select id="targetDelimiter"><option value=",">Comma</option><option value="\\t">Tab</option><option value=";">Semicolon</option><option value="|">Pipe</option></select></label></div>';
   if(mode==="csv-to-api-json")fields='<label>Data property name<input id="apiRoot" type="text" value="data"></label>';
   if(mode==="csv-query-sql")fields='<label>SQL-style query<textarea id="sqlQuery" rows="5">SELECT * FROM data</textarea><small>Supports SELECT columns, one simple WHERE condition, ORDER BY, and LIMIT.</small></label>';
   options.innerHTML=fields;
   if(mode==="csv-column-mapper"){document.getElementById("targetColumns").addEventListener("input",renderMappings);renderMappings()}
 }
 function renderMappings(){
   if(mode!=="csv-column-mapper")return;
   var targets=document.getElementById("targetColumns").value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean);
   var selectOptions='<option value="">Skip</option>'+targets.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join("");
   document.getElementById("mappingFields").innerHTML=headers(currentRows).map(function(h,i){return '<label>'+esc(h)+' maps to<select class="mapTarget" data-source="'+i+'">'+selectOptions+'</select></label>'}).join("");
   document.querySelectorAll(".mapTarget").forEach(function(sel,i){var h=headers(currentRows)[i];if(targets.indexOf(h)>=0)sel.value=h});
 }
 function randomized(n){return Math.floor(Math.random()*n)}
 function makeGenerator(){
   if(mode==="csv-template-generator"){
     var hs=document.getElementById("templateHeaders").value.split(/\r?\n/).map(function(x){return x.trim()});
     if(!hs.length||hs.every(function(x){return !x}))throw new Error("Enter at least one column heading, one per line.");
     var count=Math.max(0,Math.min(10000,Number(document.getElementById("templateRows").value)||0));
     var rows=[hs];for(var i=0;i<count;i++)rows.push(hs.map(function(){return ""}));
     showRows(rows,"csv-template.csv","Created a CSV template with "+hs.length+" columns and "+count+" blank data rows.");return;
   }
   var count=Math.max(1,Math.min(10000,Number(document.getElementById("generatedRows").value)||100)),rows=[];
   if(mode==="csv-random-data-generator"){
     var schema=document.getElementById("randomSchema").value.split(/\r?\n/).map(function(x){var p=x.split(":");return {name:(p[0]||"").trim(),type:(p[1]||"text").trim().toLowerCase()}}).filter(function(x){return x.name});
     if(!schema.length)throw new Error("Enter at least one field and type, such as name:text.");
     rows.push(schema.map(function(x){return x.name}));
     var names=["Alex Morgan","Sam Taylor","Jordan Lee","Riley Chen","Casey Patel","Avery Kim"],cities=["Austin","Boston","Denver","Seattle","Toronto","Pune"];
     for(var r=0;r<count;r++)rows.push(schema.map(function(field,i){
       if(field.type==="number"||field.type==="integer")return String(field.type==="integer"?randomized(90)+10:(Math.random()*1000).toFixed(2));
       if(field.type==="email")return "user"+(r+1)+"@example.com";
       if(field.type==="date")return new Date(Date.UTC(2020+randomized(7),randomized(12),randomized(28)+1)).toISOString().slice(0,10);
       if(field.type==="name")return names[randomized(names.length)];
       if(field.type==="city")return cities[randomized(cities.length)];
       return "sample_"+(r+1)+"_"+(i+1);
     }));
   }else{
     var dataset=document.getElementById("sampleType").value;
     var defs=dataset==="products"?["Product ID","Product","Category","Price","Stock"]:dataset==="events"?["Event ID","Event","Date","Venue","Attendees"]:["Customer ID","Name","Email","City","Age"];
     rows.push(defs);
     var names2=["Alex Morgan","Sam Taylor","Jordan Lee","Riley Chen","Casey Patel","Avery Kim"],cities2=["Austin","Boston","Denver","Seattle","Toronto","Pune"],products=["Notebook","Desk Lamp","Water Bottle","Backpack","Headphones"],categories=["Office","Home","Outdoor","Electronics"];
     for(var r=0;r<count;r++){
       if(dataset==="products")rows.push(["P"+String(r+1).padStart(4,"0"),products[randomized(products.length)],categories[randomized(categories.length)],(Math.random()*90+10).toFixed(2),String(randomized(200))]);
       else if(dataset==="events")rows.push(["E"+String(r+1).padStart(4,"0"),"Sample Event "+(r+1),new Date(Date.UTC(2025,randomized(12),randomized(28)+1)).toISOString().slice(0,10),cities2[randomized(cities2.length)],String(randomized(500)+20)]);
       else rows.push([String(1000+r),names2[randomized(names2.length)],"customer"+(r+1)+"@example.com",cities2[randomized(cities2.length)],String(randomized(55)+18)]);
     }
   }
   showRows(rows,"generated-sample.csv","Generated "+(rows.length-1)+" data rows with "+rows[0].length+" columns.");
 }
 function parseQuery(rows){
   var query=document.getElementById("sqlQuery").value.trim().replace(/;$/,"");
   var match=query.match(/^SELECT\s+(.+?)\s+FROM\s+data(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
   if(!match)throw new Error("Use SELECT fields FROM data, with optional WHERE, ORDER BY, and LIMIT clauses.");
   var header=rows[0]||[],data=rows.slice(1),selectText=match[1].trim(),where=match[2],order=match[3],limit=match[4];
   function colIndex(name){name=name.trim().replace(/^["']|["']$/g,"");var i=header.findIndex(function(h){return String(h).trim()===name});if(i<0)throw new Error("Unknown column: "+name);return i}
   if(where){
     var w=where.match(/^(.+?)\s*(IS\s+NOT\s+NULL|IS\s+NULL|LIKE|>=|<=|<>|!=|=|>|<)\s*(.*?)$/i);
     if(!w)throw new Error("WHERE supports a column, comparison, and one value.");
     var wi=colIndex(w[1]),op=w[2].toUpperCase(),raw=w[3].trim(),wanted=raw.replace(/^(['"])(.*)\1$/,"$2");
     data=data.filter(function(row){var actual=String(row[wi]||"");if(op==="IS NULL")return actual.trim()==="";if(op==="IS NOT NULL")return actual.trim()!=="";if(op==="LIKE"){var pat=wanted.replace(/[.*+?^$()|[\]\\]/g,"\\$&").replace(/%/g,".*").replace(/_/g,".");return new RegExp("^"+pat+"$","i").test(actual)}if(["=", "!=","<>"].indexOf(op)>=0){var same=actual===wanted;return op==="="?same:!same}var a=Number(actual),b=Number(wanted);if(!Number.isFinite(a)||!Number.isFinite(b))return false;return op===">"?a>b:op==="<"?a<b:op===">="?a>=b:a<=b});
   }
   if(order){var ord=order.match(/^(.+?)(?:\s+(ASC|DESC))?$/i);if(!ord)throw new Error("ORDER BY expects a column and optional ASC or DESC.");var oi=colIndex(ord[1]),dir=(ord[2]||"ASC").toUpperCase()==="DESC"?-1:1;data=data.slice().sort(function(a,b){return String(a[oi]||"").localeCompare(String(b[oi]||""),undefined,{numeric:true,sensitivity:"base"})*dir})}
   if(limit)data=data.slice(0,Number(limit));
   var selected=selectText==="*"?header.map(function(_,i){return i}):selectText.split(",").map(colIndex);
   return {rows:[selected.map(function(i){return header[i]||""})].concat(data.map(function(row){return selected.map(function(i){return row[i]||""})})),summary:"Query returned "+data.length+" row(s). Supported SQL is a simple SELECT against the CSV table named data."};
 }
 function makeChart(rows,xIndex,yIndex,kind,scatter){
   var data=rows.slice(1).map(function(r){return {x:String(r[xIndex]||""),xv:Number(String(r[xIndex]||"").trim()),y:Number(String(r[yIndex]||"").trim())}}).filter(function(p){return p.x!==""&&Number.isFinite(p.y)&&(!scatter||Number.isFinite(p.xv))}).slice(0,40);
   if(!data.length)throw new Error("No numeric values were found in the selected value column.");
   var ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 800 420");svg.setAttribute("role","img");svg.setAttribute("aria-label",scatter?"CSV scatter graph":"CSV chart");
   function el(tag,attrs,text){var n=document.createElementNS(ns,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k])});if(text!==undefined)n.textContent=text;svg.appendChild(n);return n}
   el("line",{x1:70,y1:30,x2:70,y2:350,stroke:"#8b9baa","stroke-width":2});el("line",{x1:70,y1:350,x2:770,y2:350,stroke:"#8b9baa","stroke-width":2});
   var max=Math.max.apply(null,data.map(function(p){return p.y})),min=Math.min.apply(null,data.map(function(p){return p.y}));if(max===min){max+=1;min=0}
   if(scatter){var minX=Math.min.apply(null,data.map(function(p){return p.xv})),maxX=Math.max.apply(null,data.map(function(p){return p.xv}));if(maxX===minX)maxX=minX+1;data.forEach(function(p){var x=90+(p.xv-minX)/(maxX-minX)*650,y=330-(p.y-min)/(max-min)*270;el("circle",{cx:x,cy:y,r:5,fill:"#10b995"});el("title",{},p.x+": "+p.y)})}
   else if(kind==="line"){var points=data.map(function(p,i){return (90+i*(650/Math.max(1,data.length-1)))+","+(330-(p.y-min)/(max-min)*270)}).join(" ");el("polyline",{points:points,fill:"none",stroke:"#10b995","stroke-width":3});data.forEach(function(p,i){var x=90+i*(650/Math.max(1,data.length-1)),y=330-(p.y-min)/(max-min)*270;el("circle",{cx:x,cy:y,r:4,fill:"#6be2c5"});el("text",{x:x,y:375,"text-anchor":"middle",fill:"currentColor","font-size":10},p.x.slice(0,10))})}
   else{var bw=Math.min(34,600/data.length);data.forEach(function(p,i){var h=(p.y-min)/(max-min)*270+4,x=90+i*(650/data.length);el("rect",{x:x,y:330-h,width:bw,height:h,rx:3,fill:"#10b995"});el("text",{x:x+bw/2,y:375,"text-anchor":"middle",fill:"currentColor","font-size":10},p.x.slice(0,10))})}
   el("text",{x:18,y:30,fill:"currentColor","font-size":12},String(max));el("text",{x:18,y:350,fill:"currentColor","font-size":12},String(min));
   visual.innerHTML="";visual.appendChild(svg);return data;
 }
 function runRows(rows){
   var h=headers(rows),data=rows.slice(1),result,idx;
   if(mode==="csv-diff-checker"){
     var a=currentFiles[0],b=currentFiles[1],ra=parseCSV(a.text),rb=parseCSV(b.text),max=Math.max(ra.length,rb.length),diff=[["Row","Column","First file","Second file"]];
     for(var r=0;r<max;r++){var wa=ra[r]||[],wb=rb[r]||[],w=Math.max(wa.length,wb.length);for(var c=0;c<w;c++)if(String(wa[c]||"")!==String(wb[c]||""))diff.push([r===0?"Header":r,String((ra[0]||[])[c]||"Column "+(c+1)),wa[c]||"",wb[c]||""])}
     showRows(diff,"csv-diff-report.csv","Found "+(diff.length-1)+" cell difference(s) by row position.");return;
   }
   if(mode==="csv-query-sql"){result=parseQuery(rows);showRows(result.rows,"csv-query-results.csv",result.summary);return}
   if(mode==="csv-to-chart"||mode==="csv-graph-generator"){
     idx=Number(document.getElementById(mode==="csv-to-chart"?"chartX":"graphX").value);var yi=Number(document.getElementById(mode==="csv-to-chart"?"chartY":"graphY").value);
     var plotted=makeChart(rows,idx,yi,mode==="csv-to-chart"?document.getElementById("chartKind").value:"scatter",mode==="csv-graph-generator");
     summary.textContent="Plotted "+plotted.length+" rows using "+h[idx]+" and "+h[yi]+".";visual.hidden=false;output.hidden=false;preview.textContent="";download.disabled=true;copy.disabled=true;resultText="";return;
   }
   if(mode==="csv-data-visualizer"){
     var metrics=h.map(function(name,c){var vals=data.map(function(r){return String(r[c]||"")}),missing=vals.filter(function(v){return v.trim()===""}).length;return [name,vals.length-missing,missing]});
     var chartRows=[["Column","Filled","Missing"]].concat(metrics),ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 800 420");svg.setAttribute("role","img");svg.setAttribute("aria-label","CSV data completeness");
     var max=Math.max(1,data.length),bw=Math.min(36,620/Math.max(1,metrics.length));
     metrics.forEach(function(m,i){var x=100+i*(650/Math.max(1,metrics.length)),filled=Number(m[1]),missing=Number(m[2]);var r1=document.createElementNS(ns,"rect");r1.setAttribute("x",x);r1.setAttribute("y",340-filled/max*270);r1.setAttribute("width",bw);r1.setAttribute("height",filled/max*270);r1.setAttribute("fill","#10b995");svg.appendChild(r1);var r2=document.createElementNS(ns,"rect");r2.setAttribute("x",x);r2.setAttribute("y",340-(filled+missing)/max*270);r2.setAttribute("width",bw);r2.setAttribute("height",missing/max*270);r2.setAttribute("fill","#f59e0b");svg.appendChild(r2);var label=document.createElementNS(ns,"text");label.setAttribute("x",x);label.setAttribute("y",365);label.setAttribute("fill","currentColor");label.setAttribute("font-size","10");label.textContent=String(m[0]).slice(0,12);svg.appendChild(label)});
     showRows(chartRows,"csv-profile.csv","Profiled "+data.length+" rows across "+h.length+" columns.");visual.appendChild(svg);visual.hidden=false;return;
   }
   if(mode==="csv-anonymizer"){
     var cols=Array.from(document.querySelectorAll(".anonCol:checked")).map(function(x){return Number(x.value)});if(!cols.length)throw new Error("Select at least one column to anonymize.");
     var out=[rows[0]],maps=new Map();cols.forEach(function(c){maps.set(c,new Map())});
     data.forEach(function(row){var copy=row.slice();cols.forEach(function(c){var val=String(row[c]||"");if(val.trim()==="")return;var map=maps.get(c);if(!map.has(val))map.set(val,"Anon_"+String(map.size+1).padStart(4,"0"));copy[c]=map.get(val)});out.push(copy)});
     showRows(out,"anonymized.csv","Anonymized "+cols.length+" column(s). Repeated source values map consistently.");return;
   }
   if(mode==="csv-column-mapper"){
     var targets=document.getElementById("targetColumns").value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean);
     if(!targets.length)throw new Error("Enter at least one target column.");
     var mapping=Array.from(document.querySelectorAll(".mapTarget")).map(function(x){return x.value});
     var out=[targets],index=new Map();mapping.forEach(function(target,i){if(target){if(index.has(target))throw new Error("Map no more than one source column to each target heading.");index.set(target,i)}});
     data.forEach(function(row){out.push(targets.map(function(target){return index.has(target)?row[index.get(target)]||"":""}))});
     showRows(out,"mapped-columns.csv","Mapped "+index.size+" source columns into "+targets.length+" target columns.");return;
   }
   if(mode==="csv-formula-generator"){
     var name=document.getElementById("formulaHeader").value||"Calculated",formula=document.getElementById("formulaText").value;
     if(!formula)throw new Error("Enter a formula template.");
     var out=[(rows[0]||[]).concat(name)];data.forEach(function(row,i){out.push(row.concat(formula.replace(/\{row\}/g,String(i+2))))});
     showRows(out,"formula-column.csv","Added a formula column for "+data.length+" data rows.");return;
   }
   if(mode==="csv-delimiter-converter"){
     var target=document.getElementById("targetDelimiter").value;if(target==="\\t")target="\t";
     returnWithDelimiter(rows,target);return;
   }
   if(mode==="csv-to-api-json"){
     var root=(document.getElementById("apiRoot").value||"data").trim();if(!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(root))throw new Error("Use a simple property name such as data or records.");
     var obj={};obj[root]=data.map(function(row){var record={};h.forEach(function(name,i){record[name]=row[i]||""});return record});obj.meta={rowCount:data.length,columns:h};
     showText(JSON.stringify(obj,null,2),"api-data.json","application/json;charset=utf-8",data.length+" records wrapped in JSON property "+root+".");return;
   }
 }
 function returnWithDelimiter(rows,delimiter){
   resultText="\uFEFF"+serializeCSV(rows,delimiter);preview.textContent=resultText.slice(0,10000);resultName=delimiter===String.fromCharCode(9)?"converted-delimiter.tsv":"converted-delimiter.csv";resultMime="text/csv;charset=utf-8";download.disabled=false;copy.disabled=false;summary.textContent="Converted "+rows.length+" rows to "+(delimiter==="\t"?"tab":delimiter)+" delimited text.";output.hidden=false;renderResultTable(rows);preview.hidden=true;
 }
 function runEncoding(){
   var target=document.getElementById("targetEncoding").value,text=currentFiles[0].text,bytes;
   if(target==="utf8")bytes=new TextEncoder().encode(text);
   if(target==="utf8bom"){var body=new TextEncoder().encode(text);bytes=new Uint8Array(body.length+3);bytes.set([239,187,191]);bytes.set(body,3)}
   if(target==="utf16le"){bytes=new Uint8Array(text.length*2+2);bytes[0]=255;bytes[1]=254;for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);bytes[i*2+2]=c&255;bytes[i*2+3]=c>>8}}
   resultBytes=bytes;resultText="";resultName="converted-"+target+".csv";resultMime="application/octet-stream";preview.textContent=target.toUpperCase()+" file ready for download · "+bytes.length.toLocaleString()+" bytes";visual.innerHTML="";output.hidden=false;summary.textContent="Converted text to "+target.toUpperCase()+".";download.disabled=false;copy.disabled=true;
 }
 function readFile(file){
   return file.arrayBuffer().then(function(buffer){
     var bytes=new Uint8Array(buffer),offset=0,encoding="utf-8",selected=document.getElementById("sourceEncoding");
     if(bytes.length>=3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191)offset=3;
     if(bytes.length>=2&&bytes[0]===255&&bytes[1]===254){encoding="utf-16le";offset=2}
     else if(bytes.length>=2&&bytes[0]===254&&bytes[1]===255){encoding="utf-16be";offset=2}
     if(mode==="csv-encoding-converter"&&selected&&selected.value!=="auto"){encoding=selected.value;offset=(encoding==="utf-8"&&bytes[0]===239)?3:(encoding.indexOf("utf-16")===0&&bytes.length>=2&&bytes[0]===255?2:encoding.indexOf("utf-16")===0&&bytes.length>=2&&bytes[0]===254?2:0)}
     return new TextDecoder(encoding).decode(bytes.subarray(offset)).replace(/^\uFEFF/,"");
   }).then(function(text){return {file:file,text:text}});
 }
 function doRun(){
   var files=Array.from(input.files||[]);
   if(generator){makeGenerator();return}
   if(mode==="csv-diff-checker"){
     if(files.length!==2)throw new Error("Choose exactly two CSV files to compare.");
     if(files.some(function(f){return f.size>maxBytes}))throw new Error("Each file must be 50 MB or smaller.");
     return Promise.all(files.map(readFile)).then(function(info){currentFiles=info;runRows(parseCSV(info[0].text))});
   }
   if(files.length!==1)throw new Error("Choose one CSV file first.");
   if(files[0].size>maxBytes)throw new Error("Choose a file no larger than 50 MB.");
   return readFile(files[0]).then(function(info){currentFiles=[info];var rows=parseCSV(info.text);if(mode==="csv-encoding-converter"){runEncoding()}else{if(!options.innerHTML)buildOptions(rows);runRows(rows)}});
 }
 input.addEventListener("change",function(){
   var files=Array.from(input.files||[]);if(!files.length)return;if(files.some(function(f){return f.size>maxBytes})){setStatus("Each file must be 50 MB or smaller.",true);return}
   if(mode==="csv-diff-checker"){setStatus(files.length+" file(s) selected. Choose exactly two, then run the diff.");return}
   readFile(files[0]).then(function(info){currentFiles=[info];if(mode==="csv-encoding-converter"){buildOptions([]);setStatus("Loaded "+files[0].name+". Choose source and output encodings.")}else{var rows=parseCSV(info.text);buildOptions(rows);setStatus("Loaded "+files[0].name+". Set options, then run the tool.")}}).catch(function(e){setStatus(e.message,true)});
 });
 document.getElementById("runAdvanced").addEventListener("click",function(){setStatus("Working…");try{var result=doRun();if(result&&typeof result.then==="function")result.then(function(){setStatus("Done. Review the result below.")}).catch(function(e){setStatus(e.message||"Could not complete this operation.",true)});else setStatus("Done. Review the result below.")}catch(e){setStatus(e.message||"Could not complete this operation.",true)}});
 download.addEventListener("click",function(){if(!resultText&&!resultBytes)return;var blob=new Blob(resultBytes?[resultBytes]:[resultText],{type:resultMime}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=resultName;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)});
 copy.addEventListener("click",function(){if(!resultText)return;navigator.clipboard.writeText(resultText.replace(/^\uFEFF/,"")).then(function(){setStatus("Result copied to clipboard.")}).catch(function(){setStatus("Clipboard access is unavailable. Download the result instead.",true)})});
 document.getElementById("clearAdvanced").addEventListener("click",function(){input.value="";if(!generator)options.innerHTML="";currentRows=[];currentFiles=[];resultText="";resultBytes=null;output.hidden=true;visual.innerHTML="";visual.hidden=true;preview.hidden=false;download.disabled=true;copy.disabled=true;setStatus("")});
 if(mode==="csv-random-data-generator")options.innerHTML='<div class="adv-grid"><label>Rows to generate<input id="generatedRows" type="number" min="1" max="10000" value="100"></label><label>Fields and types, one per line<textarea id="randomSchema" rows="5">id:integer\nname:name\nemail:email\nage:integer\ncity:city</textarea><small>Types: text, integer, number, email, date, name, city</small></label></div>';
 if(mode==="csv-template-generator")options.innerHTML='<div class="adv-grid"><label>Column headings, one per line<textarea id="templateHeaders" rows="5">Name\nEmail\nDate</textarea></label><label>Blank data rows<input id="templateRows" type="number" min="0" max="10000" value="10"></label></div>';
 if(mode==="csv-sample-data-generator")options.innerHTML='<div class="adv-grid"><label>Sample dataset<select id="sampleType"><option value="customers">Customers</option><option value="products">Products</option><option value="events">Events</option></select></label><label>Rows to generate<input id="generatedRows" type="number" min="1" max="10000" value="100"></label></div>';
})();
