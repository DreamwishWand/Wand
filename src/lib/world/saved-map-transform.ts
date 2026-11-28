import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
export const CARDINAL_ORIENTATIONS=['GridOrientation_Up','GridOrientation_Right','GridOrientation_Down','GridOrientation_Left'] as const;
export type Cardinal=typeof CARDINAL_ORIENTATIONS[number];
export function isCardinal(v:unknown):v is Cardinal{return CARDINAL_ORIENTATIONS.some(x=>x===v);}
export const EIGHT_WAY_ORIENTATIONS=['GridOrientation_Up','GridOrientation_UpRight','GridOrientation_Right','GridOrientation_DownRight','GridOrientation_Down','GridOrientation_DownLeft','GridOrientation_Left','GridOrientation_UpLeft'] as const;
export type EightWay=typeof EIGHT_WAY_ORIENTATIONS[number];
export function isEightWay(v:unknown):v is EightWay{return EIGHT_WAY_ORIENTATIONS.some(x=>x===v);}
export function worldOrientationCode(v:unknown):number|null{return isEightWay(v)?EIGHT_WAY_ORIENTATIONS.indexOf(v)*2:null;}
export function eightWayFurniture(o:SavedShapeObject|null):boolean{return !!o&&!o.subgrid&&!o.storage&&!o.storageKnown&&(o.layer==='furniture'||o.layer==='surface')&&Math.floor(Number(o.itemId)/100000)===400&&o.shapeKey!==null;}
export function worldOrientationAllowed(o:SavedShapeObject|null,v:unknown,free=false):v is EightWay{return isCardinal(v)||free&&eightWayFurniture(o)&&isEightWay(v);}
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
function worldTransformKindEligible(o:SavedShapeObject|null,free=false):boolean{
  if(!o||!Number.isSafeInteger(Number(o.itemId))||Number(o.itemId)<=0)return false;
  // A resolved support root and a validated storage pose can use the same
  // coordinate transaction. The codec rechecks native ownership and references.
  if(o.subgrid)return free&&o.subgrid.status==='resolved_full'&&o.shapeKey!==null&&isCardinal(o.orientation)&&!exclusiveAnchorClass(o.itemId)&&!o.storageKnown;
  if(o.storageKnown&&!o.storage)return false;
  const exclusive=exclusiveAnchorClass(o.itemId);
  if(exclusive)return o.layer===exclusive;
  if(o.nativeType==='Building'){
    // Only source-confirmed on-grid Building types with known cardinal geometry.
    // Off-grid scenes and unresolved geometry are never transform candidates.
    const id=Number(o.itemId),subtype=Math.floor((id%10_000_000)/100_000);
    return Math.floor(id/10_000_000)===2&&[0,1,2,3,5].includes(subtype)&&o.shapeKey!==null&&isCardinal(o.orientation);
  }
  return o.shapeKey!==null&&['furniture','surface','landscape'].includes(o.layer);
}
export function worldMoveEligible(o:SavedShapeObject|null,free=false):boolean{
  return worldTransformKindEligible(o,free)&&(free&&!exclusiveAnchorClass(o!.itemId)||!nativeActionBlocked(o?.editRestrictions,'select')&&!nativeActionBlocked(o?.editRestrictions,'move')&&(o?.nativeType!=='Building'||o.editRestrictions?.move==='allowedFlag'));
}
export function worldRotateEligible(o:SavedShapeObject|null,free=false):boolean{
  return worldTransformKindEligible(o,free)&&!exclusiveAnchorClass(o!.itemId)&&worldOrientationAllowed(o,o!.orientation,free)&&
    (free||!nativeActionBlocked(o?.editRestrictions,'select')&&!nativeActionBlocked(o?.editRestrictions,'rotate')&&(o?.nativeType!=='Building'||o.editRestrictions?.rotate==='allowedFlag'));
}
export function worldTransformEligible(o:SavedShapeObject|null,free=false):boolean{
  return worldMoveEligible(o,free)||worldRotateEligible(o,free);
}
export function exclusiveAnchorConflict(map:SavedShapeMap,o:SavedShapeObject|null,x:unknown,y:unknown):boolean{
  if(!o||!int32(x)||!int32(y)||(x===o.x&&y===o.y))return false;
  const kind=exclusiveAnchorClass(o.itemId);
  return kind!==null&&map.objects.some(other=>other.localOrdinal!==o.localOrdinal&&
    other.localGridOrdinal===o.localGridOrdinal&&other.x===x&&other.y===y&&
    exclusiveAnchorClass(other.itemId)===kind);
}
export function draftSavedMapTransform(o:SavedShapeObject|null,x:number|undefined,y:number|undefined,orientation:string|null,free=false){
  if(!o||!worldTransformEligible(o,free)||!int32(x)||!int32(y))return null;
  const moved=x!==o.x||y!==o.y;
  const turned=orientation!==o.orientation;
  // Preserve exact orientation on road/fence moves until connection/edge semantics are verified.
  if(moved&&!worldMoveEligible(o,free))return null;
  if(turned&&(!worldRotateEligible(o,free)||!worldOrientationAllowed(o,orientation,free)))return null;
  if(!moved&&!turned)return null;
  return {localOrdinal:o.localOrdinal,itemId:o.itemId,recordKind:'full' as const,
    expectedX:o.x,expectedY:o.y,replacementX:moved?x:null,replacementY:moved?y:null,
    expectedOrientation:turned?o.orientation:null,replacementOrientation:turned?orientation:null};
}
