import type {LocalNativeMap} from './native-local-preview.ts';
export type NativeLandmark={x:number;y:number;worldXZ?:readonly [number,number];reference?:string};
export function nativeLandmarkMeasurement(map:LocalNativeMap,p:NativeLandmark){
 const [a,b,c,d,e,f]=map.ticksToCanvas;
 if(![p.x,p.y,a,b,c,d,e,f].every(Number.isFinite)||a<=0||d<=0||b!==0||c!==0)throw Error('Invalid landmark basis');
 const px=a*p.x+e,py=d*p.y+f;
 if(px<0||py<0||px>map.width||py>map.height)throw Error('Landmark outside map');
 const candidateWorldXZ=[p.x/2,-p.y/2] as const;
 if(!p.worldXZ)return {editorTicks:[p.x,p.y],canvasPixels:[px,py],candidateWorldXZ};
 if(!p.worldXZ.every(Number.isFinite)||p.worldXZ.length!==2||!p.reference?.trim()||p.reference.length>200)throw Error('Independent source reference required');
 const expected=[2*a*p.worldXZ[0]+e,-2*d*p.worldXZ[1]+f] as const;
 const dx=px-expected[0],dy=py-expected[1];
 if(![...expected,dx,dy,dx/a,dy/d,Math.hypot(dx/a,dy/d)].every(Number.isFinite))throw Error('Invalid reference coordinate');
 return {editorTicks:[p.x,p.y],canvasPixels:[px,py],candidateWorldXZ,reference:p.reference.trim(),observedWorldXZ:p.worldXZ,expectedCanvasPixels:expected,residualPixels:[dx,dy],residualHalfWorldTicks:[dx/a,dy/d],distanceHalfWorldTicks:Math.hypot(dx/a,dy/d)};
}
export async function nativeLandmarkReport(map:LocalNativeMap,locked:boolean,points:readonly NativeLandmark[]){
 const bytes=new TextEncoder().encode(JSON.stringify(map));
 const mapPlanSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 return {schema:'wand.media.native-map-landmark-evidence@1',platform:'Steam',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,runtimeMarkerAnchorVerified:false,mapId:map.id,mapPlanSha256,mapSize:[map.width,map.height],ticksToCanvas:map.ticksToCanvas,state:locked?'locked':'unlocked',measurements:points.map(p=>nativeLandmarkMeasurement(map,p))};
}

export type NativeLandmarkSession=ReadonlyMap<string,readonly NativeLandmark[]>;
export function nativeLandmarkSessionKey(mapId:string,locked:boolean){return mapId+':'+(locked?'locked':'unlocked');}
export function setNativeLandmarks(session:NativeLandmarkSession,map:LocalNativeMap,locked:boolean,points:readonly NativeLandmark[]):NativeLandmarkSession{
 if(points.length>512)throw Error('Too many map measurements');
 points.forEach(p=>nativeLandmarkMeasurement(map,p));
 const next=new Map(session),key=nativeLandmarkSessionKey(map.id,locked);
 if(points.length)next.set(key,[...points]);else next.delete(key);
 return next;
}
export async function nativeLandmarkSessionReport(maps:readonly LocalNativeMap[],session:NativeLandmarkSession){
 const reports=[];
 for(const map of maps)for(const locked of [false,true]){
  const points=session.get(nativeLandmarkSessionKey(map.id,locked));
  if(points?.length)reports.push(await nativeLandmarkReport(map,locked,points));
 }
 if(!reports.length)throw Error('No map measurements');
 const measured=reports.flatMap(r=>r.measurements.flatMap(p=>typeof p.distanceHalfWorldTicks==='number'?[p.distanceHalfWorldTicks]:[]));
 return {schema:'wand.media.native-map-landmark-session@1',platform:'Steam',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,runtimeMarkerAnchorVerified:false,
  mapCount:new Set(reports.map(r=>r.mapId)).size,measurementCount:reports.reduce((n,r)=>n+r.measurements.length,0),
  referencedCount:measured.length,maxResidualHalfWorldTicks:measured.length?Math.max(...measured):null,
  rmsResidualHalfWorldTicks:measured.length?Math.hypot(...measured)/Math.sqrt(measured.length):null,reports};
}
