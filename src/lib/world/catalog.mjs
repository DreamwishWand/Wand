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
