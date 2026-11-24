import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openPublicItemDetails} from '../src/lib/items/public-item-details.ts';

const acq = '/Wand/acquisition/public/db01-item-acquisition-1.26.2.json';
const relations = '/Wand/acquisition/public/db01-item-source-relations-1.26.2.json';
function siteFiles() {
  const requests = [];
  let failSource = 0;
  const fetcher = async url => {
    requests.push(url);
    assert.match(url, /^\/Wand\/(?:acquisition\/public\/db01-item-(?:acquisition|source-relations)-1\.26\.2\.json|ddv\/item-master\/steam-1\.26\.2\/(?:index\.json|id\/[0-9a-f]{2}\.json))$/);
    if (url===relations && failSource>0) {
      failSource--;
      return new Response('temporary error', {status:503});
    }
    const bytes = await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes), {status:200});
  };
  return {fetcher, requests, failSourceOnce:()=>{failSource=1;}};
}

test('DB-02 15,444 original source relations join the existing DB-01 Item ID API on demand',async()=>{
  const {fetcher,requests}=siteFiles();
  const db=await openPublicItemDetails('/Wand',fetcher);
  assert.equal(db.release.count,13202);
  assert.equal(requests.length,1,'only Item master index loads at startup');

  const basic=await db.getItem(40005160);
  assert.equal(basic.definition.names.en,'Glass Shoe');
  assert(!('sourceRelations' in basic));
  assert.equal(requests.filter(url=>url===acq).length,1);
  assert.equal(requests.filter(url=>url===relations).length,0,
    'existing consumers never load the source-ID sidecar');

  const detailed=await db.getItemWithSources(40005160);
  assert.equal(detailed.itemId,40005160);
  assert.equal(detailed.definition.iconGuid,basic.definition.iconGuid);
  assert.equal(detailed.acquisition,basic.acquisition);
  assert.equal(detailed.sourceRelations.itemId,'40005160');
  assert.deepEqual(detailed.sourceRelations.categories,
    detailed.acquisition.categories);
  assert.equal(detailed.sourceRelations.sourceCoverageComplete,false);
  assert(Object.isFrozen(detailed));
  assert(Object.isFrozen(detailed.sourceRelations));
  assert.equal(requests.filter(url=>url===relations).length,1);
  assert.equal(await db.getItemWithSources(40005160),detailed);

  const unknown=await db.getItemWithSources(900000000);
  assert.equal(unknown,null);
  const unresolved=await db.getSourceRelations(900000000);
  assert.equal(unresolved.identifiedSourceLinks,false);
  assert.deepEqual(unresolved.links,[]);
  assert.equal(requests.filter(url=>url===relations).length,1);
});

test('Item ID -> concrete Quest/Star Path/Recipe IDs and reverse lookup preserve original roles',async()=>{
  const {fetcher,requests}=siteFiles();
  const db=await openPublicItemDetails('Wand',fetcher);
  const linked=await db.listItemIdsWithSources();
  assert.equal(linked.length,4137);
  assert(Object.isFrozen(linked));
  assert.equal(await db.listItemIdsWithSources(),linked);
  const questItems=await db.getSourceItemIds('quest','2070000628');
  assert(questItems.length>0);
  assert(Object.isFrozen(questItems));
  for(const id of questItems){
    const record=await db.getSourceRelations(id);
    assert(record.links.some(edge=>edge.kind==='quest'&&edge.sourceId==='2070000628'));
    for(const edge of record.links){
      assert(Object.isFrozen(edge));
      assert(Object.isFrozen(edge.sourcePosition));
      assert.equal(edge.gameSourceOnly,true);
      assert.equal(edge.grantedVerified,false);
      assert.equal(edge.currentlyAvailableVerified,false);
    }
  }
  const starItems=await db.getSourceItemIds('star_path','Seafaring2026');
  assert(starItems.length>0);
  for(const id of starItems.slice(0,5)) {
    const record=await db.getSourceRelations(id);
    assert(record.links.some(edge=>edge.kind==='star_path'&&
      edge.sourceId==='Seafaring2026'));
  }
  assert.deepEqual(await db.getSourceItemIds('quest','99999999'),[]);
  assert.equal(requests.filter(url=>url===relations).length,1);
  assert.equal(requests.filter(url=>url===acq).length,0,
    'reverse source queries do not fetch acquisition classifications');

  const enriched=await db.getItemsWithSources([...linked.slice(0,20),900000000,linked[0]]);
  assert.equal(enriched.length,22);
  assert.equal(enriched[20],null);
  for(const row of enriched){
    if(!row)continue; // Raw source reference may be outside published Item master.
    assert(row.sourceRelations.identifiedSourceLinks);
    assert.deepEqual(row.sourceRelations.categories,row.acquisition.categories);
  }
  // This published Item is actually linked; unlike some original source IDs,
  // it is confirmed present in the 13,202-definition public Item Master.
  const known=await db.getItemWithSources(40006110);
  assert.equal(known.definition.names.en,'Decorative Picnic Basket');
  assert.equal(known.sourceRelations.identifiedSourceLinks,true);
  assert(known.sourceRelations.links.length>0);
  assert.equal(enriched[0],enriched[21], 'batch preserves duplicate Item identity');
});

test('source-ID sidecar failure is retryable without inventing missing source links',async()=>{
  const {fetcher,requests,failSourceOnce}=siteFiles();
  const db=await openPublicItemDetails('/Wand',fetcher);
  failSourceOnce();
  await assert.rejects(db.getSourceRelations(40005160),
    /DB02_DB01_SOURCE_RELATIONS_DOWNLOAD_FAILED/);
  const recovered=await db.getSourceRelations(40005160);
  assert.equal(recovered.itemId,'40005160');
  assert.equal(requests.filter(url=>url===relations).length,2);
});


test('reverse acquisition lookup distinguishes result, ingredient and reward roles',async()=>{
  const {fetcher,requests}=siteFiles();
  const db=await openPublicItemDetails('/Wand',fetcher);
  const recipe='2050300095';
  const all=await db.getSourceItemIds('recipe',recipe);
  const results=await db.getSourceItemIds('recipe',recipe,'crafting_result');
  const ingredients=await db.getSourceItemIds('recipe',recipe,'recipe_ingredient_item');
  assert(results.includes(30000031));
  assert(ingredients.includes(31700021)&&ingredients.includes(31700022));
  assert(!ingredients.includes(30000031));
  for(const [role,ids] of [['crafting_result',results],['recipe_ingredient_item',ingredients]]){
    assert(Object.isFrozen(ids));
    const expected=[];
    for(const id of all){
      const record=await db.getSourceRelations(id);
      if(record.links.some(l=>l.kind==='recipe'&&l.sourceId===recipe&&l.role===role))expected.push(id);
    }
    assert.deepEqual(ids,expected);
  }
  assert.deepEqual(await db.getSourceItemIds('recipe',recipe,'star_path_free_reward'),[]);
  await assert.rejects(db.getSourceItemIds('recipe',recipe,'unknown_role'),/INVALID_SOURCE_ROLE/);
  assert.equal(requests.filter(url=>url===relations).length,1);
  assert.equal(requests.filter(url=>url===acq).length,0);
  assert(!requests.some(url=>url.includes('/id/')));
});
