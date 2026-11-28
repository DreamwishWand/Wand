import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createLootSourceReader} from '../src/lib/items/public-loot-sources.ts';
test('ordinary reward bag candidates are traceable to independent sources and original positive explicit loot groups',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const get=async field=>fields.has(field)?new Map(await db.getFieldRows(field)):new Map();
  const base=await get('acquisition.categories'),extra=await get('acquisition.additionalSources'),
    production=await get('acquisition.ordinaryProductionSources'),progress=await get('acquisition.ordinaryProgressionSources'),
    critters=await get('acquisition.ordinaryCritterSources'),intro=await get('acquisition.ordinaryQuestIntroSources'),
    conditional=await get('acquisition.conditionalQuestSources');
  const ordinary=id=>base.get(id)?.includes('ordinary_gameplay')||extra.get(id)?.some(l=>
    ['character_friendship_reward','pet_friendship_reward'].includes(l.kind)&&l.amount!==null)||
    production.has(id)||progress.has(id)||critters.has(id)||intro.has(id)||
    conditional.get(id)?.some(l=>l.category==='ordinary_gameplay');
  const classes=await get('sourceClass'),categories=await get('nativeCategory');
  const bags=await get('source.LootTableItemID'),reader=createLootSourceReader(db);
  const bagIds=[...bags.keys()].filter(id=>classes.get(id)==='LootPresentItemData'&&categories.get(bags.get(id))==='LootTable');
  assert.equal(bagIds.length,135);
  const selected=bagIds.filter(ordinary);
  assert(selected.length>=5);
  const refs=await reader.getForReferrers(selected);
  const expected=[];
  for(const r of refs)for(const ref of r.references){
    if(ref.role!=='loot_present')continue;
    for(const g of ref.definition.groups){
      const raw=g.originalGroup;
      if(!(Number.isSafeInteger(g.maximum)&&g.maximum>0&&Number.isSafeInteger(g.minimum)&&g.minimum>=0&&g.minimum<=g.maximum)||
        g.emptyField===true||raw.AvailableWhen!==undefined||g.filters.length||g.types.length||g.rarities.length||
        raw.MinRarity!==undefined||raw.MaxRarity!==undefined||(raw.ItemsConditional??[]).length||
        (raw.Weight!==undefined&&!(Number.isSafeInteger(raw.Weight)&&raw.Weight>0)))continue;
      for(const o of ref.definition.occurrences.filter(o=>o.groupIndex===g.groupIndex&&o.conditionalGroupIndex===null)){
        if(o.itemId===r.sourceItemId||categories.get(o.itemId)==='LootTable')continue;
        expected.push(JSON.stringify([o.itemId,r.sourceItemId,ref.definition.tableItemId,o.sourcePath,g.minimum,g.maximum,g.weight]));
      }
    }
  }
  const actual=await get('acquisition.ordinaryLootPresentSources'),effective=await get('acquisition.effectiveCategories');
  const occurrences=[];
  for(const [item,links] of actual)for(const l of links){
    assert(ordinary(l.sourceItemId));
    assert.equal(l.sourceActivityItemSha256,db.release.sourceFilesSha256.ActivityItem);
    assert.equal(l.sourceLootTableSha256,db.release.sourceFilesSha256.LootTable);
    assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
    assert(effective.get(item).includes('ordinary_gameplay'));
    occurrences.push(JSON.stringify([item,l.sourceItemId,l.tableItemId,l.tableSourcePath,l.minimumRolls,l.maximumRolls,l.configuredWeight]));
  }
  assert.deepEqual(occurrences.sort(),expected.sort());
});
