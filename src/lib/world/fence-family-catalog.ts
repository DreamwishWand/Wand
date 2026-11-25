import raw from './fence-family-candidates.json';
type FenceFamily={name:string;base:number;ext:readonly number[];diagExt:readonly number[]};
export const fenceFamilyCandidates:readonly FenceFamily[]=raw.map(row=>{
 const [name,base,ext,diagExt]=row as [string,number,number[],number[]];
 return {name,base,ext,diagExt};
});
export function fenceFamily(id:number){return fenceFamilyCandidates.find(f=>f.base===id);}
