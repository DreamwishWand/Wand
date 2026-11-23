import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTION_UNIVERSE_UNTAGGED,isDreamlightUniverse,isOtherUniverse,
  collectionUniverseDisplayLabel,
  sortedCollectionUniverseOptions,groupCollectionUniverseItems}
  from '../src/lib/collection/browse-layout.ts';
import {COLLECTION_UNIVERSE_TAG_NAMES} from '../src/lib/collection/universe-tag-names.ts';

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
  assert.equal(isOtherUniverse('NonIP'),true);
  assert.equal(collectionUniverseDisplayLabel('ja','NonIP'),'その他');
  assert.equal(collectionUniverseDisplayLabel('ja','DreamlightValley'),'ドリームライトバレー');
  const withOriginalOther={
    ...index,universesByItem:new Map([...index.universesByItem,[4,['NonIP']]]),
    itemsByUniverse:new Map([...index.itemsByUniverse,['NonIP',[4]]])
  };
  const original=sortedCollectionUniverseOptions(withOriginalOther,'ja',
    key=>collectionUniverseDisplayLabel('ja',key),'ユニバース未設定');
  assert.deepEqual(original.map(x=>x.id),[
    'NonIP','DreamlightValley','Alice','Elsa',COLLECTION_UNIVERSE_UNTAGGED
  ]);
  assert.equal(original.at(-1)?.total,16);
});
test('all 67 universe source definitions have eight original display names and Japanese readings',()=>{
  const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
  assert.equal(COLLECTION_UNIVERSE_TAG_NAMES.length,67);
  assert.equal(new Set(COLLECTION_UNIVERSE_TAG_NAMES.map(x=>x.id)).size,67);
  for(const row of COLLECTION_UNIVERSE_TAG_NAMES){
    assert.ok(row.id>=2000500000&&row.id<2000600000);
    assert.equal(Object.keys(row.names).length,8);
    for(const lang of locales){
      const title=collectionUniverseDisplayLabel(lang,String(row.id));
      assert.equal(title,row.names[lang]);
      assert.ok(title.length>0&&!/<[^>]+>|\u200b/.test(title));
    }
    assert.ok(/^[ぁ-んー]+$/.test(row.jaReading));
  }
  assert.equal(collectionUniverseDisplayLabel('ja','2000500069'),'ラーヤと龍の王国');
  assert.equal(collectionUniverseDisplayLabel('en','2000500069'),'Raya and the Last Dragon');
  const index={
    sourceItemCount:13_202,
    itemsByUniverse:new Map,
    universesByItem:new Map,
    universeTagIdsByItem:new Map([[1,[2000500023]],[2,[2000500017]]]),
    itemsByUniverseTagId:new Map([[2000500023,[1]],[2000500017,[2]]])
  };
  const english=sortedCollectionUniverseOptions(index,'en',
    key=>collectionUniverseDisplayLabel('en',key),'No source universe tag');
  const japanese=sortedCollectionUniverseOptions(index,'ja',
    key=>collectionUniverseDisplayLabel('ja',key),'ユニバース未設定');
  assert.equal(english.length,68,'67 original definitions plus separate untagged group');
  assert.equal(japanese.length,68);
  assert.deepEqual(japanese.slice(0,2).map(x=>x.label),['その他','ドリームライトバレー']);
  assert.deepEqual(english.slice(0,2).map(x=>x.label),['Other','Dreamlight Valley']);
  assert.equal(japanese.find(x=>x.id==='2000500069')?.total,0);
  assert.equal(japanese.at(-1)?.id,COLLECTION_UNIVERSE_UNTAGGED);
  assert.equal(japanese.at(-1)?.total,13_200);
  // Alphabetic and phonetic sorting use localized *display* names, never
  // source Tag enum keys or Unicode kanji codepoint order.
  const e=english.map(x=>x.id);
  assert.ok(e.indexOf('2000500072')<e.indexOf('2000500048'),
    "A Bug\'s Life precedes Aladdin");
  const j=japanese.map(x=>x.id);
  assert.ok(j.indexOf('2000500062')<j.indexOf('2000500005')&&
    j.indexOf('2000500005')<j.indexOf('2000500048'),
    'Japanese gojuon: アトランティス, アナ, アラジン');
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
  const full=groupCollectionUniverseItems(rows,item=>({
    id:item.family,label:item.family,
    rank:item.family==='Clothing'?1:item.family==='Furniture'?2:3
  }),rows.length);
  assert.equal(full.reduce((sum,section)=>sum+section.items.length,0),rows.length);
});
