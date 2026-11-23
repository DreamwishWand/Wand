import {nativeObliqueSourceLocalPosition} from './native-oblique.ts';
import {
  getNativeFootprintOrientationBaseDimensions,
  getNativeFootprintCardinalOrientedLayerAt,
  getNativeFootprintCardinalOrientedWindow,
} from './native-gridarea-base.ts';
export {
  getNativeFootprint,getNativeFootprintLayerAt,getNativeFootprintLayerWindow,
  getNativeFootprintCardinalDimensions,getNativeGridAreaRotatedVector,
  getNativeGridAreaUnrotatedVector,getNativeFootprintOrientationBaseDimensions,
  getNativeFootprintCardinalOrientedLayerAt,getNativeFootprintCardinalOrientedWindow,
} from './native-gridarea-base.ts';

// Read-only DB-04 adapter for World Editor, Decorate, Presets and Collection.
// No invented 2D coordinates, path/fence connectivity or permissions.
export const WORLD_SCHEMA = 'wand.db04.world@1';

import {describeNativeLayerMask,describeNativeFloorMask} from './native-mask.ts';
import {getNativeTerrainWindow} from './native-terrain-preview.ts';
import {registerSourceAnchorIndex} from './native-source-anchor-index.ts';
export {getDefaultLayoutObjects,getDefaultVillageAreaLayoutRefs,getDefaultLayoutGridEntries,getNativeDefaultLayoutAnchorWindow,getNativeVillageAreaAnchorWindow} from './native-source-anchor-index.ts';
export {GRID_LAYER_FLAGS,GRID_FLOOR_FLAGS,describeNativeLayerMask,describeNativeFloorMask} from './native-mask.ts';
export {getNativeTerrainTile,getNativeTerrainWindow,getNativeTerrainDistribution} from './native-terrain-preview.ts';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idText = value => typeof value === 'number' ? String(value) : value;
const uniqueMap = (rows, key) => {
  if (!Array.isArray(rows)) throw new TypeError('Invalid DB-04 entity collection');
  const index = new Map();
  for (const record of rows) {
    if (!isRecord(record) || !Number.isSafeInteger(record[key]) && typeof record[key] !== 'string') {
      throw new TypeError('Invalid DB-04 entity identifier');
    }
    const id = idText(record[key]);
    if (!id || index.has(id)) throw new TypeError('Duplicate/empty DB-04 entity identifier');
    index.set(id, record);
  }
  return index;
};

function validateFootprint(footprint) {
  if (footprint === null) return;
  if (!isRecord(footprint) || !Number.isInteger(footprint.sizeX) || !Number.isInteger(footprint.sizeY) ||
      footprint.sizeX < 1 || footprint.sizeY < 1 || footprint.sizeX > 256 || footprint.sizeY > 256 ||
      footprint.sizeX * footprint.sizeY > 16384 ||
      (footprint.strideOverride !== undefined &&
       footprint.strideOverride !== null &&
       (!Number.isInteger(footprint.strideOverride) ||
        footprint.strideOverride < -2147483648 ||
        footprint.strideOverride > 2147483647)) ||
      (footprint.strideOverrideSourceVerified !== undefined &&
       (typeof footprint.strideOverrideSourceVerified !== 'boolean' ||
        (footprint.strideOverrideSourceVerified &&
         !Number.isInteger(footprint.strideOverride)) ||
        (!footprint.strideOverrideSourceVerified &&
         footprint.strideOverride != null))) ||
      (footprint.strideOverridePlacementSemanticsVerified !== undefined &&
       footprint.strideOverridePlacementSemanticsVerified !== false) ||
      (footprint.strideOverrideSourceVerified === true &&
       footprint.nativeWireFields?.strideOverride !== '6.5') ||
      !Array.isArray(footprint.layerValues) ||
      footprint.layerValues.length !== footprint.sizeX * footprint.sizeY ||
      !footprint.layerValues.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 4294967295) ||
      footprint.cellIndexToXYVerified !== false || footprint.layerMaskSemanticsVerified !== false) {
    throw new TypeError('Unverified or malformed native placement footprint');
  }
}

export function createWorldCatalog(bundle) {
  if (!isRecord(bundle) || !isRecord(bundle.manifest) || bundle.manifest.schema !== WORLD_SCHEMA ||
      bundle.manifest.status !== 'partial_game_native_evidence') {
    throw new TypeError('Unsupported or unverified DB-04 manifest');
  }
  const objects = uniqueMap(bundle.objects, 'itemId');
  const scenes = uniqueMap(bundle.scenes, 'sceneId');
  const grids = uniqueMap(bundle.grids, 'gridId');
  const layouts = uniqueMap(bundle.layouts, 'layoutId');
  const worlds = uniqueMap(bundle.worlds ?? [], 'worldId');
  const areas = uniqueMap(bundle.areas ?? [], 'areaId');
  const layoutObjects = uniqueMap(bundle.layoutObjects ?? [], 'layoutObjectId');
  const layoutObjectsByLayout = new Map();
  // Reuse exact native Grid.ID buckets across viewport and anchor queries.
  // A large original GridCollection may contain many unrelated grids.
  const layoutObjectsByGrid = new Map();
  for (const object of layoutObjects.values()) {
    if (!layouts.has(object.layoutId)) {
      throw new TypeError('DB-04 default object references an absent native layout');
    }
    if (!Number.isSafeInteger(object.x) || !Number.isSafeInteger(object.y) ||
        !Number.isSafeInteger(object.gridIdNative) ||
        object.gridIdNative < 0 || object.gridIdNative > 0xffffffff ||
        !Number.isSafeInteger(object.gridObjectIdNative) ||
        object.gridObjectIdNative < 0 || object.gridObjectIdNative > 0xffffffff ||
        // The original GridCollection map key and GridObject.ID were checked
        // by extraction. Never let a divergent exported composite ID point a
        // save/editor join at a different native object after JSON mutation.
        object.layoutObjectId !==
          `${object.layoutId}#grid=${object.gridIdNative}#object=${object.gridObjectIdNative}` ||
        !Number.isSafeInteger(object.itemId) ||
        object.worldCoordinatesVerified !== false ||
        object.fixedImmovableVerified !== false) {
      throw new TypeError('Invalid native default object evidence');
    }
    const rows = layoutObjectsByLayout.get(object.layoutId) ?? [];
    rows.push(object);
    layoutObjectsByLayout.set(object.layoutId, rows);
    const buckets = layoutObjectsByGrid.get(object.layoutId) ?? new Map();
    const gridRows = buckets.get(object.gridIdNative) ?? [];
    gridRows.push(object);
    buckets.set(object.gridIdNative, gridRows);
    layoutObjectsByGrid.set(object.layoutId, buckets);

  }
  for (const item of objects.values()) validateFootprint(item.footprint);
  const catalog = { manifest: bundle.manifest, objects, scenes, grids, layouts, worlds, areas,
    layoutObjects, layoutObjectsByLayout, layoutObjectsByGrid,
    unresolved: isRecord(bundle.unresolved) ? bundle.unresolved : null };
  registerSourceAnchorIndex(catalog);
  return catalog;
}

// Explicit "false" is a valid native restriction; missing flags are NOT permission.
export function checkNativeEditRestriction(catalog, itemId, action) {
  const allowed = new Set(['canMove', 'canRotate', 'canBeRemoved', 'canBeSelected', 'canSwitchGrid']);
  if (!allowed.has(action)) throw new TypeError('Unknown DB-04 edit action');
  const record = catalog.objects.get(idText(itemId));
  if (!record) return { status: 'unknown_item' };
  const flag = record.gridEditRestrictions?.[action];
  if (flag?.value === false) return { status: 'denied_by_native_flag', evidence: flag.nativeWireField };
  if (flag?.value === true) return { status: 'native_flag_true_not_full_placement_permission',
    evidence: flag.nativeWireField };
  return { status: 'unresolved' };
}

// These records are NOT a save-specific world snapshot (reserved for DB-05).
export function getNativeWorld(catalog, worldId) {
  return catalog.worlds.get(String(worldId)) ?? null;
}

export function getNativeAreasForScene(catalog, sceneId) {
  const id = idText(sceneId);
  return [...catalog.areas.values()].filter(area => String(area.parentSceneId) === id);
}

export function getNativeScene(catalog, sceneId) {
  return catalog.scenes.get(idText(sceneId)) ?? null;
}

export function getNativeFloorPalette(catalog, gridId) {
  const native = catalog.grids.get(String(gridId));
  if (!native || !Array.isArray(native.nativeFloorTypePalette)) return null;
  return native.nativeFloorTypePalette.map(value => ({
    nativeValue: value, ...describeNativeFloorMask(value),
  }));
}

export function getLayoutGridReferences(catalog, layoutId) {
  const refs = catalog.layouts.get(String(layoutId))?.gridReferences ?? [];
  return refs.map(ref => ({
    path: ref.path, wireField: ref.wireField,
    knownGrid: catalog.grids.has(ref.path),
  }));
}

/**
 * Compose the source-defined initial layout's native grid-local 2D viewport.
 *
 * This is NOT a user's save map, a world-coordinate transform, or a placement
 * legality checker. Object positions are raw initial GridObject anchors, not
 * occupied-cell sets. The terrain candidate uses the explicitly corroborated
 * native bit/axis packing only.
 */
export function getNativeDefaultLayoutViewport(catalog, layoutId, nativeGridId, rect) {
  const id = String(layoutId);
  const layout = catalog.layouts.get(id);
  if (!layout) return { status: 'unknown_native_layout' };
  if (layout.layoutKind !== 'nativeGridCollection') {
    return { status: 'not_native_grid_collection' };
  }
  if (!Number.isSafeInteger(nativeGridId) || nativeGridId < 0 ||
      nativeGridId > 0xffffffff) {
    throw new TypeError('Native Grid.ID must be an unsigned 32-bit integer');
  }
  const grids = layout.nativeGridEntries;
  if (!Array.isArray(grids)) throw new TypeError('Malformed native grid collection');
  const entries = grids.filter(g => g.gridIdNative === nativeGridId);
  if (entries.length === 0) return { status: 'unknown_native_grid_in_layout' };
  if (entries.length !== 1) throw new TypeError('Ambiguous duplicate native Grid.ID');
  const entry = entries[0];
  if (typeof entry.gridDataPath !== 'string' || !entry.gridDataPath) {
    throw new TypeError('Missing explicit native GridDataPath');
  }
  if (!catalog.grids.has(entry.gridDataPath)) {
    return { status: 'missing_referenced_grid_in_source_subset',
      sourceLayoutId: id, gridIdNative: nativeGridId,
      gridDataPath: entry.gridDataPath };
  }

  const terrain = getNativeTerrainWindow(catalog, entry.gridDataPath, rect);
  if (terrain.status !== 'source_corroborated_grid_local_preview') {
    return { status: terrain.status, sourceLayoutId: id,
      gridIdNative: nativeGridId, gridDataPath: entry.gridDataPath };
  }
  const native = catalog.layoutObjectsByGrid.get(id)?.get(nativeGridId) ?? [];
  if (!Number.isSafeInteger(entry.defaultObjectCount) ||
      entry.defaultObjectCount < 0 ||
      entry.defaultObjectCount !== native.length) {
    return { status: 'incomplete_native_default_object_source',
      sourceLayoutId: id, gridIdNative: nativeGridId };
  }
  // Only the original-game *anchor* is filtered by the viewport. An item
  // outside may have occupied cells inside; their rotation is not yet known.
  const anchors = native.filter(item => item.x >= terrain.x &&
      item.x < terrain.x + terrain.width &&
      item.y >= terrain.y && item.y < terrain.y + terrain.height)
    .map(item => ({
      layoutObjectId: item.layoutObjectId,
      gridObjectIdNative: item.gridObjectIdNative,
      itemId: item.itemId,
      x: item.x, y: item.y,
      orientationCode: item.orientationCode,
      orientationName: item.orientationName ?? null,
      positionBasis: 'nativeGridLocal',
      fullFootprintVerified: false, fixedImmovableVerified: false,
    }));
  return {
    status: terrain.status,
    sourceLayoutId: id,
    gridIdNative: nativeGridId,
    gridDataPath: entry.gridDataPath,
    rect: { x: terrain.x, y: terrain.y,
      width: terrain.width, height: terrain.height },
    terrainRows: terrain.rows, defaultObjectAnchors: anchors,
    totalNativeDefaultObjectAnchors: native.length,
    viewAnchorCount: anchors.length,
    nativeGridLocalCoordinatesOnly: true,
    worldCoordinatesVerified: false,
    fullFootprintOccupancyVerified: false,
    placementLegalityVerified: false,
    nativeCodeBodyVerified: false,
    sourceScopeVerified: catalog.manifest.sourceScopeVerified === true,
  };
}

/** Resolve the original default village area-to-GridCollection path first. */
export function getNativeVillageAreaViewport(catalog, villageLayoutId,
                                             nativeAreaTypeCode, nativeGridId, rect) {
  const id = String(villageLayoutId);
  const village = catalog.layouts.get(id);
  if (!village) return { status: 'unknown_native_village_layout' };
  if (village.layoutKind !== 'nativeDefaultVillageData') {
    return { status: 'not_native_default_village_data' };
  }
  if (!Number.isSafeInteger(nativeAreaTypeCode)) {
    throw new TypeError('Native village area code must be an integer');
  }
  if (!Array.isArray(village.areaLayoutReferences)) {
    throw new TypeError('Malformed native village area reference map');
  }
  const matches = village.areaLayoutReferences.filter(
    area => area.nativeAreaTypeCode === nativeAreaTypeCode);
  if (matches.length === 0) return { status: 'unknown_native_village_area' };
  if (matches.length !== 1) throw new TypeError('Duplicate native area type code');
  const area = matches[0];
  if (typeof area.gridLayoutPath !== 'string' || !area.gridLayoutPath) {
    throw new TypeError('Missing native village area GridLayoutPath');
  }
  if (!catalog.layouts.has(area.gridLayoutPath)) {
    return { status: 'missing_referenced_area_layout_in_source_subset',
      villageLayoutId: id, nativeAreaTypeCode,
      expectedGridLayoutPath: area.gridLayoutPath };
  }
  const viewport = getNativeDefaultLayoutViewport(
    catalog, area.gridLayoutPath, nativeGridId, rect);
  return {
    ...viewport, villageLayoutId: id, nativeAreaTypeCode,
    nativeAreaTypeName: area.nativeAreaTypeName ?? null,
    gridLayoutPath: area.gridLayoutPath,
  };
}

/**
 * Hypothesis ONLY: visualize nonzero original GridAreaData fixed32 layer cells
 * using explicitly chosen cardinal projection assumptions. The game-native
 * index order, 16-way rotations, anchor convention and nonzero occupancy
 * predicate have NOT been verified from native machine code.
 *
 * This must never be used as placement/collision permission.
 */
export function getNativeFootprintCandidateCells(catalog, itemId, proposed, options) {
  const item = catalog.objects.get(idText(itemId));
  if (!item) return { status: 'unknown_item_id' };
  const footprint = item.footprint;
  if (!footprint) return { status: 'native_footprint_unavailable' };
  if (!isRecord(proposed) || !Number.isSafeInteger(proposed.x) ||
      !Number.isSafeInteger(proposed.y)) {
    throw new TypeError('Explicit native grid-local candidate anchor required');
  }
  if (!isRecord(options) ||
      !['x_major', 'y_major'].includes(options.cellOrder) ||
      !['top_left', 'center_floor'].includes(options.anchorModel)) {
    throw new TypeError('Explicit unverified footprint projection hypothesis required');
  }
  const orientationCode = options.orientationCode;
  if (!Number.isSafeInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid native GridOrientation enum code');
  }
  const common = {
    cellOrderHypothesis: options.cellOrder,
    anchorModelHypothesis: options.anchorModel,
    orientationCode,
    positionBasis: 'nativeGridLocal',
    nativeCodeBodyVerified: false,
    cellIndexToXYVerified: false,
    rotationTransformVerified: false,
    anchorModelVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  // All 16 names are source-defined enums; only four cardinal candidate
  // transforms are mathematically modeled. Diagonals are unresolved.
  if (![0, 4, 8, 12].includes(orientationCode)) {
    return { status: 'unsupported_noncardinal_orientation_hypothesis', ...common };
  }
  const sx = footprint.sizeX, sy = footprint.sizeY;
  const rx = orientationCode % 8 === 0 ? sx : sy;
  const ry = orientationCode % 8 === 0 ? sy : sx;
  const originX = proposed.x -
    (options.anchorModel === 'center_floor' ? Math.floor(rx / 2) : 0);
  const originY = proposed.y -
    (options.anchorModel === 'center_floor' ? Math.floor(ry / 2) : 0);
  const cells = [];
  for (let originalX = 0; originalX < sx; originalX++) {
    for (let originalY = 0; originalY < sy; originalY++) {
      const index = options.cellOrder === 'x_major'
        ? originalX * sy + originalY : originalY * sx + originalX;
      const mask = footprint.layerValues[index];
      if (mask === 0) continue;
      let x;
      let y;
      if (orientationCode === 0) {
        x = originalX; y = originalY;
      } else if (orientationCode === 4) {
        x = originalY; y = sx - 1 - originalX;
      } else if (orientationCode === 8) {
        x = sx - 1 - originalX; y = sy - 1 - originalY;
      } else {
        x = sy - 1 - originalY; y = originalX;
      }
      cells.push({
        x: originX + x, y: originY + y,
        originalFlatIndex: index,
        originalLayerValue: mask,
        hypotheticalLocalX: x, hypotheticalLocalY: y,
      });
    }
  }
  return {
    status: 'explicit_unverified_footprint_projection',
    ...common,
    sizeXRotatedHypothesis: rx,
    sizeYRotatedHypothesis: ry,
    nonzeroNativeLayerCellCount: cells.length,
    cells,
  };
}

export function assessPlacement(catalog, itemId, proposed) {
  const item = catalog.objects.get(idText(itemId));
  if (!item) return { status: 'unresolved', reasons: ['unknown_item_id'] };
  if (!isRecord(proposed) || !Number.isInteger(proposed.x) || !Number.isInteger(proposed.y)) {
    return { status: 'unresolved', reasons: ['missing_verified_position'] };
  }
  // Native position origin, occupancy iteration, terrain masks, transitions and
  // collision rules are not yet verified. Never manufacture a positive placement result.
  return { status: 'unresolved', reasons: [
    'native_world_grid_origin_unverified', 'cell_occupancy_semantics_unverified',
    'terrain_and_connectivity_rules_unverified',
  ] };
}


/** Original Steam 1.26.1 oblique GridArea local lookup, 1:1 tessellation.
 * Returns a RAW layer mask only for a mapped source GridArea cell.
 * A missing cell is NOT evidence of free world space or legal placement.
 */
export function getNativeFootprintObliqueOrientedLayerAt(
    catalog, itemId, x, y, orientationCode) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15 ||
      [0, 4, 8, 12].includes(orientationCode)) {
    throw new TypeError('Original oblique GridArea requires noncardinal direction');
  }
  const common = {
    itemId, orientationCode, gridToAreaTessellationRatioAssumed: '1:1',
    fullNativeTessellationScalingApplied: false,
    rawLayerValuesNotOccupancy: true,
    rawLayerValueNotVerifiedOccupancy: true,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false, placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return { ...common, status: 'native_oblique_local_position_unverified_for_game_version',
      nativeNoncardinalPositionTransformVerified: false };
  }
  const position = nativeObliqueSourceLocalPosition(
    footprint.sizeX, footprint.sizeY, x, y, orientationCode);
  if (position.inside !== true) {
    return { ...common, ...position, nativeNoncardinalPositionTransformVerified: true };
  }
  const nativeValue = footprint.layerValues[position.originalFlatIndex];
  return {
    ...common, x, y, ...position,
    nativeNoncardinalPositionTransformVerified: true,
    nativeValue, ...describeNativeLayerMask(nativeValue),
    positionBasis: 'unrotated_gridarea_local',
  };
}

/** Oblique raw-layer viewport. Null means OUTSIDE original GridArea, not empty space. */
export function getNativeFootprintObliqueOrientedWindow(
    catalog, itemId, orientationCode, rect) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const probe = getNativeFootprintObliqueOrientedLayerAt(
    catalog, itemId, 0, 0, orientationCode);
  if (probe.nativeNoncardinalPositionTransformVerified !== true) return probe;
  if (!isRecord(rect)) throw new TypeError('Missing original oblique GridArea window');
  const { x, y, width, height } = rect;
  const sx = probe.orientedSizeX, sy = probe.orientedSizeY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original oblique GridArea viewport outside bounds');
  }
  const rows = [];
  let unmappedOutputCellCount = 0;
  for (let yy = y; yy < y + height; yy++) {
    const row = [];
    for (let xx = x; xx < x + width; xx++) {
      const cell = nativeObliqueSourceLocalPosition(
        footprint.sizeX, footprint.sizeY, xx, yy, orientationCode);
      if (!cell.inside) {
        row.push(null);
        unmappedOutputCellCount++;
      } else {
        row.push(footprint.layerValues[cell.originalFlatIndex]);
      }
    }
    rows.push(row);
  }
  return {
    status: 'source_correlated_noncardinal_oriented_gridarea_layers',
    itemId, orientationCode, orientedSizeX: sx, orientedSizeY: sy,
    x, y, width, height, rows, unmappedOutputCellCount,
    nullMeansOutsideSourceGridArea: true,
    nativeNoncardinalPositionTransformVerified: true,
    gridToAreaTessellationRatioAssumed: '1:1',
    fullNativeTessellationScalingApplied: false,
    rawLayerValuesNotOccupancy: true,
    gridObjectAnchorVerified: false, occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}

/** All 16 orientation codes, source-specific RAW GridLayers, NEVER edit permission. */
export function getNativeFootprintOrientedLayerAt(
    catalog, itemId, x, y, orientationCode) {
  if (!Number.isInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid original GridArea orientation');
  }
  return [0, 4, 8, 12].includes(orientationCode)
    ? getNativeFootprintCardinalOrientedLayerAt(catalog, itemId, x, y, orientationCode)
    : getNativeFootprintObliqueOrientedLayerAt(catalog, itemId, x, y, orientationCode);
}

/** All 16 orientations; a null raw layer means unmapped, NOT an unoccupied cell. */
export function getNativeFootprintOrientedWindow(
    catalog, itemId, orientationCode, rect) {
  if (!Number.isInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid original GridArea orientation');
  }
  return [0, 4, 8, 12].includes(orientationCode)
    ? getNativeFootprintCardinalOrientedWindow(catalog, itemId, orientationCode, rect)
    : getNativeFootprintObliqueOrientedWindow(catalog, itemId, orientationCode, rect);
}


/**
 * Steam 1.26.1 source: GridAreaData.GetGridArea (token 0x0600309F)
 * lazy-creates the *item* GridArea with TessellationFactor=1. The separate
 * GridArea.TryGetGridLocalPosition (0x3923BB0) first converts caller grid
 * coordinates by trunc(x/gridTessellationFactor)*areaFactor before rotation.
 * A supplied factor is NOT proof of any particular world/save Grid factor.
 */
export function getNativeFootprintTessellatedOrientedLayerAt(
    catalog, itemId, x, y, orientationCode, callerGridFactor) {
  if (!Number.isInteger(orientationCode) || orientationCode < 0 || orientationCode > 15 ||
      !Number.isInteger(callerGridFactor) || callerGridFactor < 1 || callerGridFactor > 256 ||
      !Number.isInteger(x) || !Number.isInteger(y) ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647) {
    throw new TypeError('Invalid original item GridArea orientation/grid factor/position');
  }
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const common = {
    itemId, orientationCode,
    callerGridTessellationFactor: callerGridFactor,
    callerGridFactorExplicitlyProvided: true,
    callerGridFactorProvenanceVerified: false,
    itemAreaTessellationFactorSourceValue: 1,
    itemGetGridAreaFactorySourceVerified: true,
    nativeTessellationCoordinateConversionVerified: true,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      ...common, status: 'native_tessellation_not_verified_for_game_version',
      nativeTessellationCoordinateConversionVerified: false,
      itemGetGridAreaFactorySourceVerified: false,
    };
  }
  const originalSize = getNativeFootprintOrientationBaseDimensions(
    catalog, itemId, orientationCode);
  const orientedSizeX = originalSize.sizeX * callerGridFactor;
  const orientedSizeY = originalSize.sizeY * callerGridFactor;
  const dims = { ...common, orientedSizeX, orientedSizeY,
    sourceGameVersion: '1.26.1' };
  if (x < 0 || y < 0 || x >= orientedSizeX || y >= orientedSizeY) {
    return { ...dims, inside: false, status: 'outside_oriented_gridarea' };
  }
  // Native transforms nonnegative caller-grid coordinates to area units
  // BEFORE its cardinal/oblique direction-specific source-cell lookup.
  const normalizedInputX = Math.trunc(x / callerGridFactor);
  const normalizedInputY = Math.trunc(y / callerGridFactor);
  const source = getNativeFootprintOrientedLayerAt(
    catalog, itemId, normalizedInputX, normalizedInputY, orientationCode);
  if (source?.inside !== true) {
    return { ...dims, inside: false, status: 'outside_original_gridarea' };
  }
  return {
    ...dims, inside: true,
    status: 'source_correlated_item_gridarea_explicit_tessellation',
    normalizedInputX, normalizedInputY,
    originalLocalX: source.originalLocalX,
    originalLocalY: source.originalLocalY,
    originalFlatIndex: source.originalFlatIndex,
    positionBasis: 'unrotated_item_gridarea_local',
    nativeValue: source.nativeValue,
    ...describeNativeLayerMask(source.nativeValue),
    rawLayerValueNotVerifiedOccupancy: true,
  };
}

/** Bounded read-only source masks; null means UNMAPPED, not unoccupied. */
export function getNativeFootprintTessellatedOrientedWindow(
    catalog, itemId, orientationCode, callerGridFactor, rect) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!isRecord(rect)) throw new TypeError('Missing original tessellated GridArea viewport');
  const probe = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, itemId, 0, 0, orientationCode, callerGridFactor);
  if (probe.nativeTessellationCoordinateConversionVerified !== true) return probe;
  const {x, y, width, height} = rect;
  const sx = probe.orientedSizeX, sy = probe.orientedSizeY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original tessellated GridArea viewport outside bounds');
  }
  const rows = [];
  let unmappedOutputCellCount = 0;
  for (let yy = y; yy < y + height; yy++) {
    const row = [];
    for (let xx = x; xx < x + width; xx++) {
      const cell = getNativeFootprintTessellatedOrientedLayerAt(
        catalog, itemId, xx, yy, orientationCode, callerGridFactor);
      if (cell.inside === true) row.push(cell.nativeValue);
      else {row.push(null); unmappedOutputCellCount++;}
    }
    rows.push(row);
  }
  return {
    status: 'source_correlated_item_gridarea_scaled_raw_layers',
    itemId, orientationCode, callerGridTessellationFactor: callerGridFactor,
    orientedSizeX: sx, orientedSizeY: sy,
    x, y, width, height, rows, unmappedOutputCellCount,
    nullMeansUnmappedNotUnoccupied: true,
    itemAreaTessellationFactorSourceValue: 1,
    callerGridFactorExplicitlyProvided: true,
    callerGridFactorProvenanceVerified: false,
    nativeTessellationCoordinateConversionVerified: true,
    sourceGameVersion: '1.26.1',
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}


// A native DEFAULT GridCollection carries its own Grid.TessellationFactor.
// Resolve an exact GridObject -> GridCollection grid ID association, never a
// nearest-grid guess or an inferred factor from another save/world instance.
function resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId) {
  const source = catalog.layoutObjects.get(String(layoutObjectId));
  const common = {
    layoutObjectId: String(layoutObjectId),
    callerGridFactorProvenanceVerified: false,
    worldCoordinatesVerified: false,
    currentSaveObjectVerified: false,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (!source) return {...common, status: 'unknown_default_layout_object'};
  const layout = catalog.layouts.get(String(source.layoutId));
  if (layout?.layoutKind !== 'nativeGridCollection' ||
      !Array.isArray(layout.nativeGridEntries)) {
    return {...common, status: 'missing_native_grid_collection_layout'};
  }
  const matches = layout.nativeGridEntries.filter(entry =>
    entry.gridIdNative === source.gridIdNative);
  if (matches.length !== 1) {
    return {...common, status: 'missing_or_ambiguous_native_grid_reference'};
  }
  const entry = matches[0];
  if (!Number.isInteger(entry.tessellationFactor) ||
      entry.tessellationFactor < 1 || entry.tessellationFactor > 256 ||
      typeof entry.gridDataPath !== 'string' || !entry.gridDataPath ||
      !Number.isInteger(source.orientationCode) ||
      source.orientationCode < 0 || source.orientationCode > 15) {
    return {...common, status: 'invalid_native_default_grid_tessellation_or_orientation'};
  }
  if (!catalog.objects.get(idText(source.itemId))?.footprint) {
    return {...common, status: 'default_item_gridarea_unavailable'};
  }
  return {
    ...common, status: 'source_linked_default_grid_tessellation',
    callerGridFactorProvenanceVerified: true,
    layoutId: source.layoutId,
    gridIdNative: source.gridIdNative,
    originalItemId: source.itemId,
    originalOrientationCode: source.orientationCode,
    callerGridTessellationFactor: entry.tessellationFactor,
    gridDataPath: entry.gridDataPath,
    sourceGridDataLoaded: catalog.grids.has(entry.gridDataPath),
    sourcePositionBasis: 'original_default_grid_local_not_current_save',
  };
}

/**
 * Default GridObject raw layer masks at an oriented OBJECT-LOCAL coordinate.
 * This binds the caller factor to an exact native GridCollection grid entry.
 * It does NOT apply GridObject.X/Y: native anchor semantics remain unknown.
 */
export function getNativeDefaultLayoutObjectLayerAt(
    catalog, layoutObjectId, x, y) {
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const cell = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, ref.originalItemId, x, y,
    ref.originalOrientationCode, ref.callerGridTessellationFactor);
  return {
    ...cell, ...ref,
    status: cell.status,
    nativeTessellationCoordinateConversionVerified:
      cell.nativeTessellationCoordinateConversionVerified === true,
    itemFactoryRoutePerRecordVerified: false,
  };
}

/**
 * Bounded, source-linked DEFAULT GridObject raw footprint. Rows are
 * orientation-relative, not translated into world or scene coordinates.
 */
export function getNativeDefaultLayoutObjectLayerWindow(
    catalog, layoutObjectId, rect) {
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const view = getNativeFootprintTessellatedOrientedWindow(
    catalog, ref.originalItemId, ref.originalOrientationCode,
    ref.callerGridTessellationFactor, rect);
  return {
    ...view, ...ref,
    status: view.status,
    nativeTessellationCoordinateConversionVerified:
      view.nativeTessellationCoordinateConversionVerified === true,
    itemFactoryRoutePerRecordVerified: false,
  };
}


/**
 * Steam 1.26.1 original GridArea.GetStrideFor(Nullable<int>, int).
 * No override (confirmed source null) returns 1, independent of factor;
 * a present override returns signed-int32 IMUL(override, callerGridFactor).
 * Does not establish permitted placement, collision or occupied cells.
 */
export function getNativeFootprintComputedStride(catalog, itemId, callerGridFactor) {
  if (!Number.isInteger(callerGridFactor) ||
      callerGridFactor < 1 || callerGridFactor > 256) {
    throw new TypeError('Invalid original GridArea stride caller grid factor');
  }
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const common = {
    itemId, callerGridTessellationFactor: callerGridFactor,
    callerGridFactorExplicitlyProvided: true,
    callerGridFactorProvenanceVerified: false,
    sourceFactoryRoutePerRecordVerified: false,
    strideOverridePlacementSemanticsVerified: false,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {...common, status: 'native_stride_not_verified_for_game_version',
      nativeStrideCalculationVerified: false};
  }
  // Older DB-04 snapshots omitted field 6.5 entirely. Their missing
  // property is UNKNOWN, not a confirmed nullable null. Never treat it
  // as native GetStrideFor(null) just because JS nullish-coalesces.
  if (!Object.prototype.hasOwnProperty.call(footprint, 'strideOverride')) {
    return {...common, status: 'legacy_snapshot_stride_source_unavailable',
      nativeStrideCalculationVerified: false};
  }
  const override = footprint.strideOverride;
  return {
    ...common,
    status: 'source_correlated_gridarea_get_stride_for',
    strideOverride: override,
    nativeComputedStride: override === null ? 1 :
      Math.imul(override, callerGridFactor),
    nativeStrideCalculationVerified: true,
    strideOverrideSourceVerified:
      footprint.strideOverrideSourceVerified === true,
    sourceGameVersion: '1.26.1',
  };
}

/**
 * Use exact original GridCollection native Grid factor for one DEFAULT
 * GridObject; source default arrangement is not a live-save placement.
 */
export function getNativeDefaultLayoutObjectComputedStride(catalog, layoutObjectId) {
  // GetStrideFor depends on the nullable ItemList field and this Grid's
  // tessellation, not on whether object-local (0,0) maps into a rotated
  // GridArea cell. Resolve provenance directly: layerAt() is unrelated and
  // may be outside the actual oblique footprint at local origin.
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const stride = getNativeFootprintComputedStride(
    catalog, ref.originalItemId, ref.callerGridTessellationFactor);
  return {
    ...ref, ...stride,
    status: stride.status,
    nativeStrideCalculationVerified:
      stride.nativeStrideCalculationVerified === true,
    callerGridFactorProvenanceVerified: true,
    sourceFactoryRoutePerRecordVerified: false,
    itemFactoryRoutePerRecordVerified: false,
    currentSaveObjectVerified: false,
    worldCoordinatesVerified: false,
    placementLegalityVerified: false,
  };
}
