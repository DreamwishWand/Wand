import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
import {resolveStoreCatalogGate} from '../tools/db-01-items/store-catalog-gate.mjs';
async function gateContext(db){
 const q=JSON.parse(await readFile('static/guide/public/quest-index.json','utf8'));
 const e=JSON.parse(await readFile('static/guide/public/event-quest-links-1.26.2.json','utf8'));
 const event=new Set(Object.values(e.events).flat().map(Number));
 const questKinds=new Map(q.quests.filter(r=>!event.has(Number(r.id))&&['Village','Story','Realm'].includes(r.internalName.split('!')[0])&&
   q.groups[r.groupId]?.rawName.split('!')[0]===r.internalName.split('!')[0]).map(r=>[Number(r.id),'ordinary_gameplay']));
 const known=new Map((await db.getFieldRows('nativeCategory')).map(([id,nativeCategory])=>[id,{nativeCategory}]));
 return {known,questKinds,sha:db.release.sourceFilesSha256};
}
import {readStoreItemSourceEvidence} from '../src/lib/items/public-store-source-evidence.ts';
import {stageAreaSlots} from '../tools/db-01-items/store-native-stage-layout.mjs';

test('native stage layouts resolve exact original area keys with duplicate sizes preserved as slot positions',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const {known,questKinds,sha}=await gateContext(db);
 const [displayRows,layoutRows,gridRows,actualRows,classifiedRows,catalogRows,setRows,gates,overrides,evolved,categories,classes]=await Promise.all([
  'acquisition.storeDisplayDefinition','acquisition.storeLayoutCandidates','acquisition.storeLayoutDimensionComparisons',
  'acquisition.storeInstalledStageCandidates','acquisition.ordinaryGeneratedStoreStageSources','acquisition.catalogFacts',
  'source.SetItemID','source.CatalogVisibilityConditions','source.PriceOverride','source.IsEvolvedAsset','acquisition.effectiveCategories','sourceClass'
 ].map(f=>db.getFieldRows(f)));
 const displays=new Map(displayRows),actual=new Map(actualRows),classified=new Map(classifiedRows),grids=new Map(gridRows);
 const catalog=new Map(catalogRows),sets=new Map(setRows),setGates=new Map(gates),prices=new Map(overrides),ev=new Map(evolved),effective=new Map(categories),cls=new Map(classes);
 const providers=new Map(JSON.parse(await readFile('data/ddv/item-master/original-price-amounts-steam-1.26.2.json','utf8')).map(([id,provider,buy])=>[id,{provider,buy}]));
 // Independent transcription from verified Display.json and native switch.
 const expectedAreas=new Map([
  [2140000000,[[2,['6x2','6x4']],[3,['3x3','3x3','3x3','3x3']],[5,['6x2','3x4','3x4']],[6,['3x2','3x2','6x4']]]],
  [2140000001,[[1,['4x8','4x8']],[0,['8x8']],[3,['4x4','4x4','4x4','4x4']]]],
  [2140000002,[[1,['8x16','8x16']],[0,['16x16']]]],
  [2140000015,[[1,['5x10','5x10']],[0,['10x10']],[3,['5x5','5x5','5x5','5x5']]]],
  [2140000018,[[2,['6x2','6x4']],[3,['3x3','3x3','3x3','3x3']],[5,['6x2','3x4','3x4']],[6,['3x2','3x2','6x4']]]]
 ]);
 const [building]=await db.getItemFields([20300028],['source.UpgradeInfo']);
 const upgrades=building.values['source.UpgradeInfo'],slots=[];
 for(const [ui,u] of upgrades.entries())for(const [di,d] of (u.Store?.Displays??[]).entries()){
   if(d.Quantity<=0||!expectedAreas.has(d.ItemID))continue;
   const def=displays.get(d.ItemID);
   for(const [li,[type,keys]] of expectedAreas.get(d.ItemID).entries()){
     assert.equal(def.stageLayouts[li].typeCode,type);
     for(const k of new Set(keys))slots.push({displayItemId:d.ItemID,stageLayoutType:type,stageLayoutIndex:li,
       stageLayoutWeight:def.stageLayouts[li].weight,areaKey:'StoreLayoutArea_'+k,stageSlotIndices:keys.flatMap((x,i)=>x===k?[i]:[]),
       buildingSourcePath:'source.UpgradeInfo['+ui+'].Store.Displays['+di+'].ItemID',upgradeLevel:u.Level,configuredDisplayQuantity:d.Quantity});
   }
 }
 assert.equal(new Set(slots.map(s=>s.displayItemId)).size,5);assert.equal(new Set(slots.map(s=>s.areaKey)).size,13);
 for(const [id,layouts] of expectedAreas){
   const decoded=stageAreaSlots(id,displays.get(id).stageLayouts,{});
   assert.deepEqual(decoded.map(l=>[l.stageLayoutType,l.areaKey,l.stageSlotIndices]),layouts.flatMap(([t,keys])=>[...new Set(keys)].map(k=>[t,'StoreLayoutArea_'+k,keys.flatMap((x,i)=>x===k?[i]:[])])));
 }
 const expected=new Map(layoutRows.filter(([id])=>cls.get(id)==='FurnitureItemData').map(([id,l])=>[id,slots.filter(s=>l.matchingAreaKeys.includes(s.areaKey))]).filter(([,ls])=>ls.length));
 // The screened Furniture family can include subclasses; compare native category independently.
 const families=new Map(await db.getFieldRows('nativeCategory'));
 for(const [id,l] of layoutRows)if(families.get(id)==='Furniture'&&!expected.has(id)){const a=slots.filter(s=>l.matchingAreaKeys.includes(s.areaKey));if(a.length)expected.set(id,a);}
 assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),[...expected.keys()].sort((a,b)=>a-b));
 const wantClassified=new Set();
 for(const [id,ls] of actual){
   const want=expected.get(id);assert.equal(ls.length,want.length);
   for(const l of ls){
     const w=want.find(x=>x.displayItemId===l.displayItemId&&x.stageLayoutIndex===l.stageLayoutIndex&&x.areaKey===l.areaKey&&x.buildingSourcePath===l.buildingSourcePath);
     assert(w);for(const k of Object.keys(w))assert.deepEqual(l[k],w[k]);
     assert.deepEqual(l.nativeGrid,grids.get(id)?.find(x=>x.areaKey===l.areaKey)?.nativeGrid??null);
     assert.equal(l.currentAvailabilityVerified,false);
   }
   const f=catalog.get(id),set=sets.get(id),gate=setGates.get(set),o=prices.get(id),p=providers.get(id);
   if(!f?.flagsKnown||f.exclusionFlags.length||!resolveStoreCatalogGate(f.catalogVisibilityConditions,known,questKinds,sha)||!Number.isSafeInteger(set)||set<0||
     set>0&&(!gate||Object.keys(gate).length)||ev.get(id)===true||!o)continue;
   let amount=null;
   if(Object.keys(o).length===0&&p?.buy.length===1&&p.buy[0][0]===80000000)amount=p.buy[0][1];
   else if(Object.keys(o).length===1&&o.Price&&Object.keys(o.Price).length===2&&o.Price.Id===80000000&&cls.get(id)==='FurnitureItemData')amount=o.Price.Amount;
   if(!Number.isSafeInteger(amount)||amount<=0||amount>2147483647)continue;
   if(ls.some(l=>l.nativeGrid?.status==='passed'&&l.nativeGrid.directTagPredicateVerified===true&&([2140000002,2140000015].includes(l.displayItemId)&&(l.priceTables===null||Array.isArray(l.priceTables)&&l.priceTables.length===0)||
     Array.isArray(l.priceTables)&&l.priceTables.some(t=>Array.isArray(t.Thresholds)&&t.Thresholds.length))))wantClassified.add(id);
 }
 assert(wantClassified.size>0);assert.deepEqual([...classified.keys()].sort((a,b)=>a-b),[...wantClassified].sort((a,b)=>a-b));
 for(const [id,ls] of classified){
   assert(effective.get(id).includes('ordinary_gameplay'));
   for(const l of ls){
     const c=actual.get(id).find(x=>x.displayItemId===l.sourceItemId&&x.stageLayoutIndex===l.stageLayoutIndex&&x.areaKey===l.areaKey&&x.buildingSourcePath===l.sourcePath);
     assert(c);assert.deepEqual(l.stageSlotIndices,c.stageSlotIndices);
     assert.deepEqual(l.catalogGate,resolveStoreCatalogGate(catalog.get(id).catalogVisibilityConditions,known,questKinds,sha));
     assert.equal(l.itemCatalogGateEmpty,l.catalogGate.kind==='empty');
     assert.equal(l.nativeGrid.status,'passed');assert.equal(l.storeMembershipVerified,false);
     assert.equal(l.runtimeStockVerified,false);assert.equal(l.currentAvailabilityVerified,false);
     if([2140000002,2140000015].includes(l.sourceItemId)){
       assert(c.priceTables===null||Array.isArray(c.priceTables)&&c.priceTables.length===0);
       assert.equal(l.priceBandKind,'native_unbounded_positive');assert.equal(l.catalogueEnumerationVerified,false);
       assert.equal(l.tableIndex,null);assert.equal(l.bandIndex,null);assert.equal(l.minimum,1);assert.equal(l.maximum,2147483647);
     }else{
       const ts=c.priceTables[l.tableIndex].Thresholds;
       assert.equal(l.priceBandKind,'configured_thresholds');assert.equal(l.catalogueEnumerationVerified,true);
       assert.equal(l.minimum,l.bandIndex===0?1:ts[l.bandIndex-1]);assert.equal(l.maximum,l.bandIndex===ts.length?2147483647:ts[l.bandIndex]-1);
     }
   }
 }
 const ids=[...classified.keys()].slice(0,30);
 const details=await readItemAcquisitionSourceDetails(db,ids,'ja'),evidence=await readStoreItemSourceEvidence(db,ids,'ja');
 for(const [i,id] of ids.entries()){
   assert.deepEqual(details[i].classificationExtensions.filter(l=>l.family==='storeGeneratedStage').map(l=>l.evidence),classified.get(id));
   assert.deepEqual(evidence[i].installedStageCandidates,actual.get(id));
 }
});
