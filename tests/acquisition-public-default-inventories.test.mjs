import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_DEFAULT_INVENTORIES_SCHEMA,DB02_DEFAULT_INVENTORIES_FILE,
  DB02_DEFAULT_INVENTORIES_BYTES,DB02_DEFAULT_INVENTORIES_SHA,
  loadPinnedDefaultInventorySource,hasPinnedDefaultInventoryEvidence
} from '../src/lib/acquisition/public-default-inventories.ts';

const asset=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_DEFAULT_INVENTORIES_FILE,import.meta.url
));
const request=async path=>{
  assert.equal(path,'/Wand/acquisition/public/'+DB02_DEFAULT_INVENTORIES_FILE);
  return new Response(asset,{status:200});
};
const load=()=>loadPinnedDefaultInventorySource('/Wand',request);

test('pinned original default-inventories projection authenticates SHA, 15 native fields, 289 entries, 288 Item IDs',async()=>{
  assert.equal(asset.length,DB02_DEFAULT_INVENTORIES_BYTES);
  assert.equal(createHash('sha256').update(asset).digest('hex'),
    DB02_DEFAULT_INVENTORIES_SHA);
  const source=JSON.parse(asset.toString('utf8'));
  assert.equal(source.schema,DB02_DEFAULT_INVENTORIES_SCHEMA);
  assert.equal(source.source.recordType,'Meta.DefaultInventories');
  assert.equal(source.source.originalProtoDbSha256,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
  assert.equal(source.source.originalProtoDbBytes,1335720);
  assert.equal(source.source.byteEquivalentToTargetVersion,true);
  assert.equal(source.source.privateSaveIncluded,false);
  assert.equal(source.source.newPlayerGrantVerified,false);
  const index=await load();
  assert(index.sourceIntegrity==='source_protoDb_and_public_sha256_pinned');
  assert(hasPinnedDefaultInventoryEvidence(index));
  assert(!hasPinnedDefaultInventoryEvidence({...index}));
  assert.equal(index.coverage.groups,15);
  assert.equal(index.coverage.configuredEntries,289);
  assert.equal(index.coverage.distinctItemIds,288);
  assert.equal(index.coverage.containerEntries,3);
  assert.equal(index.coverage.listEntries,286);
  assert.equal(index.coverage.playerInventoryVerified,false);
  assert.equal(index.coverage.newPlayerGrantVerified,false);
  assert.equal(index.coverage.onlineOwnershipVerified,false);
  assert.equal(index.coverage.privateSaveIncluded,false);
  assert.equal(index.coverage.sourceCoverageComplete,false);
  assert.equal(index.origins.length,289);
  assert.equal(index.groups.length,15);
  assert.equal(index.linkedItemIds.length,288);
  assert.equal(index.origins.filter(x=>x.routeStatus==='confirmed_source_link').length,0);
  assert.equal(index.groups.reduce((n,g)=>n+g.entries.length,0),289);
  for(const group of index.groups){
    assert.equal(index.getGroup(group.name),group);
    assert.equal(index.getGroupOrigins(group.name).length,group.entries.length);
    assert(group.entries.every((entry,i)=>
      entry.sourceEntryIndex===i&&
      index.getItemGroupNames(entry.itemId).includes(group.name)));
  }
  assert.deepEqual([...new Set(index.origins.map(x=>x.itemId))].sort((a,b)=>Number(a)-Number(b)),
    index.linkedItemIds);

  assert(index.origins.every(x=>
    x.kind==='other'&&x.routeStatus==='static_candidate_only'&&
    x.availability==='not_live_verified'&&
    x.source.kind==='verified_game_native'&&
    x.source.gameVersion==='1.26.2'));
  assert(index.linkedItemIds.every((x,i,arr)=>i===0||Number(arr[i-1])<Number(x)));
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.origins));
  assert(Object.isFrozen(index.groups));
  assert(Object.isFrozen(index.coverage));
  assert(Object.isFrozen(index.linkedItemIds));
  for(const row of index.origins){
    assert.equal(index.getOrigin(row.originId)[0],row);
    assert(index.getItemCandidates(row.itemId).includes(row));
    assert(row.conditions.some(x=>x.includes('does not confirm a new-player grant')));
    assert(row.quantity>=1);
  }
});

test('preserve all 15 original inventory types, home duplicate slot and per-Item configured amount without claiming player ownership',async()=>{
  const index=await load();
  assert.deepEqual(index.groups.map(x=>[x.name,x.entries.length]),[
    ['Backpack',0],['HomeStorage',3],['Catalog',4],['Wardrobe',74],
    ['Pantry',0],['Makeup',42],['Trimming',8],['Buildings',6],
    ['Decals',90],['Skins',14],['AvatarFeatures',25],['Figurines',0],
    ['PhotoMode',12],['MountGear',11],['EnvironmentalFX',0]
  ]);
  assert.deepEqual(index.getGroup('HomeStorage')?.entries.map(x=>[
    x.sourceEntryIndex,x.itemId,x.configuredAmount
  ]),[
    [0,'31700017',5],[1,'31500006',1],[2,'31500006',1]
  ]);
  assert.equal(index.getItemCandidates('31500006').length,2);
  assert.equal(index.getGroup('Backpack')?.entries.length,0);
  assert.equal(index.getGroup('Pantry')?.entries.length,0);
  assert.equal(index.getGroup('EnvironmentalFX')?.entries.length,0);
  assert.equal(index.getGroup('Wardrobe')?.entries.length,74);
  assert.equal(index.getGroup('Wardrobe')?.originalFieldNumber,4);
  assert.equal(index.getGroup('Wardrobe')?.nativeInventoryType,'list');
  assert.equal(index.getGroup('HomeStorage')?.nativeInventoryType,'container');
  assert.deepEqual(index.getGroup('Catalog')?.entries.map(x=>[
    x.itemId,x.configuredAmount
  ]),[['40001598',1],['40001880',1],['40001883',2],['40001884',1]]);
  assert.deepEqual(index.getGroup('PhotoMode')?.entries.map(x=>x.itemId),[
    '190000000','190000001','190000002','190000003','190000004',
    '190000005','190000006','190000007','190000008','190000009',
    '190000010','190000011'
  ]);
  const clothing=index.getItemCandidates('50000320');
  assert.equal(clothing.length,1);
  assert.equal(clothing[0].quantity,3,'preserve Data.Amount=3, do not infer live count');
  assert.deepEqual(index.getItemGroupNames('50000320'),['Wardrobe']);
  assert.equal(index.getGroup('Missing'),null);
  assert.deepEqual(index.getGroupOrigins('Missing'),[]);
  assert.deepEqual(index.getItemCandidates('999999999'),[]);
  assert.deepEqual(index.getItemGroupNames('999999999'),[]);
  assert(Object.isFrozen(index.getGroup('Wardrobe')?.entries));
  assert(Object.isFrozen(index.getGroup('Wardrobe')?.entries[0]));
  assert.equal(index.getGroup('Wardrobe')?.entries[0].playerOwnershipVerified,false);
});

test('pinned loader rejects tampered/shortened files, dangerous bases and malformed Item IDs',async()=>{
  const copy=Buffer.from(asset);copy[123]^=1;
  await assert.rejects(loadPinnedDefaultInventorySource('/Wand',
    async()=>new Response(copy,{status:200})),/PROJECTION_SHA/);
  await assert.rejects(loadPinnedDefaultInventorySource('/Wand',
    async()=>new Response(asset.subarray(1),{status:200})),/PROJECTION_SIZE/);
  let count=0;
  await assert.rejects(loadPinnedDefaultInventorySource('/Wand/../private',
    async()=>{count++;return new Response(asset);}),/INVALID_BASE_PATH/);
  assert.equal(count,0);
  const index=await load();
  assert.throws(()=>index.getItemCandidates('00031500006'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemCandidates(0),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemCandidates(NaN),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getItemGroupNames('abc'),/INVALID_ITEM_ID/);
});
