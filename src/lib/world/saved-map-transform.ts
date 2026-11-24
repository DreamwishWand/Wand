import type {SavedShapeObject} from './saved-shape-map.ts';
export const CARDINAL_ORIENTATIONS=['GridOrientation_Up','GridOrientation_Right','GridOrientation_Down','GridOrientation_Left'] as const;
export type Cardinal=typeof CARDINAL_ORIENTATIONS[number];
export function isCardinal(v:unknown):v is Cardinal{return CARDINAL_ORIENTATIONS.some(x=>x===v);}
const int32=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
export function worldTransformEligible(o:SavedShapeObject|null):boolean{
  // Until the structural road/fence writer guard is implemented, do not
  // offer edits to those categories or unclassified records in this view.
  return !!o&&o.shapeKey!==null&&['furniture','surface','landscape'].includes(o.layer)&&
    Number.isSafeInteger(Number(o.itemId))&&Number(o.itemId)>0;
}
export function draftSavedMapTransform(o:SavedShapeObject|null,x:number,y:number,orientation:string|null){
  if(!o||!worldTransformEligible(o)||!int32(x)||!int32(y))return null;
  const moved=x!==o.x||y!==o.y;
  const turned=orientation!==o.orientation;
  if(turned&&(!isCardinal(o.orientation)||!isCardinal(orientation)))return null;
  if(!moved&&!turned)return null;
  return {localOrdinal:o.localOrdinal,itemId:o.itemId,recordKind:'full' as const,
    expectedX:o.x,expectedY:o.y,replacementX:moved?x:null,replacementY:moved?y:null,
    expectedOrientation:turned?o.orientation:null,replacementOrientation:turned?orientation:null};
}
