import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNativeTerrainTile,getNativeTerrainWindow,
  getNativeTerrainDistribution
} from '../src/lib/world/native-terrain-preview.ts';
import {
  describeNativeFloorMask,describeNativeLayerMask,GRID_FLOOR_FLAGS
} from '../src/lib/world/native-mask.ts';
import {
  createWorldCatalog,WORLD_SCHEMA,
  getNativeTerrainWindow as readPublicTerrainWindow
} from '../src/lib/world/catalog.mjs';
const item='GridData/Village04/Synthetic.json';
function source(grid,version='1.26.2',platform='Steam'){
  return createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      gameVersion:version,platform},
    objects:[],scenes:[],grids:[{gridId:item,...grid}],layouts:[]
  });
}
const direct=()=>({
  sizeX:3,sizeY:2,
  nativeSourceFormat:'original_json_direct_floor_values',
  nativeFloorTypes:[0,262148,1024,4,4,0],
  nativeFloorTypePalette:[],
  compactedFloorTypesBase64:null,
  terrainDecoding:{
    status:'source_correlated_original_json_direct_floor_values',
    decoded:true,packing:'x_major_direct_floor_values',
    cellIndexFormula:'x*sizeY+y',sourceGameVersion:'1.26.2',
    nativeCodeBodyVerified:false,placementLegalityVerified:false
  }
});
const packed=()=>({
  sizeX:2,sizeY:2,
  nativeFloorTypePalette:[0,4,1024],
  nativePaletteIndexCellCounts:[1,1,2],
  compactedFloorTypesBase64:Buffer.from([0x19]).toString('base64'),
  nativeCompactedByteCount:1,
  terrainDecoding:{
    decoded:true,packing:'x_major_msb_first',cellBits:2,
    nativeCodeBodyVerified:false,placementLegalityVerified:false,
    sampleBasedEncodingEvidence:'synthetic'
  }
});
// Packed 0x19 = [0,1,2,1] would report [1,2,1]; use explicit correct
// counts below to ensure no false histogram witness.
test('typed native terrain reads source JSON masks with X-major and exact provenance',()=>{
  const cat=source(direct());
  const rect={x:0,y:0,width:3,height:2};
  const found=getNativeTerrainWindow(cat,item,rect);
  assert.equal(found.status,'source_corroborated_grid_local_preview');
  assert.deepEqual(found.rows,[[0,1024,4],[262148,4,0]]);
  assert.deepEqual(found,readPublicTerrainWindow(cat,item,rect));
  assert.equal(found.worldCoordinatesVerified,false);
  assert.equal(found.placementLegalityVerified,false);
  assert.equal(getNativeTerrainTile(cat,item,0,1).nativeValue,262148);
  assert.deepEqual(getNativeTerrainDistribution(cat,item).values.map(v=>[v.nativeValue,v.cellCount]),
    [[0,2],[4,2],[1024,1],[262148,1]]);
  assert.deepEqual(describeNativeFloorMask(262148).symbols,
    ['Meadow','BlockAutomaticSpawning']);
  assert.equal(GRID_FLOOR_FLAGS[262144],'BlockAutomaticSpawning');
  assert.equal(describeNativeLayerMask(0x80000000).unrecognizedBits,0x80000000);
  assert.throws(()=>describeNativeFloorMask(-1),/uint32/);
});
test('typed native packed grid reports exact MSB first values and verifies histogram',()=>{
  const grid=packed();
  grid.nativePaletteIndexCellCounts=[1,2,1];
  const cat=source(grid);
  const win=getNativeTerrainWindow(cat,item,{x:0,y:0,width:2,height:2});
  assert.deepEqual(win.rows,[[0,1024],[4,4]]);
  const dist=getNativeTerrainDistribution(cat,item);
  assert.deepEqual(dist.values.map(v=>v.cellCount),[1,2,1]);
  assert.equal(dist.placementLegalityVerified,false);
  assert.equal(getNativeTerrainTile(cat,item,1,1).nativeValue,4);
});
test('unsupported source versions and platforms never inherit Steam 1.26.2 terrain proof',()=>{
  for(const [version,platform] of [['1.27.0','Steam'],['1.26.2','Switch']]){
    const cat=source(direct(),version,platform);
    assert.equal(getNativeTerrainWindow(cat,item,{x:0,y:0,width:1,height:1}).status,
      'native_terrain_packing_not_verified_for_game_version');
    assert.equal(getNativeTerrainDistribution(cat,item).status,
      'native_terrain_packing_not_verified_for_game_version');
  }
});
test('malformed source bounds and compacted indexes fail closed',()=>{
  const cat=source(direct());
  assert.equal(getNativeTerrainWindow(cat,item,{x:2,y:1,width:2,height:1}).status,
    'outside_native_grid_or_preview_limit');
  assert.equal(getNativeTerrainTile(cat,item,-1,0).status,'outside_native_grid');
  assert.throws(()=>getNativeTerrainWindow(cat,item,null),/rectangle required/);
  const bad=packed();
  bad.nativePaletteIndexCellCounts=[1,2,1];
  bad.compactedFloorTypesBase64=Buffer.from([0xff]).toString('base64');
  assert.throws(()=>getNativeTerrainTile(source(bad),item,0,0),
    /palette index is invalid/);
  assert.throws(()=>getNativeTerrainWindow({},item,{x:0,y:0,width:1,height:1}),
    /catalog boundary/);
});
