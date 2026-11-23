/**
 * Original DEFAULT GridCollection/Village source-local terrain + anchor
 * composition. No player Save mapping, occupied-cell inference or legality.
 */
import type {WorldSourceCatalog} from './native-catalog-core.ts';
import {getNativeTerrainWindow} from './native-terrain-preview.ts';
/**
 * Compose the source-defined initial layout's native grid-local 2D viewport.
 *
 * This is NOT a user's save map, a world-coordinate transform, or a placement
 * legality checker. Object positions are raw initial GridObject anchors, not
 * occupied-cell sets. The terrain candidate uses the explicitly corroborated
 * native bit/axis packing only.
 */
export function getNativeDefaultLayoutViewport(catalog:WorldSourceCatalog,layoutId:string|number,nativeGridId:number,rect:unknown) {
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
  if (!('x' in terrain) || !('y' in terrain) ||
      !('width' in terrain) || !('height' in terrain) ||
      !('rows' in terrain) ||
      typeof terrain.x!=='number'||typeof terrain.y!=='number'||
      typeof terrain.width!=='number'||typeof terrain.height!=='number'||
      !Array.isArray(terrain.rows))
    throw new TypeError('Invalid source-corroborated GridData window');
  const native=catalog.layoutObjectsByGrid.get(id)?.get(nativeGridId)??[];
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
export function getNativeVillageAreaViewport(catalog:WorldSourceCatalog,villageLayoutId:string|number,
                                             nativeAreaTypeCode:number,nativeGridId:number,rect:unknown) {
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

