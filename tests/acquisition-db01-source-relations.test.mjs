import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DB02_ITEM_SOURCE_RELATIONS_FILE, DB02_ITEM_SOURCE_RELATIONS_SCHEMA,
  DB02_SOURCE_KINDS, DB02_SOURCE_ROLES,
  parseDb01ItemSourceRelations,loadDb01ItemSourceRelations,
  hasDb01ItemSourceRelations
} from '../src/lib/acquisition/db01-item-source-relations.ts';

const bytes=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_ITEM_SOURCE_RELATIONS_FILE,import.meta.url
));
const source=JSON.parse(bytes.toString('utf8'));
const previous=JSON.parse(readFileSync(new URL(
  '../static/acquisition/public/db01-item-acquisition-1.26.2.json',import.meta.url
)));

test('Item ID source-ID crosswalk is parseable, immutable and conserves six categories',()=>{
  const index=parseDb01ItemSourceRelations(source);
  assert.equal(index.schema,DB02_ITEM_SOURCE_RELATIONS_SCHEMA);
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.sourceCoverageComplete,false);
  assert.equal(index.itemIdsWithLinks,4137);
  assert.equal(index.sourceLinks,15444);
  assert.equal(index.listItemIds().length,4137);
  assert(Object.isFrozen(index));
  assert.deepEqual(index.sourceKinds,DB02_SOURCE_KINDS);
  assert.deepEqual(index.roles,DB02_SOURCE_ROLES);
  assert(hasDb01ItemSourceRelations(index));
  assert(!hasDb01ItemSourceRelations({...index}));
  for(const [itemId,groups] of previous.items){
    if(groups.length===0)continue;
    const item=index.getItem(itemId);
    assert.equal(item.identifiedSourceLinks,true,itemId);
    assert.deepEqual(item.categories,groups.map(row=>row[0]),itemId);
    assert(item.links.length>0);
    assert(Object.isFrozen(item.links));
    assert(Object.isFrozen(item));
  }
});

test('Quest and Star Path source IDs are reversible, with slot roles intact',()=>{
  const index=parseDb01ItemSourceRelations(source);
  const quests=new Map(),star=new Map();
  for(const id of index.listItemIds()){
    const item=index.getItem(id);
    for(const link of item.links){
      assert(Object.isFrozen(link));
      assert(Object.isFrozen(link.sourcePosition));
      assert.equal(link.gameSourceOnly,true);
      assert.equal(link.grantedVerified,false);
      assert.equal(link.currentlyAvailableVerified,false);
      const target=link.kind==='quest'?quests:
        link.kind==='star_path'?star:null;
      if(target){
        const key=link.sourceId;
        const items=target.get(key)??new Set();
        items.add(id);
        target.set(key,items);
      }
    }
  }
  assert(quests.size>0);
  assert.deepEqual([...star.keys()].sort(),
    ['HauntingElegance2026','Seafaring2026']);
  for(const [sourceId,items] of quests)
    assert.deepEqual(index.getSourceItemIds('quest',sourceId),
      [...items].sort((a,b)=>Number(a)-Number(b)));
  for(const [sourceId,items] of star)
    assert.deepEqual(index.getSourceItemIds('star_path',sourceId),
      [...items].sort((a,b)=>Number(a)-Number(b)));
  assert(index.getSourceItemIds('quest','2070000628').length>0);
  assert.equal(index.getSourceItemIds('quest','99999999').length,0);
});

test('Only genuine source roles count toward acquisition: ingredients and loot do not',()=>{
  const index=parseDb01ItemSourceRelations(source);
  const candidate=new Set([
    'recipe_ingredient_item','loot_table_candidate',
    'stall_loot_pool_candidate',
    'star_path_vault_alternative_candidate',
    'star_path_premium_access_currency'
  ]);
  const relationCount={};
  let candidateCount=0;
  for(const id of index.listItemIds()){
    const item=index.getItem(id);
    for(const relation of item.links){
      relationCount[relation.role]=(relationCount[relation.role]??0)+1;
      if(candidate.has(relation.role)){
        assert.equal(relation.category,null);
        candidateCount++;
      }
    }
  }
  assert.equal(relationCount.quest_additional_loot_candidate,330);
  assert.equal(relationCount.quest_currency_reward,65);
  assert.equal(relationCount.crafting_result,1318);
  assert.equal(relationCount.cooking_result,625);
  assert.equal(relationCount.recipe_ingredient_item,6145);
  assert.equal(relationCount.loot_table_candidate,3804);
  assert.equal(relationCount.stall_loot_pool_candidate,1385);
  assert.equal(relationCount.star_path_vault_alternative_candidate,13);
  assert.equal(relationCount.star_path_premium_access_currency,2);
  assert(candidateCount>10000);
  const missing=index.getItem('99999999999');
  assert.equal(missing.identifiedSourceLinks,false);
  assert.deepEqual(missing.categories,[]);
  assert.deepEqual(missing.links,[]);
  assert.equal(missing.sourceCoverageComplete,false);
});

test('Transport loads once and detects tampered dictionaries or link relations',async()=>{
  let calls=0;
  const index=await loadDb01ItemSourceRelations('/Wand',async url=>{
    calls++;
    assert.equal(url,'/Wand/acquisition/public/'+DB02_ITEM_SOURCE_RELATIONS_FILE);
    return new Response(bytes,{status:200});
  });
  assert.equal(calls,1);
  assert.equal(index.listItemIds('star_path').length,64);
  assert.throws(()=>parseDb01ItemSourceRelations({
    ...source,roles:[...source.roles].reverse()
  }),/SCHEMA/);
  assert.throws(()=>parseDb01ItemSourceRelations({
    ...source,coverage:{...source.coverage,sourceLinks:15445}
  }),/COVERAGE/);
  const rows=[...source.items];
  rows[0]=[rows[0][0],[[999,'2070000628',1,0,[]]]];
  assert.throws(()=>parseDb01ItemSourceRelations({...source,items:rows}),
    /LINK_SHAPE/);
});
