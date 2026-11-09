export const round = n => Number(n.toPrecision(12));
export const uid = () => globalThis.crypto.randomUUID();
export const canonical = name => {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({calories:'energy_kcal',energykcal:'energy_kcal',energykj:'energy_kj',protein:'protein',carbs:'carbohydrate',carbohydrates:'carbohydrate',carbohydrate:'carbohydrate',totalfat:'fat',fat:'fat',saturates:'saturates',saturatedfat:'saturates',sugars:'sugars',totalsugars:'sugars',fibre:'fibre',fiber:'fibre',dietaryfiber:'fibre',salt:'salt',sodium:'sodium'})[n] || name.toLowerCase().trim().replace(/\s+/g,'_');
};
export function unitInfo(unit) {
  const u=unit.trim().toLowerCase().replace(/[μµ]/g,'u');
  return ({g:['mass',1,'g'],mg:['mass',0.001,'g'],ug:['mass',0.000001,'g'],kcal:['kcal',1,'kcal'],kj:['kj',1,'kJ'],'%':['percent',1,'%']})[u] || [u,1,unit];
}
export function legacyNutrition(item) {
  if(Array.isArray(item.nutrition)) return item.nutrition;
  return [['cal','energy_kcal','Energy','kcal'],['p','protein','Protein','g'],['c','carbohydrate','Carbohydrate','g'],['f','fat','Fat','g']].filter(([key])=>Number.isFinite(item[key])).map(([key,id,name,unit])=>({key:id,name,amount:item[key],unit,qualifier:'exact'}));
}
export function macro(nutrition,key) {
  const row=nutrition.find(n=>canonical(n.key||n.name)===key && n.amount!==null && n.qualifier==='exact' && (key==='energy_kcal'?unitInfo(n.unit)[0]==='kcal':unitInfo(n.unit)[0]==='mass'));
  return row ? round(row.amount*unitInfo(row.unit)[1]) : null;
}
export function hydrate(item) {return {...item,nutrition:legacyNutrition(item)};}
export function scaleNutrition(nutrition,factor) {
  if(!Number.isFinite(factor)||factor<=0)throw Error('Enter a positive portion amount.');
  return nutrition.map(n=>({...n,amount:n.amount===null?null:round(n.amount*factor)}));
}
export function quantityIn(value,unit,wanted) {
  if(!Number.isFinite(value)||value<=0)return null;
  if(unit===wanted)return value;
  if(wanted==='g'&&unit==='kg')return value*1000;
  if(wanted==='ml'&&unit==='l')return value*1000;
  return null;
}
export function portionOptions(label) {
  const options=[];
  for(const column of label.columns) {
    // Reference-intake percentages are preserved for review, but aren't meal amounts.
    if(!label.nutrients.some(n=>n.values.some(v=>v.column_id===column.id&&v.unit!=='%')))continue;
    options.push({id:column.id,columnId:column.id,label:column.label,factor:1,calculated:false});
    let factor=null;
    if(column.basis==='per_100g')factor=quantityIn(label.pack.amount,label.pack.unit,'g')/100;
    if(column.basis==='per_100ml')factor=quantityIn(label.pack.amount,label.pack.unit,'ml')/100;
    if(column.basis==='per_serving'){
      if(label.servings_per_pack>0)factor=label.servings_per_pack;
      else for(const unit of ['g','ml']){
        const pack=quantityIn(label.pack.amount,label.pack.unit,unit),serving=quantityIn(label.serving.amount,label.serving.unit,unit);
        if(pack>0&&serving>0)factor=pack/serving;
      }
    }
    // A raw pack weight must not be applied to a prepared-food column.
    if(column.preparation!=='prepared' && factor>0 && !label.columns.some(c=>c.basis==='per_pack'&&c.preparation===column.preparation)) {
      options.push({id:column.id+'-pack',columnId:column.id,label:'Per pack — calculated from '+column.label,factor,calculated:true});
    }
  }
  return options;
}
export function nutritionFor(label,option,multiplier=1) {
  return label.nutrients.map(row=>{
    const cell=row.values.find(v=>v.column_id===option.columnId);
    if(!cell || cell.unit==='%')return null;
    return {key:canonical(row.key||row.name),name:row.name,amount:cell.amount===null?null:round(cell.amount*option.factor*multiplier),unit:cell.unit,qualifier:cell.qualifier};
  }).filter(Boolean);
}
export function totals(entries) {
  const groups=new Map();
  for(const entry of entries)for(const n of legacyNutrition(entry)){
    const [dimension,scale,unit]=unitInfo(n.unit), key=canonical(n.key||n.name)+'|'+dimension;
    if(!groups.has(key))groups.set(key,{key:canonical(n.key||n.name),name:n.name,unit:dimension==='mass'?n.unit:unit,displayScale:scale,amount:0,known:0,bounded:false});
    const group=groups.get(key);
    if(n.amount!==null&&Number.isFinite(n.amount)&&n.qualifier==='exact'){group.amount+=n.amount*scale;group.known++;}
    else group.bounded=true;
  }
  return [...groups.values()].map(g=>({...g,amount:round(g.amount/g.displayScale),complete:g.known===entries.length&&!g.bounded}));
}
export function validateLabel(label) {
  if(!label||typeof label.product_name!=='string'||!Array.isArray(label.columns)||!Array.isArray(label.nutrients)||!Array.isArray(label.details)||!Array.isArray(label.warnings))throw Error('The label response is incomplete. Please try a clearer photo.');
  if(label.columns.length>12||label.nutrients.length>100||label.details.length>100)throw Error('The label is too large. Photograph one product at a time.');
  for(const key of ['pack','serving'])if(!label[key]||!(label[key].amount===null||(Number.isFinite(label[key].amount)&&label[key].amount>0))||!(label[key].unit===null||typeof label[key].unit==='string'))throw Error('Invalid pack or serving size.');
  if(!(label.servings_per_pack===null||(Number.isFinite(label.servings_per_pack)&&label.servings_per_pack>0)))throw Error('Invalid serving count.');
  const ids=new Set();
  for(const col of label.columns){if(typeof col.id!=='string'||!col.id||ids.has(col.id)||typeof col.label!=='string'||!['per_100g','per_100ml','per_serving','per_pack','other'].includes(col.basis)||!['as_sold','prepared','unspecified'].includes(col.preparation))throw Error('Invalid nutrition columns.');ids.add(col.id);}
  const keys=new Set();
  for(const row of label.nutrients){if(typeof row.name!=='string'||!row.name.trim()||typeof row.key!=='string'||keys.has(row.key)||!Array.isArray(row.values))throw Error('Invalid nutrient row.');keys.add(row.key);const cells=new Set();for(const v of row.values){if(!ids.has(v.column_id)||cells.has(v.column_id)||typeof v.unit!=='string'||typeof v.raw!=='string'||typeof v.uncertain!=='boolean'||!(v.amount===null||(Number.isFinite(v.amount)&&v.amount>=0))||!['exact','less_than','trace','unknown'].includes(v.qualifier))throw Error('Invalid nutrient value.');cells.add(v.column_id);}}
  if(label.details.some(d=>typeof d.name!=='string'||typeof d.value!=='string')||label.warnings.some(w=>typeof w!=='string'))throw Error('Invalid label details.');
  return label;
}
export function validateBackup(value) {
  if(!value||!Array.isArray(value.meals)||!Array.isArray(value.entries)||!value.targets||!Number.isFinite(value.targets.cal)||value.targets.cal<=0||!Number.isFinite(value.targets.p)||value.targets.p<=0)throw Error('This is not a valid Meal Tracker backup.');
  for(const item of [...value.meals,...value.entries]){
    if(typeof item.id!=='string'||typeof item.name!=='string')throw Error('Invalid meal in backup.');
    for(const row of legacyNutrition(item))if(typeof row.name!=='string'||typeof row.unit!=='string'||!(row.amount===null||(Number.isFinite(row.amount)&&row.amount>=0))||!['exact','less_than','trace','unknown'].includes(row.qualifier))throw Error('Invalid nutrition in backup.');
    if(item.label)validateLabel(item.label);
  }
  return {...value,meals:value.meals.map(hydrate),entries:value.entries.map(hydrate)};
}
