import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchSourceGridToLocalTerrain,DB04_SOURCE_TERRAIN_NAVIGATION
} from '../src/lib/world/native-grid-navigation.ts';

const source={
  sourceGameVersion:'1.26.2',
  sourceWorldManifestSha256:'f'.repeat(64),
  layoutId:'SceneLayouts/Village04/Beach.json',
  nativeGridId:7,
  gridDataPath:'GridData/Village04/Beach.json'
};
const direct={
  viewKey:'direct-original-beach',layoutId:source.layoutId,
  kind:'gridCollection',regionKey:'Village04',
  grids:[{gridIdNative:7,gridDataPath:source.gridDataPath,knownGridData:true}]
};
const village={
  ...direct,viewKey:'village-original-beach',kind:'villageArea'
};
const zip={gameVersion:'1.26.2',platform:'Steam',layouts:[direct,village]};

test('exact original layout, native Grid.ID and GridDataPath select unique direct source view',()=>{
  const result=matchSourceGridToLocalTerrain(source,zip);
  assert.equal(result.contract,DB04_SOURCE_TERRAIN_NAVIGATION);
  assert.equal(result.status,'ready');
  assert.equal(result.viewKey,direct.viewKey);
  assert.equal(result.regionKey,'Village04');
  assert.equal(result.nativeGridId,7);
  assert.equal(result.sourceLayoutAndGridDataPathExactMatched,true);
  for(const key of [
    'independentOriginalArchiveBinaryIdentityVerified',
    'savedGridIdentityVerified','worldCoordinatesVerified',
    'gameplayPlacementLegalityVerified','saveWritingAuthorized'
  ])assert.equal(result[key],false);
  assert.throws(()=>{result.viewKey='forged';},TypeError);
});
test('missing ZIP, wrong game version and missing partial grid fail closed',()=>{
  assert.equal(matchSourceGridToLocalTerrain(source,{
    gameVersion:null,platform:null,layouts:[]
  }).status,'zip_not_loaded');
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,gameVersion:'1.26.1'
  }).status,'source_version_mismatch');
  assert.equal(matchSourceGridToLocalTerrain({
    ...source,sourceGameVersion:'1.26.3'
  },zip).status,'source_version_mismatch');
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,platform:'Switch'
  }).status,'source_version_mismatch');
  for(const grids of [
    [{gridIdNative:8,gridDataPath:source.gridDataPath,knownGridData:true}],
    [{gridIdNative:7,gridDataPath:'GridData/Village04/Else.json',knownGridData:true}],
    [{gridIdNative:7,gridDataPath:source.gridDataPath,knownGridData:false}]
  ]){
    const result=matchSourceGridToLocalTerrain(source,{
      ...zip,layouts:[{...direct,grids}]
    });
    assert.equal(result.status,'not_in_terrain_source');
    assert.equal(result.viewKey,null);
    assert.equal(result.savedGridIdentityVerified,false);
  }
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,layouts:[{...direct,layoutId:'SceneLayouts/Village04/Else.json'}]
  }).status,'not_in_terrain_source');
});
test('never choose among multiple native GridCollection matches',()=>{
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,layouts:[direct,{...direct,viewKey:'duplicate'}]
  }).status,'ambiguous_terrain_view');
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,layouts:[village,{...village,viewKey:'different-area'}]
  }).status,'ambiguous_terrain_view');
  assert.equal(matchSourceGridToLocalTerrain(source,{
    ...zip,layouts:[village]
  }).viewKey,village.viewKey);
});
test('reject forged numeric Save IDs, traversal, missing SHA and malformed native IDs',()=>{
  for(const request of [
    {...source,layoutId:'7'},
    {...source,layoutId:'SceneLayouts/../Secret.json'},
    {...source,gridDataPath:'GridData/../Other.json'},
    {...source,gridDataPath:'griddata/Village04/Beach.json'},
    {...source,sourceWorldManifestSha256:'bad'},
    {...source,nativeGridId:-1},
    {...source,nativeGridId:4294967296},
    {...source,nativeGridId:'7'}
  ]) assert.throws(()=>matchSourceGridToLocalTerrain(request,zip),
      /DB04_TERRAIN_NAV_INVALID_ORIGINAL_GRID_REFERENCE/);
  assert.throws(()=>matchSourceGridToLocalTerrain(source,null),
    /DB04_TERRAIN_NAV_INVALID_LOCAL_ZIP/);
});
