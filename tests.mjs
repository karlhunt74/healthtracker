import assert from 'node:assert/strict';
import {portionOptions,nutritionFor,scaleNutrition,totals,validateLabel,validateBackup,macro} from './nutrition.mjs';
import {createHandler,labelSchema} from './netlify/functions/scan-label.mjs';

export function fixture(){return {
  product_name:'Test meal',pack:{amount:350,unit:'g'},serving:{amount:175,unit:'g'},servings_per_pack:2,
  columns:[{id:'hundred',label:'Per 100g',basis:'per_100g',preparation:'as_sold'},{id:'serving',label:'Per serving (175g)',basis:'per_serving',preparation:'as_sold'}],
  nutrients:[
    {key:'energy_kcal',name:'Energy (kcal)',values:[{column_id:'hundred',amount:200,unit:'kcal',qualifier:'exact',raw:'200kcal',uncertain:false},{column_id:'serving',amount:350,unit:'kcal',qualifier:'exact',raw:'350kcal',uncertain:false}]},
    {key:'protein',name:'Protein',values:[{column_id:'hundred',amount:10,unit:'g',qualifier:'exact',raw:'10g',uncertain:false},{column_id:'serving',amount:17.5,unit:'g',qualifier:'exact',raw:'17.5g',uncertain:false}]},
    {key:'salt',name:'Salt',values:[{column_id:'hundred',amount:0.1,unit:'g',qualifier:'less_than',raw:'<0.1g',uncertain:false},{column_id:'serving',amount:null,unit:'g',qualifier:'unknown',raw:'',uncertain:true}]},
    {key:'vitamin_c',name:'Vitamin C',values:[{column_id:'hundred',amount:12,unit:'mg',qualifier:'exact',raw:'12mg',uncertain:false},{column_id:'serving',amount:21,unit:'mg',qualifier:'exact',raw:'21mg',uncertain:false}]}
  ],details:[{name:'Ingredients',value:'Test ingredient'}],warnings:[]
};}
export async function runTests(){
  const label=validateLabel(fixture()),choices=portionOptions(label);
  assert.equal(choices.length,4);
  const pack=choices.find(c=>c.id==='hundred-pack'),servingPack=choices.find(c=>c.id==='serving-pack');
  assert.equal(pack.factor,3.5);assert.equal(servingPack.factor,2);
  const rows=nutritionFor(label,pack);assert.equal(macro(rows,'energy_kcal'),700);assert.equal(macro(rows,'protein'),35);
  assert.equal(rows.find(n=>n.key==='vitamin_c').amount,42);assert.equal(rows.find(n=>n.key==='salt').qualifier,'less_than');
  assert.equal(nutritionFor(label,servingPack).find(n=>n.key==='salt').amount,null);
  const half=scaleNutrition(rows,0.5);assert.equal(macro(half,'energy_kcal'),350);assert.equal(rows[0].amount,700);
  assert.equal(scaleNutrition([{key:'tiny',name:'Tiny nutrient',amount:0.0001,unit:'g',qualifier:'exact'}],0.5)[0].amount,0.00005);
  assert.equal(scaleNutrition([{key:'trace',name:'Trace nutrient',amount:null,unit:'g',qualifier:'trace'}],2)[0].qualifier,'trace');
  const derived=fixture();derived.servings_per_pack=null;assert.equal(portionOptions(derived).find(c=>c.id==='serving-pack').factor,2);
  const prepared=fixture();prepared.columns[0].preparation='prepared';assert(!portionOptions(prepared).some(c=>c.id==='hundred-pack'));
  const explicit=fixture();explicit.columns.push({id:'pack',label:'Per pack',basis:'per_pack',preparation:'as_sold'});explicit.nutrients[0].values.push({...explicit.nutrients[0].values[0],column_id:'pack'});assert(!portionOptions(explicit).some(c=>c.calculated));
  const liquid=fixture();liquid.pack={amount:0.5,unit:'l'};liquid.columns[0].basis='per_100ml';assert.equal(portionOptions(liquid).find(c=>c.id==='hundred-pack').factor,5);
  const unknown=fixture();unknown.pack.amount=null;unknown.servings_per_pack=null;assert(!portionOptions(unknown).some(c=>c.calculated));
  const percents=fixture();percents.columns.push({id:'ri',label:'% RI',basis:'other',preparation:'as_sold'});percents.nutrients[0].values.push({...percents.nutrients[0].values[0],column_id:'ri',unit:'%'});assert(!portionOptions(percents).some(c=>c.id==='ri'));
  const old={meals:[{id:'old',name:'Old meal',cal:100,p:10,c:12,f:2}],entries:[{id:'entry',name:'Old meal',date:'2026-11-09',qty:1,cal:100,p:10,c:12,f:2}],targets:{cal:2300,p:150}};
  const migrated=validateBackup(old);assert.equal(migrated.meals[0].nutrition.length,4);assert.equal(migrated.entries[0].cal,100);
  const sum=totals([{nutrition:rows},{nutrition:half},{nutrition:[{key:'vitamin_c',name:'Vitamin C',amount:0.001,unit:'g',qualifier:'exact'}]}]);
  assert.equal(sum.find(n=>n.key==='vitamin_c').amount,64);assert.equal(sum.find(n=>n.key==='vitamin_c').unit,'mg');assert(sum.find(n=>n.key==='vitamin_c').complete);
  const micro=totals([{nutrition:[{key:'vitamin_d',name:'Vitamin D',amount:5,unit:'µg',qualifier:'exact'}]}]);assert.equal(micro[0].amount,5);assert.equal(micro[0].unit,'µg');
  assert.equal(sum.find(n=>n.key==='energy_kcal').known,2);assert(!sum.find(n=>n.key==='energy_kcal').complete);
  assert.equal(sum.find(n=>n.key==='salt').known,0);
  const missing=fixture();missing.nutrients[0].values[0].column_id='wrong';assert.throws(()=>validateLabel(missing));
  assert.throws(()=>validateBackup({...old,targets:{cal:-1,p:100}}));
  // Every object must be strict, including nested objects in the API schema.
  function checkSchema(s){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(checkSchema);}if(s.items)checkSchema(s.items);}
  checkSchema(labelSchema);
  let calls=0,lastPayload;
  const secret='private-test-code-12345',env=name=>({OPENAI_API_KEY:'not-a-real-key',SCAN_ACCESS_TOKEN:secret}[name]);
  const jpeg='data:image/jpeg;base64,/9j/2Q==';
  const request=(body={images:[jpeg]},headers={})=>new Request('https://health.example/.netlify/functions/scan-label',{method:'POST',headers:{'Content-Type':'application/json','x-scan-code':secret,...headers},body:JSON.stringify(body)});
  const handler=createHandler({env,fetchImpl:async(url,options)=>{calls++;lastPayload=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/responses');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(fixture())}]}],usage:{input_tokens:123,output_tokens:456}});}});
  assert.equal((await handler(request({}, {'x-scan-code':'wrong'}))).status,401);assert.equal(calls,0);
  assert.equal((await handler(request(undefined,{origin:'https://evil.example'}))).status,403);assert.equal(calls,0);
  assert.equal((await handler(request({images:['https://example.com/image.jpg']}))).status,400);assert.equal(calls,0);
  assert.equal((await handler(request({images:['data:image/jpeg;base64,aGVsbG8=']}))).status,400);assert.equal(calls,0);
  const response=await handler(request()),body=await response.json();assert.equal(response.status,200);assert.equal(body.label.nutrients.length,4);assert.equal(body.usage.output_tokens,456);assert.equal(calls,1);assert.equal(lastPayload.store,false);assert(lastPayload.text.format.strict);assert.equal(lastPayload.input[0].content[1].detail,'high');assert(!JSON.stringify(body).includes('not-a-real-key'));
  const unset=createHandler({env:()=>undefined,fetchImpl:()=>{throw Error('Must not call');}});assert.equal((await unset(request())).status,503);
  const timeout=createHandler({env,fetchImpl:async()=>{const error=Error('timeout');error.name='TimeoutError';throw error;}});assert.equal((await timeout(request())).status,504);
  const quota=createHandler({env,fetchImpl:async()=>new Response('',{status:429})});assert.equal((await quota(request())).status,429);
  const truncated=createHandler({env,fetchImpl:async()=>Response.json({status:'incomplete'})});assert.equal((await truncated(request())).status,422);
  const refused=createHandler({env,fetchImpl:async()=>Response.json({status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]})});assert.equal((await refused(request())).status,422);
  const malformed=createHandler({env,fetchImpl:async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{}'}]}]})});assert.equal((await malformed(request())).status,422);
  const empty=createHandler({env,fetchImpl:async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...fixture(),columns:[],nutrients:[]})}]}]})});assert.equal((await empty(request())).status,422);
  return 'Passed: portion bases, calculated packs, prepared-food guard, arbitrary nutrients, unknown/trace/bounded values, unit-aware totals, legacy backups, strict schema, API auth, origin and image validation, successful mocked scan, timeout, quota, refusal and incomplete-output handling.';
}
