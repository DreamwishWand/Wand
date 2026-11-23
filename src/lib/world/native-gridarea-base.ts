/**
 * Steam v1.26.1 original GridArea base and cardinal RAW layer reads.
 * Typed SOURCE-only binary evidence. Not a player Save position, object
 * anchor model, occupancy mask, collision resolver or placement permission.
 * v1.26.2+ GridArea code paths remain UNVERIFIED.
 */
import {GRIDAREA_ROT_COS,GRIDAREA_ROT_SIN} from './native-oblique.ts';
import {describeNativeLayerMask} from './native-mask.ts';

export interface SourceGridAreaFootprint {
  readonly sizeX:number;
  readonly sizeY:number;
  readonly layerValues:readonly number[];
  readonly acceptedFloorTypesFlag?:number;
  readonly strideOverride?:number|null;
  readonly strideOverrideSourceVerified?:boolean;
}
export interface SourceGridAreaItem {
  readonly itemId:number|string;
  readonly nativeType?:string;
  readonly footprint?:SourceGridAreaFootprint|null;
}
export interface SourceGridAreaCatalog {
  readonly manifest:Readonly<{gameVersion:string}>;
  readonly objects:ReadonlyMap<string,SourceGridAreaItem>;
}
export type OriginalGridAreaRect=Readonly<{
  x:number;y:number;width:number;height:number
}>;
type SourceCardinalPosition=Readonly<{
  orientationCode:number;
  gridToAreaTessellationRatioAssumed:'1:1';
  fullNativeTessellationScalingApplied:false;
  gridObjectAnchorVerified:false;
  occupancyPredicateVerified:false;
  placementLegalityVerified:false;
}> & (
  | Readonly<{status:string;nativeCardinalPositionTransformVerified:boolean;
      inside:true;originalLocalX:number;originalLocalY:number;
      originalFlatIndex:number;positionBasis:'unrotated_gridarea_local'}>
  | Readonly<{status:string;nativeCardinalPositionTransformVerified:boolean;
      inside?:false;originalFlatIndex?:never;originalLocalX?:never;originalLocalY?:never}>
);
const isRecord=(value:unknown):value is Record<string,unknown> =>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const idText=(value:string|number):string=>String(value);

export function getNativeFootprint(catalog:SourceGridAreaCatalog,itemId:string|number) {
  const record = catalog.objects.get(idText(itemId));
  if (!record?.footprint) return null;
  return {
    itemId: record.itemId, nativeType: record.nativeType,
    sizeX: record.footprint.sizeX, sizeY: record.footprint.sizeY,
    layerValues: [...record.footprint.layerValues],
    acceptedFloorTypesFlag: record.footprint.acceptedFloorTypesFlag,
    strideOverride: record.footprint.strideOverride ?? null,
    strideOverrideSourceVerified:
      record.footprint.strideOverrideSourceVerified === true,
    strideOverrideSourceWireField:
      record.footprint.strideOverrideSourceVerified === true ? '6.5' : null,
    strideOverridePlacementSemanticsVerified: false,
    cellIndexToXYVerified: false, layerMaskSemanticsVerified: false,
  };
}

// SOURCE: Steam v1.26.1 original GameAssembly + global-metadata.dat v31,
// Definitions.Grid.GridArea.get_Item(int,int), token 0x0600343F,
// RVA 0x3923370. The compiled function indexes area[x * SizeY + y].
// This is a base/unrotated GridArea layer lookup; it is NOT an occupancy,
// grid-object anchor, rotation transform, world positioning or edit validator.
export function getNativeFootprintLayerAt(catalog:SourceGridAreaCatalog,itemId:string|number,x:number,y:number) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < 0 || y < 0 || x >= footprint.sizeX || y >= footprint.sizeY) {
    throw new TypeError('Invalid original GridArea base layer position');
  }
  // Proven from the original Steam 1.26.1 GridArea.get_Item binary,
  // not from the source code of all later game revisions.
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      itemId, x, y,
      status: 'native_gridarea_base_index_not_verified_for_game_version',
      nativeGetterIndexVerified: false,
      rotatedCellMappingVerified: false,
      anchorModelVerified: false,
      occupancyPredicateVerified: false,
      placementLegalityVerified: false,
    };
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
export function getNativeFootprintLayerWindow(catalog:SourceGridAreaCatalog,itemId:string|number,rect:unknown) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!isRecord(rect)) throw new TypeError('Missing original GridArea viewport');
  const { x, y, width, height } = rect as OriginalGridAreaRect;
  if (![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 ||
      x + width > footprint.sizeX || y + height > footprint.sizeY) {
    throw new TypeError('Invalid original GridArea layer window');
  }
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      itemId, x, y, width, height,
      status: 'native_gridarea_base_index_not_verified_for_game_version',
      nativeGetterIndexVerified: false,
      rotatedCellMappingVerified: false,
      anchorModelVerified: false,
      occupancyPredicateVerified: false,
      placementLegalityVerified: false,
    };
  }
  const rows:number[][] = [];
  for (let yy = y; yy < y + height; yy++) {
    const values:number[] = [];
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
export function getNativeFootprintCardinalDimensions(catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!Number.isSafeInteger(orientationCode) || orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid native GridOrientation value');
  }
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      status: 'native_gridarea_cardinal_dimensions_not_verified_for_game_version',
      itemId, orientationCode, nativeCardinalSizeVerified: false,
      rotatedCellMappingVerified: false, placementLegalityVerified: false,
    };
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

function nativeGridAreaVector(catalog:SourceGridAreaCatalog,x:number,y:number,orientationCode:number,inverse:boolean) {
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
export function getNativeGridAreaRotatedVector(catalog:SourceGridAreaCatalog,x:number,y:number,orientationCode:number) {
  return nativeGridAreaVector(catalog, x, y, orientationCode, false);
}

/** Native GridArea.GetUnRotated; integer truncation can prevent round-trips. */
export function getNativeGridAreaUnrotatedVector(catalog:SourceGridAreaCatalog,x:number,y:number,orientationCode:number) {
  return nativeGridAreaVector(catalog, x, y, orientationCode, true);
}

/**
 * Original GridArea.GetSizeForOrientation / MoreRotationSize for ALL 16
 * orientations, specialized to grid/area tessellation ratio 1:1.
 * Return unscaled BASE bounding dimensions only, never rotated cell masks.
 * Steam v1.26.1 source-native method bodies at 0x3923750 and 0x3923880.
 */
export function getNativeFootprintOrientationBaseDimensions(catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number) {
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
  let rotatedX:number,rotatedY:number;
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
function sourceCardinalGridAreaPosition(catalog:SourceGridAreaCatalog,footprint:SourceGridAreaFootprint,x:number,y:number,orientationCode:number):SourceCardinalPosition {
  if (![x, y, orientationCode].every(Number.isInteger) ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647 ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid original GridArea position/orientation');
  }
  const common = {
    orientationCode, gridToAreaTessellationRatioAssumed: '1:1' as const,
    fullNativeTessellationScalingApplied: false as const,
    gridObjectAnchorVerified: false as const,
    occupancyPredicateVerified: false as const,
    placementLegalityVerified: false as const,
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
      nativeCardinalPositionTransformVerified: true, inside: false as const,
    };
  }
  let localX:number,localY:number;
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
      nativeCardinalPositionTransformVerified: true, inside: false as const,
    };
  }
  return {
    ...common, status: 'source_correlated_cardinal_local_position',
    nativeCardinalPositionTransformVerified: true,
    inside: true as const,
    originalLocalX: localX, originalLocalY: localY,
    originalFlatIndex: localX * sy + localY,
    positionBasis: 'unrotated_gridarea_local',
  };
}

/** Source-indexed RAW layer value for a cardinal orientation-frame cell. */
export function getNativeFootprintCardinalOrientedLayerAt(
    catalog:SourceGridAreaCatalog,itemId:string|number,x:number,y:number,orientationCode:number) {
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
    catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number,rect:unknown) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const initial = sourceCardinalGridAreaPosition(
    catalog, footprint, 0, 0, orientationCode);
  if (initial.nativeCardinalPositionTransformVerified !== true) {
    return { itemId, ...initial };
  }
  if (!isRecord(rect)) throw new TypeError('Missing original oriented GridArea window');
  const { x, y, width, height } = rect as OriginalGridAreaRect;
  const originalX = footprint.sizeX, originalY = footprint.sizeY;
  const swap = orientationCode === 4 || orientationCode === 12;
  const sx = swap ? originalY : originalX;
  const sy = swap ? originalX : originalY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original oriented GridArea window outside bounds');
  }
  const rows:number[][] = [];
  for (let yy = y; yy < y + height; yy++) {
    const row:number[] = [];
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
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}

