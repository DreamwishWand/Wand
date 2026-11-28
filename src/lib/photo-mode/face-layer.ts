import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
import {expressionParameters,validCurve,sampleScalar,type Curve,type ExpressionWeights} from './expression-weights.ts';
import type {RigOverride,RigPath} from './rig-sampler.ts';
export type FaceBody='male'|'female';
export const faceNumbers=[0,1,2,3,4,5,6] as const;
export type FaceNumber=typeof faceNumbers[number];
const names=['face_center_bashful_smile_01','face_center_cocky_look_01','face_center_cocky_smile_01','face_center_happy_grin_01','face_center_happy_grin_02','face_center_happy_wink_01','face_center_scary_01'] as const;
type FaceAsset={sourceSha256:string;asset:BlobEntry};
export type FaceLayerIndex=Record<FaceBody,FaceAsset[]>;
type FaceTrack={path:string;attribute:1|2|3;curves:Curve[]};
type FaceLayer={body:FaceBody;number:FaceNumber;name:string;sourceSha256:string;start:number;duration:number;loop:boolean;tracks:FaceTrack[];parameters:Partial<Record<typeof expressionParameters[number],Curve>>};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=(body:FaceBody)=>body==='female'?115:96;
function check(x:unknown,m:string):asserts x{if(!x)throw Error(m)}
export function validFaceLayerIndex(x:unknown):x is FaceLayerIndex{
 if(!x||typeof x!=='object'||Object.keys(x).length!==2)return false;
 const v=x as FaceLayerIndex;
 return (['male','female'] as const).every(b=>Array.isArray(v[b])&&v[b].length===7&&new Set(v[b].map(r=>r?.sourceSha256)).size===7&&v[b].every(r=>r&&hash(r.sourceSha256)&&r.asset&&hash(r.asset.sha256)&&Number.isSafeInteger(r.asset.bytes)&&r.asset.bytes>0&&r.asset.bytes<=1024*1024));
}
export function parseFaceLayer(raw:ArrayBuffer,body:FaceBody,number:FaceNumber,sourceSha256:string):FaceLayer{
 const c=JSON.parse(new TextDecoder().decode(raw)) as FaceLayer;
 check(c&&c.body===body&&c.number===number&&c.name===names[number]&&c.sourceSha256===sourceSha256&&hash(sourceSha256)&&c.start===0&&finite(c.duration)&&c.duration>6&&c.duration<7&&c.loop===true,'Invalid native face layer identity');
 check(Array.isArray(c.tracks)&&c.tracks.length===count(body),'Invalid face layer count');
 const seen=new Set<string>();
 for(const t of c.tracks){
  check(t&&typeof t.path==='string'&&t.path.startsWith('root/')&&t.path.length<=512&&(t.path.includes('/Bip001 Head/')||body==='female'&&t.path==='root/bn_shape_value')&&[1,2,3].includes(t.attribute)&&Array.isArray(t.curves)&&t.curves.length===(t.attribute===2?4:3)&&t.curves.every(validCurve),'Invalid face track');
  const key=t.path+':'+t.attribute;check(!seen.has(key),'Duplicate face track');seen.add(key)
 }
 check(c.parameters&&typeof c.parameters==='object'&&Object.keys(c.parameters).length===(body==='female'?5:0)&&Object.entries(c.parameters).every(([k,v])=>expressionParameters.includes(k as typeof expressionParameters[number])&&validCurve(v)),'Invalid face layer weights');
 return c
}
/** Original full-weight normal facial mask; body tracks, neck/head orientation,
 * companion and prop are untouched. No runtime transition emulation. */
export function bindFaceLayer(c:FaceLayer,nodePaths:readonly (string|undefined)[]){
 const lut=new Map<string,number>();
 for(const [i,path] of nodePaths.entries()){if(path===undefined)continue;check(!lut.has(path)||!c.tracks.some(t=>t.path===path),'Ambiguous player face path');lut.set(path,i)}
 const tracks=c.tracks.map(t=>{const node=lut.get(t.path);check(node!==undefined,'Missing native face path: '+t.path);const path:RigPath=t.attribute===1?'translation':t.attribute===2?'rotation':'scale';return {...t,node,kind:path}});
 function time(t:number){check(finite(t)&&t>=0,'Invalid facial time');return c.start+(t%c.duration)}
 return {
  sample(t:number):RigOverride[]{const at=time(t);return tracks.map(tr=>{const value=tr.curves.map(v=>sampleScalar(v,at));check(value.every(finite),'Nonfinite facial transform');if(tr.kind==='translation')value[0]*=-1;else if(tr.kind==='rotation'){value[1]*=-1;value[2]*=-1;const len=Math.hypot(...value);check(len>1e-8,'Invalid facial quaternion');for(let i=0;i<4;i++)value[i]/=len}return {node:tr.node,path:tr.kind,value}})},
  weights(t:number):ExpressionWeights{const at=time(t),v=expressionParameters.map(k=>c.parameters[k]?sampleScalar(c.parameters[k]!,at)/100:0);check(v.every(finite),'Nonfinite face weight');return v as unknown as ExpressionWeights}
 }
}
