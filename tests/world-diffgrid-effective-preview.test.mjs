import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiffGridWitness,parseEffectiveDiffGridPreview} from '../src/lib/world/diffgrid-effective-preview.ts';

const path='SceneLayouts/Houses/TestHouse/TestHouse_Layout.json';
const data='GridData/Rooms/Test.json';
const entry={gridIdNative:3,gridDataPath:data,defaultObjectCount:1,defaultHashEvidence:'source_native_method_correlated',defaultGridHashCode:-3,defaultGridDataHashCode:8};
const original={gridIdNative:3,gridObjectIdNative:7,itemId:42,x:0,y:2,orientationCode:4,stateSha256:null,stateByteCount:0,fromNativeCode:null};
const source=(e=entry,rows=[original])=>({
 layouts:new Map([[path,{layoutId:path,layoutKind:'nativeGridCollection',source:{nativeType:'interior_source_with_embedded_Meta.GridCollection'},nativeGridEntries:[e]}]]),
 grids:new Map([[data,{sizeX:3,sizeY:4}]]),layoutObjectsByLayout:new Map([[path,rows]])
});
test('uses both native source hashes and exact complete object set',()=>{
 const w=createDiffGridWitness(source(),path,3,'Steam','1.26.2');
 assert.equal(w.layoutType,'Meta.DefaultCharacterHouseData, Meta');
 assert.deepEqual(w.hashes,[-3,8]);
 assert.deepEqual(w.defaultObjects,[{gridObjectIdNative:7,itemId:42,x:0,y:2,orientationCode:4,plainSource:true}]);
 assert.equal(createDiffGridWitness(source(),path,3,'Switch','1.26.2'),null);
 assert.equal(createDiffGridWitness(source(),path,3,'Steam','1.26.3'),null);
 assert.equal(createDiffGridWitness(source({...entry,defaultGridHashCode:undefined}),path,3,'Steam','1.26.2'),null);
 assert.equal(createDiffGridWitness(source(entry,[]),path,3,'Steam','1.26.2'),null);
});
test('read-only worker receipt excludes native save keys and rejects authorization',()=>{
 const raw={contract:'wand.db05.diffgrid-effective-preview@1',sourceAuthenticityVerified:false,saveWritingAuthorized:false,placementLegalityVerified:false,
 hashMismatchCount:0,unresolvedCount:0,grids:[{localGridOrdinal:1,lookupEnumerationDivergenceCount:0,points:[{itemId:'42',x:0,y:2,orientation:'Right',origin:'default',secret:'not returned'}]}]};
 const r=parseEffectiveDiffGridPreview(raw);
 assert.equal(r.grids[0].points[0].secret,undefined);
 assert.throws(()=>parseEffectiveDiffGridPreview({...raw,saveWritingAuthorized:true}));
 assert.throws(()=>parseEffectiveDiffGridPreview({...raw,grids:[{...raw.grids[0],localGridOrdinal:3}]}));
});
