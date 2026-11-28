import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePremiumBundleText} from '../src/lib/items/premium-bundle-localization.ts';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readFile} from 'node:fs/promises';
test('native bundle text stays scoped to its exact revision and locale',()=>{
  const b={bundleId:'Bundle_AliceCuriousLabyrinth',current:{language:'en-US',title:"Alice's Curious Labyrinth Bundle",description:'Native',components:[{itemId:1,quantity:1}]},legacy:{titleKey:'Liveops.Old_Title',components:[{itemId:2,quantity:1}]}};
  const ja=resolvePremiumBundleText(b,'ja');
  assert.equal(ja.current.title,'アリスの不思議なラビリンスパック');
  assert.equal(ja.current.description,null);assert.equal(ja.legacy.title,null);
  assert.equal(resolvePremiumBundleText(b,'en').current.description,'Native');
  const renamed={...b,current:{...b.current,title:'Changed'}};
  assert.equal(resolvePremiumBundleText(renamed,'ja').current.title,null);
  const withNative={...b,legacy:{...b.legacy,localizedText:{ja:{title:'旧版'}}}};
  assert.equal(resolvePremiumBundleText(withNative,'ja').legacy.title,'旧版');
});
test('canonical bundle locale batch preserves missing IDs and duplicates',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const catalog=await db.getPremiumBundleCatalog();
  const id=catalog.definitions[0].bundleId;
  const results=await db.getPremiumBundleLocalizedText([id,'not-a-real-bundle',id],'ja');
  assert.equal(results[0].bundleId,id);assert.equal(results[1],null);assert.deepEqual(results[0],results[2]);
});

test('unnamed single-component offers use only the canonical requested-locale item name',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const catalog=await db.getPremiumBundleCatalog();
  const current=catalog.definitions.filter(b=>b.current?.components.length===1&&!b.current.title);
  assert.equal(current.length,363);
  const fields=await db.getItemFields(current.map(b=>b.current.components[0].itemId),['names.ja']);
  const localized=await db.getPremiumBundleLocalizedText(current.map(b=>b.bundleId),'ja');
  for(const [i,row] of localized.entries()){
    assert.equal(row.current.title,null);
    const name=fields[i]?.values['names.ja']??null;
    assert.equal(row.current.displayTitle,name);
    assert.equal(row.current.displayTitleSource,name?'single_component_item':null);
  }
  const titleCount=catalog.definitions.filter(b=>b.current?.localizedText?.ja?.title).length;
  const legacyTitleCount=catalog.definitions.filter(b=>b.legacy?.localizedText?.ja?.title).length;
  assert.equal(titleCount,306);assert.equal(legacyTitleCount,276);
});
