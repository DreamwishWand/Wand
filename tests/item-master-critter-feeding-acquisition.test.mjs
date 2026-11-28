import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createLootSourceReader} from '../src/lib/items/public-loot-sources.ts';
import {createCritterSourceReader} from '../src/lib/items/public-critter-sources.ts';
test('feeding reward candidates preserve positive explicit groups for all independently established ordinary critters',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const eligible=await db.getFieldRows('acquisition.ordinaryCritterSources');
  const ids=[...new Set(eligible.flatMap(([,ls])=>ls.map(l=>l.sourceItemId)))];
  assert.equal(ids.length,100);
  const critters=(await createCritterSourceReader(db).getForCritters(ids)).map(r=>r.definition);
  const refs=await createLootSourceReader(db).getForReferrers(ids);
  const classes=new Map(await db.getFieldRows('nativeCategory'));
  const expected=[];
  for(const [i,c] of critters.entries()){
    if(!(c.feedingBeforeRewards>0))continue;
    for(const ref of refs[i].references){
      const preference=ref.role==='critter_like_reward'?'like':ref.role==='critter_favorite_reward'?'favorite':null;
      if(!preference)continue;
      assert.equal(ref.definition.tableItemId,preference==='like'?c.likeLootTableItemId:c.favoriteLootTableItemId);
      for(const g of ref.definition.groups){
        const raw=g.originalGroup;
        if(!(Number.isSafeInteger(g.maximum)&&g.maximum>0&&Number.isSafeInteger(g.minimum)&&g.minimum>=0&&g.minimum<=g.maximum)||
          g.emptyField===true||raw.AvailableWhen!==undefined||g.filters.length||g.types.length||g.rarities.length||
          raw.MinRarity!==undefined||raw.MaxRarity!==undefined||(raw.ItemsConditional??[]).length||
          (raw.Weight!==undefined&&!(Number.isSafeInteger(raw.Weight)&&raw.Weight>0)))continue;
        for(const o of ref.definition.occurrences.filter(o=>o.groupIndex===g.groupIndex&&o.conditionalGroupIndex===null)){
          if(o.itemId===c.critterItemId||classes.get(o.itemId)==='LootTable')continue;
          expected.push(JSON.stringify([o.itemId,c.critterItemId,ref.definition.tableItemId,preference,ref.sourcePath,o.sourcePath,c.feedingBeforeRewards,g.minimum,g.maximum,g.weight]));
        }
      }
    }
  }
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const rows=catalog.has('acquisition.ordinaryCritterFeedingSources')?await db.getFieldRows('acquisition.ordinaryCritterFeedingSources'):[];
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const actual=rows.flatMap(([item,ls])=>ls.map(l=>{
    assert(effective.get(item).includes('ordinary_gameplay'));
    assert.equal(l.sourceCompanionSha256,db.release.sourceFilesSha256.Companion);
    assert.equal(l.sourceLootTableSha256,db.release.sourceFilesSha256.LootTable);
    assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
    return JSON.stringify([item,l.sourceItemId,l.tableItemId,l.preference,l.sourcePath,l.tableSourcePath,l.configuredFeedingCount,l.minimumRolls,l.maximumRolls,l.configuredWeight]);
  }));
  assert.deepEqual(actual.sort(),expected.sort());
});
