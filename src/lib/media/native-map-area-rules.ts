import type {Layer,Color} from './native-map-renderer.ts';
export type AreaRule={readonly areas:readonly number[];readonly alpha:readonly (number|null)[]};
export type AreaPlan={readonly areaTypes:readonly number[];readonly areaRules:readonly AreaRule[]};
function check(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function selectNativeAreaLayers(base:readonly Layer[],plan:AreaPlan,states:ReadonlyMap<number,boolean>):Layer[]{
 check(plan.areaTypes.every(id=>typeof states.get(id)==='boolean')&&states.size===plan.areaTypes.length,'Explicit area states required');
 return plan.areaRules.flatMap((r,i)=>{
  const index=r.areas.reduce((n,id,j)=>n+(states.get(id)?2**j:0),0),alpha=r.alpha[index];
  return alpha===null?[]:[{...base[i],rgba:[...base[i].rgba.slice(0,3),alpha] as unknown as Color}];
 });
}
export function parseNativeAreaRules(raw:Record<string,unknown>,locked:readonly Layer[],unlocked:readonly Layer[]):AreaPlan{
 const {areaTypes,areaRules}=raw;
 check(Array.isArray(areaTypes)&&areaTypes.length<=16&&areaTypes.every((id,i)=>Number.isSafeInteger(id)&&id>=0&&id<=0xffffffff&&(i===0||id>areaTypes[i-1])),'Invalid area types');
 check(Array.isArray(areaRules)&&areaRules.length===locked.length,'Invalid area rule coverage');
 const rules:AreaRule[]=areaRules.map(r=>{
  check(record(r)&&Array.isArray(r.areas)&&r.areas.length<=8&&r.areas.every((id,i)=>areaTypes.includes(id)&&(i===0||id>(r.areas as number[])[i-1]))&&Array.isArray(r.alpha)&&r.alpha.length===2**r.areas.length&&r.alpha.every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1),'Invalid area rule');
  return {areas:r.areas as number[],alpha:r.alpha as (number|null)[]};
 });
 const plan={areaTypes:areaTypes as number[],areaRules:rules};
 for(const [state,expected] of [[true,locked],[false,unlocked]] as const){
  const actual=selectNativeAreaLayers(locked,plan,new Map(plan.areaTypes.map(id=>[id,state])));
  check(JSON.stringify(actual)===JSON.stringify(expected),'Area rule endpoint mismatch');
 }
 return plan;
}
