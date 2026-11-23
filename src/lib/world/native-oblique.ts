// Source-pinned Steam v1.26.1 GridArea.MoreRotationGetGridLocalPosition.
// Original x64 RVA 0x3923D80..0x3923FDB, SHA-256:
// befff8088fb717e1cef8501fb9c66b956f4e54fff24e8067a325ed493477ad9b
// This is ONLY the 1:1 caller/area tessellation specialization.
 // Shared TypeScript source geometry used by both legacy 1.26.1 catalog
 // reads and verified 1.26.2 source-local GridArea views. No Save writer,
 // collision resolver, or placement authority lives here.
// Returning a source GridArea cell is NOT object placement authorization.

export const GRIDAREA_ROT_COS:readonly number[] = Object.freeze([
  -100, -92, -71, -38, 0, 38, 71, 92,
  100, 92, 71, 38, 0, -38, -71, -92,
]);
export const GRIDAREA_ROT_SIN:readonly number[] = Object.freeze([
  0, 38, 71, 92, 100, 92, 71, 38,
  0, -38, -71, -92, -100, -92, -71, -38,
]);
const CARDINAL = new Set([0, 4, 8, 12]);

export type ObliqueGridAreaCell =
  | Readonly<{
      orientedSizeX:number;
      orientedSizeY:number;
      inside:false;
      status:'outside_original_oriented_gridarea'|'outside_original_gridarea';
    }>
  | Readonly<{
      orientedSizeX:number;
      orientedSizeY:number;
      inside:true;
      status:'source_correlated_noncardinal_local_position';
      originalLocalX:number;
      originalLocalY:number;
      originalFlatIndex:number;
    }>;
/** v1.26.1 and v1.26.2 code-verified noncardinal LOCAL mapping (factor 1). */
export function nativeObliqueSourceLocalPosition(
  sizeX:number,sizeY:number,x:number,y:number,orientationCode:number
):ObliqueGridAreaCell {
  if (![sizeX, sizeY, x, y, orientationCode].every(Number.isSafeInteger) ||
      sizeX < 1 || sizeY < 1 || sizeX > 256 || sizeY > 256 ||
      sizeX * sizeY > 16384 ||
      x < -2147483648 || x > 2147483647 ||
      y < -2147483648 || y > 2147483647 ||
      orientationCode < 0 || orientationCode > 15 ||
      CARDINAL.has(orientationCode)) {
    throw new TypeError('Invalid native oblique GridArea position/shape');
  }
  const cos = GRIDAREA_ROT_COS[orientationCode];
  const sin = GRIDAREA_ROT_SIN[orientationCode];
  const sizeXRotated = Math.trunc(
    (Math.imul(Math.abs(cos), sizeX) +
     Math.imul(Math.abs(sin), sizeY)) / 100);
  const sizeYRotated = Math.trunc(
    (Math.imul(Math.abs(cos), sizeY) +
     Math.imul(Math.abs(sin), sizeX)) / 100);
  const sizes = {orientedSizeX: sizeXRotated, orientedSizeY: sizeYRotated};
  if (x < 0 || y < 0 || x >= sizeXRotated || y >= sizeYRotated) {
    return Object.freeze({ ...sizes, inside: false as const, status: 'outside_original_oriented_gridarea' as const });
  }
  // Original native x86 signed int32 IMUL: center each cell at 100*x+50,
  // subtract half the oriented rectangle, inverse-rotate with EACH product
  // truncated /100, then add half the source rectangle. Final /100 occurs
  // only for NONNEGATIVE coordinates.
  const cx = (Math.imul(x, 100) + 50 - Math.imul(sizeXRotated, 50)) | 0;
  const cy = (Math.imul(y, 100) + 50 - Math.imul(sizeYRotated, 50)) | 0;
  const ux = (Math.trunc(Math.imul(cx, cos) / 100) +
    Math.trunc(Math.imul(cy, sin) / 100) + Math.imul(sizeX, 50)) | 0;
  const uy = (Math.trunc(Math.imul(cy, cos) / 100) -
    Math.trunc(Math.imul(cx, sin) / 100) + Math.imul(sizeY, 50)) | 0;
  if (ux < 0 || uy < 0) {
    return Object.freeze({ ...sizes, inside: false as const, status: 'outside_original_gridarea' as const });
  }
  const originalLocalX = Math.trunc(ux / 100);
  const originalLocalY = Math.trunc(uy / 100);
  if (originalLocalX >= sizeX || originalLocalY >= sizeY) {
    return { ...sizes, inside: false, status: 'outside_original_gridarea' };
  }
  return Object.freeze({
    ...sizes, inside: true as const, status: 'source_correlated_noncardinal_local_position' as const,
    originalLocalX, originalLocalY,
    originalFlatIndex: originalLocalX * sizeY + originalLocalY,
  });
}
