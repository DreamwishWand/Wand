import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog,WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {
  COLLECTION_DB04_JOIN_CONTRACT,reconcileSavedWorldWithDb04,
  sanitizeSavedWorldDb04Join
} from '../src/lib/collection/saved-world-db04-join.mjs';

const LAYOUT='SceneLayouts/Village04/Main.json';
const GRIDPATH='GridData/Village04/Meadow.json';
const make=(rows=[
  {gridObjectIdNative:7,itemId:40005160},
  {gridObjectIdNative:8,itemId:40006110},
  {gridObjectIdNative:9,itemId:50000001}
],manifestVersion='1.26.2',defaultObjectCount=rows.length)=>{
  const sourceRows=rows.map(o=>({
    layoutId:LAYOUT,gridIdNative:0,...o,
    layoutObjectId:LAYOUT+`#grid=0#object=${o.gridObjectIdNative}`,
    x:4,y:4,worldCoordinatesVerified:false,fixedImmovableVerified:false
  }));
  const catalog=createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      gameVersion:manifestVersion,platform:'Steam',sourceScopeVerified:false},
    objects:[],scenes:[],grids:[],worlds:[],areas:[],
    layouts:[{layoutId:LAYOUT,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:0,gridDataPath:GRIDPATH,
        defaultObjectCount}]}],
    layoutObjects:sourceRows
  });
  return {catalog,gameVersion:manifestVersion,platform:'Steam'};
};
const object=(ID,ItemID)=>({ID,ItemID,X:55,Y:66,
  State:{PrivateQuestData:'do-not-expose'},From:'unknown-player-origin'});
const diff=(ModifiedObjects,RemovedObjects=[],overrides={})=>({
  ID:850,GridDefaultLayoutPath:LAYOUT,GridDataPath:GRIDPATH,
  ModifiedObjects,RemovedObjects,...overrides
});
const save=(grid,Version=643)=>({GameInfo:{Version},Player:{Secret:'private-profile'},
  World:{GridCollection:grid,Private:'private-world'}});
const safe=x=>assert.deepEqual(sanitizeSavedWorldDb04Join(structuredClone(x)),x);

test('DiffGrid exact dual-path join restores default IDs then removes and substitutes',()=>{
 const root=save({DiffGrids:{'850':diff({
  '8':object(8,40005160),'10':object(10,40009111),
  '11':object(11,50000001),
  '7':object(7,40005160) // removed even though still materialized
 },[7])}});
 const old=structuredClone(root);
 const result=reconcileSavedWorldWithDb04(root,make());
 assert.deepEqual(root,old);
 assert.equal(result.contract,COLLECTION_DB04_JOIN_CONTRACT);
 assert.equal(result.status,'all_observed_grids_matched');
 assert.equal(result.observedGrids,1);
 assert.equal(result.matchedGrids,1);
 assert.equal(result.sourceDefaultObjects,3);
 assert.equal(result.effectiveObjects,4);
 assert.equal(result.removedDefaultObjects,1);
 assert.equal(result.savedOnlyObjects,2);
 assert.equal(result.changedDefaultIdentities,1);
 assert.deepEqual(result.entries,[
  {itemId:40005160,sourceDefault:1,effectiveSaved:1,
    savedOnlyIdentity:0,removedDefaultIdentity:1,changedDefaultIdentity:1},
  {itemId:40006110,sourceDefault:1,effectiveSaved:0,
    savedOnlyIdentity:0,removedDefaultIdentity:0,changedDefaultIdentity:0},
  {itemId:40009111,sourceDefault:0,effectiveSaved:1,
    savedOnlyIdentity:1,removedDefaultIdentity:0,changedDefaultIdentity:0}
 ]);
 assert.equal(result.globalWorldCoverageVerified,false);
 assert.equal(result.sourceAuthenticityVerified,false);
 assert.equal(result.playerOwnershipVerified,false);
 assert.equal(result.playerPlacementVerified,false);
 assert.equal(result.manualCollectionChanged,false);
 const str=JSON.stringify(result);
 for(const secret of ['private-profile','private-world','PrivateQuestData',
   'unknown-player-origin',LAYOUT,GRIDPATH,'"X"','"Y"','"ModifiedObjects"','"GridDataPath"'])
   assert.ok(!str.includes(secret),secret);
 safe(result);
});

test('full materialized Grid objects are compared by source-ID, not Grid key',()=>{
 const root=save({Grids:{'999':{
  ID:999,GridDefaultLayoutPath:LAYOUT,GridDataPath:GRIDPATH,
  Objects:{'10':object(10,40009111),'8':object(8,40006110)}
 }}});
 const out=reconcileSavedWorldWithDb04(root,make());
 assert.equal(out.matchedGrids,1);
 assert.equal(out.sourceDefaultObjects,3);
 assert.equal(out.effectiveObjects,2);
 assert.equal(out.savedOnlyObjects,1);
 assert.equal(out.removedDefaultObjects,2); // native IDs 7 and 9 not present in full save
 assert.deepEqual(out.entries,[
  {itemId:40005160,sourceDefault:1,effectiveSaved:0,
    savedOnlyIdentity:0,removedDefaultIdentity:1,changedDefaultIdentity:0},
  {itemId:40006110,sourceDefault:1,effectiveSaved:1,
    savedOnlyIdentity:0,removedDefaultIdentity:0,changedDefaultIdentity:0},
  {itemId:40009111,sourceDefault:0,effectiveSaved:1,
    savedOnlyIdentity:1,removedDefaultIdentity:0,changedDefaultIdentity:0}
 ]);
 safe(out);
});

test('unknown exact paths, version mismatch and partial native defaults fail closed',()=>{
 const unmatched=save({DiffGrids:{'850':diff({'10':object(10,40005160)},[],{
   GridDataPath:'GridData/Other.json'
 })}});
 const miss=reconcileSavedWorldWithDb04(unmatched,make());
 assert.equal(miss.status,'no_exact_source_match');
 assert.equal(miss.matchedGrids,0);
 assert.equal(miss.unresolvedGrids,1);
 assert.deepEqual(miss.entries,[]);
 safe(miss);
 const unavailable=reconcileSavedWorldWithDb04(unmatched,make([], '1.25.0'));
 assert.equal(unavailable.status,'unsupported_source_or_schema');
 safe(unavailable);
 const oldSchema=reconcileSavedWorldWithDb04(unmatched,make(),624);
 assert.notEqual(oldSchema.status,'all_observed_grids_matched');
 const brokenDefault=reconcileSavedWorldWithDb04(
  save({DiffGrids:{'850':diff({'10':object(10,40005160)})}}),
  make(undefined,'1.26.2',5));
 assert.equal(brokenDefault.status,'no_exact_source_match');
 assert.equal(brokenDefault.partialSourceGrids,1);
 safe(brokenDefault);
});

test('malformed removed identities and a source/path ambiguity cannot invent effective stock',()=>{
 const bad=save({DiffGrids:{'850':diff({'8':object(8,40005160)},['8'])}});
 const out=reconcileSavedWorldWithDb04(bad,make());
 assert.equal(out.status,'no_exact_source_match');
 assert.equal(out.invalidGrids,1);
 assert.deepEqual(out.entries,[]);
 safe(out);
 const duplicate=make();
 duplicate.catalog.layouts.get(LAYOUT).nativeGridEntries.push({
   gridIdNative:1,gridDataPath:GRIDPATH,defaultObjectCount:0
 });
 const ambiguous=reconcileSavedWorldWithDb04(
  save({DiffGrids:{'850':diff({'10':object(10,40005160)})}}),duplicate);
 assert.equal(ambiguous.status,'no_exact_source_match');
 assert.equal(ambiguous.unresolvedGrids,1);
 safe(ambiguous);
});

test('sanitizer forbids source paths, raw object identities and ownership claims',()=>{
 const baseline=reconcileSavedWorldWithDb04(
  save({DiffGrids:{'850':diff({'10':object(10,40005160)})}}),make());
 for(const mutate of [
  x=>{x.entries[0].gridId=850;},
  x=>{x.entries[0].itemId=50000001;},
  x=>{x.entries[0].effectiveSaved=999999;},
  x=>{x.status='complete_world';},
  x=>{x.globalWorldCoverageVerified=true;},
  x=>{x.playerOwnershipVerified=true;},
  x=>{x.sourceAuthenticityVerified=true;},
  x=>{x.matchedGrids=500;},
  x=>{x.entries.push({...x.entries[0]});}
 ]){
  const forged=structuredClone(baseline);mutate(forged);
  assert.throws(()=>sanitizeSavedWorldDb04Join(forged),
    /COLLECTION_DB04_JOIN_INVALID_WORKER_REPLY/);
 }
});
