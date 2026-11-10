(()=>{
  const workspace=document.getElementById("editorWorkspace");if(!workspace)return;
  let active=null,bar=null,address=null,valueInput=null;
  function columnName(n){let name="";for(n++;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name}
  function sync(cell){if(!cell)return;active=cell;if(!bar)return;address.value=columnName(Number(cell.dataset.col))+String(Number(cell.dataset.row)+1);valueInput.value=cell.value}
  function ensureBar(){const card=workspace.querySelector(".editor-data-card");if(!card||card.querySelector(".sheet-formula-bar"))return;bar=document.createElement("div");bar.className="sheet-formula-bar";bar.innerHTML='<label>Cell <input class="sheet-cell-address" aria-label="Selected cell" readonly></label><span aria-hidden="true">fx</span><input class="sheet-cell-value" aria-label="Selected cell value" type="text" placeholder="Select a cell to edit its value">';card.insertBefore(bar,card.querySelector(".editor-table-wrap"));address=bar.querySelector(".sheet-cell-address");valueInput=bar.querySelector(".sheet-cell-value");if(active)sync(active);valueInput.addEventListener("input",()=>{if(!active)return;active.value=valueInput.value;active.dispatchEvent(new Event("input"))})}
  workspace.addEventListener("focusin",event=>{const cell=event.target.closest(".csv-cell");if(cell){ensureBar();sync(cell)}});
  new MutationObserver(ensureBar).observe(workspace,{childList:true,subtree:true});
  ensureBar();
})();
