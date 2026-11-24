import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
export const CARDINAL_ORIENTATIONS=['GridOrientation_Up','GridOrientation_Right','GridOrientation_Down','GridOrientation_Left'] as const;
export type Cardinal=typeof CARDINAL_ORIENTATIONS[number];
export function isCardinal(v:unknown):v is Cardinal{return CARDINAL_ORIENTATIONS.some(x=>x===v);}
const int32=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
/** Mirror the source-verified DB-01 type/subtype contract for immediate
 * feedback. The Rust codec independently checks ALL saved records before
 * writing, including ones omitted from this bounded display. */
export function exclusiveAnchorClass(itemId:string):'ground'|'fence'|null{
  const id=Number(itemId);
  if(!Number.isSafeInteger(id)||Math.floor(id/10_000_000)!==4)return null;
  const subtype=Math.floor((id%10_000_000)/100_000);
  return subtype===1?'ground':subtype===7?'fence':null;
}
export function worldTransformEligible(o:SavedShapeObject|null):boolean{
  if(!o||!Number.isSafeInteger(Number(o.itemId))||Number(o.itemId)<=0)return false;
  const exclusive=exclusiveAnchorClass(o.itemId);
  if(exclusive)return o.layer===exclusive;
  return o.shapeKey!==null&&['furniture','surface','landscape'].includes(o.layer);
}
export function exclusiveAnchorConflict(map:SavedShapeMap,o:SavedShapeObject|null,x:unknown,y:unknown):boolean{
  if(!o||!int32(x)||!int32(y)||(x===o.x&&y===o.y))return false;
  const kind=exclusiveAnchorClass(o.itemId);
  return kind!==null&&map.objects.some(other=>other.localOrdinal!==o.localOrdinal&&
    other.localGridOrdinal===o.localGridOrdinal&&other.x===x&&other.y===y&&
    exclusiveAnchorClass(other.itemId)===kind);
}
export function draftSavedMapTransform(o:SavedShapeObject|null,x:number|undefined,y:number|undefined,orientation:string|null){
  if(!o||!worldTransformEligible(o)||!int32(x)||!int32(y))return null;
  const moved=x!==o.x||y!==o.y;
  const turned=orientation!==o.orientation;
  // Preserve exact orientation on road/fence moves until connection/edge semantics are verified.
  if(turned&&(exclusiveAnchorClass(o.itemId)||!isCardinal(o.orientation)||!isCardinal(orientation)))return null;
  if(!moved&&!turned)return null;
  return {localOrdinal:o.localOrdinal,itemId:o.itemId,recordKind:'full' as const,
    expectedX:o.x,expectedY:o.y,replacementX:moved?x:null,replacementY:moved?y:null,
    expectedOrientation:turned?o.orientation:null,replacementOrientation:turned?orientation:null};
}
