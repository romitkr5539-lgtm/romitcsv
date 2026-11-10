const $=s=>document.querySelector(s);
const kind=new URLSearchParams(location.search).get("tool")||"viewer";
if(kind==="editor")location.replace("csv-editor.html");
if(kind==="cleaner")location.replace("csv-cleaner.html");
if(kind==="merger")location.replace("csv-merger.html");
if(kind==="splitter")location.replace("csv-splitter.html");
if(kind==="validator")location.replace("csv-validator.html");
if(kind==="csvjson")location.replace("csv-to-json.html");
if(kind==="jsoncsv")location.replace("json-to-csv.html");
if(kind==="excel"||kind==="csvexcel")location.replace("csv-to-excel.html");
if(kind==="excelcsv")location.replace("excel-to-csv.html");
if(kind==="pdf"||kind==="csvpdf")location.replace("csv-to-pdf.html");
if(kind==="sql"||kind==="csvsql")location.replace("csv-to-sql.html");
const app=$("#app");

function escapeHTML(v){
  return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

function detectDelimiter(text){
  const first=text.replace(/^\uFEFF/,"").split(/\r?\n/).find(x=>x.trim())||"";
  const choices=[",",";","\t","|"];
  const counts=new Map(choices.map(d=>[d,0]));
  let inQuotes=false;
  for(let i=0;i<first.length;i++){
    const ch=first[i];
    if(ch==='"'){
      if(inQuotes&&first[i+1]==='"')i++;
      else inQuotes=!inQuotes;
    }else if(!inQuotes&&counts.has(ch))counts.set(ch,counts.get(ch)+1);
  }
  return choices.reduce((best,d)=>counts.get(d)>counts.get(best)?d:best,",");
}

function parse(text){
  text=String(text||"").replace(/^\uFEFF/,"");
  const d=detectDelimiter(text), rows=[], row=[], cell=[];
  let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(ch==='"'){
      if(inQuotes&&next==='"'){cell.push('"');i++}
      else if(inQuotes)inQuotes=false;
      else if(cell.length===0)inQuotes=true;
      else cell.push(ch);
    }else if(ch===d&&!inQuotes){
      row.push(cell.join(""));cell.length=0;
    }else if((ch==="\n"||ch==="\r")&&!inQuotes){
      if(ch==="\r"&&next==="\n")i++;
      row.push(cell.join(""));cell.length=0;
      if(row.some(v=>v.trim()!=="")) rows.push(row.slice());
      row.length=0;
    }else cell.push(ch);
  }
  if(inQuotes)throw new Error("CSV contains an unterminated quoted field.");
  if(cell.length||row.length){
    row.push(cell.join(""));
    if(row.some(v=>v.trim()!=="")) rows.push(row.slice());
  }
  const width=rows.reduce((m,r)=>Math.max(m,r.length),0);
  return rows.map(r=>Array.from({length:width},(_,i)=>r[i]??""));
}

function csv(rows){
  return rows.map(r=>r.map(v=>{
    v=String(v??"");
    return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
  }).join(",")).join("\r\n");
}

function dl(name,data,type){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([data],{type}));
  a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function viewer(){
  if(!app) return;

  app.innerHTML=`
    <div class="viewer-upload-inner" id="viewerUpload">
      <div class="viewer-upload-icon">
        <svg viewBox="0 0 48 48" fill="none"><path d="M24 31V8m0 0-8 8m8-8 8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 27v10a4 4 0 0 0 4 4h18a4 4 0 0 0 4-4V27" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
      </div>
      <strong>Drag &amp; drop your CSV file here</strong>
      <span>or</span>
      <input id="viewerFile" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden>
      <button class="viewer-primary" id="browseCsv" type="button">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" stroke-width="1.8"/><path d="M12 10v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Browse CSV File
      </button>
      <small>Supports CSV, TSV &nbsp;•&nbsp; Max file size: 50MB</small>
      <div id="viewerStatus" class="tool-status" role="status"></div>
    </div>`;

  const workspace=$("#workspace");
  let rows=[], filtered=[], page=1, pageSize=10, sortCol=-1, sortDir=1, fileLabel="sample_data.csv", fileBytes=12400;

  function setStatus(message,error=false){
    const el=$("#viewerStatus");
    if(el){el.textContent=message;el.classList.toggle("error",error)}
  }

  function formatBytes(bytes){
    if(!bytes) return "—";
    const units=["B","KB","MB","GB"];
    const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3);
    return (bytes/Math.pow(1024,i)).toFixed(i?1:0)+" "+units[i];
  }

  function showWorkspace(){
    if(!workspace)return;
    workspace.hidden=false;
    workspace.classList.add("visible");
  }

  function scrollToWorkspace(){
    requestAnimationFrame(()=>workspace?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  function render(){
    if(!workspace || !rows.length)return;
    const q=($("#tableSearch")?.value||"").trim().toLowerCase();

    filtered=rows.slice(1)
      .map((r,i)=>({r,index:i+1}))
      .filter(x=>!q||x.r.some(v=>String(v).toLowerCase().includes(q)));

    if(sortCol>=0){
      filtered.sort((a,b)=>{
        const av=String(a.r[sortCol]??"");
        const bv=String(b.r[sortCol]??"");
        return av.localeCompare(bv,undefined,{numeric:true,sensitivity:"base"})*sortDir;
      });
    }

    const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
    page=Math.min(page,totalPages);
    const start=(page-1)*pageSize;
    const visible=filtered.slice(start,start+pageSize);
    const header=rows[0]||[];
    workspace.innerHTML=`
      <div class="viewer-data-card">
        <div class="viewer-filebar">
          <div class="viewer-fileinfo">
            <div class="viewer-fileicon"><span>CSV</span></div>
            <div>
              <strong title="${escapeHTML(fileLabel)}">${escapeHTML(fileLabel)}</strong>
              <span>${formatBytes(fileBytes)} &nbsp;•&nbsp; ${Math.max(0,rows.length-1).toLocaleString()} rows &nbsp;•&nbsp; ${header.length} columns</span>
            </div>
          </div>
          <div class="viewer-file-actions">
            <div class="viewer-export">
              <button class="viewer-download" id="exportMenuToggle" type="button" aria-expanded="false" aria-controls="exportMenu">Download CSV <span>⌄</span></button>
              <div class="viewer-export-menu" id="exportMenu" hidden>
                <button id="downloadCsv" type="button">Download CSV</button>
                <button id="savePdf" type="button">Save as PDF</button>
              </div>
            </div>
            <button class="viewer-edit" id="toggleCellEdit" type="button">Edit cells</button><button class="viewer-edit" id="editCsv" type="button">Open Editor</button>
            <button class="viewer-clear" id="clearCsv" type="button">Clear</button>
          </div>
        </div>

        <div class="viewer-table-tools">
          <div class="viewer-search">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input id="tableSearch" placeholder="Search in table..." autocomplete="off">
          </div>
          <div class="viewer-selects">
            <label>Rows per page
              <select id="rowsPerPage">
                <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
            </label>
            <label>Sort by
              <select id="sortColumn"><option value="-1">None</option>${header.map((h,i)=>'<option value="'+i+'">'+escapeHTML(h||("Column "+(i+1)))+'</option>').join("")}</select>
            </label>
          </div>
        </div>

        <div class="viewer-table-wrap">
          <table>
            <thead><tr><th class="row-num-head">#</th>${header.map((h,i)=>'<th>'+escapeHTML(h||("Column "+(i+1)))+'<button class="th-sort" data-col="'+i+'" type="button">↕</button></th>').join("")}</tr></thead>
            <tbody>${visible.length?visible.map(x=>'<tr><td class="row-number">'+x.index+'</td>'+x.r.map((value,col)=>'<td class="editable-cell" data-row="'+x.index+'" data-col="'+col+'" title="'+escapeHTML(value)+'">'+escapeHTML(value)+'</td>').join("")+'</tr>').join(""):'<tr><td colspan="'+(header.length+1)+'" class="no-results">No matching rows found.</td></tr>'}</tbody>
          </table>
        </div>

        <div class="viewer-pager">
          <span>Showing ${visible.length?start+1:0} to ${Math.min(start+visible.length,filtered.length)} of ${filtered.length.toLocaleString()} rows</span>
          <div class="pager-buttons">
            <button id="prevPage" type="button" ${page<=1?"disabled":""}>‹</button>
            <b>${page}</b>
            <button id="nextPage" type="button" ${page>=totalPages?"disabled":""}>›</button>
          </div>
        </div>
      </div>`;

    $("#rowsPerPage").value=String(pageSize);
    $("#sortColumn").value=String(sortCol);

    $("#tableSearch").oninput=()=>{page=1;render()};
    $("#rowsPerPage").onchange=e=>{pageSize=Number(e.target.value);page=1;render()};
    $("#sortColumn").onchange=e=>{sortCol=Number(e.target.value);sortDir=1;page=1;render()};

    const exportMenu=$("#exportMenu");
    const exportToggle=$("#exportMenuToggle");
    exportToggle.onclick=()=>{
      exportMenu.hidden=!exportMenu.hidden;
      exportToggle.setAttribute("aria-expanded",String(!exportMenu.hidden));
    };

    $("#downloadCsv").onclick=()=>{
      exportMenu.hidden=true;
      exportToggle.setAttribute("aria-expanded","false");
      dl(fileLabel.replace(/\.(csv|tsv)$/i,"")+".csv",csv(rows),"text/csv;charset=utf-8");
    };

    $("#savePdf").onclick=()=>{
      exportMenu.hidden=true;
      exportToggle.setAttribute("aria-expanded","false");
      const printView=document.createElement("section");
      printView.className="pdf-print-view";
      printView.innerHTML=`
        <h1>${escapeHTML(fileLabel)}</h1>
        <p>${Math.max(0,rows.length-1).toLocaleString()} rows · ${header.length} columns</p>
        <table>
          <thead><tr>${header.map(h=>"<th>"+escapeHTML(h)+"</th>").join("")}</tr></thead>
          <tbody>${rows.slice(1).map(row=>"<tr>"+row.map(cell=>"<td>"+escapeHTML(cell)+"</td>").join("")+"</tr>").join("")}</tbody>
        </table>`;
      document.body.appendChild(printView);
      try{window.print()}finally{printView.remove()}
    };

    $("#toggleCellEdit").onclick=()=>{
      const cells=[...workspace.querySelectorAll(".editable-cell")];
      if(!cells.length)return;
      const enable=!cells[0].isContentEditable;
      cells.forEach(cell=>{cell.contentEditable=String(enable);cell.spellcheck=false;cell.oninput=()=>{rows[Number(cell.dataset.row)][Number(cell.dataset.col)]=cell.textContent;cell.title=cell.textContent}});
      const button=$("#toggleCellEdit");
      button.textContent=enable?"Save edits":"Edit cells";
      button.setAttribute("aria-pressed",String(enable));
      if(!enable)render();
    };

    $("#editCsv").onclick=()=>{
      sessionStorage.setItem("romitcsv.editorData",JSON.stringify(rows));
      sessionStorage.setItem("romitcsv.editorFileName",fileLabel);
      sessionStorage.setItem("romitcsv.editorFileBytes",String(fileBytes));
      location.href="csv-editor.html";
    };

    $("#clearCsv").onclick=()=>{
      rows=[];filtered=[];workspace.innerHTML="";workspace.hidden=true;
      app.hidden=false;
      $("#viewerFile").value="";
      $("#viewerUpload").hidden=false;
    };

    $("#prevPage").onclick=()=>{if(page>1){page--;render()}};
    $("#nextPage").onclick=()=>{if(page<totalPages){page++;render()}};

    document.querySelectorAll(".th-sort").forEach(btn=>{
      btn.onclick=()=>{
        const col=Number(btn.dataset.col);
        if(sortCol===col)sortDir*=-1;
        else{sortCol=col;sortDir=1}
        page=1;render();
      };
    });
  }

  function readFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(reader.error||new Error("File read failed"));
      reader.readAsText(file);
    });
  }

  async function openFile(file){
    if(!file){setStatus("Choose a CSV file first.",true);return}
    const supportedExtension=/\.(csv|tsv)$/i.test(file.name||"");
    const supportedMime=["text/csv","text/tab-separated-values","application/vnd.ms-excel"].includes(file.type);
    if(!supportedExtension&&!supportedMime){setStatus("Choose a CSV or TSV file.",true);return}
    if(file.size>50*1024*1024){setStatus("This file is larger than 50MB.",true);return}

    setStatus("Reading your CSV…");
    try{
      const text=await readFile(file);
      const parsed=parse(text);
      if(!parsed.length){setStatus("This CSV file is empty.",true);return}
      if(parsed.length===1&&parsed[0].length===1&&!String(parsed[0][0]).trim()){
        setStatus("This CSV file is empty.",true);return
      }

      rows=parsed;
      fileLabel=file.name||"data.csv";
      fileBytes=file.size;
      page=1;pageSize=10;sortCol=-1;sortDir=1;
      setStatus("");
      app.hidden=true;
      showWorkspace();
      render();
      scrollToWorkspace();
    }catch(error){
      console.error(error);
      setStatus("Could not read this CSV file. Please check that it is a valid text CSV/TSV file.",true);
    }
  }

  $("#browseCsv").onclick=e=>{
    e.preventDefault();
    $("#viewerFile").click();
  };

  $("#viewerFile").onchange=e=>openFile(e.target.files?.[0]);

  const upload=$("#viewerUpload");
  ["dragenter","dragover"].forEach(type=>{
    upload.addEventListener(type,e=>{
      e.preventDefault();e.stopPropagation();upload.classList.add("drag");
    });
  });
  ["dragleave","drop"].forEach(type=>{
    upload.addEventListener(type,e=>{
      e.preventDefault();e.stopPropagation();upload.classList.remove("drag");
    });
  });
  upload.addEventListener("drop",e=>openFile(e.dataTransfer?.files?.[0]));

  function sample(){
    rows=[
      ["ID","Name","Email","Age","City"],
      ["1","John Doe","john@example.com","28","New York"],
      ["2","Jane Smith","jane@example.com","32","London"],
      ["3","Mike Johnson","mike@example.com","24","Paris"],
      ["4","Emily Brown","emily@example.com","29","Berlin"],
      ["5","David Wilson","david@example.com","33","Tokyo"],
      ["6","Sarah Miller","sarah@example.com","27","Sydney"],
      ["7","James Taylor","james@example.com","41","Toronto"],
      ["8","Olivia Anderson","olivia@example.com","35","Singapore"],
      ["9","Daniel Thomas","daniel@example.com","22","Mumbai"],
      ["10","Sophia Jackson","sophia@example.com","26","Madrid"]
    ];
    fileLabel="sample_data.csv";fileBytes=new TextEncoder().encode(csv(rows)).length;page=1;pageSize=10;sortCol=-1;sortDir=1;
    showWorkspace();render();
  }

  function loadPending(){
    try{
      const request=indexedDB.open("RomitCSVDB",1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("files"))request.result.createObjectStore("files")};
      request.onsuccess=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains("files")){db.close();sample();return}
        const tx=db.transaction("files","readwrite");
        const store=tx.objectStore("files");
        const get=store.get("pendingCsv");
        get.onsuccess=()=>{
          const value=get.result;
          if(value){
            store.delete("pendingCsv");
            const parsed=parse(value);
            if(parsed.length){
              rows=parsed;fileLabel="data.csv";fileBytes=0;page=1;pageSize=10;sortCol=-1;sortDir=1;
              app.hidden=true;
              showWorkspace();render();scrollToWorkspace();
            }else sample();
          }else sample();
        };
        get.onerror=()=>sample();
        tx.oncomplete=()=>db.close();
      };
      request.onerror=()=>sample();
    }catch(error){
      console.error(error);sample();
    }
  }

  loadPending();
}

function input(m=false){
  app.innerHTML='<input id="f" type="file" accept=".csv,text/csv" '+(m?"multiple":"")+'> <button class="btn" id="go">Process</button><div id="s" class="tool-status"></div><div id="out"></div>';
}
function files(){
  return Promise.all([...$("#f").files].map(f=>new Promise(z=>{const r=new FileReader;r.onload=()=>z(parse(r.result));r.readAsText(f)})));
}
function clean(){
  input();$("#go").onclick=async()=>{const r=(await files())[0];if(!r?.length)return;
    const seen=new Set,o=[r[0]];r.slice(1).forEach(x=>{const k=JSON.stringify(x);if(x.some(v=>v.trim())&&!seen.has(k)){seen.add(k);o.push(x)}});
    $("#out").innerHTML='<p>Removed '+(r.length-o.length)+' rows.</p><button class="btn" id="d">Download cleaned CSV</button>';
    $("#d").onclick=()=>dl("cleaned.csv",csv(o),"text/csv");
  };
}
function merge(){
  input(true);$("#go").onclick=async()=>{const a=await files();if(!a.length)return;const o=[a[0][0],...a.flatMap(x=>x.slice(1))];
    $("#out").innerHTML='<p>Created '+(o.length-1)+' combined rows.</p><button class="btn" id="d">Download merged CSV</button>';
    $("#d").onclick=()=>dl("merged.csv",csv(o),"text/csv");
  };
}
function split(){
  input();app.insertAdjacentHTML("afterbegin",'<input id="n" type="number" value="1000" min="1">');
  $("#go").onclick=async()=>{const r=(await files())[0],n=+$("#n").value||1000;if(!r?.length)return;
    const p=[];for(let i=1;i<r.length;i+=n)p.push([r[0],...r.slice(i,i+n)]);
    $("#out").innerHTML=p.map((x,i)=>'<button class="btn" data-i="'+i+'">Download part '+(i+1)+'</button> ').join("");
    document.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>dl("part-"+(+b.dataset.i+1)+".csv",csv(p[+b.dataset.i]),"text/csv"));
  };
}
function validate(){
  input();$("#go").onclick=async()=>{const r=(await files())[0];if(!r?.length)return;const n=r[0].length,b=r.slice(1).filter(x=>x.length!==n).length;
    $("#out").innerHTML='<p>'+Math.max(0,r.length-1)+' rows · '+n+' columns.</p><p>'+(b?b+" rows have inconsistent columns.":"CSV structure looks consistent.")+'</p>';
  };
}
function cjson(){
  input();$("#go").onclick=async()=>{const r=(await files())[0];if(!r?.length)return;const h=r[0],j=JSON.stringify(r.slice(1).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""]))),null,2);
    $("#out").innerHTML='<pre>'+escapeHTML(j)+'</pre><button class="btn" id="d">Download JSON</button>';
    $("#d").onclick=()=>dl("data.json",j,"application/json");
  };
}
function jcsv(){
  app.innerHTML='<textarea id="j" placeholder="Paste JSON array of objects"></textarea><br><button class="btn" id="go">Convert</button><div id="s" class="tool-status"></div><div id="out"></div>';
  $("#go").onclick=()=>{try{const a=JSON.parse($("#j").value);if(!Array.isArray(a)||!a.every(x=>x&&typeof x==="object"&&!Array.isArray(x)))throw 0;
    const h=[...new Set(a.flatMap(x=>Object.keys(x)))],r=[h,...a.map(x=>h.map(k=>x[k]??""))];
    $("#out").innerHTML='<p>Converted '+a.length+' records.</p><button class="btn" id="d">Download CSV</button>';
    $("#d").onclick=()=>dl("data.csv",csv(r),"text/csv");
  }catch(e){$("#s").textContent="Invalid JSON. Use an array of objects."}};
}
const names={viewer:["CSV Table Viewer","Open, search, sort and inspect CSV data."],cleaner:["CSV Cleaner","Remove blank and duplicate rows."],merger:["CSV Merger","Combine multiple CSV files."],splitter:["CSV Splitter","Split CSV into smaller files."],validator:["CSV Validator","Check CSV row consistency."],csvjson:["CSV to JSON","Convert CSV rows to JSON."],jsoncsv:["JSON to CSV","Convert JSON objects to CSV."]};
const n=names[kind]||["CSV Tool","Work with CSV data in your browser."];
if($("#title"))$("#title").textContent=n[0];
if($("#desc"))$("#desc").textContent=n[1];
({viewer,cleaner:clean,merger:merge,splitter:split,validator:validate,csvjson:cjson,jsoncsv:jcsv})[kind]?.();
const savedTheme=localStorage.getItem("romitcsv.theme.v2")!=="light"?"dark":"light";
document.body.classList.toggle("dark",savedTheme==="dark");
$("#theme").onclick=()=>{
  const dark=!document.body.classList.contains("dark");
  document.body.classList.toggle("dark",dark);
  localStorage.setItem("romitcsv.theme.v2",dark?"dark":"light");
};
$("#menu").onclick=()=>$("#nav").classList.toggle("open");
