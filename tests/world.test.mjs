import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_SCHEMA, createWorldCatalog, getNativeFootprint, getNativeScene,
  getLayoutGridReferences, getNativeFloorPalette, getNativeWorld,
  getNativeAreasForScene, getDefaultLayoutObjects,
  getDefaultVillageAreaLayoutRefs, getDefaultLayoutGridEntries, describeNativeLayerMask,
  describeNativeFloorMask, checkNativeEditRestriction, assessPlacement,
  getNativeTerrainTile, getNativeTerrainWindow, getNativeTerrainDistribution,
} from '../src/lib/world/catalog.mjs';

function fixture() {
  return {
    manifest: { schema: WORLD_SCHEMA, status: 'partial_game_native_evidence', gameVersion: '1.26.2' },
    objects: [{
      itemId: 40000001, nativeType: 'Furniture', nativeName: 'Bench',
      footprint: { sizeX: 2, sizeY: 1, layerValues: [68, 76],
        acceptedFloorTypesFlag: 2048,
        cellIndexToXYVerified: false, layerMaskSemanticsVerified: false },
      gridEditRestrictions: { canMove: { value: false, nativeWireField: '25.1.1' } },
    }],
    scenes: [{ sceneId: 1540000000, nativeName: 'Village!Village04', parentWorldId: null }],
    worlds: [{ worldId: 'village-layout:Main', worldIdKind: 'derivedLayoutKey',
      defaultGridLayoutPath: 'SceneLayouts/Village04/Main.json' }],
    areas: [{ areaId: '1540000000:3', parentSceneId: 1540000000,
      nativeAreaTypeCode: 3, nativeAreaTypeName: 'Urban' }],
    grids: [{ gridId: 'GridData/Villages/Meadow.json', terrainFlagsVerified: false,
      nativeFloorTypePalette: [0, 4, 256, 512] }],
    layouts: [
      { layoutId: 'SceneLayouts/Village04/Main.json',
        layoutKind: 'nativeGridCollection',
        gridReferences: [{ path: 'GridData/Villages/Meadow.json', wireField: '1.2' }],
        nativeGridEntries: [{ gridIdNative: 0, gridDataPath: 'GridData/Villages/Meadow.json',
          tessellationFactor: 1, defaultObjectCount: 1 }] },
      { layoutId: 'SceneLayouts/Village04/Default.json',
        layoutKind: 'nativeDefaultVillageData',
        areaLayoutReferences: [{ nativeAreaTypeCode: 3, nativeAreaTypeName: 'Urban',
          gridLayoutPath: 'SceneLayouts/Village04/Main.json' }] },
    ],
    layoutObjects: [{
      layoutObjectId: 'SceneLayouts/Village04/Main.json#grid=0#object=7',
      layoutId: 'SceneLayouts/Village04/Main.json',
      gridObjectIdNative: 7, gridIdNative: 0, itemId: 40000001,
      x: 61, y: 77, orientationCode: 12, orientationName: 'Left',
      worldCoordinatesVerified: false, fixedImmovableVerified: false,
    }],
    unresolved: { unknownSemantics: ['terrain'] },
  };
}

test('native footprint is copied without supplying guessed 2D cell coordinates', () => {
  const catalog = createWorldCatalog(fixture());
  const footprint = getNativeFootprint(catalog, 40000001);
  assert.equal(footprint.sizeX, 2);
  assert.deepEqual(footprint.layerValues, [68, 76]);
  footprint.layerValues[0] = 99;
  assert.equal(getNativeFootprint(catalog, 40000001).layerValues[0], 68);
  assert.equal(footprint.cellIndexToXYVerified, false);
});

test('explicit restrictions deny but missing flags never authorize placement', () => {
  const catalog = createWorldCatalog(fixture());
  assert.equal(checkNativeEditRestriction(catalog, 40000001, 'canMove').status, 'denied_by_native_flag');
  assert.equal(checkNativeEditRestriction(catalog, 40000001, 'canRotate').status, 'unresolved');
  assert.equal(checkNativeEditRestriction(catalog, 999, 'canMove').status, 'unknown_item');
  assert.equal(assessPlacement(catalog, 40000001, { x: 1, y: 2 }).status, 'unresolved');
  assert.equal(assessPlacement(catalog, 40000001, {}).status, 'unresolved');
});

test('scene IDs and native layout references are not conflated with map geometry', () => {
  const catalog = createWorldCatalog(fixture());
  assert.equal(getNativeScene(catalog, 1540000000).nativeName, 'Village!Village04');
  assert.deepEqual(getLayoutGridReferences(catalog, 'SceneLayouts/Village04/Main.json'), [{
    path: 'GridData/Villages/Meadow.json', wireField: '1.2', knownGrid: true,
  }]);
});

test('invalid snapshots and silently inferred occupancy are rejected', () => {
  const data = fixture();
  data.objects[0].footprint.cellIndexToXYVerified = true;
  assert.throws(() => createWorldCatalog(data), /Unverified/);
  const other = fixture();
  other.objects.push({ ...other.objects[0] });
  assert.throws(() => createWorldCatalog(other), /Duplicate/);
  const bad = fixture();
  bad.manifest.schema = 'other';
  assert.throws(() => createWorldCatalog(bad), /Unsupported/);
});

test('world and biome area lookups retain explicit source-linked IDs', () => {
  const catalog = createWorldCatalog(fixture());
  assert.equal(getNativeWorld(catalog, 'village-layout:Main').worldIdKind, 'derivedLayoutKey');
  const found = getNativeAreasForScene(catalog, 1540000000);
  assert.equal(found.length, 1);
  assert.equal(found[0].nativeAreaTypeName, 'Urban');
  assert.equal(getNativeAreasForScene(catalog, 1540000001).length, 0);
});

test('IL2CPP native layer and floor enum bits are mapped without asserting placement', () => {
  assert.deepEqual(describeNativeLayerMask(68), { symbols: ['Low', 'Blocking'], unrecognizedBits: 0 });
  assert.deepEqual(describeNativeLayerMask(128), { symbols: [], unrecognizedBits: 128 });
  assert.deepEqual(describeNativeFloorMask(3072), { symbols: ['Floor', 'Wall'], unrecognizedBits: 0 });
  assert.deepEqual(getNativeFloorPalette(createWorldCatalog(fixture()), 'GridData/Villages/Meadow.json')
    .map(x => x.symbols), [[], ['Meadow'], ['Shore'], ['Water']]);
  assert.throws(() => describeNativeLayerMask(-1), /Invalid/);
});

test('default layout positions are source-defined and never treated as immutable', () => {
  const catalog = createWorldCatalog(fixture());
  const rows = getDefaultLayoutObjects(catalog, 'SceneLayouts/Village04/Main.json');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].x, rows[0].y], [61, 77]);
  assert.equal(rows[0].orientationName, 'Left');
  assert.equal(rows[0].fixedImmovableVerified, false);
  assert.equal(rows[0].worldCoordinatesVerified, false);
  rows[0].x = 999;
  assert.equal(getDefaultLayoutObjects(catalog, 'SceneLayouts/Village04/Main.json')[0].x, 61);
  assert.equal(getDefaultLayoutObjects(catalog, 'SceneLayouts/Village04/Main.json', 2).length, 0);
  assert.equal(getDefaultLayoutGridEntries(catalog, 'SceneLayouts/Village04/Main.json')[0].knownGridData, true);
  assert.equal(getDefaultVillageAreaLayoutRefs(catalog, 'SceneLayouts/Village04/Default.json')[0].knownLayout, true);
});

test('native default placement records cannot claim verified world positions or fixedness', () => {
  const a = fixture();
  a.layoutObjects[0].worldCoordinatesVerified = true;
  assert.throws(() => createWorldCatalog(a), /Invalid native default object/);
  const b = fixture();
  b.layoutObjects[0].layoutId = 'SceneLayouts/missing.json';
  assert.throws(() => createWorldCatalog(b), /absent native layout/);
});

function nativeRoomGrid() {
  // Native source observation (Steam 1.26.1): 12x16 border Floor|Wall,
  // interior Floor. Synthesize wire-compatible index packing without assets.
  const sx = 12, sy = 16;
  const bytes = new Uint8Array(sx * sy / 4);
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) {
    const index = (x === 0 || x === sx - 1 || y === 0 || y === sy - 1) ? 1 : 2;
    const bit = (x * sy + y) * 2;
    bytes[bit >>> 3] |= index << (6 - (bit % 8));
  }
  return {
    gridId: 'GridData/Rooms/TestRoom.json',
    sizeX: sx, sizeY: sy,
    nativeFloorTypePalette: [0, 3072, 1024],
    nativePaletteIndexCellCounts: [0, 52, 140],
    compactedFloorTypesBase64: Buffer.from(bytes).toString('base64'),
    nativeCompactedByteCount: bytes.length,
    terrainDecoding: {
      status: 'cross_validated_native_samples',
      decoded: true, packing: 'x_major_msb_first',
      cellBits: 2, nativeCodeBodyVerified: false,
      placementLegalityVerified: false,
      sampleBasedEncodingEvidence: 'source-synthetic-room-pattern',
    },
  };
}

test('source-corroborated native 12x16 Room terrain renders as exact wall border', () => {
  const data = fixture();
  data.grids.push(nativeRoomGrid());
  const catalog = createWorldCatalog(data);
  const grid = getNativeTerrainWindow(catalog, 'GridData/Rooms/TestRoom.json',
    { x: 0, y: 0, width: 12, height: 16 });
  assert.equal(grid.status, 'source_corroborated_grid_local_preview');
  assert.equal(grid.rows.length, 16);
  assert.deepEqual(grid.rows[0], Array(12).fill(3072));
  assert.deepEqual(grid.rows[1], [3072, ...Array(10).fill(1024), 3072]);
  assert.deepEqual(grid.rows.at(-1), Array(12).fill(3072));
  assert.equal(grid.worldCoordinatesVerified, false);
  assert.equal(grid.placementLegalityVerified, false);
  const floor = getNativeTerrainTile(catalog, 'GridData/Rooms/TestRoom.json', 5, 5);
  assert.equal(floor.nativeValue, 1024);
  assert.deepEqual(floor.symbols, ['Floor']);
  assert.equal(getNativeTerrainTile(catalog, 'GridData/Rooms/TestRoom.json', 12, 0).status,
    'outside_native_grid');
  assert.equal(getNativeTerrainTile(catalog, 'unknown-grid', 0, 0).status, 'unknown_grid');
  assert.equal(getNativeTerrainWindow(catalog, 'GridData/Rooms/TestRoom.json',
    { x: 0, y: 0, width: 257, height: 1 }).status,
    'outside_native_grid_or_preview_limit');
});

test('partial grid or invalid packing never silently produces invented terrain', () => {
  const data = fixture();
  assert.equal(getNativeTerrainTile(createWorldCatalog(data),
    'GridData/Villages/Meadow.json', 0, 0).status, 'unresolved_native_packing');

  const wrong = fixture();
  const room = nativeRoomGrid();
  room.terrainDecoding.nativeCodeBodyVerified = true;
  wrong.grids.push(room);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(wrong),
    'GridData/Rooms/TestRoom.json', 1, 1), /provenance/);

  const bad = fixture();
  const invalid = nativeRoomGrid();
  invalid.nativeCompactedByteCount++;
  bad.grids.push(invalid);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(bad),
    'GridData/Rooms/TestRoom.json', 1, 1), /length mismatch/);

  const wrongPalette = fixture();
  const room3 = nativeRoomGrid();
  room3.nativeFloorTypePalette = [0, 3072];
  wrongPalette.grids.push(room3);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(wrongPalette),
    'GridData/Rooms/TestRoom.json', 1, 1), /palette index/);
});


test('source-packed native floor histogram is an exact preview-only legend', () => {
  const data = fixture();
  data.grids.push(nativeRoomGrid());
  const catalog = createWorldCatalog(data);
  const d = getNativeTerrainDistribution(catalog, 'GridData/Rooms/TestRoom.json');
  assert.equal(d.status, 'source_corroborated_grid_local_summary');
  assert.equal(d.totalCells, 192);
  assert.deepEqual(d.values.map(v => v.cellCount), [0, 52, 140]);
  assert.deepEqual(d.values[1].symbols, ['Floor', 'Wall']);
  assert.deepEqual(d.values[2].symbols, ['Floor']);
  assert.equal(d.worldCoordinatesVerified, false);
  assert.equal(d.placementLegalityVerified, false);
  assert.equal(d.nativeCodeBodyVerified, false);
  assert.equal(getNativeTerrainDistribution(catalog, 'missing').status, 'unknown_grid');
  assert.equal(getNativeTerrainDistribution(catalog,
    'GridData/Villages/Meadow.json').status, 'unresolved_native_packing');
});

test('histogram metadata missing or inconsistent cannot silently claim valid geometry', () => {
  const absent = fixture();
  const noHistogram = nativeRoomGrid();
  delete noHistogram.nativePaletteIndexCellCounts;
  absent.grids.push(noHistogram);
  assert.equal(getNativeTerrainDistribution(createWorldCatalog(absent),
    'GridData/Rooms/TestRoom.json').status, 'histogram_not_extracted');

  const bad = fixture();
  const wrong = nativeRoomGrid();
  wrong.nativePaletteIndexCellCounts = [0, 53, 140];
  bad.grids.push(wrong);
  assert.throws(() => getNativeTerrainDistribution(createWorldCatalog(bad),
    'GridData/Rooms/TestRoom.json'), /histogram integrity/);
});
