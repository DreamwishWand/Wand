import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
import {openPublicItemDetails} from '../src/lib/items/public-item-details.ts';

const root='static/ddv/item-master/steam-1.26.2-complete';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function site(){
  const requests=[];
  return {requests,fetcher:async url=>{
    assert.match(url,/^\/Wand\/(?:ddv\/item-master|acquisition\/public\/db01-item-)/);
    requests.push(url);
    const bytes=await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes),{status:200});
  }};
}

test('complete source release includes every original definition exactly once',async()=>{
  const {fetcher,requests}=site();
  const master=await openPublicItemMaster('/Wand',fetcher,{gameVersion:'current',scope:'complete'});
  assert.equal(master.release.version,'steam-1.26.2-item-id-master-v3');
  assert.equal(master.release.count,39067);
  assert.equal(master.release.sourceFilesVerified,39);
  assert.equal(master.release.coverage.nativeCategoryCount,38);
  assert.equal(master.release.coverage.sourceSelectorCount,262);
  assert.equal(master.release.coverage.allOriginalFieldSemanticsVerified,false);
  assert.equal(requests.length,2,'registry and index only');
  const all=new Map();
  for(const [path,meta] of Object.entries(master.release.shards)){
    const bytes=await readFile(join(root,path));
    assert.equal(digest(bytes),meta.sha256);
    assert.equal(bytes.length,meta.bytes);
    const rows=JSON.parse(bytes).items;
    assert.equal(rows.length,meta.count);
    for(const r of rows){
      assert.equal(all.has(r.itemId),false);all.set(r.itemId,r);
      assert.equal(r.collectionMembershipVerified,false);
      assert.equal(r.worldMembershipVerified,false);
      assert.equal(r.availabilityVerified,false);
    }
  }
  assert.equal(all.size,39067);
  const facets=await master.getCollectionFacets();
  assert.equal(facets.nativeSubtypeItems.length,39067);
  assert.equal(facets.definitionScopeItems.length,39067);
  assert.equal(facets.browseItems.length,16176);
  assert.equal(facets.universeTags.length,67);
  assert.equal(facets.worldSourceTagItems.length,11275);
  assert(facets.universeTags.every(x=>Object.values(x.names).every(n=>typeof n==='string'&&n.length>0)));
  assert.equal(facets.craftingRecipeResultItems.length,1294);
  assert.equal(facets.craftingRecipeResultItems.reduce((n,r)=>n+r[1].length,0),1318);
  assert(facets.universeTags.some(r=>r.key==='NonIP'&&r.tagId===2000500017));
  const relations=await master.getSourceRelations();
  assert.equal(relations.collectionMenus.length,305);
  assert.equal(relations.collectionSelectors.length,262);
  assert.equal(relations.gameRuntimeMembershipVerified,false);
  const names=await master.getBrowseNames('ja');
  assert(names.length>10000);
  assert.equal(new Set(names.map(r=>r[0])).size,names.length);
  assert(requests.some(u=>u.endsWith('/locale/ja.json')));
  assert(!requests.some(u=>u.endsWith('/locale/en.json')));
  const sample=[2130000001,200000001,100000010,20300002,130000387,30000031];
  const fromReader=await master.getItems(sample);
  assert.deepEqual(fromReader,sample.map(id=>all.get(id)));
  assert.equal(fromReader[0].nativeCategory,'Condition');
  assert.equal(fromReader[0].iconGuid,null);
  assert.equal(fromReader[0].definitionScope,'other_definition');
  assert.equal(fromReader[1].nativeCategory,'Story');
  assert.equal(fromReader[2].nativeCategory,'TouchOfMagic');
  assert.deepEqual(fromReader[2].universeSetTagIds,[2000500001]);
  assert.deepEqual(fromReader[3].universeTagIds,[2000500017]);
  assert(fromReader[4].collectionExclusions.some(x=>x.setId===2120000349&&x.criterion===2001300012));
  assert(fromReader[4].artwork.maskGuid);
  assert(fromReader[5].craftingRecipeItemIds.includes(2050300095));
  assert(fromReader[5].collectionExclusions.some(x=>x.sourceRecipeItemId===2050300095));
  assert(Object.isFrozen(fromReader[5].collectionExclusions));
  assert(Object.isFrozen(fromReader[0].observedFields[0]));
  assert.equal(await master.getItem(99999999),null);
});

test('complete details use the existing DB-02 joins even for source-only IDs',async()=>{
  const {fetcher}=site();
  const details=await openPublicItemDetails('/Wand',fetcher);
  const item=await details.getCompleteItem(2130000001);
  assert.equal(item.definition.nativeCategory,'Condition');
  assert.equal(item.definition.iconGuid,null);
  assert.equal(Number(item.sourceRelations.itemId),item.itemId);
  assert.equal(Number(item.acquisition.itemId),item.itemId);
  assert.equal(item.currentAvailabilityVerified,false);
  const results=await details.getCompleteItems([30000031,99999999]);
  assert.equal(results[0].itemId,30000031);assert.equal(results[1],null);
});

test('complete source shard and browse asset digest mismatches fail closed',async()=>{
  const {fetcher}=site();
  const tamper=async url=>{
    const res=await fetcher(url);
    if(!url.endsWith('/collection-facets.json')&&!url.includes('/id/'))return res;
    const bytes=new Uint8Array(await res.arrayBuffer());
    bytes[0]^=1;
    return new Response(bytes);
  };
  const m=await openPublicItemMaster('/Wand',tamper,{scope:'complete'});
  await assert.rejects(m.getCollectionFacets(),/SHA_MISMATCH/);
  await assert.rejects(m.getItem(2130000001),/SHA_MISMATCH/);
});


test('canonical fields support selective access, sparse values and reverse lookup without row shards',async()=>{
  const {fetcher,requests}=site();
  const m=await openPublicItemMaster('/Wand',fetcher,{scope:'complete'});
  const catalog=await m.getFieldCatalog();
  assert(catalog.some(x=>x.field==='source.GridAreaData'));
  assert(catalog.some(x=>x.field==='source.Ingredients'));
  assert(catalog.some(x=>x.field==='source.Description'));
  assert.equal(catalog.find(x=>x.field==='itemId').count,m.release.count);
  const fields=['names.ja','iconGuid','source.GridAreaData'];
  const values=await m.getItemFields([40005160,2130000001,99999999,40005160],fields);
  assert.equal(values[0].values['names.ja'],'ガラスの靴');
  assert.equal(values[0].values.iconGuid,'ee85e95b0e61be642af03833a4942ae7');
  assert.equal(values[0].values['source.GridAreaData'].SizeX,1);
  assert.equal(values[1].values.iconGuid,null);
  assert(!Object.hasOwn(values[1].values,'source.GridAreaData'));
  assert.equal(values[2],null);
  assert.equal(values[3],values[0]);
  assert(Object.isFrozen(values[0].values));
  assert(Object.isFrozen(values[0].values['source.GridAreaData']));
  assert(!requests.some(x=>x.includes('/id/')||x.includes('/names.en/')||
    x.includes('/source.Ingredients/')||x.includes('/text/')));
  const grids=await m.findItemIdsByField('source.GridAreaData',{kind:'present'});
  assert.equal(grids.length,11325);
  const furniture=await m.findItemIdsByField('nativeCategory',{kind:'equals',value:'Furniture'});
  assert(furniture.includes(40005160));
  const universe=await m.findItemIdsByField('universeTagIds',{kind:'contains',value:2000500017});
  assert(universe.includes(20300002));
  const missing=await m.getItemFields([2130000001],[]);
  assert.equal(missing[0].itemId,2130000001);
  assert.deepEqual(Object.keys(missing[0].values),[]);
  await assert.rejects(m.getFieldRows('unknownField'),/UNKNOWN_FIELD/);
  await assert.rejects(m.getFieldRows('../index'),/INVALID_NAME/);
  assert(!requests.some(x=>x.includes('/id/')));
});

test('field columns equal canonical values for source fields, localized names and IDs',async()=>{
  const {fetcher}=site();
  const m=await openPublicItemMaster('/Wand',fetcher,{scope:'complete'});
  const all=await m.getFieldRows('itemId');
  assert.equal(all.length,m.release.count);
  const ids=[2050300095,40005160,30000031,130000387,2130000001];
  const rows=await m.getItems(ids);
  const fields=['names.en','nativeCategory','artwork.maskGuid','source.Ingredients',
    'source.Description','source.GridAreaData','universeTagIds','sourceFrame','observedFields'];
  const projections=await m.getItemFields(ids,fields);
  for(let i=0;i<ids.length;i++){
    const expected=rows[i],values=projections[i].values;
    for(const field of fields){
      const [group,key]=field.split('.');
      const value=group==='source'?(expected.sourceAttributes?.[key]??expected.nativeProperties[key]):
        key?expected[group]?.[key]:expected[group];
      assert.equal(Object.hasOwn(values,field),value!==undefined,field);
      if(value!==undefined)assert.deepEqual(values[field],value,field);
    }
  }
});

test('field column integrity failure rejects and retries without falling back to full rows',async()=>{
  const {fetcher,requests}=site();
  let failed=false;
  const tamper=async url=>{
    const response=await fetcher(url);
    if(failed||!url.includes('/fields/names.ja/'))return response;
    failed=true;
    const bytes=new Uint8Array(await response.arrayBuffer());
    bytes[0]^=1;
    return new Response(bytes);
  };
  const m=await openPublicItemMaster('/Wand',tamper,{scope:'complete'});
  await assert.rejects(m.getItemFields([40005160],['names.ja']),/SHA_MISMATCH/);
  assert.equal((await m.getItemFields([40005160],['names.ja']))[0].values['names.ja'],'ガラスの靴');
  assert(!requests.some(x=>x.includes('/id/')));
});
