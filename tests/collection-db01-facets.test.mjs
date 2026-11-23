import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COLLECTION_NATIVE_SUBTYPE_UI,collectionNativeSubtypeLabel}
  from '../src/lib/collection/native-subtype-labels.ts';
import {join} from 'node:path';
import {buildWorldBrowseIndex,countOwnedInWorldScope} from '../src/lib/collection/world-browse-index.ts';
import {COLLECTION_TOP_CATEGORIES,collectionTopCategory,collectionTopCategoryCards,collectionTopCategoryLabel}
  from '../src/lib/collection/category-hierarchy.ts';
import {
  COLLECTION_DB01_FACETS_SCHEMA,COLLECTION_DB01_ARCHIVE_SHA,
  parseCollectionDb01Facets,collectionDb01Groups,collectionDb01Matches,
  COLLECTION_DB01_SUBMENUS,collectionDb01InCategory,
  collectionDb01FacetLabel
} from '../src/lib/collection/db01-native-facets.ts';

test('DB-01 source native filtering is a narrow projection, not a second Item master',async()=>{
  // npm pretest regenerates this from the pinned, published Item master ZIP.
  const file=join(process.cwd(),'static/ddv/collection/db01-facets-1262.json');
  const raw=JSON.parse(await readFile(file,'utf8'));
  assert.equal(raw.schema,COLLECTION_DB01_FACETS_SCHEMA);
  assert.equal(raw.sourceArchiveSha256,COLLECTION_DB01_ARCHIVE_SHA);
  assert.equal(raw.sourceItemCount,13202);
  assert.ok(raw.taggedItems>1000,'source tags must cover real Item IDs');
  assert.equal(Object.hasOwn(raw,'names'),false);
  assert.equal(Object.hasOwn(raw,'iconGuid'),false);
  assert.equal(Object.hasOwn(raw,'collectionSourceCandidates'),false);
  const index=parseCollectionDb01Facets(raw);
  assert.equal(index.taggedItems,raw.taggedItems);
  assert.equal(COLLECTION_DB01_SUBMENUS.length,20);
  assert.ok(raw.categoryItemCount>8000);
  assert.ok(index.itemsByCategory.get(3).length>5000,
    'the original FurnitureSets browse path must have real Item IDs');
  assert.ok(index.itemsByCategory.get(4).length>1900,
    'the original ClothingSets browse path must have real Item IDs');
  assert.ok(index.itemsByCategory.get(1).length>50,
    'source Fish Item IDs are a real Collection category');
  assert.equal(collectionDb01InCategory(index,40005160,3),true,
    'the source Furniture category resolves by exact Item ID');
  assert.equal(collectionDb01InCategory(index,40005160,1),false);
  const shoe=index.byItem.get(40005160);
  assert.ok(shoe,'Glass Shoe must have native filter tags');
  assert.ok(shoe.some(([facet,key])=>facet==='color'&&key==='White'));
  assert.equal(collectionDb01Matches(index,40005160,'color','White'),true);
  assert.equal(collectionDb01Matches(index,40005160,'color','Pink'),false);
  const groups=collectionDb01Groups(index,[40005160,40005160]);
  assert.equal(groups.find(x=>x.facet==='color').options.find(x=>x.key==='White').count,1,
    'repeated category Item IDs must be deduplicated before count');
  assert.equal(collectionDb01FacetLabel('ja','color'),'色');
  const allGroups=collectionDb01Groups(index,[...index.byItem.keys()]);
  assert.ok(allGroups.find(group=>group.facet==='worldContextTag')?.options
    .some(option=>option.key==='IsDreamlightValley'),
    'original World-context tags must be available as source browse filters');
  assert.ok((allGroups.find(group=>group.facet==='disneyUniverse')?.options.length??0)>0,
    'original Disney universe tags must be available for cross-category browsing');
  assert.equal(collectionDb01FacetLabel('ja','worldContextTag'),'ワールドの原本タグ');
  // All 4,050 original Steam ActivityItem definitions carry exact Item ID
  // subtype evidence. The 1,972 items previously lumped into a generic
  // unclassified bucket must resolve to six distinct native type groups.
  assert.equal(raw.activityTypeItemCount,4050);
  assert.equal(index.activityTypesByItem.size,4050);
  assert.equal(raw.nativeSubtypeItemCount,13202);
  assert.equal(raw.nativeSubtypeGameUiMembershipVerified,false);
  assert.equal(index.nativeSubtypeByItem.size,13202);
  const counts=[...index.itemsByNativeSubtype.entries()].map(([key,ids])=>({
    key,count:ids.length,original:index.nativeSubtypeNames.get(key)
  }));
  assert.equal(counts.reduce((sum,x)=>sum+x.count,0),13202);
  const byClass=new Map();
  for(const group of counts){
    const type=group.key.split(':')[0];
    byClass.set(type,(byClass.get(type)??0)+group.count);
    assert.ok(group.count>0);
    assert.ok(index.itemsByNativeSubtype.get(group.key)?.every(id=>{
      const native=index.nativeSubtypeByItem.get(id);
      return native&&native.nativeType+':'+native.code===group.key;
    }));
  }
  assert.equal(byClass.get('ActivityItem'),4050);
  assert.equal(byClass.get('Furniture'),6746);
  assert.equal(byClass.get('Clothing'),2041);
  assert.equal(byClass.get('Trimming'),365);
  assert.equal(counts.length,50);
  const explicitKeys=COLLECTION_TOP_CATEGORIES.flatMap(group=>group.keys);
  assert.equal(new Set(explicitKeys).size,explicitKeys.length);
  assert.ok(explicitKeys.every(key=>index.itemsByNativeSubtype.has(key)));
  const parents=collectionTopCategoryCards(counts.map(row=>({
    key:row.key,total:row.count,owned:0
  })));
  assert.deepEqual(parents.map(row=>row.id),[
    'furniture','landscaping','roads-fences','interior','buildings','environment',
    'clothing','appearance','touch-of-magic','photo-mode','tools','upgrades',
    'characters','companions','adventure-companions','critters','mounts','crafting','meals','ingredients',
    'foraging','fish','gems','timebending','memories','board-game','snippets',
    'lorekeeper-tales','quest-puzzles','exhibition'
  ]);
  const boundTotal=counts.filter(row=>collectionTopCategory(row.key)!==null)
    .reduce((sum,row)=>sum+row.count,0);
  assert.equal(parents.reduce((sum,row)=>sum+row.total,0),boundTotal);
  assert.ok(boundTotal>0&&boundTotal<13202);
  for(const key of ['Clothing:5','Clothing:16','Clothing:17','Clothing:18'])
    assert.equal(collectionTopCategory(key),'appearance');
  assert.equal(collectionTopCategory('Furniture:7'),'roads-fences');
  assert.equal(collectionTopCategory('Trimming:0'),'interior');
  for(const key of ['ActivityItem:12','ActivityItem:13','Furniture:5','Furniture:6'])
    assert.equal(collectionTopCategory(key),null);

  for(const group of parents)for(const locale of ['en','ja','fr','it','de','es-ES','zh-CN','pt-BR'])
    assert.ok(collectionTopCategoryLabel(locale,group.id).length>0);

  assert.equal(COLLECTION_NATIVE_SUBTYPE_UI.length,35);
  const languages=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
  for(const spec of COLLECTION_NATIVE_SUBTYPE_UI){
    assert.equal(index.nativeSubtypeNames.get(spec.key),spec.source,
      'UI subtype labels require the exact original IL2CPP subtype name');
    assert.equal(Object.keys(spec.labels).length,8);
    for(const lang of languages){
      const translated=collectionNativeSubtypeLabel(lang,spec.key,spec.source);
      assert.equal(translated,spec.labels[lang]);
      assert.ok(translated.length>0);
    }
    assert.notEqual(
      collectionNativeSubtypeLabel('ja',spec.key,'UnverifiedType'),spec.labels.ja,
      'mismatched original enum must fall back to original name');
  }
  assert.equal(index.itemsByNativeSubtype.get('ActivityItem:3')?.length,618);
  assert.equal(index.itemsByNativeSubtype.get('ActivityItem:11')?.length,201);
  assert.equal(index.itemsByNativeSubtype.get('Furniture:7')?.length,319);
  assert.equal(index.itemsByNativeSubtype.get('Clothing:5')?.length,114);
  assert.equal(index.itemsByNativeSubtype.get('Trimming:0')?.length,218);
  assert.ok(raw.universeSourceItemCount>0);
  assert.equal(index.universesByItem.size,raw.universeSourceItemCount);
  assert.ok(index.itemsByUniverse.size>0&&index.itemsByUniverse.size<=67);
  assert.equal(index.itemsByUniverse.size,66,
    'published DB-01 per-Item links expose 66 native universe Tag keys');
  assert.ok(index.itemsByUniverse.has('NonIP'));
  assert.ok(index.itemsByUniverse.has('DreamlightValley'));
  for(const [key,ids] of index.itemsByUniverse)
    assert.ok(ids.every(id=>index.universesByItem.get(id)?.includes(key)));
  assert.equal(raw.universeSourceTagEvidence,
    'original_tag_id_or_collection_predicate_tag_id');
  assert.equal(raw.universeSourceTagGameUiMembershipVerified,false);
  assert.ok(raw.universeSourceTagCount>0);
  assert.equal(index.universeTagIdsByItem.size,raw.universeSourceTagCount);
  assert.equal(index.itemsByUniverseTagId.size,66,
    '66 original Tag IDs have item links; 67th (Raya) is a zero-item definition');
  assert.equal(index.itemsByUniverseTagId.has(2000500069),false,
    'do not invent Raya Item ID membership');
  assert.ok(index.itemsByUniverseTagId.has(2000500017));
  assert.ok(index.itemsByUniverseTagId.has(2000500023));
  for(const [id,items] of index.itemsByUniverseTagId)
    assert.ok(items.every(itemId=>index.universeTagIdsByItem.get(itemId)?.includes(id)));
  assert.equal(index.itemsByActivityType.size,15);
  assert.deepEqual([...index.activityTypeNames.entries()].sort((a,b)=>a[0]-b[0]),[
    [0,'Default'],[2,'Crop'],[3,'Meal'],[4,'Seed'],[8,'Flower'],
    [10,'Fish'],[11,'Ingredient'],[12,'RequestItem'],
    [13,'Ephemeral'],[14,'LootPresent'],[15,'Consummable'],
    [16,'Mineral'],[17,'CraftingMaterial'],[18,'BuffElixir'],[19,'Manual']
  ],'source-native subtype names must match the SHA-pinned DB-01 release');
  const expected=new Map([
    [0,34],[2,165],[3,618],[4,171],[8,129],[10,103],
    [11,201],[12,1559],[13,193],[14,168],[15,481],
    [16,59],[17,151],[18,11],[19,7]
  ]);
  for(const [code,count] of expected)
    assert.equal(index.itemsByActivityType.get(code)?.length,count,
      'exact Item-ID census for native ActivityItemType '+code);
  assert.equal([...expected.values()].reduce((sum,n)=>sum+n,0),4050);
  assert.equal([0,12,13,14,18,19].reduce(
    (sum,code)=>sum+(index.itemsByActivityType.get(code)?.length??0),0),1972);
  assert.equal(index.activityTypesByItem.get(31200002)?.code,12);
  for(const [code,ids] of index.itemsByActivityType)
    assert.ok(ids.every(id=>index.activityTypesByItem.get(id)?.code===code));
});

test('source browse index refuses invented availability, reordered IDs and unreviewed tags',()=>{
  const fixture={
    schema:COLLECTION_DB01_FACETS_SCHEMA,
    release:'steam-1.26.2-item-id-master-v1',
    sourceArchiveSha256:COLLECTION_DB01_ARCHIVE_SHA,
    sourceItemCount:13202,
    taggedItems:2,
    items:[[100,[['color','White']]],[200,[['furnitureStyle','F_Elegant']]]]
  };
  const index=parseCollectionDb01Facets(fixture);
  assert.equal(index.byItem.size,2);
  assert.equal(index.activityTypesByItem.size,0,'legacy synthetic tag tests remain valid');
  assert.throws(()=>parseCollectionDb01Facets({
    ...fixture,activityTypeEvidence:'original_il2cpp_activity_item_type',
    activityTypeGameUiMembershipVerified:false,activityTypeItemCount:2,
    activityTypeItems:[[31200002,12,'QuestItem'],[31300003,13,'Default']]
  }),/ACTIVITY_TYPE_MANIFEST/);
  assert.equal(collectionDb01Matches(index,200,'furnitureStyle','F_Elegant'),true);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,items:[fixture.items[1],fixture.items[0]]}),
    /INVALID_ROW/);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,items:[[100,[['worldAvailability','DreamlightValley']]]]}),
    /INVALID_MANIFEST|INVALID_ROW/);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,sourceItemCount:200}),
    /INVALID_MANIFEST/);
});
test('world browse index matches source tags and subtype counts without querying the runtime',async()=>{
  const raw=JSON.parse(await readFile(join(process.cwd(),'static/ddv/collection/db01-facets-1262.json'),'utf8'));
  const source=parseCollectionDb01Facets(raw);
  const worlds=buildWorldBrowseIndex(source);
  const all=worlds.get('');
  assert.equal(all.itemIds.length,source.sourceItemCount);
  assert.equal(new Set(all.itemIds).size,all.itemIds.length);
  assert.ok(worlds.size>1);
  for(const [world,scope] of worlds){
    const expected=[...source.nativeSubtypeByItem.keys()].filter(id=>
      !world||collectionDb01Matches(source,id,'worldContextTag',world));
    assert.deepEqual(new Set(scope.itemIds),new Set(expected));
    assert.equal(scope.itemIds.length,new Set(expected).size);
    assert.equal([...scope.nativeCounts.values()].reduce((a,b)=>a+b,0),scope.itemIds.length);
    for(const [key,count] of scope.nativeCounts){
      const matching=new Set(source.itemsByNativeSubtype.get(key));
      assert.equal(count,expected.filter(id=>matching.has(id)).length);
    }
    const records=Object.fromEntries(expected.slice(0,17).map(id=>[String(id),{status:'owned'}]));
    const owned=countOwnedInWorldScope(source,scope,records);
    assert.equal([...owned.native.values()].reduce((a,b)=>a+b,0),Math.min(expected.length,17));
    assert.equal(countOwnedInWorldScope(source,scope,{}).native.size,0);
  }
});
