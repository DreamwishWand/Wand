import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {decodeP1gPackagedProfile,p1gPackagedProfileCodec} from '../src/lib/collection/private-p1g-codec.js';
import {createSavedStorePreview, attachHistoricalStoreLabels} from '../src/lib/collection/saved-store-preview.mjs';
import {inspectEncryptedSavedStore,inspectLocalSavedStore} from '../src/lib/collection/saved-store-worker-core.mjs';
import {inspectLocalDb04SaveJoin} from '../src/lib/collection/saved-world-db04-join-worker-core.mjs';
import {
  makeCollectionDb04ZipFixture,TEST_DB04_LAYOUT,TEST_DB04_GRID
} from './helpers/collection-db04-zip-fixture.mjs';
import {inspectDecodedWorldStores} from '../src/lib/acquisition/world-store-save.mjs';

// A wholly synthetic Node AES/ZIP source profile; never read owner originals.
const KEY=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
const NAME=Buffer.from('profile');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);}return(c^0xffffffff)>>>0;}
function makeFixture(decoded){
 const p=Buffer.from(JSON.stringify(decoded)),compressed=deflateRawSync(p);
 const local=Buffer.alloc(30+NAME.length+compressed.length);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
 local.writeUInt32LE(crc32(p),14);local.writeUInt32LE(compressed.length,18);
 local.writeUInt32LE(p.length,22);local.writeUInt16LE(NAME.length,26);
 NAME.copy(local,30);compressed.copy(local,30+NAME.length);
 const central=Buffer.alloc(46+NAME.length);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt16LE(8,10);central.writeUInt32LE(crc32(p),16);
 central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(p.length,24);
 central.writeUInt16LE(NAME.length,28);NAME.copy(central,46);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);
 end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);
 end.writeUInt32LE(local.length,16);
 const enc=createCipheriv('aes-256-ecb',KEY,null);enc.setAutoPadding(true);
 return new Uint8Array(Buffer.concat([enc.update(Buffer.concat([local,central,end])),enc.final()]));
}
test('browser P1G read-only codec opens synthetic saved shops and produces Collection preview',async()=>{
 const source=makeFixture({GameInfo:{Version:643},Player:{},World:{Stores:[{
  BuildingItemID:123,Displays:[{DisplayItemID:789,DisplayInfo:{Slots:[
   {Item:{id:40000001,amount:1},IsAvailable:true,CurrencyId:10},
   {Item:null,IsAvailable:true}
  ]}}]}]}});
 const raw=await decodeP1gPackagedProfile(source);
 assert.equal(raw.metadata.profileVersion,643);
 const saved=JSON.parse(raw.jsonText);
 const evidence=inspectDecodedWorldStores({getStallStaticCatalog:()=>null},saved);
 const summary=createSavedStorePreview(evidence,[{itemId:40000001,label:'Reference only',family:'Furniture'}]);
 assert.equal(summary.distinctItemCount,1);
 assert.equal(summary.savedSlotsWithoutItem,1);
 assert.equal(summary.items[0].historicalReferenceOnly,true);
 assert.equal(summary.items[0].playerOwnedVerified,false);
 assert.equal(summary.pricesVerified,false);
});
test('dedicated public-site reader does not expose save Writer API',()=>{
 assert.equal(p1gPackagedProfileCodec.createEncodedProfile,undefined);
});
test('rejects malformed encrypted profiles without dispatching network operations',async()=>{
 await assert.rejects(()=>decodeP1gPackagedProfile(new Uint8Array(17)),/INVALID_ENCRYPTED_PROFILE_LENGTH/);
});


test('one-shot worker core decodes encrypted P1G and returns ID-only data', async()=>{
 const source=makeFixture({GameInfo:{Version:643},Player:{Secret:'private test field'},
 World:{Stores:[{BuildingItemID:1,Displays:[{DisplayItemID:100,DisplayInfo:{Slots:[
  {Item:{id:40000001,amount:24},IsAvailable:true,CurrencyId:10},
  {Item:{id:40000001,amount:11},IsAvailable:false},
  {Item:null,IsAvailable:true}
 ]}}]}]}});
 const result=await inspectEncryptedSavedStore(source);
 assert.equal(result.kind,'saved-store-summary');
 assert.equal(result.saveSchema,643);
 assert.equal(result.summary.distinctItemCount,1);
 assert.equal(result.summary.savedStoreCount,1);
 assert.equal(result.summary.savedItemReferenceCount,2);
 assert.equal(result.summary.savedSlotsWithoutItem,1);
 const ui=attachHistoricalStoreLabels(structuredClone(result.summary),
  [{itemId:40000001,label:'Historical',family:'Furniture'}]);
 assert.equal(ui.items[0].historicalLabel,'Historical');
 assert.equal(ui.items[0].referenceCount,2);
 const reply=JSON.stringify(result);
 assert.ok(!reply.includes('private test field'));
 assert.ok(!reply.includes('"amount":'));
 assert.ok(!reply.includes('"Amount":'));
 assert.ok(!reply.includes('CurrencyId'));
 assert.ok(!reply.includes('IsAvailable'));
 assert.equal(ui.ownershipVerified,false);
 assert.equal(ui.liveInventoryVerified,false);
});

test('synthetic encrypted P1G keeps native discovery booleans and excludes category conflicts',async()=>{
 const source=makeFixture({
  GameInfo:{Version:643},
  Player:{
   Secret:'do-not-leak',
   CollectionSets:[{
    CollectionDefinitionID:2120000032,
    GroupData:[
     {GroupIndex:0,State:'private-player-group',
       GroupsCollectionItems:{'40005160':true,'40006110':false,'40003256':true}},
     {GroupIndex:1,State:'private-player-group',
       GroupsCollectionItems:{'40003256':false,'40006110':false}}
    ]
   }]
  },
  World:{Stores:[]}
 });
 const result=await inspectEncryptedSavedStore(source);
 assert.equal(result.saveSchema,643);
 assert.equal(result.discovery.status,'partial_inconclusive');
 assert.equal(result.discovery.ambiguousItemIds,1);
 assert.deepEqual(result.discovery.entries,[
  {itemId:40005160,discovered:true},
  {itemId:40006110,discovered:false}
 ]);
 const json=JSON.stringify(result);
 assert.ok(!json.includes('do-not-leak'));
 assert.ok(!json.includes('private-player-group'));
 assert.ok(!json.includes('CollectionDefinitionID'));
 assert.ok(!json.includes('GroupIndex'));
 assert.equal(result.discovery.ownershipVerified,false);
 const {sanitizeSavedCollectionDiscovery}=await import('../src/lib/collection/saved-collection-discovery.mjs');
 assert.deepEqual(sanitizeSavedCollectionDiscovery(structuredClone(result.discovery)),result.discovery);
});

test('encrypted synthetic P1G exposes positive-stock ownership only without raw amounts',async()=>{
 const root={GameInfo:{Version:643},Player:{
  PrivateName:'no-leak-identity',
  ListInventories:{
   '0':{ID:0,CompatibleItemType:'Furniture',Inventory:{
    '40005160':{Amount:3,Marker:'Favorite'},
    '40006110':{Amount:0,Marker:'Hidden'}
   }},
   '1':{ID:1,CompatibleItemType:'Clothing',Inventory:{
    '50000001':{Amount:1}
   }}
  },
  CollectionSets:[{GroupData:[{GroupsCollectionItems:{
   '40005160':true,'40006110':false
  }}]}]
 },World:{Stores:[]}};
 const actual=await inspectEncryptedSavedStore(makeFixture(root));
 assert.deepEqual(actual.positiveOwnership.entries,[
  {itemId:40005160,role:'Furniture'},
  {itemId:50000001,role:'Clothing'}
 ]);
 assert.equal(actual.positiveOwnership.zeroReferences,1);
 assert.equal(actual.positiveOwnership.missingStatusInferred,false);
 const {sanitizePositiveListInventoryOwnership}=await import('../src/lib/collection/saved-list-positive-ownership.mjs');
 assert.deepEqual(sanitizePositiveListInventoryOwnership(
  structuredClone(actual.positiveOwnership)),actual.positiveOwnership);
 const json=JSON.stringify(actual);
 assert.ok(!json.includes('no-leak-identity'));
 assert.ok(!json.includes('"Amount":3'));
 assert.ok(!json.includes('Hidden'));
 assert.ok(!json.includes('Favorite'));
 assert.ok(!json.includes('ListInventories'));
});

test('encrypted synthetic P1G observes surviving world furniture, not ownership',async()=>{
 const source=makeFixture({GameInfo:{Version:643},Player:{Secret:'private-no-leak'},
  World:{
   Stores:[],
   GridCollection:{
    Grids:{'10':{ID:10,Objects:{
     '3':{ID:3,ItemID:40005160,X:321,State:{Private:'never-leak'}},
     '4':{ID:4,ItemID:40005160,X:321}
    }}},
    DiffGrids:{'11':{ID:11,RemovedObjects:[7],ModifiedObjects:{
     '7':{ID:7,ItemID:40005160,From:'removed-reference'},
     '9':{ID:9,ItemID:40006110,X:123}
    }}}
   }
  }
 });
 const result=await inspectEncryptedSavedStore(source);
 assert.equal(result.gridFurniture.status,'saved_furniture_references');
 assert.equal(result.gridFurniture.fullReferences,2);
 assert.equal(result.gridFurniture.diffModifiedReferences,1);
 assert.deepEqual(result.gridFurniture.entries,[
  {itemId:40005160,fullGridReferences:2,diffModifiedReferences:0},
  {itemId:40006110,fullGridReferences:0,diffModifiedReferences:1}
 ]);
 assert.equal(result.positiveOwnership.entries.length,0);
 assert.equal(result.gridFurniture.ownershipOrUnlockInferred,false);
 const {sanitizeSavedGridFurnitureReferences}=await import(
  '../src/lib/collection/saved-grid-furniture-references.mjs');
 assert.deepEqual(sanitizeSavedGridFurnitureReferences(structuredClone(result.gridFurniture)),
  result.gridFurniture);
 const encoded=JSON.stringify(result);
 for(const value of ['private-no-leak','never-leak','removed-reference',
   '"X"','"State"','"From"','"RemovedObjects"'])assert.ok(!encoded.includes(value),value);
});

test('dual-file local DB04 ZIP + encrypted P1G rejoins only exact source paths',async()=>{
 const root={
  GameInfo:{Version:643},Player:{Secret:'sensitive-test-profile'},
  World:{GridCollection:{
    Grids:{'13':{ID:13,Objects:{'1':{ID:1,ItemID:40005160}}}},
    DiffGrids:{'950':{
      ID:950,GridDefaultLayoutPath:TEST_DB04_LAYOUT,
       GridDefaultLayoutType:'Meta.GridCollection, Meta',
       DefaultLayoutGridID:0,DefaultGridHashCode:-816650372,
       DefaultGridDataHashCode:-410688507,
      RemovedObjects:[7],
      ModifiedObjects:{
        '7':{ID:7,ItemID:40005160,Private:'removed-payload'},
        '8':{ID:8,ItemID:40005160,X:432},
        '10':{ID:10,ItemID:40009111,Y:321}
      }
    }}
  }}
 };
 const source=makeFixture(root);
 const archive=new Uint8Array(makeCollectionDb04ZipFixture());
 const outcome=await inspectLocalDb04SaveJoin(source,archive);
 assert.equal(outcome.status,'partial_exact_matches');
 assert.equal(outcome.observedGrids,2);
 assert.equal(outcome.matchedGrids,1);
 assert.equal(outcome.unresolvedGrids,1);
 assert.equal(outcome.sourceDefaultObjects,3);
 assert.equal(outcome.effectiveObjects,3); // 8, 9 (default), 10
 assert.equal(outcome.removedDefaultObjects,1);
 assert.equal(outcome.savedOnlyObjects,1);
 assert.deepEqual(outcome.entries,[
  {itemId:40005160,sourceDefault:1,effectiveSaved:1,
    savedOnlyIdentity:0,removedDefaultIdentity:1,changedDefaultIdentity:1},
  {itemId:40006110,sourceDefault:1,effectiveSaved:0,
    savedOnlyIdentity:0,removedDefaultIdentity:0,changedDefaultIdentity:0},
  {itemId:40009111,sourceDefault:0,effectiveSaved:1,
    savedOnlyIdentity:1,removedDefaultIdentity:0,changedDefaultIdentity:0}
 ]);
 assert.equal(outcome.playerOwnershipVerified,false);
 const str=JSON.stringify(outcome);
 for(const secret of ['sensitive-test-profile','removed-payload',TEST_DB04_LAYOUT,
    TEST_DB04_GRID,'"X"','"Y"','"GridDefaultLayoutPath"'])
  assert.ok(!str.includes(secret),secret);
 const {sanitizeSavedWorldDb04Join}=await import('../src/lib/collection/saved-world-db04-join.mjs');
 assert.deepEqual(sanitizeSavedWorldDb04Join(structuredClone(outcome)),outcome);
});

test('DB04 dual-file Worker rejects tampered source hash and unsupported Steam target',async()=>{
 const p1g=makeFixture({
  GameInfo:{Version:643},Player:{},World:{GridCollection:{DiffGrids:{}}}
 });
 const zip=makeCollectionDb04ZipFixture({gameVersion:'1.26.1'});
 const output=await inspectLocalDb04SaveJoin(p1g,new Uint8Array(zip));
 assert.equal(output.status,'unsupported_source_or_schema');
 await assert.rejects(()=>inspectLocalDb04SaveJoin(p1g,new Uint8Array(19)),
   /COLLECTION_DB04_INVALID_LOCAL_INPUT/);
});

test('worker core rejects oversize or misaligned ciphertext before decoding',async()=>{
 await assert.rejects(()=>inspectEncryptedSavedStore(new Uint8Array(15)),/LOCAL_P1G_INVALID_CIPHERTEXT/);
 await assert.rejects(()=>inspectEncryptedSavedStore(new Uint8Array(33)),/LOCAL_P1G_INVALID_CIPHERTEXT/);
});

test('Collection accepts plain Steam .profile JSON through the local Worker projection contract',async()=>{
  const root={GameInfo:{Version:643},Player:{
    PrivateName:'MUST_NOT_LEAK',
    ListInventories:{'0':{CompatibleItemType:'Furniture',Inventory:{
      '40005160':{Amount:2,Internal:'secret'}
    }}}
  },World:{Stores:[]}};
  const bytes=new Uint8Array(Buffer.from(' \r\n'+JSON.stringify(root)));
  const result=await inspectLocalSavedStore(bytes);
  assert.equal(result.kind,'saved-store-summary');
  assert.equal(result.saveSchema,643);
  assert.deepEqual(result.positiveOwnership.entries,[
    {itemId:40005160,role:'Furniture'}
  ]);
  assert.ok(!JSON.stringify(result).includes('MUST_NOT_LEAK'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('Collection native decoder injection remains Worker-local and fails closed on forged JSON',async()=>{
  const root={GameInfo:{Version:643},Player:{PrivateName:'no-copy'},World:{Stores:[]}};
  const bytes=makeFixture(root);
  let calls=0;
  const response=await inspectLocalSavedStore(bytes,async source=>{
    calls++;
    assert.equal(source,bytes);
    return {jsonText:JSON.stringify(root)};
  });
  assert.equal(calls,1);
  assert.equal(response.saveSchema,643);
  assert.ok(!JSON.stringify(response).includes('no-copy'));
  await assert.rejects(
    inspectLocalSavedStore(bytes,async()=>({
      jsonText:'{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}'
    })),
    /Duplicate JSON object key/
  );
});
