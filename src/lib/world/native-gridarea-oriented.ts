/**
 * Read-only source-local GridArea oriented raw layer views.
 * Steam v1.26.1 native proof is gated for all orientation codes and explicit
 * tessellation. Values are raw GridLayers, not occupied cells, collision or
 * legal placement. A null output cell indicates an unmapped SOURCE cell.
 */
import type {SourceGridAreaCatalog,OriginalGridAreaRect} from './native-gridarea-base.ts';
import {getNativeFootprintCardinalOrientedLayerAt,
        getNativeFootprintCardinalOrientedWindow,
        getNativeFootprintOrientationBaseDimensions} from './native-gridarea-base.ts';
import {nativeObliqueSourceLocalPosition} from './native-oblique.ts';
import {describeNativeLayerMask} from './native-mask.ts';
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const idText=(value:string|number):string=>String(value);

/** Original Steam 1.26.1 oblique GridArea local lookup, 1:1 tessellation.
 * Returns a RAW layer mask only for a mapped source GridArea cell.
 * A missing cell is NOT evidence of free world space or legal placement.
 */
export function getNativeFootprintObliqueOrientedLayerAt(
    catalog:SourceGridAreaCatalog,itemId:string|number,x:number,y:number,orientationCode:number) {
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
    rawLayerValueNotVerifiedOccupancy: true,
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
    catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number,rect:unknown) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const probe = getNativeFootprintObliqueOrientedLayerAt(
    catalog, itemId, 0, 0, orientationCode);
  if (probe.nativeNoncardinalPositionTransformVerified !== true) return probe;
  if (!isRecord(rect)) throw new TypeError('Missing original oblique GridArea window');
  const {x,y,width,height}=rect as OriginalGridAreaRect;
  if (!('orientedSizeX' in probe) || !('orientedSizeY' in probe) ||
      typeof probe.orientedSizeX !== 'number' ||
      typeof probe.orientedSizeY !== 'number')
    throw new TypeError('Unverified original oblique GridArea dimensions');
  const sx=probe.orientedSizeX,sy=probe.orientedSizeY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original oblique GridArea viewport outside bounds');
  }
  const rows:(number|null)[][]=[];
  let unmappedOutputCellCount = 0;
  for (let yy = y; yy < y + height; yy++) {
    const row:(number|null)[]=[];
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
    catalog:SourceGridAreaCatalog,itemId:string|number,x:number,y:number,orientationCode:number) {
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
    catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number,rect:unknown) {
  if (!Number.isInteger(orientationCode) ||
      orientationCode < 0 || orientationCode > 15) {
    throw new TypeError('Invalid original GridArea orientation');
  }
  return [0, 4, 8, 12].includes(orientationCode)
    ? getNativeFootprintCardinalOrientedWindow(catalog, itemId, orientationCode, rect)
    : getNativeFootprintObliqueOrientedWindow(catalog, itemId, orientationCode, rect);
}


/**
 * Steam 1.26.1 source: GridAreaData.GetGridArea (token 0x0600309F)
 * lazy-creates the *item* GridArea with TessellationFactor=1. The separate
 * GridArea.TryGetGridLocalPosition (0x3923BB0) first converts caller grid
 * coordinates by trunc(x/gridTessellationFactor)*areaFactor before rotation.
 * A supplied factor is NOT proof of any particular world/save Grid factor.
 */
export function getNativeFootprintTessellatedOrientedLayerAt(
    catalog:SourceGridAreaCatalog,itemId:string|number,x:number,y:number,orientationCode:number,callerGridFactor:number) {
  if (!Number.isInteger(orientationCode) || orientationCode < 0 || orientationCode > 15 ||
      !Number.isInteger(callerGridFactor) || callerGridFactor < 1 || callerGridFactor > 256 ||
      !Number.isInteger(x) || !Number.isInteger(y) ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647) {
    throw new TypeError('Invalid original item GridArea orientation/grid factor/position');
  }
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  const common = {
    itemId, orientationCode,
    callerGridTessellationFactor: callerGridFactor,
    callerGridFactorExplicitlyProvided: true,
    callerGridFactorProvenanceVerified: false,
    itemAreaTessellationFactorSourceValue: 1,
    itemGetGridAreaFactorySourceVerified: true,
    nativeTessellationCoordinateConversionVerified: true,
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
  if (catalog.manifest.gameVersion !== '1.26.1') {
    return {
      ...common, status: 'native_tessellation_not_verified_for_game_version',
      nativeTessellationCoordinateConversionVerified: false,
      itemGetGridAreaFactorySourceVerified: false,
    };
  }
  const originalSize = getNativeFootprintOrientationBaseDimensions(
    catalog, itemId, orientationCode);
  if (!originalSize || !('sizeX' in originalSize) ||
      typeof originalSize.sizeX !== 'number' ||
      typeof originalSize.sizeY !== 'number')
    return {...common,status:'native_orientation_base_size_not_verified_for_game_version',
      nativeTessellationCoordinateConversionVerified:false};
  const orientedSizeX = originalSize.sizeX * callerGridFactor;
  const orientedSizeY = originalSize.sizeY * callerGridFactor;
  const dims = { ...common, orientedSizeX, orientedSizeY,
    sourceGameVersion: '1.26.1' };
  if (x < 0 || y < 0 || x >= orientedSizeX || y >= orientedSizeY) {
    return { ...dims, inside: false, status: 'outside_oriented_gridarea' };
  }
  // Native transforms nonnegative caller-grid coordinates to area units
  // BEFORE its cardinal/oblique direction-specific source-cell lookup.
  const normalizedInputX = Math.trunc(x / callerGridFactor);
  const normalizedInputY = Math.trunc(y / callerGridFactor);
  const source = getNativeFootprintOrientedLayerAt(
    catalog, itemId, normalizedInputX, normalizedInputY, orientationCode);
  if (!source || !('inside' in source) || source.inside !== true) {
    return { ...dims, inside: false, status: 'outside_original_gridarea' };
  }
  return {
    ...dims, inside: true,
    status: 'source_correlated_item_gridarea_explicit_tessellation',
    normalizedInputX, normalizedInputY,
    originalLocalX: source.originalLocalX,
    originalLocalY: source.originalLocalY,
    originalFlatIndex: source.originalFlatIndex,
    positionBasis: 'unrotated_item_gridarea_local',
    nativeValue: source.nativeValue,
    ...describeNativeLayerMask(source.nativeValue),
    rawLayerValueNotVerifiedOccupancy: true,
  };
}

/** Bounded read-only source masks; null means UNMAPPED, not unoccupied. */
export function getNativeFootprintTessellatedOrientedWindow(
    catalog:SourceGridAreaCatalog,itemId:string|number,orientationCode:number,callerGridFactor:number,rect:unknown) {
  const footprint = catalog.objects.get(idText(itemId))?.footprint;
  if (!footprint) return null;
  if (!isRecord(rect)) throw new TypeError('Missing original tessellated GridArea viewport');
  const probe = getNativeFootprintTessellatedOrientedLayerAt(
    catalog, itemId, 0, 0, orientationCode, callerGridFactor);
  if (probe.nativeTessellationCoordinateConversionVerified !== true) return probe;
  const {x,y,width,height}=rect as OriginalGridAreaRect;
  if (!('orientedSizeX' in probe) || !('orientedSizeY' in probe) ||
      typeof probe.orientedSizeX !== 'number' ||
      typeof probe.orientedSizeY !== 'number')
    throw new TypeError('Unverified tessellated GridArea dimensions');
  const sx=probe.orientedSizeX,sy=probe.orientedSizeY;
  if (![x, y, width, height].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 256 || height > 256 || x + width > sx || y + height > sy) {
    throw new TypeError('Original tessellated GridArea viewport outside bounds');
  }
  const rows:(number|null)[][]=[];
  let unmappedOutputCellCount = 0;
  for (let yy = y; yy < y + height; yy++) {
    const row:(number|null)[]=[];
    for (let xx = x; xx < x + width; xx++) {
      const cell = getNativeFootprintTessellatedOrientedLayerAt(
        catalog, itemId, xx, yy, orientationCode, callerGridFactor);
      if (cell && 'inside' in cell && cell.inside === true) row.push(cell.nativeValue);
      else {row.push(null); unmappedOutputCellCount++;}
    }
    rows.push(row);
  }
  return {
    status: 'source_correlated_item_gridarea_scaled_raw_layers',
    itemId, orientationCode, callerGridTessellationFactor: callerGridFactor,
    orientedSizeX: sx, orientedSizeY: sy,
    x, y, width, height, rows, unmappedOutputCellCount,
    nullMeansUnmappedNotUnoccupied: true,
    itemAreaTessellationFactorSourceValue: 1,
    callerGridFactorExplicitlyProvided: true,
    callerGridFactorProvenanceVerified: false,
    nativeTessellationCoordinateConversionVerified: true,
    sourceGameVersion: '1.26.1',
    gridObjectAnchorVerified: false,
    occupancyPredicateVerified: false,
    placementLegalityVerified: false,
  };
}


