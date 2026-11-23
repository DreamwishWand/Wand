/**
 * UI-only draft for quarter-turning observed saved integer Grid coordinates.
 * This is not a native-world transform, legal placement, or Save writer.
 * Rust/WASM must independently re-resolve and optimistically verify every
 * source object before any separate-copy export.
 */
export type GridQuarterTurnDirection='clockwise'|'counterclockwise';
export type GridCardinalOrientation=
  'GridOrientation_Up'|'GridOrientation_Right'|
  'GridOrientation_Down'|'GridOrientation_Left';

export interface GridQuarterTurnSource {
  readonly localOrdinal:number;
  readonly localGridOrdinal:number;
  readonly itemId:string;
  readonly recordKind:'full'|'diff_modified';
  readonly coordinatesObserved:boolean;
  readonly x:number|null;
  readonly y:number|null;
  readonly orientation:string|null;
}
export interface GridQuarterTurnDraft {
  readonly localOrdinal:number;
  readonly itemId:string;
  readonly recordKind:'full'|'diff_modified';
  readonly expectedX:number;
  readonly expectedY:number;
  readonly replacementX:number|null;
  readonly replacementY:number|null;
  readonly expectedOrientation:GridCardinalOrientation;
  readonly replacementOrientation:GridCardinalOrientation;
}
const cardinals:readonly GridCardinalOrientation[]=[
  'GridOrientation_Up','GridOrientation_Right',
  'GridOrientation_Down','GridOrientation_Left'
];
const MIN=-2147483648,MAX=2147483647;
const int32=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&
  value>=MIN&&value<=MAX;
function cardinalIndex(value:unknown):number {
  return cardinals.findIndex(candidate=>candidate===value);
}
/** The chosen selected object is the fixed pivot; Y grows down on this map. */
export function draftGridGroupQuarterTurn(
  sources:readonly GridQuarterTurnSource[],
  direction:GridQuarterTurnDirection,
  pivotOrdinal?:number
):readonly GridQuarterTurnDraft[]|null {
  if(!Array.isArray(sources)||sources.length<2||sources.length>16||
     (direction!=='clockwise'&&direction!=='counterclockwise'))return null;
  const first=sources[0];
  if(!first||!int32(first.x)||!int32(first.y)||
     !Number.isSafeInteger(first.localGridOrdinal))return null;
  const ids=new Set<number>();
  for(const row of sources){
    if(!row||row.localGridOrdinal!==first.localGridOrdinal||
       !Number.isSafeInteger(row.localOrdinal)||row.localOrdinal<1||
       ids.has(row.localOrdinal)||!row.coordinatesObserved||
       !int32(row.x)||!int32(row.y)||
       cardinalIndex(row.orientation)<0)return null;
    ids.add(row.localOrdinal);
  }
  // Explicit pivots must refer to a selected ordinal. Never silently rotate
  // about a different point when a stale/foreign ordinal is supplied.
  const pivot=pivotOrdinal===undefined?first:
    sources.find(row=>row.localOrdinal===pivotOrdinal);
  if(!pivot||!int32(pivot.x)||!int32(pivot.y))return null;
  const sign=direction==='clockwise'?1:-1;
  const result:GridQuarterTurnDraft[]=[];
  for(const row of sources){
    // The above guard establishes original integer coordinates and orientation.
    const x=row.x as number,y=row.y as number;
    const dx=x-pivot.x,dy=y-pivot.y;
    const newX=pivot.x-sign*dy,newY=pivot.y+sign*dx;
    if(!int32(newX)||!int32(newY))return null;
    const current=cardinalIndex(row.orientation);
    result.push({
      localOrdinal:row.localOrdinal,itemId:row.itemId,
      recordKind:row.recordKind,expectedX:x,expectedY:y,
      replacementX:newX===x&&newY===y?null:newX,
      replacementY:newX===x&&newY===y?null:newY,
      expectedOrientation:cardinals[current],
      replacementOrientation:cardinals[(current+sign+4)%4]
    });
  }
  return result;
}
