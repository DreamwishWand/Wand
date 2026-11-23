/**
 * Typed production World catalog surface. Source verification and immutable
 * game-native read APIs; World editing/placement checks are not provided.
 */
export {
  WORLD_SCHEMA,createWorldCatalog,checkNativeEditRestriction,
  getNativeWorld,getNativeAreasForScene,getNativeScene,
  getNativeFloorPalette,getLayoutGridReferences,
} from './native-catalog-core.ts';
export type {
  WorldSourceCatalog,WorldSourceObject,WorldSourceGrid,
  WorldSourceLayout,WorldSourceDefaultObject,WorldCatalogManifest
} from './native-catalog-core.ts';
export {
  getNativeDefaultLayoutViewport,getNativeVillageAreaViewport
} from './native-layout-viewport.ts';
export {
  getNativeFootprintCandidateCells,assessPlacement
} from './native-footprint-hypothesis.ts';
export {
  getNativeFootprintObliqueOrientedLayerAt,
  getNativeFootprintObliqueOrientedWindow,
  getNativeFootprintOrientedLayerAt,getNativeFootprintOrientedWindow,
  getNativeFootprintTessellatedOrientedLayerAt,
  getNativeFootprintTessellatedOrientedWindow
} from './native-gridarea-oriented.ts';
export {
  getNativeDefaultLayoutObjectLayerAt,getNativeDefaultLayoutObjectLayerWindow,
  getNativeFootprintComputedStride,getNativeDefaultLayoutObjectComputedStride
} from './native-gridarea-default-object.ts';
export {
  getNativeFootprint,getNativeFootprintLayerAt,getNativeFootprintLayerWindow,
  getNativeFootprintCardinalDimensions,getNativeGridAreaRotatedVector,
  getNativeGridAreaUnrotatedVector,getNativeFootprintOrientationBaseDimensions,
  getNativeFootprintCardinalOrientedLayerAt,
  getNativeFootprintCardinalOrientedWindow
} from './native-gridarea-base.ts';
export {
  getDefaultLayoutObjects,getDefaultVillageAreaLayoutRefs,
  getDefaultLayoutGridEntries,getNativeDefaultLayoutAnchorWindow,
  getNativeVillageAreaAnchorWindow
} from './native-source-anchor-index.ts';
export {
  GRID_LAYER_FLAGS,GRID_FLOOR_FLAGS,
  describeNativeLayerMask,describeNativeFloorMask
} from './native-mask.ts';
export {
  getNativeTerrainTile,getNativeTerrainWindow,getNativeTerrainDistribution
} from './native-terrain-preview.ts';
