import {supportAreaEligible,type SupportAreaTrees} from './biome-furniture-preset.ts';
import {captureSupportScene,supportSceneRootCounts,type SupportScene} from './support-scene.ts';
import {parseSupportTree} from './subgrid-local.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
/** Shared local read and geometry preflight. Cancellation closes the private
 * Save worker and detaches all listeners from the shared terrain worker. */
function response(worker:Worker,send:unknown,match:(d:any)=>boolean,signal:AbortSignal,owned=false):Promise<any>{
 return new Promise((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;
  const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',receive);worker.removeEventListener('error',cancel);worker.removeEventListener('messageerror',cancel);signal.removeEventListener('abort',cancel);if(owned)worker.terminate();};
  const cancel=()=>{cleanup();reject(Error('SUPPORT_READ'));};
  const receive=(e:MessageEvent)=>{if(!match(e.data))return;cleanup();resolve(e.data);};
  timer=setTimeout(cancel,30000);
  if(signal.aborted){cancel();return;}
  signal.addEventListener('abort',cancel,{once:true});worker.addEventListener('message',receive);worker.addEventListener('error',cancel);worker.addEventListener('messageerror',cancel);
  try{worker.postMessage(send);}catch{cancel();}
 });
}
export async function validateAreaSupportTrees(worker:Worker,scenes:Iterable<SupportScene>,nextRequest:()=>number,signal:AbortSignal){
 for(const scene of scenes){
  if([...supportSceneRootCounts(scene).values()].reduce((n,v)=>n+v,0)>32)throw Error('SUPPORT_LIMIT');
  const requestId=nextRequest(),d=await response(worker,{command:'support-scene-geometry',requestId,scene},d=>d?.requestId===requestId,signal);
  if(d?.kind!=='support-scene-geometry'||d.valid!==true)throw Error('SUPPORT_GEOMETRY');
 }
}
export async function readAreaSupportTrees(file:File,objects:readonly MainlandSavedObject[],terrain:Worker,nextRequest:()=>number,signal:AbortSignal):Promise<SupportAreaTrees>{
 const parents=objects.filter(supportAreaEligible).map(p=>({localOrdinal:p.object.localOrdinal,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y}));
 const out=new Map<number,SupportScene>();
 if(new Set(parents.map(p=>p.localOrdinal)).size!==parents.length)throw Error('SUPPORT_SCOPE');
 for(let i=0;i<parents.length;i+=128){
  const batch=parents.slice(i,i+128),worker=new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'});
  const d=await response(worker,{command:'inspect-subgrids',file,parents:batch},()=>true,signal,true);
  if(d?.kind!=='subgrids-local'||!Array.isArray(d.results)||d.results.length!==batch.length)throw Error('SUPPORT_READ');
  for(const p of batch){
   const result=d.results.find((r:any)=>r?.localOrdinal===p.localOrdinal)?.result;
   const scene=captureSupportScene(p.itemId,parseSupportTree(result));if(!scene)throw Error('SUPPORT_READ');
   out.set(p.localOrdinal,scene);
  }
 }
 await validateAreaSupportTrees(terrain,out.values(),nextRequest,signal);
 return out;
}
export const supportAreaWords={
 ja:['支持家具・小物も含める','通常家具・支持家具・小物・道・フェンスを置換します。建物・進行関連物・未対応の階層は保持します。'],
 en:['Include support furniture and contents','Replace ordinary furniture, support furniture, contents, roads and fences. Buildings, progression objects and unsupported hierarchies remain.'],
 fr:['Inclure supports et objets','Remplace meubles, supports, objets, chemins et clôtures. Bâtiments, progression et structures non prises en charge sont conservés.'],
 it:['Includi supporti e oggetti','Sostituisce mobili, supporti, oggetti, sentieri e recinzioni. Edifici, progressione e strutture non supportate restano.'],
 de:['Auflagen und Inhalt einschließen','Ersetzt Möbel, Auflagen, Inhalt, Wege und Zäune. Gebäude, Fortschrittsobjekte und nicht unterstützte Strukturen bleiben.'],
 'es-ES':['Incluir soportes y objetos','Sustituye muebles, soportes, objetos, caminos y vallas. Conserva edificios, progreso y estructuras no compatibles.'],
 'zh-CN':['包含支撑家具和物品','替换普通家具、支撑家具、物品、道路和围栏。保留建筑、进度相关物品和不支持的层级。'],
 'pt-BR':['Incluir suportes e objetos','Substitui móveis, suportes, objetos, caminhos e cercas. Construções, progresso e estruturas incompatíveis permanecem.']
} as const;
