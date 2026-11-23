/**
 * Read-only original Steam GridData source terrain decoder.
 * Source version gating, native X-major packed/direct values, bounded
 * query windows, and independent histogram verification. Does not infer
 * real-world coordinates, occupancy, collision or placement authorization.
 */
import {describeNativeFloorMask} from './native-mask.ts';
interface NativeTerrainEvidence {
  status?:string;
  decoded?:boolean;
  packing?:string;
  cellBits?:number;
  cellIndexFormula?:string;
  sourceGameVersion?:string;
  nativeCodeBodyVerified?:boolean;
  placementLegalityVerified?:boolean;
  sampleBasedEncodingEvidence?:unknown;
}
interface NativeGridData {
  sizeX:number;
  sizeY:number;
  terrainDecoding?:NativeTerrainEvidence;
  nativeSourceFormat?:string;
  nativeFloorTypes?:number[];
  nativeFloorTypePalette?:number[];
  compactedFloorTypesBase64?:string|null;
  nativeCompactedByteCount?:number|null;
  nativePaletteIndexCellCounts?:number[]|null;
}
interface NativeTerrainCatalog {
  manifest:{gameVersion:string;platform?:string};
  grids:ReadonlyMap<string,NativeGridData>;
}
type PreparedGrid =
  |{readonly kind:'direct';readonly sizeX:number;readonly sizeY:number;
    readonly values:readonly number[];readonly evidence:unknown;
    readonly status?:never}
  |{readonly kind:'packed';readonly sizeX:number;readonly sizeY:number;
    readonly palette:readonly number[];readonly bits:number;
    readonly packed:Uint8Array;readonly observedCounts:readonly number[];
    readonly evidence:unknown;readonly status?:never};
type TerrainUnavailable={readonly status:string;readonly kind?:never};
type PreparedOrUnavailable=PreparedGrid|TerrainUnavailable;
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function requireTerrainCatalog(source:unknown):NativeTerrainCatalog{
  if(!isRecord(source)||!isRecord(source.manifest)||
    typeof source.manifest.gameVersion!=='string'||
    !(source.grids instanceof Map))
    throw new TypeError('Invalid original World terrain catalog boundary');
  // Individual original GridData records are verified when used; the cast
  // only establishes the typed boundary of createWorldCatalog's maps.
  return source as unknown as NativeTerrainCatalog;
}
const READONLY_NATIVE_TERRAIN_GAME_VERSIONS=
  new Set(['1.26.1','1.26.2']);
const hasNativeTerrainReadEvidence=(catalog:NativeTerrainCatalog):boolean=>
  READONLY_NATIVE_TERRAIN_GAME_VERSIONS.has(catalog.manifest.gameVersion)&&
  (catalog.manifest.gameVersion!=='1.26.2'||catalog.manifest.platform==='Steam');

// Raw native GridData remains private. Steam 1.26.1 source-native
// GridData.get_Item and GetNumberOfBitsPerPosition confirm 1/2/4-bit
// MSB-first packed palettes. This is NOT a placement checker.
const decodedGridCache=new WeakMap<NativeTerrainCatalog,Map<string,PreparedGrid>>();

// Verify every source-packed palette symbol once per grid; do not trust
// user-provided JSON summaries merely because their totals are correct.
// This is a byte-level consistency check, not native machine-code proof.
function countNativePackedPaletteIndices(packed:Uint8Array,bits:number,cellCount:number,paletteLength:number):number[] {
  const counts:number[] = Array(paletteLength).fill(0);
  const cellsPerByte = 8 / bits;
  const mask = (1 << bits) - 1;
  let seen = 0;
  for (let i = 0; i < packed.length && seen < cellCount; i++) {
    const count = Math.min(cellsPerByte, cellCount - seen);
    for (let pos = 0; pos < count; pos++) {
      const index = (packed[i] >> (8 - bits * (pos + 1))) & mask;
      if (index >= paletteLength) {
        throw new TypeError('Native compacted grid palette index is invalid');
      }
      counts[index]++;
    }
    seen += count;
  }
  if (seen !== cellCount) throw new TypeError('Incomplete native packed terrain');
  return counts;
}

function packedGridForPreview(catalog:NativeTerrainCatalog,gridId:string|number):PreparedOrUnavailable {
  const grid = catalog.grids.get(String(gridId));
  if (!grid) return { status: 'unknown_grid' };
  const evidence = grid.terrainDecoding;
  // Only these two pinned Steam native read paths have source evidence.
  // Older unresolved 1.26.2 snapshots stay unsupported; never trust flags
  // on an unknown future build, even when a ZIP claims decoded:true.
  if (!hasNativeTerrainReadEvidence(catalog) ||
      evidence?.status === 'native_packing_not_verified_for_game_version' ||
      evidence?.status === 'native_json_floor_index_not_verified_for_game_version') {
    return { status: 'native_terrain_packing_not_verified_for_game_version' };
  }
  // Original JSON GridData has an explicit full FloorTypes array. It is
  // NOT a compacted protobuf palette and may include BlockAutomaticSpawning.
  // No bit-packing, palette guessing or placement permission is applied.
  if (grid.nativeSourceFormat === 'original_json_direct_floor_values') {
    if (evidence?.decoded !== true ||
        evidence.status !== 'source_correlated_original_json_direct_floor_values' ||
        evidence.packing !== 'x_major_direct_floor_values' ||
        evidence.cellIndexFormula !== 'x*sizeY+y' ||
        evidence.sourceGameVersion !== catalog.manifest.gameVersion ||
        evidence.nativeCodeBodyVerified !== false ||
        evidence.placementLegalityVerified !== false) {
      return { status: 'unresolved_native_packing' };
    }
    const sx = grid.sizeX, sy = grid.sizeY;
    const values = grid.nativeFloorTypes;
    if (!Number.isSafeInteger(sx) || !Number.isSafeInteger(sy) ||
        sx < 1 || sy < 1 || sx * sy > 1_000_000 ||
        !Array.isArray(values) || values.length !== sx * sy ||
        !values.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff) ||
        !Array.isArray(grid.nativeFloorTypePalette) ||
        grid.nativeFloorTypePalette.length !== 0 ||
        grid.compactedFloorTypesBase64 != null) {
      throw new TypeError('Invalid original native JSON FloorTypes');
    }
    let cache = decodedGridCache.get(catalog);
    if (!cache) { cache = new Map(); decodedGridCache.set(catalog, cache); }
    const key = String(gridId);
    if (cache.has(key)) return cache.get(key);
    const prepared:PreparedGrid = { kind: 'direct', sizeX: sx, sizeY: sy, values,
      evidence: evidence.sampleBasedEncodingEvidence ?? null };
    cache.set(key, prepared);
    return prepared;
  }
  if (evidence?.decoded !== true || evidence?.packing !== 'x_major_msb_first' ||
      ![1, 2, 4].includes(evidence.cellBits)) {
    return { status: 'unresolved_native_packing' };
  }
  if (evidence.nativeCodeBodyVerified !== false ||
      evidence.placementLegalityVerified !== false) {
    throw new TypeError('Invalid provenance for preview native grid decoding');
  }
  const sx = grid.sizeX, sy = grid.sizeY;
  const palette = grid.nativeFloorTypePalette;
  const bits = evidence.cellBits as number;
  if (!Number.isSafeInteger(sx) || !Number.isSafeInteger(sy) ||
      sx <= 0 || sy <= 0 || sx * sy > 16777216 ||
      !Array.isArray(palette) || palette.length < 1 ||
      palette.length > (1 << bits) ||
      (bits === 1 && palette.length > 2) ||
      (bits === 2 && (palette.length < 3 || palette.length > 4)) ||
      (bits === 4 && (palette.length < 5 || palette.length > 16)) ||
      !palette.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff) ||
      typeof grid.compactedFloorTypesBase64 !== 'string') {
    throw new TypeError('Invalid source-derived native compacted grid');
  }
  let gridCache = decodedGridCache.get(catalog);
  if (!gridCache) {
    gridCache = new Map();
    decodedGridCache.set(catalog, gridCache);
  }
  const key = String(gridId);
  if (gridCache.has(key)) return gridCache.get(key);
  const expectedBytes = Math.ceil(sx * sy * bits / 8);
  const expectedBase64Length = Math.ceil(expectedBytes / 3) * 4;
  if (grid.compactedFloorTypesBase64.length !== expectedBase64Length ||
      expectedBytes !== grid.nativeCompactedByteCount) {
    throw new TypeError('Native compacted grid length mismatch');
  }
  const text = atob(grid.compactedFloorTypesBase64);
  const packed = Uint8Array.from(text, char => char.charCodeAt(0));
  if (packed.length !== expectedBytes) {
    throw new TypeError('Native compacted grid length mismatch');
  }
  const remaining = (sx * sy * bits) % 8;
  if (remaining && (packed[packed.length - 1] & ((1 << (8 - remaining)) - 1))) {
    throw new TypeError('Native compacted grid padding mismatch');
  }
  const observedCounts = countNativePackedPaletteIndices(
    packed, bits, sx * sy, palette.length);
  const entry:PreparedGrid = { kind:'packed',sizeX: sx, sizeY: sy, palette: [...palette], bits,
    packed, observedCounts, evidence: evidence.sampleBasedEncodingEvidence ?? null };
  gridCache.set(key, entry);
  return entry;
}

function previewFloorValue(grid:PreparedGrid,x:number,y:number):number {
  if (grid.kind === 'direct') return grid.values[x * grid.sizeY + y];
  const bitOffset = (x * grid.sizeY + y) * grid.bits;
  const shift = 8 - grid.bits - (bitOffset % 8);
  const index = (grid.packed[bitOffset >> 3] >> shift) & ((1 << grid.bits) - 1);
  if (index >= grid.palette.length) {
    throw new TypeError('Native compacted grid palette index is invalid');
  }
  return grid.palette[index];
}

/**
 * Return a source-corroborated grid-local floor value. Neither this API nor
 * floor masks establish placement permission or world-space origin.
 */
export function getNativeTerrainTile(source:unknown,gridId:string|number,x:number,y:number) {
  const catalog=requireTerrainCatalog(source);
  const grid = packedGridForPreview(catalog, gridId);
  if (grid.status) return { status: grid.status };
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < 0 || y < 0 || x >= grid.sizeX || y >= grid.sizeY) {
    return { status: 'outside_native_grid' };
  }
  const nativeValue = previewFloorValue(grid, x, y);
  return { status: 'source_corroborated_grid_local_preview', x, y, nativeValue,
    ...describeNativeFloorMask(nativeValue),
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false, sampleBasedEncodingEvidence: grid.evidence };
}

/** 2D Y-row-major presentation; bytes themselves are native X-major packed. */
export function getNativeTerrainWindow(source:unknown,gridId:string|number,rect:unknown) {
  const catalog=requireTerrainCatalog(source);
  const grid = packedGridForPreview(catalog, gridId);
  if (grid.status) return { status: grid.status };
  if (!isRecord(rect)) throw new TypeError('Native grid preview rectangle required');
  const { x, y, width, height } = rect as {x:number;y:number;width:number;height:number};
  if (![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 || y < 0 || width <= 0 || height <= 0 ||
      width > 256 || height > 256 ||
      x + width > grid.sizeX || y + height > grid.sizeY) {
    return { status: 'outside_native_grid_or_preview_limit' };
  }
  const rows:number[][] = [];
  for (let yy = y; yy < y + height; yy++) {
    const row:number[] = [];
    for (let xx = x; xx < x + width; xx++) row.push(previewFloorValue(grid, xx, yy));
    rows.push(row);
  }
  return { status: 'source_corroborated_grid_local_preview',
    x, y, width, height, rows,
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false, sampleBasedEncodingEvidence: grid.evidence };
}

/**
 * Count original native terrain palette indices without exposing all 2D cells.
 * The histogram comes from source-packed bytes checked by verify_bundle.py;
 * it is a visual/analytical legend, never placement permission.
 */
export function getNativeTerrainDistribution(source:unknown,gridId:string|number) {
  const catalog=requireTerrainCatalog(source);
  const grid = catalog.grids.get(String(gridId));
  if (!grid) return { status: 'unknown_grid' };
  // Match tile/window provenance gate. Unsupported future builds and
  // legacy unverified 1.26.2 extraction never produce fake histograms.
  if (!hasNativeTerrainReadEvidence(catalog) ||
      grid.terrainDecoding?.status === 'native_packing_not_verified_for_game_version' ||
      grid.terrainDecoding?.status === 'native_json_floor_index_not_verified_for_game_version') {
    return { status: 'native_terrain_packing_not_verified_for_game_version' };
  }
  if (grid.nativeSourceFormat === 'original_json_direct_floor_values') {
    const source = packedGridForPreview(catalog, gridId);
    if (source.status) return { status: source.status };
    if (source.kind !== 'direct') {
      throw new TypeError('Invalid original native direct terrain source');
    }
    // Original JSON provides native raw values, not a native palette.
    // Report distinct masks, not fabricated palette indices or permissions.
    const counts = new Map<number,number>();
    for (const value of source.values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return {
      status: 'source_corroborated_grid_local_summary',
      distributionBasis: 'original_json_direct_floor_values',
      sizeX: source.sizeX, sizeY: source.sizeY,
      totalCells: source.sizeX * source.sizeY,
      worldCoordinatesVerified: false, placementLegalityVerified: false,
      nativeCodeBodyVerified: false,
      values: [...counts].sort(([a], [b]) => a - b)
        .map(([nativeValue, cellCount]) => ({
          nativeValue, cellCount, ...describeNativeFloorMask(nativeValue),
        })),
    };
  }
  if (grid.terrainDecoding?.decoded !== true ||
      grid.terrainDecoding?.packing !== 'x_major_msb_first') {
    return { status: 'unresolved_native_packing' };
  }
  if (grid.terrainDecoding?.nativeCodeBodyVerified !== false ||
      grid.terrainDecoding?.placementLegalityVerified !== false) {
    throw new TypeError('Invalid native terrain histogram provenance');
  }
  const counts = grid.nativePaletteIndexCellCounts;
  const palette = grid.nativeFloorTypePalette;
  const sx = grid.sizeX, sy = grid.sizeY;
  if (counts == null) return { status: 'histogram_not_extracted' };
  if (!Array.isArray(counts) || !Array.isArray(palette) ||
      counts.length !== palette.length || !Number.isSafeInteger(sx) ||
      !Number.isSafeInteger(sy) || sx < 1 || sy < 1 ||
      sx * sy > 16777216 || !counts.every(n => Number.isSafeInteger(n) && n >= 0) ||
      counts.reduce((a, b) => a + b, 0) !== sx * sy) {
    throw new TypeError('Invalid native terrain histogram integrity');
  }
  const source = packedGridForPreview(catalog, gridId);
  if (source.status) return { status: source.status };
  if (source.kind !== 'packed')
    throw new TypeError('Invalid original native compacted terrain source');
  if (source.observedCounts.length !== counts.length ||
      counts.some((count, index) => count !== source.observedCounts[index])) {
    throw new TypeError('Native terrain histogram mismatches packed source bytes');
  }
  return {
    status: 'source_corroborated_grid_local_summary',
    sizeX: sx, sizeY: sy, totalCells: sx * sy,
    worldCoordinatesVerified: false, placementLegalityVerified: false,
    nativeCodeBodyVerified: false,
    values: counts.map((cellCount, index) => ({
      paletteIndex: index, nativeValue: palette[index], cellCount,
      ...describeNativeFloorMask(palette[index]),
    })),
  };
}

