/**
 * DB-05 UI-only composition of staged saved-Grid edit receipts.
 *
 * Native Save identity, optimistic source validation, and P1G writing stay
 * exclusively inside Rust/WASM. This helper never infers terrain/world
 * coordinates or authorizes placement. It only merges unambiguous local
 * ordinal drafts before the existing Rust mixed-batch Worker validates them.
 */
export interface QueuedGridCoordinateEdit {
  readonly localOrdinal:number;
  readonly itemId:string;
  readonly recordKind:'full'|'diff_modified';
  readonly expectedX:number;
  readonly expectedY:number;
  readonly replacementX:number;
  readonly replacementY:number;
}
export type GridCardinal=
  'GridOrientation_Up'|'GridOrientation_Right'|
  'GridOrientation_Down'|'GridOrientation_Left';
export interface QueuedGridMixedEdit {
  readonly localOrdinal:number;
  readonly itemId:string;
  readonly recordKind:'full'|'diff_modified';
  readonly expectedX:number;
  readonly expectedY:number;
  readonly replacementX:number|null;
  readonly replacementY:number|null;
  readonly expectedOrientation:GridCardinal|null;
  readonly replacementOrientation:GridCardinal|null;
}

/**
 * Two separate queues become ONE atomic Rust mixed batch (max 16 targets).
 * If the same saved local ordinal is present twice, merge only when the
 * mixed entry is orientation-only and its original identity/position matches
 * the coordinate entry. Competing coordinate destinations are ambiguous and
 * are rejected rather than silently overriding the user's earlier edit.
 */
export function combineSavedGridQueues(
  coordinates:readonly QueuedGridCoordinateEdit[],
  mixed:readonly QueuedGridMixedEdit[]
):QueuedGridMixedEdit[]|null{
  if(!Array.isArray(coordinates)||!Array.isArray(mixed)||
     !coordinates.length||!mixed.length||
     coordinates.length>16||mixed.length>16)return null;
  const result:QueuedGridMixedEdit[]=[];
  const index=new Map<number,number>();
  for(const edit of coordinates){
    if(!Number.isSafeInteger(edit.localOrdinal)||edit.localOrdinal<1||
       index.has(edit.localOrdinal))return null;
    index.set(edit.localOrdinal,result.length);
    result.push({
      ...edit,expectedOrientation:null,replacementOrientation:null
    });
  }
  const mixedSeen=new Set<number>();
  for(const edit of mixed){
    if(!Number.isSafeInteger(edit.localOrdinal)||edit.localOrdinal<1||
       mixedSeen.has(edit.localOrdinal))return null;
    mixedSeen.add(edit.localOrdinal);
    const existingIndex=index.get(edit.localOrdinal);
    if(existingIndex===undefined){
      index.set(edit.localOrdinal,result.length);
      result.push({...edit});
      if(result.length>16)return null;
      continue;
    }
    const previous=result[existingIndex];
    if(edit.replacementX!==null||edit.replacementY!==null||
       edit.expectedOrientation===null||edit.replacementOrientation===null||
       previous.itemId!==edit.itemId||
       previous.recordKind!==edit.recordKind||
       previous.expectedX!==edit.expectedX||
       previous.expectedY!==edit.expectedY)return null;
    result[existingIndex]={
      ...previous,expectedOrientation:edit.expectedOrientation,
      replacementOrientation:edit.replacementOrientation
    };
  }
  return result.length<=16?result:null;
}

/**
 * Compose all staged Grid edits for the separate quantity+Grid transaction.
 * Unlike combineSavedGridQueues, a single nonempty Grid queue is sufficient
 * when it is joined with a nonempty quantity batch. No native IDs are used.
 */
export function gridEditsForQuantityExport(
  coordinates:readonly QueuedGridCoordinateEdit[],
  mixed:readonly QueuedGridMixedEdit[]
):QueuedGridMixedEdit[]|null{
  if(!Array.isArray(coordinates)||!Array.isArray(mixed)||
     coordinates.length>16||mixed.length>16||
     (!coordinates.length&&!mixed.length))return null;
  if(coordinates.length&&mixed.length)
    return combineSavedGridQueues(coordinates,mixed);
  if(mixed.length){
    const seen=new Set<number>();
    for(const edit of mixed){
      if(!Number.isSafeInteger(edit.localOrdinal)||edit.localOrdinal<1||
         seen.has(edit.localOrdinal))return null;
      seen.add(edit.localOrdinal);
    }
    return mixed.map(edit=>({...edit}));
  }
  const seen=new Set<number>();
  const result:QueuedGridMixedEdit[]=[];
  for(const edit of coordinates){
    if(!Number.isSafeInteger(edit.localOrdinal)||edit.localOrdinal<1||
       seen.has(edit.localOrdinal))return null;
    seen.add(edit.localOrdinal);
    result.push({...edit,expectedOrientation:null,
      replacementOrientation:null});
  }
  return result;
}
