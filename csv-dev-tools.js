(function(){
  "use strict";
  var mode=document.body.dataset.devTool||"",input=document.getElementById("devFile"),options=document.getElementById("devOptions"),status=document.getElementById("devStatus"),output=document.getElementById("devOutput"),preview=document.getElementById("devPreview"),download=document.getElementById("devDownload"),copy=document.getElementById("devCopy");
  var fileName="converted",generated="",generatedName="",maxBytes=50*1024*1024;
  var extension={"csv-to-javascript-array":"js","csv-to-typescript-interface":"ts","csv-to-php-array":"php","csv-to-python-dictionary":"py","csv-to-postgresql":"sql","csv-to-mysql":"sql","csv-to-sqlite":"sql","csv-to-pandas-dataframe":"py","csv-to-java-objects":"java","csv-to-csharp-objects":"cs"};
  function detectDelimiter(text){
    var line=(String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find(function(x){return x.trim()})||""),choices=[",","\t",";","|"];
    var counts=choices.map(function(d){var q=false,n=0;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"'){i++;continue}q=!q}else if(line[i]===d&&!q)n++}return [d,n]});
    counts.sort(function(a,b){return b[1]-a[1]});return counts[0][1]?counts[0][0]:",";
  }
  function parseCSV(text){
    text=String(text||"").replace(/^\uFEFF/,"");var delim=detectDelimiter(text),rows=[],row=[],cell="",quoted=false;
    for(var i=0;i<text.length;i++){var ch=text[i],next=text[i+1];
      if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++}else quoted=!quoted}
      else if(ch===delim&&!quoted){row.push(cell);cell=""}
      else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&next==="\n")i++;row.push(cell);cell="";if(row.length>1||row[0]!=="")rows.push(row);row=[]}
      else cell+=ch;
    }
    if(quoted)throw new Error("This file has an unclosed quoted field.");
    if(cell!==""||row.length){row.push(cell);rows.push(row)}return rows;
  }
  function esc(value){return String(value==null?"":value).replace(/[&<>\"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]})}
  function identifier(value,index,style,used){
    var base=String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9_$]+/g," ").trim();
    var parts=base.split(/\s+/).filter(Boolean);if(!parts.length)parts=["column",String(index+1)];
    var name=style==="pascal"?parts.map(function(p){return p.charAt(0).toUpperCase()+p.slice(1)}).join(""):parts[0].toLowerCase()+parts.slice(1).map(function(p){return p.charAt(0).toUpperCase()+p.slice(1)}).join("");
    if(!/^[A-Za-z_$]/.test(name))name="_"+name;
    var reserved=new Set(["class","interface","enum","default","new","return","public","private","static","void","string","int","float","null","true","false","var","const","let","function","package","import","this","super","extends","implements","namespace","using","operator","delete"]);
    if(reserved.has(name))name+="_";
    var original=name,count=2;while(used.has(name)){name=original+count;count++}used.add(name);return name;
  }
  function prep(rows){
    if(!rows.length)throw new Error("The selected file is empty.");
    var w=Math.max(rows[0].length,rows.reduce(function(n,row){return Math.max(n,row.length)},0));
    if(!w)throw new Error("The file has no columns.");
    var usedHeaders=new Set(),headers=Array.from({length:w},function(_,i){var base=String(rows[0][i]||"").trim()||("column_"+(i+1)),name=base,n=2;while(usedHeaders.has(name)){name=base+"_"+n;n++}usedHeaders.add(name);return name});
    var records=rows.slice(1).map(function(row){var obj={};headers.forEach(function(h,i){obj[h]=String(row[i]||"")});return obj});
    return {headers:headers,records:records};
  }
  function buildOptions(){
    var html="";
    if(mode==="csv-to-postgresql"||mode==="csv-to-mysql"||mode==="csv-to-sqlite")html='<label>Table name<input id="tableName" type="text" value="csv_data"></label><label class="dev-check"><input id="nullBlanks" type="checkbox"> Write empty cells as NULL</label>';
    if(mode==="csv-to-java-objects")html='<label>Java class name<input id="className" type="text" value="CsvRow"></label>';
    if(mode==="csv-to-csharp-objects")html='<label>C# class name<input id="className" type="text" value="CsvRecord"></label>';
    options.innerHTML=html;
  }
  function phpString(value){return '"'+String(value).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\$/g,"\\$").replace(/\r/g,"\\r").replace(/\n/g,"\\n")+'"';}
  function jsObjects(headers,records,keys){return records.map(function(record){return "  { "+headers.map(function(h,i){return JSON.stringify(keys?keys[i]:h)+": "+JSON.stringify(record[h]||"")}).join(", ")+" }"}).join(",\n")}
  function makeCode(rows){
    var data=prep(rows),headers=data.headers,records=data.records,keys,code="",ext=extension[mode]||"txt",className;
    if(mode==="csv-to-javascript-array")code="export const data = [\n"+jsObjects(headers,records)+"\n];\n";
    if(mode==="csv-to-typescript-interface"){
      var used=new Set();keys=headers.map(function(h,i){return identifier(h,i,"camel",used)});
      var fields=keys.map(function(k){return "  "+k+": string;"}).join("\n");
      var objects=records.map(function(record){return "  { "+headers.map(function(h,i){return keys[i]+": "+JSON.stringify(record[h]||"")}).join(", ")+" }"}).join(",\n");
      code="export interface CsvRow {\n"+fields+"\n}\n\nexport const data: CsvRow[] = [\n"+objects+"\n];\n";
    }
    if(mode==="csv-to-php-array")code="<?php\n$data = [\n"+records.map(function(r){return "    ["+headers.map(function(h){return phpString(h)+" => "+phpString(r[h]||"")}).join(", ")+"]"}).join(",\n")+"\n];\n";
    if(mode==="csv-to-python-dictionary"||mode==="csv-to-pandas-dataframe"){
      var pyRows="[\n"+records.map(function(r){return "    {"+headers.map(function(h){return " "+JSON.stringify(h)+": "+JSON.stringify(r[h]||"")}).join(",")+" }"}).join(",\n")+"\n]";
      code=mode==="csv-to-python-dictionary"?"data = "+pyRows+"\n":"import pandas as pd\n\nrecords = "+pyRows+"\ndf = pd.DataFrame(records)\n";
    }
    if(mode==="csv-to-postgresql"||mode==="csv-to-mysql"||mode==="csv-to-sqlite"){
      var dialect=mode==="csv-to-postgresql"?"postgresql":mode==="csv-to-mysql"?"mysql":"sqlite",q=dialect==="mysql"?String.fromCharCode(96):'"',table=(document.getElementById("tableName").value||"csv_data").trim(),nullBlanks=document.getElementById("nullBlanks").checked;
      function quoteIdent(name){return q+String(name).replace(new RegExp(q,"g"),q+q)+q}
      var usedCols=new Set(),cols=headers.map(function(h,i){return identifier(h,i,"snake",usedCols).replace(/([A-Z])/g,"_$1").toLowerCase()});
      var seen=new Set();cols=cols.map(function(c){var n=c,j=2;while(seen.has(n)){n=c+"_"+j;j++}seen.add(n);return n});
      var sqlTable=table.split(".").map(quoteIdent).join("."),stmts=[];
      for(var start=0;start<records.length;start+=500){
        var batch=records.slice(start,start+500);
        var values=batch.map(function(r){return "  ("+headers.map(function(h){var v=String(r[h]||"");if(v===""&&nullBlanks)return "NULL";return "'"+v.replace(/'/g,"''").replace(/\0/g,"")+"'" }).join(", ")+")"});
        stmts.push("INSERT INTO "+sqlTable+" ("+cols.map(quoteIdent).join(", ")+") VALUES\n"+values.join(",\n")+";");
      }
      code=stmts.join("\n\n")+(stmts.length?"\n":"");
    }
    if(mode==="csv-to-java-objects"){
      className=identifier(document.getElementById("className").value||"CsvRow",0,"pascal",new Set());
      var javaUsed=new Set();keys=headers.map(function(h,i){return identifier(h,i,"camel",javaUsed)});
      var declaration=keys.map(function(k){return "  private final String "+k+";"}).join("\n");
      var args=keys.map(function(k){return "String "+k}).join(", "),assigns=keys.map(function(k){return "    this."+k+" = "+k+";"}).join("\n");
      var getters=keys.map(function(k){return "  public String get"+k.charAt(0).toUpperCase()+k.slice(1)+"() { return "+k+"; }"}).join("\n");
      var objects=records.map(function(r){return "    new "+className+"("+headers.map(function(h){return JSON.stringify(r[h]||"")}).join(", ")+")"}).join(",\n");
      code="import java.util.List;\n\npublic class "+className+" {\n"+declaration+"\n\n  public "+className+"("+args+") {\n"+assigns+"\n  }\n\n"+getters+"\n\n  public static final List<"+className+"> DATA = List.of(\n"+objects+"\n  );\n}\n";ext="java";
    }
    if(mode==="csv-to-csharp-objects"){
      className=identifier(document.getElementById("className").value||"CsvRecord",0,"pascal",new Set());
      var csUsed=new Set();keys=headers.map(function(h,i){return identifier(h,i,"pascal",csUsed)});
      var props=keys.map(function(k){return "    public string "+k+" { get; set; } = \"\";"}).join("\n");
      var objects=records.map(function(r){return "        new "+className+" { "+headers.map(function(h,i){return keys[i]+" = "+JSON.stringify(r[h]||"")}).join(", ")+" }"}).join(",\n");
      code="using System.Collections.Generic;\n\npublic class "+className+" {\n"+props+"\n}\n\npublic static class CsvData {\n  public static readonly List<"+className+"> Rows = new List<"+className+"> {\n"+objects+"\n  };\n}\n";ext="cs";
    }
    if((mode==="csv-to-postgresql"||mode==="csv-to-mysql"||mode==="csv-to-sqlite")&&!records.length)code="-- No data rows to insert.\n";
    if(!code)throw new Error("This code converter is not available.");
    var baseName=fileName.replace(/\.(csv|tsv|txt)$/i,"").replace(/[^A-Za-z0-9_-]/g,"_")||"csv_data";
    if(mode==="csv-to-java-objects"||mode==="csv-to-csharp-objects")baseName=className;
    return {code:code,name:baseName+"."+ext,rows:records.length,columns:headers.length};
  }
  function setStatus(message,error){status.textContent=message;status.classList.toggle("is-error",!!error)}
  input.addEventListener("change",function(){
    var file=input.files&&input.files[0];if(!file)return;
    if(file.size>maxBytes){setStatus("Choose a file no larger than 50 MB.",true);return}
    fileName=file.name;buildOptions();setStatus("Loaded "+file.name+". Set any options, then convert.");
  });
  document.getElementById("runDevTool").addEventListener("click",function(){
    var file=input.files&&input.files[0];if(!file){setStatus("Choose a CSV file first.",true);return}
    if(file.size>maxBytes){setStatus("Choose a file no larger than 50 MB.",true);return}
    setStatus("Converting…");
    file.text().then(function(text){var result=makeCode(parseCSV(text));generated=result.code;generatedName=result.name;preview.textContent=generated;output.hidden=false;download.disabled=false;copy.disabled=false;setStatus(result.rows+" data rows · "+result.columns+" columns converted to "+generatedName+".")}).catch(function(error){output.hidden=true;download.disabled=true;copy.disabled=true;setStatus(error.message||"Could not convert the selected CSV.",true)});
  });
  download.addEventListener("click",function(){if(!generated)return;var link=document.createElement("a"),url=URL.createObjectURL(new Blob([generated],{type:"text/plain;charset=utf-8"}));link.href=url;link.download=generatedName;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)});
  copy.addEventListener("click",function(){if(!generated)return;navigator.clipboard.writeText(generated).then(function(){setStatus("Code copied to clipboard.")}).catch(function(){setStatus("Clipboard access is unavailable. Download the code file instead.",true)})});
  document.getElementById("clearDevTool").addEventListener("click",function(){input.value="";options.innerHTML="";output.hidden=true;download.disabled=true;copy.disabled=true;generated="";setStatus("")});
})();