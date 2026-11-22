import {
  getNativeDefaultLayoutAnchorWindow,
  getNativeVillageAreaAnchorWindow,
} from './catalog.mjs';

// Source paths, not inferred coordinate transforms or server-side world IDs.
// This grouping works for Village04, Expansion01..04, WinnieDLC and realms.
function regionKeyFromLayoutId(layoutId) {
  if (typeof layoutId !== 'string') return 'Other';
  const parts = layoutId.split('/');
  return parts.length >= 3 && parts[0] === 'SceneLayouts' && parts[1]
    ? parts[1] : 'Other';
}

/**
 * Counts only source-referenced records present in the local partial ZIP.
 * Do not treat zero missing explicit references as full world/DLC coverage,
 * verified world coordinates, occupancy or placement legality.
 */
export function summarizeWorldPreviewSourceCoverage(catalog) {
  const groups = new Map();
  const groupFor = regionKey => {
    let group = groups.get(regionKey);
    if (!group) {
      group = {
        regionKey, villageLayoutCount: 0,
        areaReferenceCount: 0, resolvedAreaReferenceCount: 0,
        missingAreaLayoutReferenceCount: 0,
        sourceDefaultAnchorCount: 0,
        nativeGridReferenceCount: 0, presentNativeGridReferenceCount: 0,
        missingNativeGridReferenceCount: 0,
        worldCoordinatesVerified: false, placementLegalityVerified: false,
      };
      groups.set(regionKey, group);
    }
    return group;
  };
  const seenLayouts = new Map(), gridSets = new Map();
  for (const layout of catalog.layouts.values()) {
    const regionKey = regionKeyFromLayoutId(layout.layoutId);
    groupFor(regionKey);
    if (layout.layoutKind !== 'nativeDefaultVillageData') continue;
    const group = groupFor(regionKey);
    group.villageLayoutCount++;
    const seen = seenLayouts.get(regionKey) ?? new Set();
    const grids = gridSets.get(regionKey) ?? new Set();
    for (const reference of layout.areaLayoutReferences ?? []) {
      group.areaReferenceCount++;
      const linked = catalog.layouts.get(reference.gridLayoutPath);
      if (linked?.layoutKind !== 'nativeGridCollection') {
        group.missingAreaLayoutReferenceCount++;
        continue;
      }
      group.resolvedAreaReferenceCount++;
      // Two native AreaTypes can refer to the same original GridCollection:
      // count unique source anchors once instead of fabricating extras.
      if (!seen.has(linked.layoutId)) {
        seen.add(linked.layoutId);
        group.sourceDefaultAnchorCount +=
          catalog.layoutObjectsByLayout.get(linked.layoutId)?.length ?? 0;
      }
      for (const entry of linked.nativeGridEntries ?? []) {
        grids.add(entry.gridDataPath);
      }
    }
    seenLayouts.set(regionKey, seen);
    gridSets.set(regionKey, grids);
  }
  for (const [regionKey, group] of groups) {
    const paths = gridSets.get(regionKey) ?? new Set();
    group.nativeGridReferenceCount = paths.size;
    for (const path of paths) {
      if (catalog.grids.has(path)) group.presentNativeGridReferenceCount++;
      else group.missingNativeGridReferenceCount++;
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.regionKey.localeCompare(b.regionKey, 'en'));
}

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
      regionKey: regionKeyFromLayoutId(layout.layoutId),
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
        regionKey: regionKeyFromLayoutId(village.layoutId),
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
