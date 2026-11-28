import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('all source-listed profile update grants retain conditions and are not asserted as standing acquisition',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const d=JSON.parse(await readFile('data/ddv/item-master/profile-update-grants-steam-1.26.2.json','utf8'));
 const canonical=new Set((await db.getFieldRows('nativeCategory')).map(([id])=>id));
 const expected=d.updates.flatMap(([updateId,updateIndex,ur,up,pos,name,index,r,p,conditions,grants])=>grants.filter(([,id])=>canonical.has(id)).map(([i,id,amount])=>JSON.stringify([id,name,updateId,updateIndex,ur,up,pos,index,r,p,conditions,i,amount])));
 const rows=(await db.getFieldRows('acquisition.additionalSources')).flatMap(([id,links])=>links.filter(l=>l.kind==='profile_update_grant').map(l=>[id,l]));
 assert.equal(d.updates.length,8);assert.equal(d.updates.flatMap(r=>r[10]).length,14);
 assert.deepEqual(rows.map(([id,l])=>{
   assert.equal(l.targetItemId,id);assert.equal(l.nativeGrantActionVerified,true);
   for(const k of ['profileVersionEligibilityVerified','standingAcquisitionVerified','currentAvailabilityVerified','guaranteedGrantVerified'])assert.equal(l[k],false);
   return JSON.stringify([id,l.sourceId,l.updateId,l.updateRecordIndex,l.updateRecordSha256,l.updatePayloadSha256,l.updateActionPosition,l.sourceRecordIndex,l.sourceRecordSha256,l.sourcePayloadSha256,l.conditions.Conditions,l.sourcePosition,l.configuredAmount]);
 }).sort(),expected.sort());
 for(const u of d.updates){
   const r=await db.findItemIdsByAcquisitionSource({family:'additional',kind:'profile_update_grant',sourceId:u[5]});
   assert.deepEqual(r.itemIds,u[10].map(([,id])=>id).filter(id=>canonical.has(id)).sort((a,b)=>a-b));
 }
 const details=await readItemAcquisitionSourceDetails(db,rows.map(([id])=>id),'ja');
 assert(details.every((d,i)=>d.additional.some(l=>l.evidence.kind==='profile_update_grant'&&l.evidence.sourceId===rows[i][1].sourceId)));
 console.log('DB01_PROFILE_UPDATE_GRANTS_VERIFIED '+JSON.stringify({items:new Set(rows.map(([id])=>id)).size,occurrences:rows.length}));
});
