import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTION_UNIVERSE_UNTAGGED,isDreamlightUniverse,
  sortedCollectionUniverseOptions,groupCollectionUniverseItems}
  from '../src/lib/collection/browse-layout.ts';

test('universe order keeps no-tag then Dreamlight before locale-collated source choices',()=>{
  const index={
    sourceItemCount:20,
    universesByItem:new Map([[1,['DreamlightValley']],[2,['Elsa']],[3,['Alice']]]),
    itemsByUniverse:new Map([
      ['Elsa',[2]],['DreamlightValley',[1]],['Alice',[3]]
    ])
  };
  const en=sortedCollectionUniverseOptions(index,'en',x=>x,'No source tag');
  assert.deepEqual(en.map(x=>x.id),[
    COLLECTION_UNIVERSE_UNTAGGED,'DreamlightValley','Alice','Elsa'
  ]);
  assert.equal(en[0].total,17);
  const labels={Elsa:'えりさ',Alice:'あいりす',DreamlightValley:'ドリームライトバレー'};
  const ja=sortedCollectionUniverseOptions(index,'ja',x=>labels[x], '未設定');
  assert.deepEqual(ja.map(x=>x.id),[
    COLLECTION_UNIVERSE_UNTAGGED,'DreamlightValley','Alice','Elsa'
  ]);
  assert.equal(isDreamlightUniverse('Disney_Dreamlight_Valley'),true);
});
test('selected universe groups source-native Item IDs, keeps all headings on first page',()=>{
  const rows=[
    {itemId:32,family:'Furniture'},{itemId:13,family:'Fish'},
    {itemId:11,family:'Fish'},{itemId:21,family:'Furniture'},
    {itemId:56,family:'Clothing'}
  ];
  const sections=groupCollectionUniverseItems(rows,item=>({
    id:item.family,label:item.family,
    rank:item.family==='Clothing'?1:item.family==='Furniture'?2:3
  }),2);
  assert.deepEqual(sections.map(x=>x.id),['Clothing','Furniture','Fish']);
  assert.deepEqual(sections.find(x=>x.id==='Fish').items.map(x=>x.itemId),[11,13]);
  assert.deepEqual(sections.find(x=>x.id==='Furniture').items.map(x=>x.itemId),[21,32]);
  assert.deepEqual(sections.map(x=>x.total),[1,2,2]);
});
