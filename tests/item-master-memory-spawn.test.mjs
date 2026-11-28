import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('all Custom direct spawn memory references preserve shard index and classify only positive reviewed quest gates',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const all=new Map(await db.getFieldRows('acquisition.memorySpawnSources'));
 const classified=new Map(await db.getFieldRows('acquisition.classifiedMemorySpawnSources'));
 assert.equal(all.size,53);assert.equal([...all.values()].flat().length,78);
 assert.equal(classified.size,24);assert.equal([...classified.values()].flat().length,38);
 const links=[...all.values()].flat();
 const srcIds=[...new Set(links.map(l=>l.sourceItemId))].sort((a,b)=>a-b);
 const events=new Map((await db.getItemFields(srcIds,['source.Spawn','source.Conditions'])).map(r=>[r.itemId,r.values]));
 const invalid=links.filter(l=>!l.shardIndexValid);
 assert.equal(invalid.length,1);assert.equal(invalid[0].sourceItemId,1520002281);assert.equal(invalid[0].category,null);
 for(const l of links){
   const v=events.get(l.sourceItemId),s=v['source.Spawn'],r=s.RewardOverride;
   const nested=l.sourcePath.endsWith('ConsummableData.ItemID');
   assert.equal(l.targetItemId,nested?r.State.ConsummableData.ItemID:r.ItemID);
   assert.equal(l.shardIndex,(nested?r.State.ConsummableData.State:r.State).MemoryShardIndex);
   assert.deepEqual(l.conditions,v['source.Conditions']??null);
   assert.equal(l.configuredAmount,s.AmountToSpawn.Value.Value);
   assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
   assert.equal(l.sourceEventSha256,db.release.sourceFilesSha256.ConditionalEvent);
 }
 const ids=[...classified.keys()];const d=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const [i,id] of ids.entries()){
   assert(d[i].effectiveCategories.includes('ordinary_gameplay'));
   const evidence=d[i].classificationExtensions.filter(e=>e.family==='memorySpawn');
   assert.deepEqual(evidence.map(e=>e.evidence),classified.get(id));
   for(const e of evidence){assert.equal(e.identity.nativeCategory,'ConditionalEvent');assert(e.relatedIdentities.some(r=>r.nativeCategory==='Mission'));}
 }
});
