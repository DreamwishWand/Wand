import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_SCHEMA, createWorldCatalog,
  getNativeTerrainTile, getNativeTerrainWindow, getNativeTerrainDistribution,
} from '../src/lib/world/catalog.mjs';

const gridId = 'GridData/Rooms/Synthetic.json';
function catalog(version, terrainDecoding) {
  return createWorldCatalog({
    manifest: {schema: WORLD_SCHEMA, status:'partial_game_native_evidence',
      gameVersion:version, platform:'Steam'},
    objects: [], scenes: [], worlds: [], areas: [], layouts: [], layoutObjects: [],
    grids: [{
      gridId, sizeX:2, sizeY:2, nativeFloorTypePalette:[0,4],
      compactedFloorTypesBase64:'UA==', nativeCompactedByteCount:1,
      terrainDecoding,
    }],
  });
}
const decoded = {
  decoded:true, status:'cross_validated_native_samples',
  packing:'x_major_msb_first', cellBits:1,
  nativeCodeBodyVerified:false, placementLegalityVerified:false,
};
const unresolved = {decoded:false,
  status:'native_packing_not_verified_for_game_version'};

test('new versions return identical explicit unknown-version status across terrain APIs', () => {
  for (const version of ['1.27.0','2.0.0']) {
    for (const evidence of [unresolved, decoded, null]) {
      const source = catalog(version,evidence);
      const tile = getNativeTerrainTile(source,gridId,0,0);
      const window = getNativeTerrainWindow(source,gridId,
        {x:0,y:0,width:2,height:2});
      const summary = getNativeTerrainDistribution(source,gridId);
      for (const result of [tile,window,summary]) {
        assert.equal(result.status,
          'native_terrain_packing_not_verified_for_game_version');
        assert.equal(result.rows,undefined);
        assert.equal(result.nativeValue,undefined);
        assert.equal(result.values,undefined);
      }
    }
  }
});

test('the verified 1.26.1 path still decodes bounded raw native terrain cells', () => {
  const source = catalog('1.26.1',decoded);
  const tile = getNativeTerrainTile(source,gridId,0,1);
  assert.equal(tile.status,'source_corroborated_grid_local_preview');
  assert.equal(tile.nativeValue,4);
  const window = getNativeTerrainWindow(source,gridId,
    {x:0,y:0,width:2,height:2});
  assert.equal(window.status,'source_corroborated_grid_local_preview');
  assert.deepEqual(window.rows,[[0,0],[4,4]]);
  assert.equal(getNativeTerrainDistribution(source,gridId).status,
    'histogram_not_extracted');
});

test('Steam 1.26.2 pinned native read-path supports only bounded grid-local preview', () => {
  const source = catalog('1.26.2', decoded);
  const grid = source.grids.get(gridId);
  grid.nativePaletteIndexCellCounts = [2,2];
  assert.deepEqual(getNativeTerrainTile(source,gridId,0,1), {
    status:'source_corroborated_grid_local_preview',
    x:0,y:1,nativeValue:4,symbols:['Meadow'],unrecognizedBits:0,
    worldCoordinatesVerified:false,placementLegalityVerified:false,
    nativeCodeBodyVerified:false,sampleBasedEncodingEvidence:null,
  });
  assert.deepEqual(getNativeTerrainWindow(source,gridId,
    {x:0,y:0,width:2,height:2}).rows,[[0,0],[4,4]]);
  const histogram = getNativeTerrainDistribution(source,gridId);
  assert.equal(histogram.status,'source_corroborated_grid_local_summary');
  assert.deepEqual(histogram.values.map(v => v.cellCount),[2,2]);
  assert.equal(histogram.placementLegalityVerified,false);
  assert.equal(getNativeTerrainWindow(source,gridId,
    {x:0,y:0,width:3,height:1}).status,'outside_native_grid_or_preview_limit');

  // A console snapshot must not inherit Steam's native PE64 proof.
  const consoleCatalog = catalog('1.26.2',decoded);
  consoleCatalog.manifest.platform = 'Switch';
  assert.equal(getNativeTerrainTile(consoleCatalog,gridId,0,0).status,
    'native_terrain_packing_not_verified_for_game_version');
  assert.equal(getNativeTerrainDistribution(consoleCatalog,gridId).status,
    'native_terrain_packing_not_verified_for_game_version');

  // Older 1.26.2 snapshots retain their explicit unverified origin; the
  // catalog must not silently reinterpret an older private ZIP's data.
  const legacy = catalog('1.26.2',unresolved);
  for (const result of [
    getNativeTerrainTile(legacy,gridId,0,0),
    getNativeTerrainWindow(legacy,gridId,
      {x:0,y:0,width:1,height:1}),
    getNativeTerrainDistribution(legacy,gridId),
  ]) assert.equal(result.status,
    'native_terrain_packing_not_verified_for_game_version');
});

test('literal Steam 1.26.2 JSON FloorTypes render source-local masks without placement claims', () => {
  const source = catalog('1.26.2',decoded);
  source.grids.set('GridData/Villages/Spawn.json', {
    gridId:'GridData/Villages/Spawn.json',
    sizeX:2,sizeY:3,
    nativeSourceFormat:'original_json_direct_floor_values',
    nativeFloorTypes:[0,262144,4,262148,512,262656],
    nativeFloorTypePalette:[],compactedFloorTypesBase64:null,
    terrainDecoding:{
      status:'source_correlated_original_json_direct_floor_values',
      decoded:true,sourceGameVersion:'1.26.2',
      packing:'x_major_direct_floor_values',
      cellIndexFormula:'x*sizeY+y',
      nativeCodeBodyVerified:false,placementLegalityVerified:false,
    },
  });
  const grid='GridData/Villages/Spawn.json';
  const tile=getNativeTerrainTile(source,grid,1,2);
  assert.equal(tile.nativeValue,262656);
  assert.equal(tile.placementLegalityVerified,false);
  assert.equal(tile.status,'source_corroborated_grid_local_preview');
  assert.ok(tile.symbols.includes('BlockAutomaticSpawning'));
  const window=getNativeTerrainWindow(source,grid,{x:0,y:0,width:2,height:3});
  assert.deepEqual(window.rows,[[0,262148],[262144,512],[4,262656]]);
  assert.equal(window.worldCoordinatesVerified,false);
  const summary=getNativeTerrainDistribution(source,grid);
  assert.equal(summary.status,'source_corroborated_grid_local_summary');
  assert.equal(summary.distributionBasis,'original_json_direct_floor_values');
  assert.equal(summary.totalCells,6);
  assert.deepEqual(summary.values.map(value=>value.nativeValue),
    [0,4,512,262144,262148,262656]);
  assert.equal(summary.values.every(value=>value.cellCount===1),true);
  assert.equal(getNativeTerrainWindow(source,grid,
    {x:0,y:0,width:2,height:4}).status,'outside_native_grid_or_preview_limit');
  const altered={...source.grids.get(grid),nativeFloorTypes:[0,1]};
  assert.throws(()=>getNativeTerrainTile({
    ...source,grids:new Map([[grid,altered]])},grid,0,0),
    /Invalid original native JSON FloorTypes/);
  const future=catalog('1.27.0',decoded);
  future.grids.set(grid,source.grids.get(grid));
  assert.equal(getNativeTerrainTile(future,grid,0,0).status,
    'native_terrain_packing_not_verified_for_game_version');
  const switchGame=catalog('1.26.2',decoded);
  switchGame.manifest.platform='Switch';
  switchGame.grids.set(grid,source.grids.get(grid));
  assert.equal(getNativeTerrainDistribution(switchGame,grid).status,
    'native_terrain_packing_not_verified_for_game_version');
});

test('unknown grid still reports unknown grid before inspecting native versions', () => {
  const source = catalog('1.26.2',unresolved);
  for (const result of [
    getNativeTerrainTile(source,'GridData/Absent',0,0),
    getNativeTerrainWindow(source,'GridData/Absent',
      {x:0,y:0,width:1,height:1}),
    getNativeTerrainDistribution(source,'GridData/Absent'),
  ]) assert.equal(result.status,'unknown_grid');
});
