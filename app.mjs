import {starter} from './starter.mjs';
import {uid,round,canonical,hydrate,macro,legacyNutrition,scaleNutrition,portionOptions,nutritionFor,totals,validateLabel,validateBackup,unitInfo} from './nutrition.mjs';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='mealTracker-v1';
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const format=(amount,unit='',qualifier='exact')=>amount===null?(qualifier==='trace'?'Trace':'Unknown'):(qualifier==='less_than'?'< ':'')+round(amount)+' '+unit;
let state,storageBlocked=false,draft=null,photos=[],scanning=false,scanController=null;
try{const saved=localStorage.getItem(KEY);state=saved?validateBackup(JSON.parse(saved)):{meals:starter.map(hydrate),entries:[],targets:{cal:2300,p:150}};}
catch{state={meals:[],entries:[],targets:{cal:2300,p:150}};storageBlocked=true;notify('Your saved diary could not be read. It has not been replaced. Restore a valid backup in Settings before saving new changes.');}
function notify(message){$('notice').textContent=message;$('notice').hidden=false;}
function ask(message){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='confirm-dialog';const paragraph=document.createElement('p');paragraph.textContent=message;dialog.append(paragraph);const buttons=document.createElement('div');buttons.className='buttons';const cancel=document.createElement('button'),accept=document.createElement('button');cancel.textContent='Cancel';cancel.className='secondary';accept.textContent='Continue';buttons.append(cancel,accept);dialog.append(buttons);document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();resolve(value);};cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.showModal();});}
function commit(next){
  if(storageBlocked){notify('Restore a valid backup before saving changes; your unreadable saved data is preserved.');return false;}
  try{localStorage.setItem(KEY,JSON.stringify(next));state=next;return true;}
  catch{notify('Could not save on this device. Free some browser storage or download a backup. The change has not been saved.');return false;}
}
function showTab(id){for(const tab of ['library','diary','add','settings'])$(tab).hidden=tab!==id;document.querySelectorAll('[data-tab]').forEach(button=>{if(button.dataset.tab===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
$('date').value=today();$('date').addEventListener('change',render);$('filter').addEventListener('change',renderLibrary);
$('startPhoto').addEventListener('click',()=>{showTab('add');$('takePhoto').focus()});
function macroText(item){const n=legacyNutrition(item);return [['energy_kcal','kcal'],['protein','g protein']].map(([key,unit])=>format(macro(n,key),unit)).join(' · ');}
function nutritionTable(rows){return '<div class="table-wrap"><table><thead><tr><th>Nutrient</th><th>Amount</th></tr></thead><tbody>'+rows.map(n=>'<tr><td>'+escape(n.name)+'</td><td>'+escape(format(n.amount,n.unit,n.qualifier))+'</td></tr>').join('')+'</tbody></table></div>';}
function fullLabelTable(label){return '<div class="table-wrap"><table><thead><tr><th>Nutrient</th>'+label.columns.map(c=>'<th>'+escape(c.label)+'</th>').join('')+'</tr></thead><tbody>'+label.nutrients.map(row=>'<tr><td>'+escape(row.name)+'</td>'+label.columns.map(c=>{const v=row.values.find(v=>v.column_id===c.id);return '<td>'+escape(v?format(v.amount,v.unit,v.qualifier):'Unknown')+'</td>'}).join('')+'</tr>').join('')+'</tbody></table></div>';}
function renderLibrary(){
  const filter=$('filter').value;
  $('mealList').innerHTML=state.meals.filter(m=>filter==='All'||m.source===filter).map(m=>'<article class="meal"><div class="meal-head"><div><span class="pill">'+escape(m.source||'Other')+'</span><br><b>'+escape(m.name)+'</b><small>'+escape(macroText(m))+'</small><small>'+escape(m.portion_description||'Your usual portion')+'</small></div><div class="log-controls"><label>Portions<input data-qty type="number" min="0.001" max="1000" step="any" value="1" aria-label="Portions of '+escape(m.name)+'"></label><button data-log="'+escape(m.id)+'">+ Log</button></div></div><details><summary>Full nutrition & label</summary>'+nutritionTable(legacyNutrition(m))+(m.label?'<details><summary>Original reviewed label</summary>'+fullLabelTable(m.label)+m.label.details.map(d=>'<p><b>'+escape(d.name)+':</b> '+escape(d.value)+'</p>').join('')+'</details>':'')+'</details></article>').join('')||'<p>No meals saved in this category.</p>';
}
function dayEntries(){return state.entries.filter(e=>e.date===$('date').value);}
function render(){
  renderLibrary();const entries=dayEntries(),all=totals(entries);
  for(const [key,id,target,unit] of [['energy_kcal','cal',state.targets.cal,'kcal'],['protein','protein',state.targets.p,'g']]){
    const group=all.find(t=>t.key===key&&(unit==='kcal'?unitInfo(t.unit)[0]==='kcal':unitInfo(t.unit)[0]==='mass'));
    const amount=group?round(group.amount*unitInfo(group.unit)[1]):0,partial=entries.length>0&&!group?.complete;
    $(id).textContent=entries.length&&!group?.known?'Unknown':(partial?'≥ ':'')+round(amount)+(id==='protein'?' g':'');
    $(id==='cal'?'calLeft':'proteinLeft').textContent=partial?'Partial total · target '+target+' '+unit:round(target-amount)+' '+unit+' remaining of '+target;
  }
  const cal=all.find(t=>t.key==='energy_kcal'&&t.unit==='kcal')?.amount||0;
  $('bar').style.width=Math.min(100,100*cal/state.targets.cal)+'%';
  $('coverage').textContent=entries.length?'Totals use the nutrition recorded for each meal. See Diary for every nutrient and data coverage.':'Log a meal to start your diary.';
  $('entryList').innerHTML=entries.map(e=>'<article class="entry"><div class="meal-head"><div><b>'+escape(e.name)+'</b><small>'+escape(e.qty)+' × '+escape(e.portion_description||'usual portion')+' · '+escape(macroText(e))+'</small></div><button class="danger" data-remove="'+escape(e.id)+'">Remove</button></div><details><summary>Nutrition for this entry</summary>'+nutritionTable(legacyNutrition(e))+'</details></article>').join('')||'<p>No meals logged for this date.</p>';
  $('nutrientTotals').innerHTML=all.length?'<div class="table-wrap"><table><thead><tr><th>Nutrient</th><th>Known total</th><th>Coverage</th></tr></thead><tbody>'+all.map(n=>'<tr><td>'+escape(n.name)+'</td><td>'+escape(n.known?format(n.amount,n.unit):'Unknown')+'</td><td>'+n.known+'/'+entries.length+' meals'+(n.complete?'':' · partial')+'</td></tr>').join('')+'</tbody></table></div>':'<p>No nutrient totals yet.</p>';
  $('targetCal').value=state.targets.cal;$('targetP').value=state.targets.p;
}
$('mealList').addEventListener('click',event=>{
  const button=event.target.closest('[data-log]');if(!button)return;
  const meal=state.meals.find(m=>m.id===button.dataset.log);if(!meal)return;
  if(!$('date').value)return notify('Choose a diary date first.');
  const raw=button.closest('.log-controls').querySelector('[data-qty]').value;
  const qty=Number(raw);if(!Number.isFinite(qty)||qty<=0||qty>1000)return notify('Enter a positive portion amount up to 1,000.');
  const nutrition=scaleNutrition(legacyNutrition(meal),qty),entry={id:uid(),date:$('date').value,mealId:meal.id,name:meal.name,source:meal.source,qty,portion_description:meal.portion_description,nutrition};
  for(const [field,key] of [['cal','energy_kcal'],['p','protein'],['c','carbohydrate'],['f','fat']])entry[field]=macro(nutrition,key);
  if(commit({...state,entries:[...state.entries,entry]})){render();notify('Added '+meal.name+' to '+$('date').value+'.');}
});
$('entryList').addEventListener('click',async event=>{const button=event.target.closest('[data-remove]');if(button&&await ask('Remove this diary entry?')&&commit({...state,entries:state.entries.filter(e=>e.id!==button.dataset.remove)}))render();});
$('targetForm').addEventListener('submit',event=>{event.preventDefault();const cal=Number($('targetCal').value),p=Number($('targetP').value);if(!Number.isFinite(cal)||!Number.isFinite(p)||cal<=0||p<=0)return;if(commit({...state,targets:{cal,p}})){render();notify('Targets saved.');}});
function download(name,contents,type){const link=document.createElement('a'),url=URL.createObjectURL(new Blob([contents],{type}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportJSON').addEventListener('click',()=>download('healthtracker-backup-'+today()+'.json',JSON.stringify({...state,version:3},null,2),'application/json'));
$('restore').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{if(file.size>20_000_000)throw Error('Backup is too large.');const next=validateBackup(JSON.parse(await file.text()));if(!await ask('Replace the current meals and diary with this backup?'))return;const wasBlocked=storageBlocked;storageBlocked=false;if(!commit(next)){storageBlocked=wasBlocked;return;}render();notify('Backup restored.');}catch(error){notify('Could not restore backup: '+error.message);}
});
const csvCell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
$('exportCSV').addEventListener('click',()=>{
  const rows=[['Date','Meal','Source','Portions','Usual portion','Nutrient','Key','Amount','Unit','Qualifier']];
  for(const entry of state.entries)for(const n of legacyNutrition(entry))rows.push([entry.date,entry.name,entry.source,entry.qty,entry.portion_description,n.name,n.key,n.amount,n.unit,n.qualifier]);
  download('healthtracker-diary-'+today()+'.csv',rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
});
$('copySummary').addEventListener('click',async()=>{
  const entries=dayEntries(),text='Food diary '+$('date').value+'\n'+entries.map(e=>e.name+' ('+e.qty+' usual portion): '+legacyNutrition(e).map(n=>n.name+': '+format(n.amount,n.unit,n.qualifier)).join(', ')).join('\n')+'\nTOTALS\n'+totals(entries).map(n=>n.name+': '+(n.known?format(n.amount,n.unit):'Unknown')+(n.complete?'':' (partial: '+n.known+'/'+entries.length+' meals)')).join('\n');
  try{await navigator.clipboard.writeText(text);notify('Diary copied.');}catch{download('healthtracker-day-'+$('date').value+'.txt',text,'text/plain');notify('Clipboard unavailable. Downloaded your diary as text.');}
});

// Scan-code preferences are separate from diary data and never enter backups.
const SCAN_CODE_KEY='healthtracker-scan-code-v1';
function codePreferenceStatus(message){$('rememberCodeStatus').textContent=message;$('savedCodeStatus').textContent=message;}
function rememberCode(){
  if(!$('rememberScanCode').checked)return;
  const code=$('scanCode').value.trim();
  try{
    if(code)localStorage.setItem(SCAN_CODE_KEY,code);else localStorage.removeItem(SCAN_CODE_KEY);
    codePreferenceStatus(code?'Scan code remembered on this device.':'Enter a scan code to remember it.');
  }catch{codePreferenceStatus('Could not update the saved code. Your browser may have blocked storage; the previous setting may remain.');}
}
function forgetCode(){
  try{localStorage.removeItem(SCAN_CODE_KEY);$('scanCode').value='';$('rememberScanCode').checked=false;codePreferenceStatus('Scan code forgotten on this device.');}
  catch{codePreferenceStatus('Could not remove the saved code. Clear this site’s browser data to remove it.');}
}
try{
  const code=localStorage.getItem(SCAN_CODE_KEY);
  if(code){$('scanCode').value=code;$('rememberScanCode').checked=true;codePreferenceStatus('Scan code remembered on this device.');}
  else codePreferenceStatus('No scan code saved on this device.');
}catch{codePreferenceStatus('Remembering the scan code is unavailable in this browser.');}
$('rememberScanCode').addEventListener('change',()=>{
  if($('rememberScanCode').checked)rememberCode();
  else try{localStorage.removeItem(SCAN_CODE_KEY);codePreferenceStatus('The code will only be used for this page session.');}
  catch{$('rememberScanCode').checked=true;codePreferenceStatus('Could not remove the saved code. Use Forget code or clear this site’s browser data.');}
});
$('scanCode').addEventListener('input',rememberCode);
$('forgetScanCode').addEventListener('click',forgetCode);
$('forgetScanCodeSettings').addEventListener('click',forgetCode);

// Photos stay in memory and are only transmitted after the explicit Read label action.
function setScanStatus(message){$('scanStatus').textContent=message;}
function renderPhotos(){
  $('photoList').innerHTML=photos.map((p,i)=>'<div class="photo"><img src="'+p.data+'" alt="Label photo '+(i+1)+'"><button type="button" class="secondary" data-photo-remove="'+i+'" '+(scanning?'disabled':'')+'>Remove '+(i+1)+'</button></div>').join('');
  $('scanControls').hidden=!photos.length;
}
async function preparePhoto(file){
  if(!file.type.startsWith('image/'))throw Error('Choose a photo file.');
  if(file.size>30_000_000)throw Error('That photo is too large. Choose one smaller than 30 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{image.src=url;await image.decode();const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/jpeg',0.88)};}
  catch{throw Error('This photo format could not be opened. Try a JPEG photo or screenshot.');}finally{URL.revokeObjectURL(url);}
}
let preparing=false;
async function addPhotos(event){
  const files=[...event.target.files];event.target.value='';if(scanning||preparing||!files.length)return;
  if(files.length+photos.length>3)return setScanStatus('Use up to three photos of the same product. Remove a photo to replace it.');
  preparing=true;$('scan').disabled=true;
  try{setScanStatus('Preparing photos…');const added=[];for(const file of files)added.push(await preparePhoto(file));if([...photos,...added].reduce((sum,p)=>sum+p.data.length,0)>3_800_000)throw Error('Photos are too large together. Use fewer photos or crop closer to the label.');photos.push(...added);renderPhotos();setScanStatus('Photos ready. Check that these are all the same product, then read the label.');}
  catch(error){setScanStatus(error.message);}finally{preparing=false;$('scan').disabled=false;}
}
$('takePhoto').addEventListener('click',()=>$('camera').click());$('choosePhoto').addEventListener('click',()=>$('photos').click());
$('camera').addEventListener('change',addPhotos);$('photos').addEventListener('change',addPhotos);
$('photoList').addEventListener('click',event=>{const button=event.target.closest('[data-photo-remove]');if(button&&!scanning){photos.splice(Number(button.dataset.photoRemove),1);renderPhotos();}});
$('cancelScan').addEventListener('click',()=>scanController?.abort());
function scanBusy(value){scanning=value;for(const id of ['scan','takePhoto','choosePhoto','manualMeal','scanCode','rememberScanCode','forgetScanCode','forgetScanCodeSettings'])$(id).disabled=value;$('mealForm').inert=value;$('cancelScan').hidden=!value;renderPhotos();}
$('scan').addEventListener('click',async()=>{
  if(scanning||preparing||!photos.length)return;
  const code=$('scanCode').value.trim();if(!code)return setScanStatus('Enter the private scan access code for this app.');
  rememberCode();
  if(draft&&!await ask('Replace the current unsaved label review with a new scan?'))return;
  scanController=new AbortController();const controller=scanController;
  const timer=setTimeout(()=>controller.abort('timeout'),58_000);scanBusy(true);setScanStatus('Reading your label with AI… This may take up to a minute.');
  try{
    const response=await fetch('/.netlify/functions/scan-label',{method:'POST',headers:{'Content-Type':'application/json','x-scan-code':code},body:JSON.stringify({images:photos.map(p=>p.data)}),signal:controller.signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error(data?.error||(response.status===429?'Scan limit reached. Try again later.':'The scan service is unavailable. Check Netlify setup and deployment.'));
    draft=validateLabel(data.label);openEditor();
    setScanStatus('Label read. Review every column and choose the portion you actually eat.');
  }catch(error){setScanStatus(controller.signal.aborted?(controller.signal.reason==='timeout'?'The scan timed out. Try fewer photos or a closer crop.':'Scan cancelled. An AI request already in progress may still use credit.'):error.message);}
  finally{clearTimeout(timer);scanController=null;scanBusy(false);}
});

function newCell(columnId,unit='g'){return {column_id:columnId,amount:null,unit,qualifier:'unknown',raw:'',uncertain:false};}
function manualLabel(){const id='usual';return {product_name:'',pack:{amount:null,unit:'g'},serving:{amount:null,unit:null},servings_per_pack:null,columns:[{id,label:'Per usual portion',basis:'per_serving',preparation:'as_sold'}],nutrients:[['energy_kcal','Energy (kcal)','kcal'],['protein','Protein','g'],['carbohydrate','Carbohydrate','g'],['fat','Fat','g']].map(([key,name,unit])=>({key,name,values:[newCell(id,unit)]})),details:[],warnings:[]};}
$('manualMeal').addEventListener('click',async()=>{if(draft&&!await ask('Start a new meal and discard the unsaved label review?'))return;draft=manualLabel();openEditor();$('mealName').focus();});
function openEditor(){
  $('mealForm').hidden=false;$('mealName').value=draft.product_name;$('mealSource').value='Other';$('portionCount').value='1';$('portionDescription').value='';$('reviewed').checked=false;
  $('packAmount').value=draft.pack.amount??'';const unit=draft.pack.unit||'g';if(![...$('packUnit').options].some(o=>o.value===unit)){const option=document.createElement('option');option.value=unit;option.textContent=unit;$('packUnit').append(option);}$('packUnit').value=unit;
  $('servings').value=draft.servings_per_pack??'';$('servingInfo').textContent=draft.serving.amount?'Printed serving: '+draft.serving.amount+' '+(draft.serving.unit||''):'';
  $('warnings').innerHTML=draft.warnings.map(w=>'<p class="warning">'+escape(w)+'</p>').join('');
  renderEditor();$('mealForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderEditor(){
  $('nutritionEditor').innerHTML='<table><thead><tr><th>Nutrient</th>'+draft.columns.map(c=>'<th>'+escape(c.label)+'</th>').join('')+'<th>Remove</th></tr></thead><tbody>'+draft.nutrients.map((row,ri)=>'<tr><td><input class="nutrient-name" data-name="'+ri+'" aria-label="Nutrient '+(ri+1)+' name" value="'+escape(row.name)+'" required></td>'+draft.columns.map((col,ci)=>{
    let value=row.values.find(v=>v.column_id===col.id);if(!value){value=newCell(col.id);row.values.push(value);}
    const valueText=value.amount===null?(value.qualifier==='trace'?'trace':''):(value.qualifier==='less_than'?'<':'')+value.amount;
    return '<td class="'+(value.uncertain?'uncertain':'')+'"><input data-value-row="'+ri+'" data-value-col="'+ci+'" aria-label="'+escape(row.name+' '+col.label)+'" value="'+escape(valueText)+'" placeholder="Unknown"><input class="unit" data-unit-row="'+ri+'" data-unit-col="'+ci+'" aria-label="'+escape(row.name+' unit for '+col.label)+'" value="'+escape(value.unit)+'" placeholder="Unit" required>'+ (value.uncertain?'<small>Check reading: '+escape(value.raw)+'</small>':'')+'</td>';
  }).join('')+'<td><button type="button" class="danger" data-remove-row="'+ri+'" aria-label="Remove '+escape(row.name)+'">×</button></td></tr>').join('')+'</tbody></table>';
  renderColumns();renderDetails();renderPortions();
}
const bases=[['per_100g','Per 100g'],['per_100ml','Per 100ml'],['per_serving','Per serving'],['per_pack','Per pack'],['other','Other / reference intake']];
const preparations=[['as_sold','As sold'],['prepared','Prepared'],['unspecified','Not specified']];
function options(values,current){return values.map(([value,label])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+label+'</option>').join('');}
function renderColumns(){
  $('columnEditor').innerHTML=draft.columns.map((col,i)=>'<div class="column"><label for="colLabel'+i+'">Column '+(i+1)+' heading</label><input id="colLabel'+i+'" data-column="'+i+'" data-field="label" value="'+escape(col.label)+'" required><div class="row"><div><label for="colBasis'+i+'">Values are for</label><select id="colBasis'+i+'" data-column="'+i+'" data-field="basis">'+options(bases,col.basis)+'</select></div><div><label for="colPrep'+i+'">Preparation</label><select id="colPrep'+i+'" data-column="'+i+'" data-field="preparation">'+options(preparations,col.preparation)+'</select></div></div><p><button type="button" class="danger" data-remove-column="'+i+'">Remove column</button></p></div>').join('');
}
function renderDetails(){
  $('detailEditor').innerHTML=draft.details.map((d,i)=>'<div class="detail-row"><label for="detailName'+i+'">Detail '+(i+1)+'</label><input id="detailName'+i+'" data-detail="'+i+'" data-field="name" value="'+escape(d.name)+'" required><label for="detailValue'+i+'">Text</label><textarea id="detailValue'+i+'" data-detail="'+i+'" data-field="value">'+escape(d.value)+'</textarea><button type="button" class="danger" data-remove-detail="'+i+'">Remove detail</button></div>').join('');
}
function currentOption(){return portionOptions(draft).find(o=>o.id===$('portionBasis').value);}
function renderPortions(){
  const previous=$('portionBasis').value,items=portionOptions(draft);
  $('portionBasis').innerHTML='<option value="">Choose a column or calculated pack</option>'+items.map(o=>'<option value="'+escape(o.id)+'">'+escape(o.label)+'</option>').join('');
  if(items.some(o=>o.id===previous))$('portionBasis').value=previous;
  previewPortion();
}
function previewPortion(){
  $('reviewed').checked=false;const choice=currentOption(),count=Number($('portionCount').value);
  $('portionNote').textContent=choice?.calculated?'Calculated using the pack quantity or servings per pack above. Check both before saving.':'Choose “Per pack” to save a full pack. If that column isn’t printed, enter the pack quantity to calculate it from per-100g/ml values, or servings per pack to use a per-serving column. Prepared values need their own printed basis.';
  $('portionPreview').innerHTML=choice&&count>0&&Number.isFinite(count)?nutritionTable(nutritionFor(draft,choice,count)):'<p>Select the basis for your usual portion. For a 350g portion using a per-100g column, enter 3.5 above.</p>';
}
function parseAmount(input){
  const raw=input.trim();if(!raw)return {amount:null,qualifier:'unknown'};if(/^trace$/i.test(raw))return {amount:null,qualifier:'trace'};
  const match=raw.match(/^(<\s*)?(\d+(?:[.,]\d+)?|[.,]\d+)$/);if(!match)throw Error('Use a non-negative number, <0.1, trace, or leave blank for unknown.');
  const amount=Number(match[2].replace(',','.'));if(!Number.isFinite(amount))throw Error('Enter a finite amount.');
  return {amount,qualifier:match[1]?'less_than':'exact'};
}
$('nutritionEditor').addEventListener('input',event=>{
  const input=event.target;$('reviewed').checked=false;
  if(input.dataset.name!==undefined){const row=draft.nutrients[Number(input.dataset.name)];row.name=input.value;row.key=canonical(input.value);if(/^energy$/i.test(input.value)&&row.values[0]?.unit==='kcal')row.key='energy_kcal';renderPortions();return;}
  const ri=Number(input.dataset.valueRow??input.dataset.unitRow),ci=Number(input.dataset.valueCol??input.dataset.unitCol);if(!Number.isInteger(ri)||!Number.isInteger(ci))return;
  const cell=draft.nutrients[ri].values.find(v=>v.column_id===draft.columns[ci].id);
  if(input.dataset.unitRow!==undefined){cell.unit=input.value.trim();renderPortions();return;}
  try{Object.assign(cell,parseAmount(input.value));cell.uncertain=false;input.setCustomValidity('');input.closest('td').classList.remove('uncertain');previewPortion();}catch(error){input.setCustomValidity(error.message);}
});
$('nutritionEditor').addEventListener('click',event=>{const button=event.target.closest('[data-remove-row]');if(button){draft.nutrients.splice(Number(button.dataset.removeRow),1);renderEditor();}});
$('columnEditor').addEventListener('input',event=>{const input=event.target;if(input.dataset.column!==undefined){draft.columns[Number(input.dataset.column)][input.dataset.field]=input.value;$('reviewed').checked=false;}});
$('columnEditor').addEventListener('change',event=>{const input=event.target;if(input.dataset.column!==undefined){draft.columns[Number(input.dataset.column)][input.dataset.field]=input.value;renderEditor();}});
$('columnEditor').addEventListener('click',event=>{const button=event.target.closest('[data-remove-column]');if(!button)return;if(draft.columns.length===1)return notify('Keep at least one nutrition column.');const [col]=draft.columns.splice(Number(button.dataset.removeColumn),1);draft.nutrients.forEach(n=>n.values=n.values.filter(v=>v.column_id!==col.id));renderEditor();});
$('detailEditor').addEventListener('input',event=>{const input=event.target;if(input.dataset.detail!==undefined){draft.details[Number(input.dataset.detail)][input.dataset.field]=input.value;$('reviewed').checked=false;}});
$('detailEditor').addEventListener('click',event=>{const button=event.target.closest('[data-remove-detail]');if(button){draft.details.splice(Number(button.dataset.removeDetail),1);renderDetails();$('reviewed').checked=false;}});
$('addNutrient').addEventListener('click',()=>{if(draft.nutrients.length>=100)return notify('A label can have up to 100 nutrient rows.');draft.nutrients.push({key:'nutrient_'+uid(),name:'New nutrient',values:draft.columns.map(c=>newCell(c.id))});renderEditor();});
$('addColumn').addEventListener('click',()=>{if(draft.columns.length>=12)return notify('A label can have up to 12 columns.');const id='col_'+uid();draft.columns.push({id,label:'New column',basis:'other',preparation:'unspecified'});draft.nutrients.forEach(n=>n.values.push(newCell(id)));renderEditor();});
$('addDetail').addEventListener('click',()=>{draft.details.push({name:'',value:''});renderDetails();$('reviewed').checked=false;});
for(const id of ['packAmount','packUnit','servings'])$(id).addEventListener('input',()=>{draft.pack={amount:$('packAmount').value===''?null:Number($('packAmount').value),unit:$('packUnit').value};draft.servings_per_pack=$('servings').value===''?null:Number($('servings').value);renderPortions();});
$('portionBasis').addEventListener('change',previewPortion);$('portionCount').addEventListener('input',previewPortion);
$('mealForm').addEventListener('submit',event=>{
  event.preventDefault();if(!draft)return;
  try{
    const option=currentOption(),count=Number($('portionCount').value),name=$('mealName').value.trim();
    if(!option||!name||!Number.isFinite(count)||count<=0||count>1000)throw Error('Enter a meal name, choose a nutrition basis and enter a valid portion.');
    if(!$('reviewed').checked)throw Error('Check the values and confirm the review before saving.');
    draft.product_name=name;validateLabel(draft);
    const nutrition=nutritionFor(draft,option,count);
    if(!nutrition.length)throw Error('Add at least one nutrient amount column, not just percentage reference intakes.');
    if(!nutrition.some(n=>n.amount!==null||n.qualifier==='trace'))throw Error('Enter at least one nutrition value before saving.');
    const meal={id:uid(),name,source:$('mealSource').value,type:$('mealType').value,nutrition,label:structuredClone(draft),portion:{columnId:option.columnId,factor:option.factor,count,calculated:option.calculated},portion_description:$('portionDescription').value.trim()||count+' × '+option.label};
    for(const [field,key] of [['cal','energy_kcal'],['p','protein'],['c','carbohydrate'],['f','fat']])meal[field]=macro(nutrition,key);
    if(commit({...state,meals:[...state.meals,meal]})){
      draft=null;photos=[];renderPhotos();$('mealForm').hidden=true;$('mealForm').reset();if(!$('rememberScanCode').checked)$('scanCode').value='';$('filter').value='All';render();showTab('library');notify('Saved '+name+'. You can log it again from your meal library without another scan.');
    }
  }catch(error){notify(error.message);}
});
window.addEventListener('beforeunload',event=>{if(draft||scanning){event.preventDefault();event.returnValue='';}});
render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
