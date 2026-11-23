/**
 * Explicit hypothetical projection ONLY, not native occupancy evidence.
 * Candidate display always records falsifiable assumptions; placement
 * validation ALWAYS returns unresolved and never marks a valid placement.
 */
import type {WorldSourceCatalog} from './native-catalog-core.ts';
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
/**
 * Hypothesis ONLY: visualize nonzero original GridAreaData fixed32 layer cells
 * using explicitly chosen cardinal projection assumptions. The game-native
 * index order, 16-way rotations, anchor convention and nonzero occupancy
 * predicate have NOT been verified from native machine code.
 *
 * This must never be used as placement/collision permission.
 */
export function getNativeFootprintCandidateCells(catalog:WorldSourceCatalog,itemId:string|number,proposed:unknown,options:unknown) {
  const item = catalog.objects.get(String(itemId));
  if (!item) return { status: 'unknown_item_id' };
  const footprint = item.footprint;
  if (!footprint) return { status: 'native_footprint_unavailable' };
  if (!isRecord(proposed) || !Number.isSafeInteger(proposed.x) ||
      !Number.isSafeInteger(proposed.y)) {
    throw new TypeError('Explicit native grid-local candidate anchor required');
  }
  if (!isRecord(options) ||
      typeof options.cellOrder!=='string' ||
      !['x_major','y_major'].includes(options.cellOrder) ||
      typeof options.anchorModel!=='string' ||
      !['top_left','center_floor'].includes(options.anchorModel)) {
    throw new TypeError('Explicit unverified footprint projection hypothesis required');
  }
  const orientationCode=options.orientationCode as number;
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
  const originX = (proposed.x as number) -
    (options.anchorModel === 'center_floor' ? Math.floor(rx / 2) : 0);
  const originY = (proposed.y as number) -
    (options.anchorModel === 'center_floor' ? Math.floor(ry / 2) : 0);
  const cells = [];
  for (let originalX = 0; originalX < sx; originalX++) {
    for (let originalY = 0; originalY < sy; originalY++) {
      const index = options.cellOrder === 'x_major'
        ? originalX * sy + originalY : originalY * sx + originalX;
      const mask = footprint.layerValues[index];
      if (mask === 0) continue;
      let x:number;
      let y:number;
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

export function assessPlacement(catalog:WorldSourceCatalog,itemId:string|number,proposed:unknown) {
  const item = catalog.objects.get(String(itemId));
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


