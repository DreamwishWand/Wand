import {getNativeFootprintTessellatedOrientedWindow} from './native-gridarea-oriented.ts';
import {getNativeDefaultLayoutObjectLayerAt,getNativeDefaultLayoutObjectLayerWindow,getNativeFootprintComputedStride,getNativeDefaultLayoutObjectComputedStride} from './native-gridarea-default-object.ts';
export {getNativeFootprintObliqueOrientedLayerAt,getNativeFootprintObliqueOrientedWindow,getNativeFootprintOrientedLayerAt,getNativeFootprintOrientedWindow,getNativeFootprintTessellatedOrientedLayerAt,getNativeFootprintTessellatedOrientedWindow} from './native-gridarea-oriented.ts';
export {getNativeDefaultLayoutObjectLayerAt,getNativeDefaultLayoutObjectLayerWindow,getNativeFootprintComputedStride,getNativeDefaultLayoutObjectComputedStride} from './native-gridarea-default-object.ts';
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


