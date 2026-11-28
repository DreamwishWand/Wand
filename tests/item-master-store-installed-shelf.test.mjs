import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readStoreItemSourceEvidence} from '../src/lib/items/public-store-source-evidence.ts';
test('installed shelf candidates are exact positive upgrade and shelf joins, not generic area matches',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const actual=new Map(await db.getFieldRows('acquisition.storeInstalledShelfCandidates'));
 const layouts=new Map(await db.getFieldRows('acquisition.storeLayoutCandidates'));
 const defs=new Map(await db.getFieldRows('acquisition.storeDisplayDefinition'));
 const [building]=await db.getItemFields([20300028],['source.UpgradeInfo']);
 const upgrades=building.values['source.UpgradeInfo'];
 const slots=[];
 for(const [ui,u] of upgrades.entries())for(const [di,d] of (u.Store?.Displays??[]).entries()){
   const def=defs.get(d.ItemID);
   if(d.Quantity<=0||def?.kind!=='shelf')continue;
   for(const [si,s] of def.shelfSlots.entries())slots.push({ui,di,si,s,d,u});
 }
 const expected=[...layouts].filter(([,l])=>slots.some(x=>l.matchingAreaKeys.includes(x.s.areaKey))).map(([id])=>id);
 assert(actual.size>0);assert.deepEqual([...actual.keys()],expected);
 for(const [id,links] of actual){
   const want=slots.filter(x=>layouts.get(id).matchingAreaKeys.includes(x.s.areaKey));
   assert.equal(links.length,want.length);
   for(const l of links){
     const w=want.find(x=>x.d.ItemID===l.displayItemId&&x.si===l.shelfSlotIndex&&x.u.Level===l.upgradeLevel&&l.buildingSourcePath==='source.UpgradeInfo['+x.ui+'].Store.Displays['+x.di+'].ItemID');
     assert(w);assert.equal(l.targetItemId,id);assert.equal(l.shelfSlotAmount,w.s.amount);
     assert.equal(l.configuredDisplayQuantity,w.d.Quantity);assert.equal(l.areaKey,w.s.areaKey);
     assert.equal(l.storeMembershipVerified,false);assert.equal(l.runtimeStorePoolVerified,false);
     assert.equal(l.currentAvailabilityVerified,false);
   }
 }
 const sample=[...actual.keys()].slice(0,20);
 const evidence=await readStoreItemSourceEvidence(db,sample,'ja');
 for(const r of evidence)assert.deepEqual(r.installedShelfCandidates,actual.get(r.itemId));
});
