import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';

test('positive original additional quest loot groups are classified without assuming guaranteed rewards',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const [quests,events]=await Promise.all(['quest-index.json','event-quest-links-1.26.2.json'].map(async f=>JSON.parse(await readFile('static/guide/public/'+f,'utf8'))));
 const eventIds=new Set(Object.values(events.events).flat().map(Number)),questById=new Map(quests.quests.map(q=>[Number(q.id),q]));
 const [lootRows,familyRows,categoryRows,actualRows]=await Promise.all(['source.AdditionnalRewards','nativeCategory','acquisition.effectiveCategories','acquisition.questAdditionalLootSources'].map(f=>db.getFieldRows(f)));
 const families=new Map(familyRows),categories=new Map(categoryRows),actual=new Map(actualRows),expected=new Map(),counts={};
 const validFamilies=new Set(['ActivityItem','Furniture','Clothing','Companion','Currency','MemoryShard','BoardGame','Skin','Trimming','Tool','Building','Upgrade','MountGear','AvatarFeature','Makeup']);
 let original=0;
 for(const [questId,loot] of lootRows){
   const q=questById.get(questId),prefix=q?.internalName.split('!')[0];
   const category=eventIds.has(questId)?'in_game_limited_event':['Village','Story','Realm'].includes(prefix)&&quests.groups[q.groupId]?.rawName.split('!')[0]===prefix?'ordinary_gameplay':null;
   for(const [gi,g] of (loot.SubLootTables??[]).entries()){
     original+=(g.Items??[]).length;
     if(!category||!Number.isSafeInteger(g.Min)||g.Min<0||!Number.isSafeInteger(g.Max)||g.Max<=0||g.Max<g.Min||
       (g.Weight!==undefined&&(!Number.isSafeInteger(g.Weight)||g.Weight<=0))||
       Object.keys(g).some(k=>!['Items','Min','Max','Weight'].includes(k)))continue;
     for(const [ii,v] of (g.Items??[]).entries()){
       if(!Number.isSafeInteger(v.ItemID)||v.ItemID<=0||Object.keys(v).some(k=>!['ItemID','State'].includes(k)))continue;
       counts[category]=(counts[category]??0)+1;
       if(!validFamilies.has(families.get(v.ItemID)))continue;
       const key=v.ItemID,list=expected.get(key)??[];
       list.push({kind:'quest_additional_loot_candidate',category,sourceItemId:questId,targetItemId:key,
         sourcePath:'source.AdditionnalRewards.SubLootTables['+gi+'].Items['+ii+'].ItemID',
         groupIndex:gi,itemIndex:ii,minimumRolls:g.Min,maximumRolls:g.Max,configuredWeight:g.Weight??null,
         originalEntry:v,sourceGameVersion:db.release.target.gameVersion,sourceMissionSha256:db.release.sourceFilesSha256.Mission,
         guaranteedGrantVerified:false,currentAvailabilityVerified:false});expected.set(key,list);
     }
   }
 }
 // Independently decoded original reviewed projection, before canonical target family filtering.
 assert.equal(original,330);assert.deepEqual(counts,{ordinary_gameplay:171,in_game_limited_event:42});
 assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),[...expected.keys()].sort((a,b)=>a-b));
 const sort=(a,b)=>a.sourceItemId-b.sourceItemId||a.groupIndex-b.groupIndex||a.itemIndex-b.itemIndex;
 for(const [id,links] of actual){
   assert.deepEqual([...links].sort(sort),[...expected.get(id)].sort(sort));
   for(const l of links)assert(categories.get(id).includes(l.category));
 }
 const ids=[...actual.keys()],details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const d of details){
   const links=d.classificationExtensions.filter(l=>l.family==='questLoot');
   assert.deepEqual(links.map(l=>l.evidence),actual.get(d.itemId));
   for(const l of links){assert.equal(l.identity.itemId,l.evidence.sourceItemId);assert.equal(l.identity.nativeCategory,'Mission');}
 }
});
