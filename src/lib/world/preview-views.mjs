import {
  getNativeDefaultLayoutAnchorWindow,
  getNativeVillageAreaAnchorWindow,
} from './catalog.mjs';

// Source paths, not inferred coordinate transforms or server-side world IDs.
// The game sources the three Expansion04 underwater roots from nested paths.
// Keep their exact original subregion names instead of presenting all three
// independent GridCollections as a single terrestrial Expansion04 grid.
function regionKeyFromLayoutId(layoutId) {
  if (typeof layoutId !== 'string') return 'Other';
  const parts = layoutId.split('/');
  if (parts[0] !== 'SceneLayouts' || parts.length < 3 || !parts[1]) {
    return 'Other';
  }
  if (parts[1] === 'Realms' && parts.length >= 4 && parts[2]) {
    return 'Realms/' + parts[2];
  }
  if (parts[1] === 'OffGridBuildings' && parts.length >= 4 && parts[2]) {
    // The source hierarchy nests the Expansion/DLC/season scene types. Do
    // not collapse independent off-grid scenes into world Village AreaTypes.
    if (/^(Expansion0[1-9]|WinnieDLC|EventFloatingIslands)$/.test(parts[2]) &&
        parts.length >= 5 && parts[3]) {
      return 'OffGridBuildings/' + parts[2] + '/' + parts[3];
    }
    return 'OffGridBuildings/' + parts[2];
  }
  if (parts[1] === 'VillageExpansion04UnderwaterAreas' &&
      parts.length >= 4 && parts[2]) {
    return parts[1] + '/' + parts[2];
  }
  return parts[1];
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
        regionKey, villageLayoutCount: 0, realmLayoutCount: 0, offGridLayoutCount: 0,
        areaReferenceCount: 0, resolvedAreaReferenceCount: 0,
        missingAreaLayoutReferenceCount: 0,
        sourceDefaultAnchorCount: 0,
        nativeGridReferenceCount: 0, presentNativeGridReferenceCount: 0,
        missingNativeGridReferenceCount: 0,
        separateAreaReferenceCount: 0, resolvedSeparateAreaReferenceCount: 0,
        missingSeparateAreaReferenceCount: 0,
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
    // A Realm embeds its native GridCollection in the original realm
    // source root; it is not a Village AreaType or global coordinate.
    if (layout.layoutKind === 'nativeGridCollection' &&
        regionKey.startsWith('Realms/')) {
      const group = groupFor(regionKey);
      group.realmLayoutCount++;
      group.sourceDefaultAnchorCount +=
        catalog.layoutObjectsByLayout.get(layout.layoutId)?.length ?? 0;
      const grids = gridSets.get(regionKey) ?? new Set();
      for (const entry of layout.nativeGridEntries ?? []) {
        grids.add(entry.gridDataPath);
      }
      gridSets.set(regionKey, grids);
    }
    if (layout.layoutKind === 'nativeGridCollection' &&
        (regionKey === 'OffGridBuildings' ||
         regionKey.startsWith('OffGridBuildings/'))) {
      const group = groupFor(regionKey);
      group.offGridLayoutCount++;
      group.sourceDefaultAnchorCount +=
        catalog.layoutObjectsByLayout.get(layout.layoutId)?.length ?? 0;
      const grids = gridSets.get(regionKey) ?? new Set();
      for (const entry of layout.nativeGridEntries ?? []) {
        grids.add(entry.gridDataPath);
      }
      gridSets.set(regionKey, grids);
    }
    if (layout.layoutKind !== 'nativeDefaultVillageData') continue;
    const group = groupFor(regionKey);
    group.villageLayoutCount++;
    const seen = seenLayouts.get(regionKey) ?? new Set();
    const grids = gridSets.get(regionKey) ?? new Set();
    // Meta.DefaultVillageData's separatedAreasRaw contains native, explicit
    // references to OTHER DefaultVillageData roots, not additional grid IDs.
    // Report them separately from AreaType -> GridCollection mappings.
    const separate = new Set();
    if (Array.isArray(layout.separatedAreasRaw)) {
      for (const path of layout.separatedAreasRaw) {
        if (typeof path !== 'string' || !path.startsWith('SceneLayouts/') ||
            separate.has(path)) continue;
        separate.add(path);
        const nested = catalog.layouts.get(path);
        if (nested?.layoutKind === 'nativeDefaultVillageData') {
          group.resolvedSeparateAreaReferenceCount++;
        } else {
          group.missingSeparateAreaReferenceCount++;
        }
      }
    }
    group.separateAreaReferenceCount += separate.size;
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
