import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_SCHEMA, createWorldCatalog, getNativeFootprint, getNativeScene,
  getLayoutGridReferences, getNativeFloorPalette, getNativeWorld,
  getNativeAreasForScene, getDefaultLayoutObjects,
  getDefaultVillageAreaLayoutRefs, getDefaultLayoutGridEntries, describeNativeLayerMask,
  describeNativeFloorMask, checkNativeEditRestriction, assessPlacement,
  getNativeTerrainTile, getNativeTerrainWindow, getNativeTerrainDistribution,
  getNativeFootprintCandidateCells,
  getNativeFootprintLayerAt, getNativeFootprintLayerWindow,
  getNativeFootprintOrientedLayerAt, getNativeFootprintOrientedWindow,
  getNativeFootprintTessellatedOrientedLayerAt,
  getNativeFootprintTessellatedOrientedWindow,
  getNativeDefaultLayoutObjectLayerAt,
  getNativeDefaultLayoutObjectLayerWindow,
  getNativeFootprintComputedStride,
  getNativeDefaultLayoutObjectComputedStride,
  getNativeFootprintObliqueOrientedLayerAt,
  getNativeFootprintObliqueOrientedWindow,
  getNativeFootprintCardinalOrientedLayerAt,
  getNativeFootprintCardinalOrientedWindow,
  getNativeGridAreaRotatedVector, getNativeGridAreaUnrotatedVector,
  getNativeFootprintOrientationBaseDimensions,
  getNativeFootprintCardinalDimensions,
  getNativeDefaultLayoutViewport, getNativeVillageAreaViewport,
  getNativeDefaultLayoutAnchorWindow, getNativeVillageAreaAnchorWindow,
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

test('native GridAreaData.Nullable StrideOverride survives raw source and cannot grant placement', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    strideOverride: 2,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  const catalog = createWorldCatalog(data);
  const item = getNativeFootprint(catalog, 40000001);
  assert.equal(item.strideOverride, 2);
  assert.equal(item.strideOverrideSourceVerified, true);
  assert.equal(item.strideOverrideSourceWireField, '6.5');
  assert.equal(item.strideOverridePlacementSemanticsVerified, false);
  assert.equal(assessPlacement(catalog, 40000001, {x: 1, y: 2}).status,
    'unresolved');

  const zero = fixture();
  zero.objects[0].footprint = {
    ...zero.objects[0].footprint,
    strideOverride: 0,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  assert.equal(getNativeFootprint(createWorldCatalog(zero), 40000001)
    .strideOverride, 0);
  const absent = getNativeFootprint(createWorldCatalog(fixture()), 40000001);
  assert.equal(absent.strideOverride, null);
  assert.equal(absent.strideOverrideSourceVerified, false);
  assert.equal(absent.strideOverrideSourceWireField, null);

  for (const bad of [
    {strideOverride: '2'},
    {strideOverride: 2147483648},
    {strideOverride: true},
    {strideOverride: 2, strideOverrideSourceVerified: false},
    {strideOverride: null, strideOverrideSourceVerified: true},
    {strideOverride: 2, strideOverrideSourceVerified: true},
    {strideOverride: 2, strideOverrideSourceVerified: true,
      nativeWireFields: {strideOverride: '6.4'}},
    {strideOverride: 2, strideOverridePlacementSemanticsVerified: true},
  ]) {
    const source = fixture();
    source.objects[0].footprint = {
      ...source.objects[0].footprint, ...bad,
    };
    assert.throws(() => createWorldCatalog(source),
      /Unverified or malformed native placement footprint/);
  }
});

test('source-native GridArea.GetStrideFor preserves nullable default and signed int32 math', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    strideOverride: 2,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  data.layouts[0].nativeGridEntries[0].tessellationFactor = 3;
  const catalog = createWorldCatalog(data);
  const item = getNativeFootprintComputedStride(catalog, 40000001, 3);
  assert.equal(item.nativeComputedStride, 6);
  assert.equal(item.nativeStrideCalculationVerified, true);
  assert.equal(item.callerGridFactorProvenanceVerified, false);
  assert.equal(item.strideOverrideSourceVerified, true);
  assert.equal(item.strideOverridePlacementSemanticsVerified, false);
  assert.equal(item.placementLegalityVerified, false);

  // Exact default layout Grid ID supplies the independent caller factor.
  const defaultObjectId = data.layoutObjects[0].layoutObjectId;
  const sourced = getNativeDefaultLayoutObjectComputedStride(catalog, defaultObjectId);
  assert.equal(sourced.nativeComputedStride, 6);
  assert.equal(sourced.callerGridTessellationFactor, 3);
  assert.equal(sourced.callerGridFactorProvenanceVerified, true);
  assert.equal(sourced.itemFactoryRoutePerRecordVerified, false);
  assert.equal(sourced.worldCoordinatesVerified, false);
  assert.equal(sourced.placementLegalityVerified, false);
  assert.equal(sourced.nativeValue, undefined);
  assert.equal(sourced.inside, undefined);
  assert.equal(sourced.nativeTessellationCoordinateConversionVerified, undefined);
  assert.equal(getNativeDefaultLayoutObjectComputedStride(
    catalog, 'missing').status, 'unknown_default_layout_object');

  // Stride comes from a source nullable override and exact Grid factor.
  // Orientation-specific raw cells must never be a prerequisite: for an
  // oblique initial object, (0,0) may be outside its rotated footprint.
  const oblique = fixture();
  oblique.manifest.gameVersion = '1.26.1';
  oblique.objects[0].footprint = {
    ...oblique.objects[0].footprint,
    strideOverride: 2,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  oblique.layoutObjects[0].orientationCode = 7;
  oblique.layouts[0].nativeGridEntries[0].tessellationFactor = 3;
  const obliqueCatalog = createWorldCatalog(oblique);
  const obliqueStride = getNativeDefaultLayoutObjectComputedStride(
    obliqueCatalog, oblique.layoutObjects[0].layoutObjectId);
  assert.equal(obliqueStride.status, 'source_correlated_gridarea_get_stride_for');
  assert.equal(obliqueStride.nativeComputedStride, 6);
  assert.equal(obliqueStride.originalOrientationCode, 7);
  assert.equal(obliqueStride.callerGridFactorProvenanceVerified, true);
  assert.equal(obliqueStride.nativeValue, undefined);
  assert.equal(obliqueStride.inside, undefined);
  assert.equal(obliqueStride.placementLegalityVerified, false);

  const rawNull = fixture();
  rawNull.manifest.gameVersion = '1.26.1';
  rawNull.objects[0].footprint = {
    ...rawNull.objects[0].footprint,
    strideOverride: null,
    strideOverrideSourceVerified: false,
    strideOverridePlacementSemanticsVerified: false,
  };
  assert.equal(getNativeFootprintComputedStride(
    createWorldCatalog(rawNull), 40000001, 3).nativeComputedStride, 1);
  const rawZero = fixture();
  rawZero.manifest.gameVersion = '1.26.1';
  rawZero.objects[0].footprint = {
    ...rawZero.objects[0].footprint,
    strideOverride: 0,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  assert.equal(getNativeFootprintComputedStride(
    createWorldCatalog(rawZero), 40000001, 3).nativeComputedStride, 0);
  const rawSigned = fixture();
  rawSigned.manifest.gameVersion = '1.26.1';
  rawSigned.objects[0].footprint = {
    ...rawSigned.objects[0].footprint,
    strideOverride: 2147483647,
    strideOverrideSourceVerified: true,
    nativeWireFields: {strideOverride: '6.5'},
    strideOverridePlacementSemanticsVerified: false,
  };
  assert.equal(getNativeFootprintComputedStride(
    createWorldCatalog(rawSigned), 40000001, 2).nativeComputedStride, -2);

  // Legacy snapshots never extracted field 6.5. Missing is not NULL.
  const legacy = fixture();
  legacy.manifest.gameVersion = '1.26.1';
  const unknown = getNativeFootprintComputedStride(
    createWorldCatalog(legacy), 40000001, 2);
  assert.equal(unknown.status, 'legacy_snapshot_stride_source_unavailable');
  assert.equal(unknown.nativeComputedStride, undefined);
  assert.equal(unknown.nativeStrideCalculationVerified, false);
  const unsupported = getNativeFootprintComputedStride(
    createWorldCatalog(fixture()), 40000001, 2);
  assert.equal(unsupported.status, 'native_stride_not_verified_for_game_version');
  assert.equal(unsupported.nativeComputedStride, undefined);
  for (const factor of [0, -1, 257, false, 1.5]) {
    assert.throws(() => getNativeFootprintComputedStride(
      catalog, 40000001, factor), /stride caller grid factor/);
  }
});

test('original GridArea native getter indexes unrotated layer values X-major, without inventing placement', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  const original = [1, 2, 4, 8, 16, 32];
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: original,
  };
  const catalog = createWorldCatalog(data);
  assert.deepEqual(
    [getNativeFootprintLayerAt(catalog, 40000001, 0, 0).nativeValue,
     getNativeFootprintLayerAt(catalog, 40000001, 0, 1).nativeValue,
     getNativeFootprintLayerAt(catalog, 40000001, 1, 0).nativeValue,
     getNativeFootprintLayerAt(catalog, 40000001, 2, 1).nativeValue],
    [1, 2, 4, 32],
  );
  const at = getNativeFootprintLayerAt(catalog, 40000001, 2, 1);
  assert.equal(at.originalFlatIndex, 5);
  assert.equal(at.sourceGetterIndexFormula, 'x*sizeY+y');
  assert.deepEqual(at.symbols, ['Clear']);
  assert.equal(at.nativeGetterIndexVerified, true);
  assert.equal(at.occupancyPredicateVerified, false);
  assert.equal(at.placementLegalityVerified, false);
  const window = getNativeFootprintLayerWindow(catalog, 40000001,
    { x: 0, y: 0, width: 3, height: 2 });
  assert.deepEqual(window.rows, [[1, 4, 16], [2, 8, 32]]);
  window.rows[0][0] = 999;
  assert.equal(getNativeFootprintLayerAt(catalog, 40000001, 0, 0).nativeValue, 1);
  assert.equal(window.nativeGetterIndexVerified, true);
  assert.equal(window.rotatedCellMappingVerified, false);
  assert.throws(() => getNativeFootprintLayerAt(catalog, 40000001, 3, 0), /position/);
  assert.throws(() => getNativeFootprintLayerAt(catalog, 40000001, 0.5, 0), /position/);
  assert.throws(() => getNativeFootprintLayerWindow(catalog, 40000001,
    { x: 1, y: 0, width: 3, height: 2 }), /window/);
  assert.equal(getNativeFootprintLayerAt(catalog, 1111111, 0, 0), null);
  assert.equal(getNativeFootprintLayerWindow(catalog, 1111111,
    { x: 0, y: 0, width: 1, height: 1 }), null);
});

test('source cardinal GridArea dimensions swap axes but do not infer rotated layer positions', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: [1, 2, 4, 8, 16, 32],
  };
  const catalog = createWorldCatalog(data);
  for (const orientationCode of [0, 4, 8, 12]) {
    const result = getNativeFootprintCardinalDimensions(catalog, 40000001, orientationCode);
    assert.deepEqual([result.sizeX, result.sizeY],
      orientationCode % 8 === 0 ? [3, 2] : [2, 3]);
    assert.equal(result.nativeCardinalSizeVerified, true);
    assert.equal(result.tessellationScalingApplied, false);
    assert.equal(result.rotatedCellMappingVerified, false);
    assert.equal(result.occupancyPredicateVerified, false);
    assert.equal(result.placementLegalityVerified, false);
  }
  for (const orientationCode of [1, 3, 5, 7, 9, 11, 13, 15]) {
    const result = getNativeFootprintCardinalDimensions(catalog, 40000001, orientationCode);
    assert.equal(result.status, 'noncardinal_gridarea_dimensions_not_derived');
    assert.equal(result.nativeCardinalSizeVerified, false);
    assert.equal(result.sizeX, undefined);
  }
  assert.throws(() => getNativeFootprintCardinalDimensions(
    catalog, 40000001, 16), /GridOrientation/);
  assert.equal(getNativeFootprintCardinalDimensions(catalog, 1111111, 0), null);
});

test('raw GridArea interpretation never claims 1.26.1 native proof on later versions', () => {
  for (const gameVersion of ['1.26.2', '1.27.0']) {
    const source = fixture();
    source.manifest.gameVersion = gameVersion;
    const catalog = createWorldCatalog(source);

    // Raw source-derived masks remain available without inventing a native
    // GridArea.get_Item indexing proof for a different GameAssembly.
    assert.deepEqual(getNativeFootprint(catalog, 40000001).layerValues, [68, 76]);
    const cell = getNativeFootprintLayerAt(catalog, 40000001, 0, 0);
    assert.equal(cell.status, 'native_gridarea_base_index_not_verified_for_game_version');
    assert.equal(cell.nativeGetterIndexVerified, false);
    assert.equal(cell.nativeValue, undefined);
    assert.equal(cell.originalFlatIndex, undefined);
    assert.equal(cell.placementLegalityVerified, false);

    const window = getNativeFootprintLayerWindow(catalog, 40000001,
      {x: 0, y: 0, width: 2, height: 1});
    assert.equal(window.status, 'native_gridarea_base_index_not_verified_for_game_version');
    assert.equal(window.nativeGetterIndexVerified, false);
    assert.equal(window.rows, undefined);
    assert.equal(window.placementLegalityVerified, false);

    for (const orientationCode of [0, 4, 8, 12]) {
      const size = getNativeFootprintCardinalDimensions(catalog, 40000001,
        orientationCode);
      assert.equal(size.status, 'native_gridarea_cardinal_dimensions_not_verified_for_game_version');
      assert.equal(size.nativeCardinalSizeVerified, false);
      assert.equal(size.sizeX, undefined);
      assert.equal(size.sizeY, undefined);
      assert.equal(size.placementLegalityVerified, false);
    }
    // Even in unsupported versions, invalid coordinates and orientations
    // must not bypass boundary validation or become accepted input.
    assert.throws(() => getNativeFootprintLayerAt(catalog, 40000001, 2, 0),
      /position/);
    assert.throws(() => getNativeFootprintLayerWindow(catalog, 40000001,
      {x: 0, y: 0, width: 3, height: 1}), /window/);
    assert.throws(() => getNativeFootprintCardinalDimensions(
      catalog, 40000001, 16), /GridOrientation/);
  }
});

test('Steam v1.26.1 original GridArea integer vector transforms cover all 16 orientations', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  const catalog = createWorldCatalog(data);
  const rotations = [
    [-2, -3], [-2, -2], [-3, -1], [-2, 0],
    [-3, 2], [-2, 2], [-1, 3], [0, 2],
    [2, 3], [2, 2], [3, 1], [2, 0],
    [3, -2], [2, -2], [1, -3], [0, -2],
  ];
  const inverse = [
    [-2, -3], [0, -2], [1, -3], [2, -2],
    [3, -2], [2, 0], [3, 1], [2, 2],
    [2, 3], [0, 2], [-1, 3], [-2, 2],
    [-3, 2], [-2, 0], [-3, -1], [-2, -2],
  ];
  for (let code = 0; code < 16; code++) {
    const rot = getNativeGridAreaRotatedVector(catalog, 2, 3, code);
    const back = getNativeGridAreaUnrotatedVector(catalog, 2, 3, code);
    assert.deepEqual([rot.x, rot.y], rotations[code]);
    assert.deepEqual([back.x, back.y], inverse[code]);
    assert.equal(rot.coefficientScale, 100);
    assert.equal(rot.sourceGameVersion, '1.26.1');
    assert.equal(rot.nativeVectorRotationVerified, true);
    assert.equal(rot.rotatedGridAreaCellMappingVerified, false);
    assert.equal(rot.gridObjectAnchorVerified, false);
    assert.equal(rot.occupancyPredicateVerified, false);
    assert.equal(rot.placementLegalityVerified, false);
  }

  // Inverse is lossy for oblique rotations: native division truncates EACH
  // signed product toward zero, not once at the end or with Math.round().
  const rotated = getNativeGridAreaRotatedVector(catalog, 2, 3, 1);
  assert.deepEqual([rotated.x, rotated.y], [-2, -2]);
  const recovered = getNativeGridAreaUnrotatedVector(
    catalog, rotated.x, rotated.y, 1);
  assert.deepEqual([recovered.x, recovered.y], [1, 1]);
  assert.deepEqual(
    [getNativeGridAreaRotatedVector(catalog, 1, 0, 2).x,
      getNativeGridAreaRotatedVector(catalog, 1, 0, 2).y], [0, 0]);

  // 32-bit native signed IMUL overflow, not JS floating-point multiplication.
  const large = getNativeGridAreaRotatedVector(catalog, 2147483647, 0, 4);
  assert.deepEqual([large.x, large.y], [0, -1]);
  assert.throws(() => getNativeGridAreaRotatedVector(catalog, 0, 0, 16),
    /Invalid native GridArea/);
  assert.throws(() => getNativeGridAreaRotatedVector(catalog, 0, 0, -1),
    /Invalid native GridArea/);
  assert.throws(() => getNativeGridAreaRotatedVector(catalog, 0.5, 0, 0),
    /Invalid native GridArea/);
  assert.throws(() => getNativeGridAreaRotatedVector(catalog, 2147483648, 0, 0),
    /Invalid native GridArea/);
});

test('source-native 16-way GridArea bounding size uses unscaled integer dimensions only', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    sizeX: 3, sizeY: 2,
    layerValues: [1, 2, 4, 8, 16, 32],
  };
  const catalog = createWorldCatalog(data);
  const expected = [
    [3, 2], [3, 2], [3, 3], [2, 3],
    [2, 3], [2, 3], [3, 3], [3, 2],
    [3, 2], [3, 2], [3, 3], [2, 3],
    [2, 3], [2, 3], [3, 3], [3, 2],
  ];
  for (let code = 0; code < 16; code++) {
    const size = getNativeFootprintOrientationBaseDimensions(
      catalog, 40000001, code);
    assert.deepEqual([size.sizeX, size.sizeY], expected[code]);
    assert.equal(size.sourceGameVersion, '1.26.1');
    assert.equal(size.nativeOrientationBaseSizeVerified, true);
    assert.equal(size.gridToAreaTessellationRatioAssumed, '1:1');
    assert.equal(size.fullNativeTessellationScalingApplied, false);
    assert.equal(size.rotatedGridAreaCellMappingVerified, false);
    assert.equal(size.gridObjectAnchorVerified, false);
    assert.equal(size.occupancyPredicateVerified, false);
    assert.equal(size.placementLegalityVerified, false);
  }
  assert.equal(getNativeFootprintOrientationBaseDimensions(
    catalog, 999999, 3), null);
  assert.throws(() => getNativeFootprintOrientationBaseDimensions(
    catalog, 40000001, -1), /GridOrientation/);
  assert.throws(() => getNativeFootprintOrientationBaseDimensions(
    catalog, 40000001, 16), /GridOrientation/);

  // Unverified other versions may not inherit Steam 1.26.1 native dimensions.
  const other = createWorldCatalog(fixture());
  const unverified = getNativeFootprintOrientationBaseDimensions(
    other, 40000001, 3);
  assert.equal(unverified.status,
    'native_orientation_base_size_not_verified_for_game_version');
  assert.equal(unverified.nativeOrientationBaseSizeVerified, false);
  assert.equal(unverified.sizeX, undefined);
  assert.equal(unverified.placementLegalityVerified, false);
});

test('native vector rotation refuses to claim source proof on other game versions', () => {
  const catalog = createWorldCatalog(fixture()); // fixture is v1.26.2
  const rotated = getNativeGridAreaRotatedVector(catalog, 2, 3, 4);
  assert.equal(rotated.status, 'native_rotation_not_verified_for_game_version');
  assert.equal(rotated.nativeVectorRotationVerified, false);
  assert.equal(rotated.x, undefined);
  assert.equal(rotated.rotatedGridAreaCellMappingVerified, false);
  assert.equal(rotated.placementLegalityVerified, false);
});

test('Steam 1.26.1 original GridArea cardinal local position gives exact raw oriented layers', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint, sizeX: 3, sizeY: 2,
    layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(data);
  const expected = new Map([
    [0, [[32, 22, 12], [31, 21, 11]]],
    [4, [[12, 11], [22, 21], [32, 31]]],
    [8, [[11, 21, 31], [12, 22, 32]]],
    [12, [[31, 32], [21, 22], [11, 12]]],
  ]);
  for (const [orientationCode, rows] of expected) {
    const window = getNativeFootprintCardinalOrientedWindow(
      catalog, 40000001, orientationCode,
      {x: 0, y: 0, width: rows[0].length, height: rows.length});
    assert.deepEqual(window.rows, rows);
    assert.equal(window.nativeCardinalPositionTransformVerified, true);
    assert.equal(window.gridToAreaTessellationRatioAssumed, '1:1');
    assert.equal(window.fullNativeTessellationScalingApplied, false);
    assert.equal(window.gridObjectAnchorVerified, false);
    assert.equal(window.occupancyPredicateVerified, false);
    assert.equal(window.placementLegalityVerified, false);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
      const layer = getNativeFootprintCardinalOrientedLayerAt(
        catalog, 40000001, x, y, orientationCode);
      assert.equal(layer.nativeValue, rows[y][x]);
      assert.equal(layer.originalFlatIndex,
        layer.originalLocalX * 2 + layer.originalLocalY);
      assert.equal(layer.rawLayerValueNotVerifiedOccupancy, true);
      assert.equal(layer.gridObjectAnchorVerified, false);
    }
    window.rows[0][0] = 999;
    assert.equal(getNativeFootprintCardinalOrientedLayerAt(
      catalog, 40000001, 0, 0, orientationCode).nativeValue, rows[0][0]);
    const part = getNativeFootprintCardinalOrientedWindow(
      catalog, 40000001, orientationCode, {x: 1, y: 0, width: 1, height: 1});
    assert.deepEqual(part.rows, [[rows[0][1]]]);
  }

  assert.equal(getNativeFootprintCardinalOrientedLayerAt(
    catalog, 1000, 0, 0, 8), null);
  assert.equal(getNativeFootprintCardinalOrientedWindow(
    catalog, 1000, 8, {x: 0, y: 0, width: 1, height: 1}), null);
  assert.throws(() => getNativeFootprintCardinalOrientedLayerAt(
    catalog, 40000001, 0, 0, 16), /position\/orientation/);
  assert.throws(() => getNativeFootprintCardinalOrientedWindow(
    catalog, 40000001, 4, {x: 0, y: 0, width: 3, height: 1}),
    /outside bounds/);
  const outside = getNativeFootprintCardinalOrientedLayerAt(
    catalog, 40000001, -1, 0, 8);
  assert.equal(outside.status, 'outside_original_gridarea');
  assert.equal(outside.inside, false);
  assert.equal(outside.nativeValue, undefined);
  assert.equal(outside.placementLegalityVerified, false);
});

test('cardinal GridArea mapping does not assign unverified noncardinal or newer-version cells', () => {
  const old = fixture();
  old.manifest.gameVersion = '1.26.1';
  const catalog = createWorldCatalog(old);
  for (const code of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]) {
    const cell = getNativeFootprintCardinalOrientedLayerAt(
      catalog, 40000001, 0, 0, code);
    assert.equal(cell.status, 'noncardinal_local_position_unresolved');
    assert.equal(cell.nativeValue, undefined);
    assert.equal(cell.nativeCardinalPositionTransformVerified, false);
    assert.equal(cell.placementLegalityVerified, false);
    const view = getNativeFootprintCardinalOrientedWindow(
      catalog, 40000001, code, {x: 0, y: 0, width: 1, height: 1});
    assert.equal(view.rows, undefined);
    assert.equal(view.nativeCardinalPositionTransformVerified, false);
  }
  const newer = createWorldCatalog(fixture()); // 1.26.2 not source verified
  const result = getNativeFootprintCardinalOrientedLayerAt(
    newer, 40000001, 0, 0, 8);
  assert.equal(result.status, 'native_cardinal_local_position_unverified_for_game_version');
  assert.equal(result.nativeValue, undefined);
  assert.equal(result.nativeCardinalPositionTransformVerified, false);
  const view = getNativeFootprintCardinalOrientedWindow(
    newer, 40000001, 8, {x: 0, y: 0, width: 1, height: 1});
  assert.equal(view.rows, undefined);
});

test('original source GridArea twelve oblique directions map raw layer masks, not occupancy', () => {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(data);
  const source = new Map([
    [1, [[32, 22, 12], [31, 21, 11]]],
    [2, [[null, 12, 12], [32, 22, 11], [32, 31, null]]],
    [3, [[12, 11], [22, 21], [32, 31]]],
    [5, [[12, 11], [22, 21], [32, 31]]],
    [6, [[12, 11, null], [12, 22, 31], [null, 32, 32]]],
    [7, [[11, 21, 31], [12, 22, 32]]],
    [9, [[11, 21, 31], [12, 22, 32]]],
    [10, [[null, 31, 32], [11, 22, 32], [12, 12, null]]],
    [11, [[31, 32], [21, 22], [11, 12]]],
    [13, [[31, 32], [21, 22], [11, 12]]],
    [14, [[32, 32, null], [31, 22, 12], [null, 11, 12]]],
    [15, [[32, 22, 12], [31, 21, 11]]],
  ]);
  for (const [code, rows] of source) {
    const rect = {x: 0, y: 0, width: rows[0].length, height: rows.length};
    const view = getNativeFootprintOrientedWindow(catalog, 40000001, code, rect);
    assert.deepEqual(view.rows, rows);
    assert.equal(view.nativeNoncardinalPositionTransformVerified, true);
    assert.equal(view.gridToAreaTessellationRatioAssumed, '1:1');
    assert.equal(view.unmappedOutputCellCount,
      rows.flat().filter(value => value === null).length);
    assert.equal(view.nullMeansOutsideSourceGridArea, true);
    assert.equal(view.fullNativeTessellationScalingApplied, false);
    assert.equal(view.gridObjectAnchorVerified, false);
    assert.equal(view.occupancyPredicateVerified, false);
    assert.equal(view.placementLegalityVerified, false);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
      const cell = getNativeFootprintOrientedLayerAt(catalog, 40000001, x, y, code);
      if (rows[y][x] === null) {
        assert.equal(cell.inside, false);
        assert.equal(cell.nativeValue, undefined);
        assert.equal(cell.originalFlatIndex, undefined);
      } else {
        assert.equal(cell.nativeValue, rows[y][x]);
        assert.equal(cell.rawLayerValueNotVerifiedOccupancy, true);
        assert.equal(cell.originalFlatIndex,
          cell.originalLocalX * 2 + cell.originalLocalY);
      }
      assert.equal(cell.occupancyPredicateVerified, false);
    }
    const copy = getNativeFootprintObliqueOrientedWindow(
      catalog, 40000001, code, rect);
    copy.rows[0][0] = 999;
    assert.deepEqual(
      getNativeFootprintObliqueOrientedWindow(catalog, 40000001, code, rect).rows,
      rows);
  }
  // The unified API reuses the separately proven cardinal source mapping.
  const cardinal = getNativeFootprintOrientedWindow(catalog, 40000001, 8,
    {x: 0, y: 0, width: 3, height: 2});
  assert.deepEqual(cardinal.rows, [[11, 21, 31], [12, 22, 32]]);
  assert.equal(cardinal.nativeCardinalPositionTransformVerified, true);
});

test('original oblique position fails closed on unsupported versions and bounds', () => {
  const newer = createWorldCatalog(fixture()); // 1.26.2
  const unavailable = getNativeFootprintOrientedLayerAt(
    newer, 40000001, 0, 0, 2);
  assert.equal(unavailable.status,
    'native_oblique_local_position_unverified_for_game_version');
  assert.equal(unavailable.nativeValue, undefined);
  assert.equal(unavailable.nativeNoncardinalPositionTransformVerified, false);
  assert.equal(unavailable.placementLegalityVerified, false);
  const view = getNativeFootprintOrientedWindow(
    newer, 40000001, 2, {x: 0, y: 0, width: 1, height: 1});
  assert.equal(view.rows, undefined);
  assert.equal(view.nativeNoncardinalPositionTransformVerified, false);

  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  data.objects[0].footprint = {
    ...data.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(data);
  const outside = getNativeFootprintObliqueOrientedLayerAt(
    catalog, 40000001, 0, 0, 2);
  assert.equal(outside.inside, false);
  assert.equal(outside.nativeValue, undefined);
  assert.equal(outside.status, 'outside_original_gridarea');
  assert.throws(() => getNativeFootprintOrientedLayerAt(
    catalog, 40000001, 1, 0, 16), /orientation/);
  assert.throws(() => getNativeFootprintOrientedWindow(
    catalog, 40000001, -1, {x: 0, y: 0, width: 1, height: 1}),
    /orientation/);
  assert.throws(() => getNativeFootprintObliqueOrientedWindow(
    catalog, 40000001, 2, {x: 1, y: 0, width: 3, height: 1}),
    /outside bounds/);
  assert.equal(getNativeFootprintObliqueOrientedLayerAt(
    catalog, 1, 0, 0, 2), null);
});

test('source GridAreaData factory 1:1 paths preserve original all-16 source masks', () => {
  const source = fixture();
  source.manifest.gameVersion = '1.26.1';
  source.objects[0].footprint = {
    ...source.objects[0].footprint, sizeX: 3, sizeY: 2,
    layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(source);
  for (let code = 0; code < 16; code++) {
    const size = getNativeFootprintOrientationBaseDimensions(catalog, 40000001, code);
    const rect = {x: 0, y: 0, width: size.sizeX, height: size.sizeY};
    const original = getNativeFootprintOrientedWindow(catalog, 40000001, code, rect);
    const newWindow = getNativeFootprintTessellatedOrientedWindow(
      catalog, 40000001, code, 1, rect);
    assert.deepEqual(newWindow.rows, original.rows);
    assert.equal(newWindow.itemAreaTessellationFactorSourceValue, 1);
    assert.equal(newWindow.nativeTessellationCoordinateConversionVerified, true);
    assert.equal(newWindow.callerGridFactorExplicitlyProvided, true);
    assert.equal(newWindow.callerGridFactorProvenanceVerified, false);
    assert.equal(newWindow.gridObjectAnchorVerified, false);
    assert.equal(newWindow.occupancyPredicateVerified, false);
    assert.equal(newWindow.placementLegalityVerified, false);
  }
});

test('native caller Grid factor 2 replicates cardinal and oblique raw item layers', () => {
  const source = fixture();
  source.manifest.gameVersion = '1.26.1';
  source.objects[0].footprint = {
    ...source.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(source);
  for (const code of [0, 4, 8, 12, 2, 6, 10, 14]) {
    const size = getNativeFootprintOrientationBaseDimensions(catalog, 40000001, code);
    const rect = {x: 0, y: 0, width: size.sizeX, height: size.sizeY};
    const original = getNativeFootprintOrientedWindow(catalog, 40000001, code, rect);
    const scaled = getNativeFootprintTessellatedOrientedWindow(
      catalog, 40000001, code, 2,
      {x: 0, y: 0, width: size.sizeX * 2, height: size.sizeY * 2});
    const expected = original.rows.flatMap(row => [
      row.flatMap(value => [value, value]),
      row.flatMap(value => [value, value]),
    ]);
    assert.deepEqual(scaled.rows, expected);
    assert.equal(scaled.orientedSizeX, size.sizeX * 2);
    assert.equal(scaled.orientedSizeY, size.sizeY * 2);
    assert.equal(scaled.unmappedOutputCellCount,
      expected.flat().filter(v => v === null).length);
    assert.equal(scaled.nullMeansUnmappedNotUnoccupied, true);
    assert.equal(scaled.callerGridFactorProvenanceVerified, false);
    assert.equal(scaled.occupancyPredicateVerified, false);
    assert.equal(scaled.placementLegalityVerified, false);
    scaled.rows[0][0] = 999;
    assert.deepEqual(getNativeFootprintTessellatedOrientedWindow(
      catalog, 40000001, code, 2,
      {x: 0, y: 0, width: size.sizeX * 2, height: size.sizeY * 2}).rows,
      expected);
  }
  const mapped = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, 40000001, 3, 5, 8, 3);
  assert.deepEqual([mapped.normalizedInputX, mapped.normalizedInputY], [1, 1]);
  assert.equal(mapped.originalFlatIndex, 3);
  assert.equal(mapped.nativeValue, 22);
  assert.equal(mapped.itemGetGridAreaFactorySourceVerified, true);
  assert.equal(mapped.callerGridFactorProvenanceVerified, false);
});

test('tessellation API refuses unsupported revisions, invalid factors and unproven occupancy', () => {
  const newer = createWorldCatalog(fixture());
  const unverifiable = getNativeFootprintTessellatedOrientedLayerAt(
    newer, 40000001, 0, 0, 8, 2);
  assert.equal(unverifiable.status, 'native_tessellation_not_verified_for_game_version');
  assert.equal(unverifiable.nativeValue, undefined);
  assert.equal(unverifiable.nativeTessellationCoordinateConversionVerified, false);
  assert.equal(unverifiable.placementLegalityVerified, false);
  assert.equal(getNativeFootprintTessellatedOrientedWindow(
    newer, 40000001, 8, 2, {x: 0, y: 0, width: 1, height: 1}).rows, undefined);
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  const catalog = createWorldCatalog(data);
  for (const factor of [0, -1, 257, false, 1.5]) {
    assert.throws(() => getNativeFootprintTessellatedOrientedLayerAt(
      catalog, 40000001, 0, 0, 8, factor), /grid factor/);
  }
  const outside = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, 40000001, 4, 0, 8, 2);
  assert.equal(outside.inside, false);
  assert.equal(outside.nativeValue, undefined);
  assert.equal(outside.placementLegalityVerified, false);
  assert.throws(() => getNativeFootprintTessellatedOrientedWindow(
    catalog, 40000001, 8, 2, {x: 0, y: 0, width: 5, height: 1}),
    /outside bounds/);
  assert.equal(getNativeFootprintTessellatedOrientedLayerAt(
    catalog, 999, 0, 0, 8, 2), null);
});

test('native Default GridCollection factor is linked to exact GridObject, not guessed', () => {
  const native = fixture();
  native.manifest.gameVersion = '1.26.1';
  native.layouts[0].nativeGridEntries[0].tessellationFactor = 2;
  native.objects[0].footprint = {
    ...native.objects[0].footprint,
    sizeX: 3, sizeY: 2, layerValues: [11, 12, 21, 22, 31, 32],
  };
  const catalog = createWorldCatalog(native);
  const id = native.layoutObjects[0].layoutObjectId;
  const window = getNativeDefaultLayoutObjectLayerWindow(catalog, id,
    {x: 0, y: 0, width: 4, height: 6});
  assert.deepEqual(window.rows, [
    [31,31,32,32], [31,31,32,32],
    [21,21,22,22], [21,21,22,22],
    [11,11,12,12], [11,11,12,12],
  ]);
  assert.equal(window.callerGridTessellationFactor, 2);
  assert.equal(window.originalItemId, 40000001);
  assert.equal(window.originalOrientationCode, 12);
  assert.equal(window.layoutObjectId, id);
  assert.equal(window.gridIdNative, 0);
  assert.equal(window.gridDataPath, 'GridData/Villages/Meadow.json');
  assert.equal(window.sourceGridDataLoaded, true);
  assert.equal(window.callerGridFactorProvenanceVerified, true);
  assert.equal(window.nativeTessellationCoordinateConversionVerified, true);
  assert.equal(window.itemFactoryRoutePerRecordVerified, false);
  assert.equal(window.worldCoordinatesVerified, false);
  assert.equal(window.currentSaveObjectVerified, false);
  assert.equal(window.gridObjectAnchorVerified, false);
  assert.equal(window.occupancyPredicateVerified, false);
  assert.equal(window.placementLegalityVerified, false);
  const cell = getNativeDefaultLayoutObjectLayerAt(catalog, id, 3, 5);
  assert.equal(cell.nativeValue, 12);
  assert.equal(cell.callerGridFactorProvenanceVerified, true);
  assert.equal(cell.originalFlatIndex, 1);
  window.rows[0][0] = 999;
  assert.equal(getNativeDefaultLayoutObjectLayerAt(catalog, id, 0, 0).nativeValue, 31);

  // Default layout source link is NOT evidence of a CURRENT SAVE object.
  assert.equal(cell.currentSaveObjectVerified, false);
  assert.equal(cell.worldCoordinatesVerified, false);
});

test('default layout Grid factor and object identity must be uniquely source linked', () => {
  const id = fixture().layoutObjects[0].layoutObjectId;
  const unknown = getNativeDefaultLayoutObjectLayerAt(
    createWorldCatalog(fixture()), 'missing-layout-object', 0, 0);
  assert.equal(unknown.status, 'unknown_default_layout_object');
  assert.equal(unknown.callerGridFactorProvenanceVerified, false);

  const cases = [
    ['missing native grid mapping', data => {
      data.layouts[0].nativeGridEntries[0].gridIdNative = 99; },
      'missing_or_ambiguous_native_grid_reference'],
    ['ambiguous native grid ID', data => { data.layouts[0].nativeGridEntries.push(
      {...data.layouts[0].nativeGridEntries[0]}); },
      'missing_or_ambiguous_native_grid_reference'],
    ['zero native grid factor', data => {
      data.layouts[0].nativeGridEntries[0].tessellationFactor = 0; },
      'invalid_native_default_grid_tessellation_or_orientation'],
    ['missing footprint', data => { data.objects[0].footprint = null; },
      'default_item_gridarea_unavailable'],
    ['non-gridcollection layout', data => {
      data.layouts[0].layoutKind = 'nativeDefaultVillageData'; },
      'missing_native_grid_collection_layout'],
  ];
  for (const [label, change, status] of cases) {
    const data = fixture();
    change(data);
    const result = getNativeDefaultLayoutObjectLayerWindow(
      createWorldCatalog(data), id, {x: 0, y: 0, width: 1, height: 1});
    assert.equal(result.status, status, label);
    assert.equal(result.callerGridFactorProvenanceVerified, false, label);
    assert.equal(result.rows, undefined, label);
    assert.equal(result.placementLegalityVerified, false, label);
  }

  const version = getNativeDefaultLayoutObjectLayerWindow(
    createWorldCatalog(fixture()), id,
    {x: 0, y: 0, width: 1, height: 1});
  assert.equal(version.status, 'native_tessellation_not_verified_for_game_version');
  assert.equal(version.callerGridFactorProvenanceVerified, true);
  assert.equal(version.nativeTessellationCoordinateConversionVerified, false);
  assert.equal(version.rows, undefined);
  assert.equal(version.worldCoordinatesVerified, false);
  assert.equal(version.placementLegalityVerified, false);
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

test('browser catalog rejects forged default GridObject map identity', () => {
  for (const [field, forged] of [
    ['gridObjectIdNative', 8],
    ['gridIdNative', 1],
    ['gridObjectIdNative', -1],
    ['gridIdNative', 0x100000000],
    ['layoutObjectId', 'SceneLayouts/Village04/Main.json#grid=0#object=8'],
  ]) {
    const data = fixture();
    data.layoutObjects[0][field] = forged;
    assert.throws(() => createWorldCatalog(data), /Invalid native default object/,
      field + ':' + forged);
  }
  const data = fixture();
  data.layoutObjects[0].gridObjectIdNative = 0;
  data.layoutObjects[0].layoutObjectId =
    'SceneLayouts/Village04/Main.json#grid=0#object=0';
  const catalog = createWorldCatalog(data);
  assert.equal(getDefaultLayoutObjects(catalog, 'SceneLayouts/Village04/Main.json')
    [0].gridObjectIdNative, 0);
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

function originalTerrainFixture() {
  const data = fixture();
  data.manifest.gameVersion = '1.26.1';
  return data;
}

test('later game versions cannot inherit original GridData native indexing proof', () => {
  for (const gameVersion of ['1.26.2', '1.27.0']) {
    const source = fixture();
    source.manifest.gameVersion = gameVersion;
    const rawGrid = nativeRoomGrid();
    source.grids.push(rawGrid);
    const catalog = createWorldCatalog(source);
    // Native FloorType palette is game-sourced and still inspectable.
    assert.deepEqual(getNativeFloorPalette(catalog, rawGrid.gridId)
      .map(row => row.nativeValue), rawGrid.nativeFloorTypePalette);
    for (const outcome of [
      getNativeTerrainTile(catalog, rawGrid.gridId, 0, 0),
      getNativeTerrainWindow(catalog, rawGrid.gridId,
        {x: 0, y: 0, width: 1, height: 1}),
      getNativeTerrainDistribution(catalog, rawGrid.gridId),
    ]) {
      assert.equal(outcome.status,
        'native_terrain_packing_not_verified_for_game_version');
      assert.equal(outcome.nativeValue, undefined);
      assert.equal(outcome.rows, undefined);
      assert.equal(outcome.values, undefined);
    }
    rawGrid.terrainDecoding = {
      status: 'native_packing_not_verified_for_game_version',
      decoded: false, sourceGameVersion: gameVersion,
      verifiedNativeGameVersion: '1.26.1',
      nativeCodeBodyVerified: false, placementLegalityVerified: false,
    };
    assert.equal(getNativeTerrainTile(catalog, rawGrid.gridId, 0, 0).status,
      'native_terrain_packing_not_verified_for_game_version');
  }
});

test('original native four-bit GridData decoding keeps x-major cells and MSB nibble order', () => {
  const data = originalTerrainFixture();
  const base = nativeRoomGrid();
  const bytes = Buffer.from([0x01, 0x23, 0x41, 0x03, 0x20]);
  const fourBit = {
    ...base,
    gridId: 'GridData/Rooms/FourBit.json',
    sizeX: 3, sizeY: 3,
    nativeFloorTypePalette: [0, 8, 16, 32, 64],
    nativePaletteIndexCellCounts: [2, 2, 2, 2, 1],
    compactedFloorTypesBase64: bytes.toString('base64'),
    nativeCompactedByteCount: bytes.length,
    terrainDecoding: {
      ...base.terrainDecoding, cellBits: 4,
      sampleBasedEncodingEvidence: 'synthetic-native-v31-four-bit',
    },
  };
  data.grids.push(fourBit);
  const catalog = createWorldCatalog(data);
  const view = getNativeTerrainWindow(catalog, fourBit.gridId,
    { x: 0, y: 0, width: 3, height: 3 });
  assert.deepEqual(view.rows, [[0, 32, 0], [8, 64, 32], [16, 8, 16]]);
  assert.equal(getNativeTerrainTile(catalog, fourBit.gridId, 1, 1).nativeValue, 64);
  assert.deepEqual(getNativeTerrainDistribution(catalog, fourBit.gridId)
    .values.map(v => v.cellCount), [2, 2, 2, 2, 1]);
  assert.equal(view.nativeCodeBodyVerified, false);
  assert.equal(view.placementLegalityVerified, false);

  const invalid = originalTerrainFixture();
  invalid.grids.push({
    ...fourBit,
    compactedFloorTypesBase64: Buffer.from([0xf1, 0x23, 0x41, 0x03, 0x20])
      .toString('base64'),
  });
  assert.throws(() => getNativeTerrainTile(
    createWorldCatalog(invalid), fourBit.gridId, 0, 0), /palette index is invalid/);
  const padding = originalTerrainFixture();
  padding.grids.push({
    ...fourBit,
    compactedFloorTypesBase64: Buffer.from([0x01, 0x23, 0x41, 0x03, 0x2f])
      .toString('base64'),
  });
  assert.throws(() => getNativeTerrainTile(
    createWorldCatalog(padding), fourBit.gridId, 0, 0), /padding mismatch/);

  const oversized = originalTerrainFixture();
  oversized.grids.push({
    ...fourBit,
    nativeFloorTypePalette: Array.from({ length: 17 }, (_, i) => i),
  });
  assert.throws(() => getNativeTerrainTile(
    createWorldCatalog(oversized), fourBit.gridId, 0, 0),
    /Invalid source-derived native compacted grid/);
});

test('source-corroborated native 12x16 Room terrain renders as exact wall border', () => {
  const data = originalTerrainFixture();
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
  const data = originalTerrainFixture();
  assert.equal(getNativeTerrainTile(createWorldCatalog(data),
    'GridData/Villages/Meadow.json', 0, 0).status, 'unresolved_native_packing');

  const wrong = originalTerrainFixture();
  const room = nativeRoomGrid();
  room.terrainDecoding.nativeCodeBodyVerified = true;
  wrong.grids.push(room);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(wrong),
    'GridData/Rooms/TestRoom.json', 1, 1), /provenance/);

  const bad = originalTerrainFixture();
  const invalid = nativeRoomGrid();
  invalid.nativeCompactedByteCount++;
  bad.grids.push(invalid);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(bad),
    'GridData/Rooms/TestRoom.json', 1, 1), /length mismatch/);

  const wrongPalette = originalTerrainFixture();
  const room3 = nativeRoomGrid();
  room3.nativeFloorTypePalette = [0, 3072];
  wrongPalette.grids.push(room3);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(wrongPalette),
    'GridData/Rooms/TestRoom.json', 1, 1),
    /Invalid source-derived native compacted grid/);
});


test('source-packed native floor histogram is an exact preview-only legend', () => {
  const data = originalTerrainFixture();
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

test('browser terrain histogram detects same-total falsification against original packed bytes', () => {
  const data = originalTerrainFixture();
  const room = nativeRoomGrid();
  // The overall native grid size remains 192, so a sum-only check would pass.
  room.nativePaletteIndexCellCounts = [0, 51, 141];
  data.grids.push(room);
  const catalog = createWorldCatalog(data);
  assert.equal(getNativeTerrainTile(catalog, room.gridId, 0, 0).nativeValue, 3072);
  assert.throws(() => getNativeTerrainDistribution(catalog, room.gridId),
    /histogram mismatches packed source bytes/);
});

test('browser terrain rejects invalid source palette symbols outside the requested window', () => {
  const data = originalTerrainFixture();
  const room = nativeRoomGrid();
  const bytes = Buffer.from(room.compactedFloorTypesBase64, 'base64');
  // Original room has three palette entries (0,1,2): native symbol 3
  // must never be silently interpreted as a valid terrain mask.
  bytes[bytes.length - 1] = 0xff;
  room.compactedFloorTypesBase64 = bytes.toString('base64');
  data.grids.push(room);
  const catalog = createWorldCatalog(data);
  assert.throws(() => getNativeTerrainTile(catalog, room.gridId, 5, 5),
    /palette index is invalid/);
  assert.throws(() => getNativeTerrainWindow(catalog, room.gridId,
    { x: 0, y: 0, width: 1, height: 1 }), /palette index is invalid/);
});

test('browser terrain verifies packed Base64 size before decoding large or padded inputs', () => {
  const bad = originalTerrainFixture();
  const room = nativeRoomGrid();
  room.compactedFloorTypesBase64 += 'AAAA';
  bad.grids.push(room);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(bad), room.gridId, 0, 0),
    /Native compacted grid length mismatch/);
  const missing = originalTerrainFixture();
  const badCount = nativeRoomGrid();
  badCount.nativeCompactedByteCount = null;
  missing.grids.push(badCount);
  assert.throws(() => getNativeTerrainTile(createWorldCatalog(missing),
    badCount.gridId, 0, 0), /Native compacted grid length mismatch/);
});

test('histogram metadata missing or inconsistent cannot silently claim valid geometry', () => {
  const absent = originalTerrainFixture();
  const noHistogram = nativeRoomGrid();
  delete noHistogram.nativePaletteIndexCellCounts;
  absent.grids.push(noHistogram);
  assert.equal(getNativeTerrainDistribution(createWorldCatalog(absent),
    'GridData/Rooms/TestRoom.json').status, 'histogram_not_extracted');

  const bad = originalTerrainFixture();
  const wrong = nativeRoomGrid();
  wrong.nativePaletteIndexCellCounts = [0, 53, 140];
  bad.grids.push(wrong);
  assert.throws(() => getNativeTerrainDistribution(createWorldCatalog(bad),
    'GridData/Rooms/TestRoom.json'), /histogram integrity/);
});

function preparedVillageViewportFixture() {
  const data = originalTerrainFixture();
  const room = nativeRoomGrid();
  data.grids = [room];
  data.layouts[0].nativeGridEntries[0].gridDataPath = room.gridId;
  data.layouts[0].gridReferences[0].path = room.gridId;
  data.layouts[0].nativeGridEntries[0].defaultObjectCount = 2;
  data.layoutObjects[0].x = 5;
  data.layoutObjects[0].y = 5;
  data.layoutObjects.push({
    ...data.layoutObjects[0],
    layoutObjectId: 'SceneLayouts/Village04/Main.json#grid=0#object=9',
    gridObjectIdNative: 9, x: 11, y: 15, itemId: 40000002,
    orientationCode: 4, orientationName: 'Right',
  });
  return data;
}

test('default/village raw anchor windows work on 1.26.2 without packed terrain proof', () => {
  const data = preparedVillageViewportFixture();
  data.manifest.gameVersion = '1.26.2';
  // The file's original Grid dimensions and default GridObject records are
  // source data; no packed palette-index/position interpretation is assumed.
  const grid = data.grids[0];
  data.grids = [{
    gridId: grid.gridId, sizeX: grid.sizeX, sizeY: grid.sizeY,
    nativeFloorTypePalette: grid.nativeFloorTypePalette,
    terrainDecoding: {
      status: 'native_packing_not_verified_for_game_version',
      decoded: false, sourceGameVersion: '1.26.2',
      verifiedNativeGameVersion: '1.26.1',
      nativeCodeBodyVerified: false, placementLegalityVerified: false,
    },
  }];
  const catalog = createWorldCatalog(data);
  const area = 'SceneLayouts/Village04/Default.json';
  const layout = 'SceneLayouts/Village04/Main.json';
  const rect = { x: 4, y: 3, width: 3, height: 4 };
  assert.equal(getNativeDefaultLayoutViewport(catalog, layout, 0, rect).status,
    'native_terrain_packing_not_verified_for_game_version');
  const source = getNativeDefaultLayoutAnchorWindow(catalog, layout, 0, rect);
  assert.equal(source.status, 'source_native_default_layout_anchors_only');
  assert.equal(source.terrainDecoded, false);
  assert.equal(source.viewAnchorCount, 1);
  assert.equal(source.totalNativeDefaultObjectAnchors, 2);
  assert.deepEqual(source.defaultObjectAnchors.map(a => [a.x, a.y]), [[5, 5]]);
  assert.equal(source.nativeGridSizeX, 12);
  assert.equal(source.nativeGridSizeY, 16);
  assert.deepEqual(source.rect, rect);
  assert.equal(source.worldCoordinatesVerified, false);
  assert.equal(source.gridObjectAnchorConventionVerified, false);
  assert.equal(source.fullFootprintOccupancyVerified, false);
  assert.equal(source.placementLegalityVerified, false);
  assert.equal(source.currentSaveObjectVerified, false);
  assert.equal(source.sourceScopeVerified, false);
  source.defaultObjectAnchors[0].x = 100;
  assert.equal(getNativeDefaultLayoutAnchorWindow(catalog, layout, 0, rect)
    .defaultObjectAnchors[0].x, 5);

  const village = getNativeVillageAreaAnchorWindow(catalog, area, 3, 0, rect);
  assert.equal(village.status, source.status);
  assert.equal(village.villageLayoutId, area);
  assert.equal(village.gridLayoutPath, layout);
  assert.equal(village.nativeAreaTypeCode, 3);
  assert.equal(village.nativeAreaTypeName, 'Urban');
  assert.deepEqual(village.defaultObjectAnchors.map(a => [a.x, a.y]), [[5, 5]]);
  const empty = getNativeDefaultLayoutAnchorWindow(catalog, layout, 0,
    { x: 0, y: 0, width: 2, height: 2 });
  assert.equal(empty.viewAnchorCount, 0);
  assert.equal(empty.totalNativeDefaultObjectAnchors, 2);
  assert.equal(empty.fullFootprintOccupancyVerified, false);
});

test('source-only anchor viewport rejects missing or ambiguous native references', () => {
  const baseline = preparedVillageViewportFixture();
  baseline.manifest.gameVersion = '1.26.2';
  const rect = { x: 4, y: 3, width: 3, height: 4 };
  const area = 'SceneLayouts/Village04/Default.json';
  const layout = 'SceneLayouts/Village04/Main.json';
  const catalog = createWorldCatalog(baseline);
  assert.equal(getNativeVillageAreaAnchorWindow(catalog, area, 99, 0, rect).status,
    'unknown_native_village_area');
  assert.equal(getNativeVillageAreaAnchorWindow(catalog, 'missing', 3, 0, rect).status,
    'unknown_native_village_layout');
  assert.equal(getNativeDefaultLayoutAnchorWindow(catalog, area, 0, rect).status,
    'not_native_grid_collection');
  assert.equal(getNativeDefaultLayoutAnchorWindow(catalog, layout, 999, rect).status,
    'unknown_native_grid_in_layout');
  assert.throws(() => getNativeDefaultLayoutAnchorWindow(catalog, layout, -1, rect),
    /unsigned 32-bit integer/);
  assert.equal(getNativeDefaultLayoutAnchorWindow(catalog, layout, 0,
    { x: 11, y: 15, width: 2, height: 2 }).status,
  'outside_native_grid_or_preview_limit');

  const missing = preparedVillageViewportFixture();
  missing.layouts[0].nativeGridEntries[0].gridDataPath = 'GridData/absent.json';
  assert.equal(getNativeDefaultLayoutAnchorWindow(createWorldCatalog(missing),
    layout, 0, rect).status, 'missing_referenced_grid_in_source_subset');

  const noDimensions = preparedVillageViewportFixture();
  delete noDimensions.grids[0].sizeY;
  assert.equal(getNativeDefaultLayoutAnchorWindow(createWorldCatalog(noDimensions),
    layout, 0, rect).status, 'native_grid_dimensions_unavailable');

  const incomplete = preparedVillageViewportFixture();
  incomplete.layouts[0].nativeGridEntries[0].defaultObjectCount = 3;
  assert.equal(getNativeDefaultLayoutAnchorWindow(createWorldCatalog(incomplete),
    layout, 0, rect).status, 'incomplete_native_default_object_source');

  const duplicates = preparedVillageViewportFixture();
  duplicates.layouts[0].nativeGridEntries.push({
    ...duplicates.layouts[0].nativeGridEntries[0],
  });
  assert.throws(() => getNativeDefaultLayoutAnchorWindow(
    createWorldCatalog(duplicates), layout, 0, rect),
  /Ambiguous duplicate native Grid.ID/);

  const missingArea = preparedVillageViewportFixture();
  missingArea.layouts[1].areaLayoutReferences[0].gridLayoutPath = 'SceneLayouts/missing.json';
  assert.equal(getNativeVillageAreaAnchorWindow(createWorldCatalog(missingArea),
    area, 3, 0, rect).status, 'missing_referenced_area_layout_in_source_subset');
});

test('native village area viewport composes only explicitly linked terrain and anchor positions', () => {
  const catalog = createWorldCatalog(preparedVillageViewportFixture());
  const result = getNativeVillageAreaViewport(
    catalog, 'SceneLayouts/Village04/Default.json', 3, 0,
    { x: 4, y: 3, width: 3, height: 4 });
  assert.equal(result.status, 'source_corroborated_grid_local_preview');
  assert.equal(result.villageLayoutId, 'SceneLayouts/Village04/Default.json');
  assert.equal(result.gridLayoutPath, 'SceneLayouts/Village04/Main.json');
  assert.equal(result.gridDataPath, 'GridData/Rooms/TestRoom.json');
  assert.equal(result.nativeAreaTypeCode, 3);
  assert.equal(result.nativeAreaTypeName, 'Urban');
  assert.deepEqual(result.terrainRows, Array(4).fill(null).map(() => [1024, 1024, 1024]));
  assert.equal(result.viewAnchorCount, 1);
  assert.equal(result.totalNativeDefaultObjectAnchors, 2);
  assert.deepEqual(result.defaultObjectAnchors.map(item => [item.itemId, item.x, item.y]),
    [[40000001, 5, 5]]);
  assert.equal(result.worldCoordinatesVerified, false);
  assert.equal(result.fullFootprintOccupancyVerified, false);
  assert.equal(result.placementLegalityVerified, false);
  assert.equal(result.nativeCodeBodyVerified, false);
  const standalone = getNativeDefaultLayoutViewport(catalog,
    'SceneLayouts/Village04/Main.json', 0,
    { x: 11, y: 15, width: 1, height: 1 });
  assert.equal(standalone.viewAnchorCount, 1);
  assert.deepEqual([standalone.defaultObjectAnchors[0].x,
    standalone.defaultObjectAnchors[0].y], [11, 15]);
  assert.equal(standalone.terrainRows[0][0], 3072);
});

test('native village 2D API fails closed for missing and ambiguous source links', () => {
  const root = 'SceneLayouts/Village04/Default.json';
  const target = 'SceneLayouts/Village04/Main.json';
  const rect = { x: 0, y: 0, width: 3, height: 3 };
  const full = createWorldCatalog(preparedVillageViewportFixture());
  assert.equal(getNativeVillageAreaViewport(full, root, 100, 0, rect).status,
    'unknown_native_village_area');
  assert.equal(getNativeVillageAreaViewport(full, 'unknown', 3, 0, rect).status,
    'unknown_native_village_layout');
  assert.equal(getNativeDefaultLayoutViewport(full, root, 0, rect).status,
    'not_native_grid_collection');
  assert.equal(getNativeDefaultLayoutViewport(full, target, 500, rect).status,
    'unknown_native_grid_in_layout');
  assert.throws(() => getNativeDefaultLayoutViewport(full, target, -1, rect),
    /unsigned 32-bit integer/);

  const noArea = preparedVillageViewportFixture();
  noArea.layouts[1].areaLayoutReferences[0].gridLayoutPath = 'SceneLayouts/not-present.json';
  assert.equal(getNativeVillageAreaViewport(createWorldCatalog(noArea),
    root, 3, 0, rect).status,
  'missing_referenced_area_layout_in_source_subset');

  const noGrid = preparedVillageViewportFixture();
  noGrid.layouts[0].nativeGridEntries[0].gridDataPath = 'GridData/not-present.json';
  assert.equal(getNativeDefaultLayoutViewport(createWorldCatalog(noGrid), target,
    0, rect).status, 'missing_referenced_grid_in_source_subset');

  const incomplete = preparedVillageViewportFixture();
  incomplete.layouts[0].nativeGridEntries[0].defaultObjectCount = 3;
  assert.equal(getNativeDefaultLayoutViewport(createWorldCatalog(incomplete),
    target, 0, rect).status, 'incomplete_native_default_object_source');

  const duplicate = preparedVillageViewportFixture();
  duplicate.layouts[1].areaLayoutReferences.push({
    nativeAreaTypeCode: 3, nativeAreaTypeName: 'Meadow',
    gridLayoutPath: 'SceneLayouts/other.json',
  });
  assert.throws(() => getNativeVillageAreaViewport(
    createWorldCatalog(duplicate), root, 3, 0, rect),
    /Duplicate native area type code/);
});

test('viewport never assumes an out-of-frame anchor occupies no visible cells', () => {
  const catalog = createWorldCatalog(preparedVillageViewportFixture());
  const result = getNativeDefaultLayoutViewport(catalog,
    'SceneLayouts/Village04/Main.json', 0, { x: 0, y: 0, width: 2, height: 2 });
  assert.equal(result.viewAnchorCount, 0);
  assert.equal(result.totalNativeDefaultObjectAnchors, 2);
  assert.equal(result.fullFootprintOccupancyVerified, false);
  assert.equal(result.sourceScopeVerified, false);
});

test('source footprint candidate geometry is explicitly unverified across cardinal axes', () => {
  const catalog = createWorldCatalog(fixture());
  const xmajor = getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 5, y: 6 }, {
      cellOrder: 'x_major', anchorModel: 'top_left', orientationCode: 4,
    });
  assert.equal(xmajor.status, 'explicit_unverified_footprint_projection');
  assert.deepEqual(xmajor.cells.map(c => [c.x, c.y, c.originalLayerValue]),
    [[5, 7, 68], [5, 6, 76]]);
  assert.equal(xmajor.nonzeroNativeLayerCellCount, 2);
  assert.equal(xmajor.rotationTransformVerified, false);
  assert.equal(xmajor.cellIndexToXYVerified, false);
  assert.equal(xmajor.occupancyPredicateVerified, false);
  assert.equal(xmajor.placementLegalityVerified, false);

  const centered = getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 5, y: 6 }, {
      cellOrder: 'x_major', anchorModel: 'center_floor', orientationCode: 4,
    });
  assert.deepEqual(centered.cells.map(c => [c.x, c.y]), [[5, 6], [5, 5]]);
  const reversed = getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 5, y: 6 }, {
      cellOrder: 'y_major', anchorModel: 'top_left', orientationCode: 12,
    });
  assert.deepEqual(reversed.cells.map(c => [c.x, c.y]), [[5, 6], [5, 7]]);
});

test('unsupported noncardinal footprint rotations are unresolved, never guessed', () => {
  const catalog = createWorldCatalog(fixture());
  const original = getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 0, y: 0 }, { cellOrder: 'x_major',
      anchorModel: 'top_left', orientationCode: 7 });
  assert.equal(original.status, 'unsupported_noncardinal_orientation_hypothesis');
  assert.equal(original.placementLegalityVerified, false);
  assert.equal(original.cells, undefined);
  assert.throws(() => getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 0, y: 0 }, {
      cellOrder: 'x_major', anchorModel: 'top_left', orientationCode: 16,
    }), /GridOrientation/);
  assert.throws(() => getNativeFootprintCandidateCells(catalog, 40000001,
    { x: 0, y: 0 }, {
      cellOrder: 'unknown', anchorModel: 'top_left', orientationCode: 0,
    }), /Explicit unverified/);
  assert.throws(() => getNativeFootprintCandidateCells(catalog, 40000001,
    { x: Infinity, y: 0 }, {
      cellOrder: 'x_major', anchorModel: 'top_left', orientationCode: 0,
    }), /anchor required/);
  assert.equal(getNativeFootprintCandidateCells(catalog, 999,
    { x: 0, y: 0 }, {
      cellOrder: 'x_major', anchorModel: 'top_left', orientationCode: 0,
    }).status, 'unknown_item_id');
  assert.equal(assessPlacement(catalog, 40000001, { x: 5, y: 6 }).status,
    'unresolved');
});
