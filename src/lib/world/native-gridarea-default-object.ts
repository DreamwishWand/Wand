/**
 * Exact original DEFAULT GridObject -> GridCollection -> GridData source join.
 * The Grid.TessellationFactor is read only from the original native Grid.ID
 * association. No GridObject.X/Y translation or player Save Grid join occurs.
 * Raw layer values, stride and nullable source field 6.5 never grant edits.
 */
import type {SourceGridAreaCatalog,OriginalGridAreaRect} from './native-gridarea-base.ts';
import {
  getNativeFootprintTessellatedOrientedLayerAt,
  getNativeFootprintTessellatedOrientedWindow,
} from './native-gridarea-oriented.ts';
interface NativeDefaultObject {
  readonly layoutId:string;
  readonly gridIdNative:number;
  readonly itemId:number|string;
  readonly orientationCode:number;
}
interface NativeDefaultGridEntry {
  readonly gridIdNative:number;
  readonly tessellationFactor:number;
  readonly gridDataPath:string;
}
interface NativeDefaultLayout {
  readonly layoutKind:string;
  readonly nativeGridEntries?:readonly NativeDefaultGridEntry[];
}
interface DefaultWorldCatalog extends SourceGridAreaCatalog {
  readonly layoutObjects:ReadonlyMap<string,NativeDefaultObject>;
  readonly layouts:ReadonlyMap<string,NativeDefaultLayout>;
  readonly grids:ReadonlyMap<string,unknown>;
}
const idText=(v:string|number):string=>String(v);
type SourceGridFactorResolved=Readonly<{
  status:'source_linked_default_grid_tessellation';
  callerGridFactorProvenanceVerified:true;
  originalItemId:number|string;
  originalOrientationCode:number;
  callerGridTessellationFactor:number;
  layoutId:string;
  gridIdNative:number;
  gridDataPath:string;
}>;

// A native DEFAULT GridCollection carries its own Grid.TessellationFactor.
// Resolve an exact GridObject -> GridCollection grid ID association, never a
// nearest-grid guess or an inferred factor from another save/world instance.
function resolveDefaultObjectNativeGridFactor(catalog:DefaultWorldCatalog,layoutObjectId:string|number) {
  const source = catalog.layoutObjects.get(String(layoutObjectId));
  const common = {
    layoutObjectId: String(layoutObjectId),
    callerGridFactorProvenanceVerified: false as const,
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
    callerGridFactorProvenanceVerified: true as const,
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
    catalog:DefaultWorldCatalog,layoutObjectId:string|number,x:number,y:number) {
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const cell = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, ref.originalItemId, x, y,
    ref.originalOrientationCode, ref.callerGridTessellationFactor);
  if (!cell)
    return {...ref,status:'default_item_gridarea_unavailable',
      nativeTessellationCoordinateConversionVerified:false};
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
    catalog:DefaultWorldCatalog,layoutObjectId:string|number,rect:unknown) {
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const view = getNativeFootprintTessellatedOrientedWindow(
    catalog, ref.originalItemId, ref.originalOrientationCode,
    ref.callerGridTessellationFactor, rect);
  if (!view)
    return {...ref,status:'default_item_gridarea_unavailable',
      nativeTessellationCoordinateConversionVerified:false};
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
export function getNativeFootprintComputedStride(catalog:SourceGridAreaCatalog,itemId:string|number,callerGridFactor:number) {
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
      Math.imul(override as number, callerGridFactor),
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
export function getNativeDefaultLayoutObjectComputedStride(catalog:DefaultWorldCatalog,layoutObjectId:string|number) {
  // GetStrideFor depends on the nullable ItemList field and this Grid's
  // tessellation, not on whether object-local (0,0) maps into a rotated
  // GridArea cell. Resolve provenance directly: layerAt() is unrelated and
  // may be outside the actual oblique footprint at local origin.
  const ref = resolveDefaultObjectNativeGridFactor(catalog, layoutObjectId);
  if (ref.callerGridFactorProvenanceVerified !== true) return ref;
  const stride = getNativeFootprintComputedStride(
    catalog, ref.originalItemId, ref.callerGridTessellationFactor);
  if (!stride)
    return {...ref,status:'default_item_gridarea_unavailable',
      nativeStrideCalculationVerified:false};
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
