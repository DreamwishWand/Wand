import { GRIDAREA_ROT_COS, GRIDAREA_ROT_SIN, nativeObliqueSourceLocalPosition } from './oblique.mjs';

// Read-only DB-04 adapter for World Editor, Decorate, Presets and Collection.
// This API never invents 2D coordinates, path/fence connectivity or permissions.
export const WORLD_SCHEMA = 'wand.db04.world@1';


/** Native IL2CPP enum GridLayers (not a collision/placement algorithm). */
export const GRID_LAYER_FLAGS = Object.freeze({
  1: 'Ground', 2: 'Floor', 4: 'Low', 8: 'Medium',
  16: 'High', 32: 'Clear', 64: 'Blocking',
});

/** Native IL2CPP enum GridFloorType (Steam baseline 1.26.1). */
export const GRID_FLOOR_FLAGS = Object.freeze({
  1: 'Beach', 2: 'Wetland', 4: 'Meadow', 8: 'Urban',
  16: 'Savannah', 32: 'Forest', 64: 'DarkMountains', 128: 'Cliff',
  256: 'Shore', 512: 'Water', 1024: 'Floor', 2048: 'Wall',
  4096: 'Surface', 8192: 'AtlanteanOutpost', 16384: 'Desert',
  32768: 'Jungle', 65536: 'Mythology', 131072: 'FairyTales',
  262144: 'BlockAutomaticSpawning', 524288: 'Library',
  1048576: 'Puzzle', 2097152: 'PuzzleSurface', 4194304: 'Rockies',
  8388608: 'Fashion', 16777216: 'Wishland', 33554432: 'OutsideFloor',
  67108864: 'Honeywood', 134217728: 'Pirates',
  268435456: 'Candy', 536870912: 'Kingdom',
});

function symbolicNativeMask(value, dictionary) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new TypeError('Invalid native uint32 mask');
  }
  // Bitwise operators in JS are signed int32; use arithmetic for the full mask.
  let remainder = value;
  const names = [];
  for (const [bit, name] of Object.entries(dictionary)) {
    const flag = Number(bit);
    if (Math.floor(remainder / flag) % 2 === 1) {
      names.push(name);
      remainder -= flag;
    }
  }
  return { symbols: names, unrecognizedBits: remainder };
}

export const describeNativeLayerMask = mask => symbolicNativeMask(mask, GRID_LAYER_FLAGS);
export const describeNativeFloorMask = mask => symbolicNativeMask(mask, GRID_FLOOR_FLAGS);

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
      footprint.sizeX * footprint.sizeY > 16384 || !Array.isArray(footprint.layerValues) ||
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
  for (const object of layoutObjects.values()) {
    if (!layouts.has(object.layoutId)) {
      throw new TypeError('DB-04 default object references an absent native layout');
    }
    if (!Number.isSafeInteger(object.x) || !Number.isSafeInteger(object.y) ||
        !Number.isSafeInteger(object.gridObjectIdNative) ||
        !Number.isSafeInteger(object.itemId) ||
        object.worldCoordinatesVerified !== false ||
        object.fixedImmovableVerified !== false) {
      throw new TypeError('Invalid native default object evidence');
    }
    const rows = layoutObjectsByLayout.get(object.layoutId) ?? [];
    rows.push(object);
    layoutObjectsByLayout.set(object.layoutId, rows);
  }
  for (const item of objects.values()) validateFootprint(item.footprint);
  return { manifest: bundle.manifest, objects, scenes, grids, layouts, worlds, areas,
    layoutObjects, layoutObjectsByLayout,
    unresolved: isRecord(bundle.unresolved) ? bundle.unresolved : null };
}

export function getNativeFootprint(catalog, itemId) {
  const record = catalog.objects.get(idText(itemId));
  if (!record?.footprint) return null;
  return {
    itemId: record.itemId, nativeType: record.nativeType,
    sizeX: record.footprint.sizeX, sizeY: record.footprint.sizeY,
    layerValues: [...record.footprint.layerValues],
    acceptedFloorTypesFlag: record.footprint.acceptedFloorTypesFlag,
    cellIndexToXYVerified: false, layerMaskSemanticsVerified: false,
  };
}

// SOURCE: Steam v1.26.1 original GameAssembly + global-metadata.dat v31,
// Definitions.Grid.GridArea.get_Item(int,int), token 0x0600343F,
// RVA 0x3923370. The compiled function indexes area[x * SizeY + y].
// This is a base/unrotated GridArea layer lookup; it is NOT an occupancy,
// grid-object anchor, rotation transform, world positioning or edit validator.
export function getNativeFootprintLayerAt(catalog, itemId, x, y) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < 0 || y < 0 || x >= footprint.sizeX || y >= footprint.sizeY) {
    throw new TypeError('Invalid original GridArea base layer position');
  }
  const originalFlatIndex = x * footprint.sizeY + y;
  const nativeValue = footprint.layerValues[originalFlatIndex];
  return {
    itemId, x, y, originalFlatIndex, nativeValue,
    ...describeNativeLayerMask(nativeValue),
    positionBasis: 'original_unrotated_gridarea_local',
    sourceGetterIndexFormula: 'x*sizeY+y',
    nativeGetterIndexVerified: true,
    rotatedCellMappingVerified: false,
    anchorModelVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}

/** A bounded Y-major display window of source-indexed UNROTATED layer masks. */
export function getNativeFootprintLayerWindow(catalog, itemId, rect) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!isRecord(rect)) throw new TypeError('Missing original GridArea viewport');
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 ||
      x + width > footprint.sizeX || y + height > footprint.sizeY) {
    throw new TypeError('Invalid original GridArea layer window');
  }
  const rows = [];
  for (let yy = y; yy < y + height; yy++) {
    const values = [];
    for (let xx = x; xx < x + width; xx++) {
      values.push(footprint.layerValues[xx * footprint.sizeY + yy]);
    }
    rows.push(values);
  }
  return {
    itemId, status: 'source_correlated_unrotated_gridarea_layer_window',
    x, y, width, height, rows,
    sourceGetterIndexFormula: 'x*sizeY+y',
    nativeGetterIndexVerified: true,
    rotatedCellMappingVerified: false,
    anchorModelVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}

/**
 * Original GridArea.GetHorizontalSizeForOrientation / GetVerticalSizeForOrientation
 * cardinal branches. These report *unscaled base dimensions*, NOT transformed
 * layer coordinates or an object's tessellated world footprint.
 */
export function getNativeFootprintCardinalDimensions(catalog, itemId, orientationCode) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isSafeInteger(orientationCode) || orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid native GridOrientation value');
  }
  if (![0, 4, 8, 12].includes(orientationCode)) {
    return {
      status: 'noncardinal_gridarea_dimensions_not_derived', itemId,
      orientationCode, nativeCardinalSizeVerified: false,
      rotatedCellMappingVerified: false, placementLegalityVerified: false,
    };
  }
  const swap = orientationCode === 4 || orientationCode === 12;
  return {
    status: 'source_correlated_cardinal_gridarea_dimensions',
    itemId, orientationCode,
    sizeX: swap ? footprint.sizeY : footprint.sizeX,
    sizeY: swap ? footprint.sizeX : footprint.sizeY,
    nativeCardinalSizeVerified: true,
    tessellationScalingApplied: false,
    rotatedCellMappingVerified: false, anchorModelVerified: false,
    occupancyPredicateVerified: false, placementLegalityVerified: false,
  };
}

// Steam v1.26.1 ORIGINAL GridArea static initializer _cos/_sin tables,
// SHA256 names 33E08F57... and 5B6E0D7F..., and exact source PE64 bodies
// GridArea.GetRotated (0x3924D30) / GetUnRotated (0x3924C10).
// Entries are signed integer coefficients scaled by 100, *not* JS trig.
// A source version gate prevents silently applying this binary's logic to
// newer game revisions whose original machine code has not been rechecked.

function nativeGridAreaVector(catalog, x, y, orientationCode, inverse) {
  if (!catalog?.manifest || !Number.isInteger(x) || !Number.isInteger(y) ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647 ||
      !Number.isInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid native GridArea signed vector/orientation');
  }
  const common = {
    orientationCode, operation: inverse ? 'GetUnRotated' : 'GetRotated',
    rotatedGridAreaCellMappingVerified: false,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      ...common, status: 'native_rotation_not_verified_for_game_version',
      nativeVectorRotationVerified: false,
    };
  }
  const cos = GRIDAREA_ROT_COS[orientationCode];
  const sin = GRIDAREA_ROT_SIN[orientationCode];
  // GameAssembly uses 32-bit IMUL then integer truncation of EACH product
  // divided by 100; do not combine before division and do not Math.round().
  const xc = Math.trunc(Math.imul(x, cos) / 100);
  const ys = Math.trunc(Math.imul(y, sin) / 100);
  const xs = Math.trunc(Math.imul(x, sin) / 100);
  const yc = Math.trunc(Math.imul(y, cos) / 100);
  return {
    ...common,
    x: (inverse ? xc + ys : xc - ys) | 0,
    y: (inverse ? yc - xs : yc + xs) | 0,
    status: 'steam_1_26_1_source_matched_integer_vector_rotation',
    coefficientScale: 100,
    nativeIntegerTruncationVerified: true,
    nativeVectorRotationVerified: true,
    sourceGameVersion: '1.26.1',
  };
}

/** Native GridArea.GetRotated: vector only, not a footprint transformation. */
export function getNativeGridAreaRotatedVector(catalog, x, y, orientationCode) {
  return nativeGridAreaVector(catalog, x, y, orientationCode, false);
}

/** Native GridArea.GetUnRotated; integer truncation can prevent round-trips. */
export function getNativeGridAreaUnrotatedVector(catalog, x, y, orientationCode) {
  return nativeGridAreaVector(catalog, x, y, orientationCode, true);
}

/**
 * Original GridArea.GetSizeForOrientation / MoreRotationSize for ALL 16
 * orientations, specialized to grid/area tessellation ratio 1:1.
 * Return unscaled BASE bounding dimensions only, never rotated cell masks.
 * Steam v1.26.1 source-native method bodies at 0x3923750 and 0x3923880.
 */
export function getNativeFootprintOrientationBaseDimensions(catalog, itemId, orientationCode) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isInteger(orientationCode) || orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid native GridOrientation value');
  }
  const common = {
    itemId, orientationCode,
    gridToAreaTessellationRatioAssumed: '1:1',
    fullNativeTessellationScalingApplied: false,
    rotatedGridAreaCellMappingVerified: false,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return { ...common,
      status: 'native_orientation_base_size_not_verified_for_game_version',
      nativeOrientationBaseSizeVerified: false };
  }
  const sx = footprint.sizeX, sy = footprint.sizeY;
  let rotatedX, rotatedY;
  if (orientationCode === 0 || orientationCode === 8) {
    rotatedX = sx; rotatedY = sy;
  } else if (orientationCode === 4 || orientationCode === 12) {
    rotatedX = sy; rotatedY = sx;
  } else {
    const c = Math.abs(GRIDAREA_ROT_COS[orientationCode]);
    const sn = Math.abs(GRIDAREA_ROT_SIN[orientationCode]);
    // Original MoreRotationSize does an integer /100 of the SUM of products.
    // Unlike vector rotation, do not divide each term separately.
    rotatedX = Math.trunc((Math.imul(c, sx) + Math.imul(sn, sy)) / 100);
    rotatedY = Math.trunc((Math.imul(c, sy) + Math.imul(sn, sx)) / 100);
  }
  return { ...common,
    sizeX: rotatedX, sizeY: rotatedY,
    status: 'steam_1_26_1_source_matched_gridarea_base_dimensions',
    nativeOrientationBaseSizeVerified: true, sourceGameVersion: '1.26.1' };
}

/**
 * Steam v1.26.1 original GridArea.TryGetGridLocalPosition:
 * native entry RVA 0x3923BB0, source byte range through 0x3923D79,
 * three original PE .pdata unwind fragments. At equal source/input
 * tessellation factors, its 0/4/8/12 cardinal branches map an
 * orientation-frame local position back into unrotated GridArea coordinates.
 * This does NOT establish an actual GridObject world anchor or footprint
 * occupancy: the current source snapshot does not contain its area ratio.
 */
function sourceCardinalGridAreaPosition(catalog, footprint, x, y, orientationCode) {
  if (![x, y, orientationCode].every(Number.isInteger) ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647 ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid original GridArea position/orientation');
  }
  const common = {
    orientationCode, gridToAreaTessellationRatioAssumed: '1:1',
    fullNativeTessellationScalingApplied: false,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false, placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      ...common, status: 'native_cardinal_local_position_unverified_for_game_version',
      nativeCardinalPositionTransformVerified: false,
    };
  }
  if (![0, 4, 8, 12].includes(orientationCode)) {
    return {
      ...common, status: 'noncardinal_local_position_unresolved',
      nativeCardinalPositionTransformVerified: false,
    };
  }
  const sx = footprint.sizeX, sy = footprint.sizeY;
  if (x < 0 || y < 0) {
    return {
      ...common, status: 'outside_original_gridarea',
      nativeCardinalPositionTransformVerified: true, inside: false,
    };
  }
  let localX, localY;
  if (orientationCode === 0) {
    localX = sx - 1 - x; localY = sy - 1 - y;
  } else if (orientationCode === 4) {
    localX = y; localY = sy - 1 - x;
  } else if (orientationCode === 8) {
    localX = x; localY = y;
  } else {
    localX = sx - 1 - y; localY = x;
  }
  if (localX < 0 || localY < 0 || localX >= sx || localY >= sy) {
    return {
      ...common, status: 'outside_original_gridarea',
      nativeCardinalPositionTransformVerified: true, inside: false,
    };
  }
  return {
    ...common, status: 'source_correlated_cardinal_local_position',
    nativeCardinalPositionTransformVerified: true,
    inside: true,
    originalLocalX: localX, originalLocalY: localY,
    originalFlatIndex: localX * sy + localY,
    positionBasis: 'unrotated_gridarea_local',
  };
}

/** Source-indexed RAW layer value for a cardinal orientation-frame cell. */
export function getNativeFootprintCardinalOrientedLayerAt(
    catalog, itemId, x, y, orientationCode) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const position = sourceCardinalGridAreaPosition(
    catalog, footprint, x, y, orientationCode);
  if (position.inside !== true) return { itemId, ...position };
  const nativeValue = footprint.layerValues[position.originalFlatIndex];
  return {
    itemId, x, y, ...position, nativeValue,
    ...describeNativeLayerMask(nativeValue),
    rawLayerValueNotVerifiedOccupancy: true,
  };
}

/** Bounded Y-major RAW GridLayers matrix, with no anchor or collision claim. */
export function getNativeFootprintCardinalOrientedWindow(
    catalog, itemId, orientationCode, rect) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const initial = sourceCardinalGridAreaPosition(
    catalog, footprint, 0, 0, orientationCode);
  if (initial.nativeCardinalPositionTransformVerified !== true) {
    return { itemId, ...initial };
  }
  if (!isRecord(rect)) throw new TypeError('Missing original oriented GridArea window');
  const { x, y, width, height } = rect;
  const originalX = footprint.sizeX, originalY = footprint.sizeY;
  const swap = orientationCode === 4 || orientationCode === 12;
  const sx = swap ? originalY : originalX;
  const sy = swap ? originalX : originalY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original oriented GridArea window outside bounds');
  }
  const rows = [];
  for (let yy = y; yy < y + height; yy++) {
    const row = [];
    for (let xx = x; xx < x + width; xx++) {
      const position = sourceCardinalGridAreaPosition(
        catalog, footprint, xx, yy, orientationCode);
      if (position.inside !== true) {
        throw new TypeError('Source cardinal layer coordinate unexpectedly outside');
      }
      row.push(footprint.layerValues[position.originalFlatIndex]);
    }
    rows.push(row);
  }
  return {
    status: 'source_correlated_cardinal_oriented_gridarea_layers',
    itemId, orientationCode,
    x, y, width, height,
    orientedSizeX: sx, orientedSizeY: sy,
    rows, nativeCardinalPositionTransformVerified: true,
    gridToAreaTessellationRatioAssumed: '1:1',
    fullNativeTessellationScalingApplied: false,
    rawLayerValuesNotOccupancy: true,
    rawLayerValueNotVerifiedOccupancy: true,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
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

// A default layout is an original-game starting arrangement; whether a
// particular object is permanent or movable must be checked separately.
export function getDefaultLayoutObjects(catalog, layoutId, nativeGridId = null) {
  const rows = catalog.layoutObjectsByLayout.get(String(layoutId)) ?? [];
  return rows.filter(row => nativeGridId === null ||
      row.gridIdNative === nativeGridId).map(row => ({
    layoutObjectId: row.layoutObjectId,
    gridObjectIdNative: row.gridObjectIdNative,
    gridIdNative: row.gridIdNative,
    itemId: row.itemId,
    x: row.x, y: row.y,
    orientationCode: row.orientationCode,
    orientationName: row.orientationName,
    positionBasis: 'nativeGridLocal',
    worldCoordinatesVerified: false,
    fixedImmovableVerified: false,
  }));
}

export function getDefaultVillageAreaLayoutRefs(catalog, layoutId) {
  const layout = catalog.layouts.get(String(layoutId));
  if (!layout || layout.layoutKind !== 'nativeDefaultVillageData') return [];
  return (layout.areaLayoutReferences ?? []).map(ref => ({
    nativeAreaTypeCode: ref.nativeAreaTypeCode,
    nativeAreaTypeName: ref.nativeAreaTypeName ?? null,
    gridLayoutPath: ref.gridLayoutPath,
    knownLayout: catalog.layouts.has(ref.gridLayoutPath),
  }));
}

export function getDefaultLayoutGridEntries(catalog, layoutId) {
  const layout = catalog.layouts.get(String(layoutId));
  if (!layout || layout.layoutKind !== 'nativeGridCollection') return [];
  return (layout.nativeGridEntries ?? []).map(entry => ({
    gridIdNative: entry.gridIdNative,
    gridDataPath: entry.gridDataPath,
    tessellationFactor: entry.tessellationFactor,
    defaultObjectCount: entry.defaultObjectCount,
    knownGridData: catalog.grids.has(entry.gridDataPath),
  }));
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

// Raw native GridData remains private. Steam 1.26.1 source-native
// GridData.get_Item and GetNumberOfBitsPerPosition confirm 1/2/4-bit
// MSB-first packed palettes. This is NOT a placement checker.
const decodedGridCache = new WeakMap();

// Verify every source-packed palette symbol once per grid; do not trust
// user-provided JSON summaries merely because their totals are correct.
// This is a byte-level consistency check, not native machine-code proof.
function countNativePackedPaletteIndices(packed, bits, cellCount, paletteLength) {
  const counts = Array(paletteLength).fill(0);
  const cellsPerByte = 8 / bits;
  const mask = (1 << bits) - 1;
  let seen = 0;
  for (let i = 0; i < packed.length && seen < cellCount; i++) {
    const count = Math.min(cellsPerByte, cellCount - seen);
    for (let pos = 0; pos < count; pos++) {
      const index = (packed[i] >> (8 - bits * (pos + 1))) & mask;
      if (index >= paletteLength) {
        throw new TypeError('Native compacted grid palette index is invalid');
      }
      counts[index]++;
    }
    seen += count;
  }
  if (seen !== cellCount) throw new TypeError('Incomplete native packed terrain');
  return counts;
}

function packedGridForPreview(catalog, gridId) {
  const grid = catalog.grids.get(String(gridId));
  if (!grid) return { status: 'unknown_grid' };
  const evidence = grid.terrainDecoding;
  if (evidence?.decoded !== true || evidence?.packing !== 'x_major_msb_first' ||
      ![1, 2, 4].includes(evidence.cellBits)) {
    return { status: 'unresolved_native_packing' };
  }
  if (evidence.nativeCodeBodyVerified !== false ||
      evidence.placementLegalityVerified !== false) {
    throw new TypeError('Invalid provenance for preview native grid decoding');
  }
  const sx = grid.sizeX, sy = grid.sizeY;
  const palette = grid.nativeFloorTypePalette;
  const bits = evidence.cellBits;
  if (!Number.isSafeInteger(sx) || !Number.isSafeInteger(sy) ||
      sx <= 0 || sy <= 0 || sx * sy > 16777216 ||
      !Array.isArray(palette) || palette.length < 1 ||
      palette.length > (1 << bits) ||
      (bits === 1 && palette.length > 2) ||
      (bits === 2 && (palette.length < 3 || palette.length > 4)) ||
      (bits === 4 && (palette.length < 5 || palette.length > 16)) ||
      !palette.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff) ||
      typeof grid.compactedFloorTypesBase64 !== 'string') {
    throw new TypeError('Invalid source-derived native compacted grid');
  }
  let gridCache = decodedGridCache.get(catalog);
  if (!gridCache) {
    gridCache = new Map();
    decodedGridCache.set(catalog, gridCache);
  }
  const key = String(gridId);
  if (gridCache.has(key)) return gridCache.get(key);
  const expectedBytes = Math.ceil(sx * sy * bits / 8);
  const expectedBase64Length = Math.ceil(expectedBytes / 3) * 4;
  if (grid.compactedFloorTypesBase64.length !== expectedBase64Length ||
      expectedBytes !== grid.nativeCompactedByteCount) {
    throw new TypeError('Native compacted grid length mismatch');
  }
  const text = atob(grid.compactedFloorTypesBase64);
  const packed = Uint8Array.from(text, char => char.charCodeAt(0));
  if (packed.length !== expectedBytes) {
    throw new TypeError('Native compacted grid length mismatch');
  }
  const remaining = (sx * sy * bits) % 8;
  if (remaining && (packed[packed.length - 1] & ((1 << (8 - remaining)) - 1))) {
    throw new TypeError('Native compacted grid padding mismatch');
  }
  const observedCounts = countNativePackedPaletteIndices(
    packed, bits, sx * sy, palette.length);
  const entry = { sizeX: sx, sizeY: sy, palette: [...palette], bits,
    packed, observedCounts, evidence: evidence.sampleBasedEncodingEvidence ?? null };
  gridCache.set(key, entry);
  return entry;
}

function previewFloorValue(grid, x, y) {
  const bitOffset = (x * grid.sizeY + y) * grid.bits;
  const shift = 8 - grid.bits - (bitOffset % 8);
  const index = (grid.packed[bitOffset >> 3] >> shift) & ((1 << grid.bits) - 1);
  if (index >= grid.palette.length) {
    throw new TypeError('Native compacted grid palette index is invalid');
  }
  return grid.palette[index];
}

/**
 * Return a source-corroborated grid-local floor value. Neither this API nor
 * floor masks establish placement permission or world-space origin.
 */
export function getNativeTerrainTile(catalog, gridId, x, y) {
  const grid = packedGridForPreview(catalog, gridId);
  if (grid.status) return { status: grid.status };
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < 0 || y < 0 || x >= grid.sizeX || y >= grid.sizeY) {
    return { status: 'outside_native_grid' };
  }
  const nativeValue = previewFloorValue(grid, x, y);
  return { status: 'source_corroborated_grid_local_preview', x, y, nativeValue,
    ...describeNativeFloorMask(nativeValue),
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false, sampleBasedEncodingEvidence: grid.evidence };
}

/** 2D Y-row-major presentation; bytes themselves are native X-major packed. */
export function getNativeTerrainWindow(catalog, gridId, rect) {
  const grid = packedGridForPreview(catalog, gridId);
  if (grid.status) return { status: grid.status };
  if (!isRecord(rect)) throw new TypeError('Native grid preview rectangle required');
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 || y < 0 || width <= 0 || height <= 0 ||
      width > 256 || height > 256 ||
      x + width > grid.sizeX || y + height > grid.sizeY) {
    return { status: 'outside_native_grid_or_preview_limit' };
  }
  const rows = [];
  for (let yy = y; yy < y + height; yy++) {
    const row = [];
    for (let xx = x; xx < x + width; xx++) row.push(previewFloorValue(grid, xx, yy));
    rows.push(row);
  }
  return { status: 'source_corroborated_grid_local_preview',
    x, y, width, height, rows,
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false, sampleBasedEncodingEvidence: grid.evidence };
}

/**
 * Count original native terrain palette indices without exposing all 2D cells.
 * The histogram comes from source-packed bytes checked by verify_bundle.py;
 * it is a visual/analytical legend, never placement permission.
 */
export function getNativeTerrainDistribution(catalog, gridId) {
  const grid = catalog.grids.get(String(gridId));
  if (!grid) return { status: 'unknown_grid' };
  if (grid.terrainDecoding?.decoded !== true ||
      grid.terrainDecoding?.packing !== 'x_major_msb_first') {
    return { status: 'unresolved_native_packing' };
  }
  if (grid.terrainDecoding?.nativeCodeBodyVerified !== false ||
      grid.terrainDecoding?.placementLegalityVerified !== false) {
    throw new TypeError('Invalid native terrain histogram provenance');
  }
  const counts = grid.nativePaletteIndexCellCounts;
  const palette = grid.nativeFloorTypePalette;
  const sx = grid.sizeX, sy = grid.sizeY;
  if (counts == null) return { status: 'histogram_not_extracted' };
  if (!Array.isArray(counts) || !Array.isArray(palette) ||
      counts.length !== palette.length || !Number.isSafeInteger(sx) ||
      !Number.isSafeInteger(sy) || sx < 1 || sy < 1 ||
      sx * sy > 16777216 || !counts.every(n => Number.isSafeInteger(n) && n >= 0) ||
      counts.reduce((a, b) => a + b, 0) !== sx * sy) {
    throw new TypeError('Invalid native terrain histogram integrity');
  }
  const source = packedGridForPreview(catalog, gridId);
  if (source.status) return { status: source.status };
  if (source.observedCounts.length !== counts.length ||
      counts.some((count, index) => count !== source.observedCounts[index])) {
    throw new TypeError('Native terrain histogram mismatches packed source bytes');
  }
  return {
    status: 'source_corroborated_grid_local_summary',
    sizeX: sx, sizeY: sy, totalCells: sx * sy,
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false,
    values: counts.map((cellCount, index) => ({
      paletteIndex: index, nativeValue: palette[index], cellCount,
      ...describeNativeFloorMask(palette[index]),
    })),
  };
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
  const all = catalog.layoutObjectsByLayout.get(id) ?? [];
  const native = all.filter(item => item.gridIdNative === nativeGridId);
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
