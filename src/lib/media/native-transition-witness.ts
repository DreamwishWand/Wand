import type {LocalNativeMap} from './native-local-preview.ts';
export type TransitionWitness={component:string;name:string;worldXZ:readonly [number,number];reference:string};
export type TransitionWitnessMap={sceneSha256:string;sceneCab:string;points:readonly (TransitionWitness&{canvasXY:readonly [number,number]})[]};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const pathId=(v:unknown):v is string=>typeof v==='string'&&/^-?\d{1,20}$/.test(v);
const vec=(v:unknown,n:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
export function parseTransitionWitnesses(doc:unknown):ReadonlyMap<string,TransitionWitnessMap>{
 check(object(doc)&&doc.schema==='wand.src04.native-map-transition-witnesses@1'&&doc.privateOnly===true&&doc.publicationAuthorized===false&&doc.worldPlacementVerified===false&&doc.runtimeMarkerAnchorVerified===false&&Array.isArray(doc.maps)&&doc.maps.length===10,'Invalid private transition witness file');
 const result=new Map<string,TransitionWitnessMap>();
 for(const row of doc.maps){
  check(object(row)&&typeof row.prefab==='string'&&/^MapVillage[A-Za-z0-9]+$/.test(row.prefab)&&!result.has(row.prefab)&&typeof row.sceneSha256==='string'&&/^[a-f0-9]{64}$/.test(row.sceneSha256)&&typeof row.sceneCab==='string'&&/^CAB-[a-f0-9]{32}$/.test(row.sceneCab)&&Array.isArray(row.points)&&row.points.length<=512,'Invalid transition scene');
  const ids=new Set<string>();
  const points=row.points.map(p=>{
   check(object(p)&&pathId(p.component)&&!ids.has(p.component)&&pathId(p.gameObject)&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=256&&vec(p.worldXYZ,3)&&vec(p.candidateCanvasXY,2)&&Array.isArray(p.identityAncestors)&&p.identityAncestors.length<=128&&p.identityAncestors.every(pathId),'Invalid transition point');
   ids.add(p.component);
   return {component:p.component,name:p.name,worldXZ:[p.worldXYZ[0],p.worldXYZ[2]] as const,canvasXY:[p.candidateCanvasXY[0],p.candidateCanvasXY[1]] as const,reference:'VillageAreaTransition '+row.sceneSha256+' / '+row.sceneCab+' / '+p.component};
  });
  result.set(row.prefab,{sceneSha256:row.sceneSha256,sceneCab:row.sceneCab,points});
 }
 return result;
}
/** Check that a local witness file uses the same candidate transform, not that the transform is correct. */
export function witnessesForMap(map:LocalNativeMap,doc:ReadonlyMap<string,TransitionWitnessMap>):readonly TransitionWitness[]{
 const entry=doc.get(map.id);if(!entry)return [];
 const [a,b,c,d,e,f]=map.ticksToCanvas;
 check([a,b,c,d,e,f].every(Number.isFinite)&&a>0&&d>0&&b===0&&c===0,'Invalid map basis');
 for(const p of entry.points){
  const [x,z]=p.worldXZ,px=2*a*x+e,py=-2*d*z+f;
  check(Number.isFinite(px)&&Number.isFinite(py)&&Math.abs(px-p.canvasXY[0])<=1e-5&&Math.abs(py-p.canvasXY[1])<=1e-5&&px>=0&&py>=0&&px<=map.width&&py<=map.height,'Transition witness candidate mismatch');
 }
 return entry.points;
}
export async function readTransitionWitnesses(file:File){
 check(file.size>0&&file.size<=2*1024*1024,'Transition witness file exceeds limit');
 return parseTransitionWitnesses(JSON.parse(await file.text()));
}
