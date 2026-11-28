import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePremiumBundleText} from '../src/lib/items/premium-bundle-localization.ts';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readFile} from 'node:fs/promises';
test('native bundle text stays scoped to its exact revision and locale',()=>{
  const b={bundleId:'Bundle_AliceCuriousLabyrinth',current:{language:'en-US',title:"Alice's Curious Labyrinth Bundle",description:'Native'},legacy:{titleKey:'Liveops.Old_Title'}};
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
