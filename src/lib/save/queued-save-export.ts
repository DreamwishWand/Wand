/**
 * The user-facing Save Editor must export every staged change, not just
 * the last individually validated item. A conflicting group fails closed.
 * Diagnostic routes retain access to the lower-level Rust preview modes.
 */
export type QueuedSaveExportMode =
  |'none'|'quantity'|'coordinates'|'mixed'|'combined'
  |'quantity-grid'|'conflict';

export function queuedSaveExportMode(
  quantityCount:number,
  coordinateCount:number,
  mixedCount:number,
  mergedGridCount:number|null,
  quantityGridCount:number|null
):QueuedSaveExportMode{
  const counts=[quantityCount,coordinateCount,mixedCount];
  if(counts.some(count=>!Number.isSafeInteger(count)||count<0||
     count>16))return 'conflict';
  const hasGrid=coordinateCount>0||mixedCount>0;
  if(quantityCount===0&&!hasGrid)return 'none';
  if(hasGrid&&quantityCount>0){
    return quantityGridCount!==null&&
      Number.isSafeInteger(quantityGridCount)&&
      quantityGridCount>0&&quantityGridCount<=16
      ?'quantity-grid':'conflict';
  }
  if(quantityCount>0)return 'quantity';
  if(coordinateCount>0&&mixedCount>0){
    return mergedGridCount!==null&&
      Number.isSafeInteger(mergedGridCount)&&
      mergedGridCount>0&&mergedGridCount<=16
      ?'combined':'conflict';
  }
  // Even one Grid queue must pass the shared local composition
  // check; an invalid ordinal/duplicate cannot fall back to a subset.
  if(quantityGridCount===null||
     !Number.isSafeInteger(quantityGridCount)||
     quantityGridCount<1||quantityGridCount>16)return 'conflict';
  return mixedCount>0?'mixed':'coordinates';
}
