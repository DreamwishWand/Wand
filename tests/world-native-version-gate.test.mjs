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
  for (const version of ['1.26.2','1.27.0','2.0.0']) {
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

test('unknown grid still reports unknown grid before inspecting native versions', () => {
  const source = catalog('1.26.2',unresolved);
  for (const result of [
    getNativeTerrainTile(source,'GridData/Absent',0,0),
    getNativeTerrainWindow(source,'GridData/Absent',
      {x:0,y:0,width:1,height:1}),
    getNativeTerrainDistribution(source,'GridData/Absent'),
  ]) assert.equal(result.status,'unknown_grid');
});
