import {
  getNativeDefaultLayoutAnchorWindow,
  getNativeVillageAreaAnchorWindow,
} from './catalog.mjs';

// Read-only original source paths. A village's AreaType reference is not a
// world-coordinate transform: it only identifies the native GridCollection.
function gridOptions(catalog, layout) {
  if (layout?.layoutKind !== 'nativeGridCollection' ||
      !Array.isArray(layout.nativeGridEntries)) return [];
  return layout.nativeGridEntries.map(entry => {
    const grid = catalog.grids.get(entry.gridDataPath);
    return {
      gridIdNative: entry.gridIdNative,
      gridDataPath: entry.gridDataPath,
      knownGridData: Boolean(grid),
      sizeX: grid?.sizeX ?? null,
      sizeY: grid?.sizeY ?? null,
      defaultObjectCount: entry.defaultObjectCount,
    };
  });
}

export function listWorldPreviewViews(catalog) {
  const views = [];
  for (const layout of catalog.layouts.values()) {
    if (layout.layoutKind !== 'nativeGridCollection') continue;
    views.push({
      viewKey: JSON.stringify(['grid', layout.layoutId]),
      kind: 'gridCollection',
      label: 'GridCollection · ' + layout.layoutId,
      layoutId: layout.layoutId,
      grids: gridOptions(catalog, layout),
    });
  }
  for (const village of catalog.layouts.values()) {
    if (village.layoutKind !== 'nativeDefaultVillageData') continue;
    for (const area of village.areaLayoutReferences ?? []) {
      const linked = catalog.layouts.get(area.gridLayoutPath);
      views.push({
        viewKey: JSON.stringify(['village', village.layoutId,
          area.nativeAreaTypeCode, area.gridLayoutPath]),
        kind: 'villageArea',
        label: 'Village · ' + village.layoutId + ' / ' +
          (area.nativeAreaTypeName ?? 'Area') + ' (' +
          area.nativeAreaTypeCode + ') → ' + area.gridLayoutPath,
        layoutId: area.gridLayoutPath,
        villageLayoutId: village.layoutId,
        nativeAreaTypeCode: area.nativeAreaTypeCode,
        nativeAreaTypeName: area.nativeAreaTypeName ?? null,
        missingReferencedLayout: !linked,
        grids: gridOptions(catalog, linked),
      });
    }
  }
  return views;
}

export function getWorldPreviewAnchorWindow(catalog, view, nativeGridId,
                                            rect, page = null) {
  if (!view) return {status: 'unknown_world_preview_source'};
  if (view.kind === 'villageArea') {
    return getNativeVillageAreaAnchorWindow(catalog, view.villageLayoutId,
      view.nativeAreaTypeCode, nativeGridId, rect, page);
  }
  if (view.kind === 'gridCollection') {
    return getNativeDefaultLayoutAnchorWindow(catalog, view.layoutId,
      nativeGridId, rect, page);
  }
  return {status: 'unknown_world_preview_source'};
}
