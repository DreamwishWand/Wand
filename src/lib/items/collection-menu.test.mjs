import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createDb01OriginalCollectionMenuClient,
  DB01_COLLECTION_MENU_EVIDENCE,
} from './collection-menu.ts';

const hash=raw=>createHash('sha256').update(raw).digest('hex');
const encoded=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
const source='a'.repeat(64),original='b'.repeat(64),dump='c'.repeat(64);
const row={itemId:30_200_001,nativeCategory:'ActivityItem',
  nativeKey:'ActivityItem!Synthetic',sourceSha256:source};
const set={itemId:2120000015,nativeCategory:'CollectionSet',
  nativeKey:'IngredientsSpice',sourceSha256:original};
const menu={
  setId:set.itemId,setKey:set.nativeKey,submenuCode:8,submenu:'Foraging',
  collectionLabelKey:'CollectionSet.ForagingSpice_CollectionName',
  sortPriority:3,groupCount:1,directListedItemCount:1,
  dynamicSelectorsUnresolved:1,gameUiVisibilityVerified:false,
};
const listed={
  setId:set.itemId,setKey:set.nativeKey,submenuCode:8,submenu:'Foraging',
  collectionLabelKey:menu.collectionLabelKey,groupIndex:0,
  evidence:DB01_COLLECTION_MENU_EVIDENCE,
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
};
function fixture(){
  const data={'menus.json':encoded([menu]),
    'direct-items.json':encoded([{itemId:row.itemId,memberships:[listed]}])};
  const files=Object.fromEntries(Object.entries(data).map(([path,bytes])=>
    [path,{sha256:hash(bytes),bytes:bytes.length,count:1}]));
  const manifest={
    schema:'wand.db01.collection-menu-direct@1',platform:'Steam',
    gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,
    sourceSqliteSha256:'d'.repeat(64),sourceItemsSha256:source,
    sourceCollectionSetSha256:original,sourceIl2cppDumpSha256:dump,
    catalogDefinitions:2,collectionSetDefinitions:1,
    directListedItemIds:1,directListedAssociations:1,dynamicSelectorsUnresolved:1,
    ignoredExplicitListEntries:1,emptySourceGroups:0,
    menusBySubmenu:{Foraging:1},directAssociationsBySubmenu:{Foraging:1},
    gameUiVisibilityComplete:false,dynamicSelectorsEvaluated:false,
    worldAvailabilityVerified:false,dlcOwnershipVerified:false,files,
  };
  const base=[row,set];
  const catalog={
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
      sourceItemsSha256:source,definitions:2},
    getItem:async id=>base.find(v=>v.itemId===id)??null,
    getItems:async ids=>ids.map(id=>base.find(v=>v.itemId===id)??null),
  };
  const requests=[];
  const load=async path=>{requests.push(path);return data[path];};
  return {data,manifest,catalog,load,requests};
}
test('source CollectionSet submenu and direct Item-ID lookup, not inferred UI visibility',async()=>{
  const f=fixture();
  const c=createDb01OriginalCollectionMenuClient(f.manifest,f.load,f.catalog);
  const menus=await c.getMenus();
  assert.equal(menus.length,1);
  assert.equal(menus[0].submenu,'Foraging');
  assert.equal(menus[0].dynamicSelectorsUnresolved,1);
  const refs=await c.getDirectListings(row.itemId);
  assert.equal(refs.length,1);
  assert.equal(refs[0].evidence,DB01_COLLECTION_MENU_EVIDENCE);
  assert.equal(refs[0].setId,set.itemId);
  assert.equal(refs[0].gameUiVisibilityVerified,false);
  assert.equal(refs[0].worldAvailabilityVerified,false);
  assert.equal(refs[0].dlcOwnershipVerified,false);
  assert.deepEqual(await c.getDirectListings(123456789),[]);
  assert.deepEqual(f.requests,['menus.json','direct-items.json']);
  assert.strictEqual(c.source.directListedItemIds,1);
  assert.strictEqual(c.source.dynamicSelectorsUnresolved,1);
});
test('source mismatches and unverified flags cannot be approved',()=>{
  const f=fixture();
  assert.throws(()=>createDb01OriginalCollectionMenuClient({
    ...f.manifest,dynamicSelectorsEvaluated:true},f.load,f.catalog),/PRIVATE_SOURCE_REQUIRED/);
  assert.throws(()=>createDb01OriginalCollectionMenuClient(f.manifest,f.load,{
    ...f.catalog,source:{...f.catalog.source,gameVersion:'1.27.0'}}),
  /CATALOG_SOURCE_MISMATCH/);
});
test('SHA-pinned source assets reject modifications before interpreting memberships',async()=>{
  const f=fixture();
  f.data['menus.json']=encoded([]);
  await assert.rejects(
    createDb01OriginalCollectionMenuClient(f.manifest,f.load,f.catalog).getMenus(),
    /FILE_SIZE|FILE_SHA/);
});
test('original CollectionSet identity checked against source catalog',async()=>{
  const f=fixture();
  const forged={...f.catalog,
    getItems:async ids=>ids.map(id=>id===set.itemId?{...set,nativeKey:'Forged'}:row)};
  await assert.rejects(createDb01OriginalCollectionMenuClient(
    f.manifest,f.load,forged).getMenus(),/ORIGINAL_MENU_MISMATCH/);
});
test('self-consistent forged menu association with incorrect group is rejected',async()=>{
  const f=fixture();
  const corrupt={...listed,groupIndex:2};
  const bytes=encoded([{itemId:row.itemId,memberships:[corrupt]}]);
  f.data['direct-items.json']=bytes;
  f.manifest.files['direct-items.json']={
    sha256:hash(bytes),bytes:bytes.length,count:1,
  };
  await assert.rejects(createDb01OriginalCollectionMenuClient(
    f.manifest,f.load,f.catalog).getMenus(),/LISTING_MENU_MISMATCH/);
});
test('mutating caller manifest cannot retarget SHA after initialization',async()=>{
  const f=fixture();
  const c=createDb01OriginalCollectionMenuClient(f.manifest,f.load,f.catalog);
  f.manifest.files['menus.json'].sha256='f'.repeat(64);
  f.manifest.menusBySubmenu.Foraging=0;
  assert.equal((await c.getMenus())[0].submenu,'Foraging');
});
