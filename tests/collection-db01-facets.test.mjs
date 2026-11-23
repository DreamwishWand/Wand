import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
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