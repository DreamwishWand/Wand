/** One lazily created Collection Worker shared by both inspector panels.
 * This is UI transport/cache only; exact game-source verification stays in
 * the Worker and the independently validated DB-00/02/03 readers. */
import type {CollectionQuestSummary} from './quest-evidence.ts';
import type {CollectionAcquisitionWithDistribution}
  from './distribution-evidence.ts';

import type {CollectionConcreteAcquisition} from './concrete-acquisition.ts';
import type {ItemMasterLocale} from '../items/public-item-master.ts';

export type CollectionEvidenceKind='acquisition'|'quests'|'concrete';
export interface CollectionEvidenceRequest {
  readonly requestId:number;
  readonly kind:CollectionEvidenceKind;
  readonly itemId:number;
  readonly basePath:string;
  readonly locale?:ItemMasterLocale;
}
type Summary=CollectionAcquisitionWithDistribution|CollectionQuestSummary|CollectionConcreteAcquisition;
export type CollectionEvidenceReply=
  | Readonly<Omit<CollectionEvidenceRequest,'basePath'> & {
      ok:true;summary:Summary;
    }>
  | Readonly<Omit<CollectionEvidenceRequest,'basePath'> & {ok:false}>;

export interface CollectionSourceWorker {
  onmessage:((event:MessageEvent<CollectionEvidenceReply>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  postMessage(message:CollectionEvidenceRequest):void;
  terminate():void;
}
export interface CollectionEvidenceHandle {
  loadAcquisition(itemId:number,basePath:string):
    Promise<CollectionAcquisitionWithDistribution>;
  loadConcreteAcquisition(itemId:number,basePath:string,locale:ItemMasterLocale):Promise<CollectionConcreteAcquisition>;
  loadQuests(itemId:number,basePath:string):
    Promise<CollectionQuestSummary>;
  release():void;
}
interface Pending {
  readonly key:string;
  readonly kind:CollectionEvidenceKind;
  readonly itemId:number;
  readonly locale?:ItemMasterLocale;
  resolve:(value:Summary)=>void;
  reject:(error:Error)=>void;
}
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

const LOCALES:readonly ItemMasterLocale[]=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
function isSummary(raw:unknown,kind:CollectionEvidenceKind,id:number,locale?:ItemMasterLocale):
  raw is Summary{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return false;
  const s=raw as Record<string,unknown>;
  if(s.itemId!==id)return false;
  if(kind==='concrete')return s.locale===locale&&[s.configuredNames,s.candidateNames].every(v=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.trim().length>0));
  if(s.staticSourceOnly!==true)return false;
  const d=s.distribution as Record<string,unknown>|undefined;
  return kind==='acquisition'
    ?Array.isArray(s.kinds)&&Array.isArray(s.candidates)&&
      s.availabilityVerified===false&&s.ownershipVerified===false&&
      d!==null&&typeof d==='object'&&d.itemId===id&&
      d.sourceCoverageComplete===false&&
      d.exclusiveLimitedItemVerified===false&&
      d.currentAvailabilityVerified===false&&
      d.playerOwnershipVerified===false&&
      d.collectionUiMembershipVerified===false&&
      Array.isArray(d.groups)&&d.groups.every(row=>
        row&&typeof row==='object'&&
        ['ordinary_gameplay','gameplay_time_condition','real_world_distribution']
          .includes(row.group)&&Array.isArray(row.proofs)&&
        row.proofs.length>0&&row.proofs.every((proof:unknown)=>
          ['configured_item_id_link','native_source_category',
           'configured_route_unverified','name_only_candidate'].includes(String(proof))))
    :Array.isArray(s.targets)&&Array.isArray(s.rewards)&&
      s.mandatoryRequirementVerified===false&&
      s.guaranteedRewardVerified===false&&s.playerProgressVerified===false;
}

/** Factory is testable with a fake Worker; module default is browser-only. */
export function createCollectionEvidencePool(makeWorker:()=>CollectionSourceWorker){
  let worker:CollectionSourceWorker|null=null;
  let refs=0;
  let nextRequest=0;
  const pending=new Map<number,Pending>();
  const inflight=new Map<string,Promise<Summary>>();
  const cache=new Map<string,Summary>();

  function rejectAll(reason:string):void{
    const failed=[...pending.values()];
    pending.clear();
    inflight.clear();
    for(const entry of failed)entry.reject(new Error(reason));
  }
  function abort(reason:string):void{
    const current=worker;
    worker=null;
    if(current){
      current.onmessage=null;
      current.onerror=null;
      current.terminate();
    }
    rejectAll(reason);
  }
  function ensureWorker():CollectionSourceWorker{
    if(worker)return worker;
    const created=makeWorker();
    created.onmessage=(event:MessageEvent<CollectionEvidenceReply>)=>{
      const message=event.data;
      const entry=message&&pending.get(message.requestId);
      if(!entry)return;
      pending.delete(message.requestId);
      inflight.delete(entry.key);
      if(message.kind!==entry.kind||message.itemId!==entry.itemId||
         message.ok!==true||!isSummary(message.summary,entry.kind,entry.itemId,entry.locale)){
        entry.reject(new Error('COLLECTION_SOURCE_EVIDENCE_MISMATCH'));
        return;
      }
      cache.set(entry.key,message.summary);
      entry.resolve(message.summary);
    };
    created.onerror=()=>abort('COLLECTION_SOURCE_WORKER_FAILED');
    worker=created;
    return created;
  }
  function load(kind:CollectionEvidenceKind,itemId:number,basePath:string,locale?:ItemMasterLocale):
    Promise<Summary>{
    if(!Number.isSafeInteger(itemId)||itemId<=0||
       typeof basePath!=='string'||
       (basePath!==''&&!BASE.test(basePath))||
       (kind==='concrete'?locale===undefined||!LOCALES.includes(locale):locale!==undefined))
      return Promise.reject(new TypeError('COLLECTION_SOURCE_REQUEST_INVALID'));
    const key=basePath+'|'+kind+'|'+itemId+'|'+(locale??'');
    const cached=cache.get(key);
    if(cached)return Promise.resolve(cached);
    const previous=inflight.get(key);
    if(previous)return previous;
    let running:CollectionSourceWorker;
    try{running=ensureWorker();}
    catch{return Promise.reject(new Error('COLLECTION_SOURCE_WORKER_UNAVAILABLE'));}
    const requestId=++nextRequest;
    let resolve!: (value:Summary)=>void;
    let reject!: (error:Error)=>void;
    const result=new Promise<Summary>((r,j)=>{resolve=r;reject=j;});
    pending.set(requestId,{key,kind,itemId,locale,resolve,reject});
    inflight.set(key,result);
    try{running.postMessage({requestId,kind,itemId,basePath,...(locale?{locale}:{})});}
    catch{
      pending.delete(requestId);
      inflight.delete(key);
      reject(new Error('COLLECTION_SOURCE_WORKER_SEND_FAILED'));
    }
    return result;
  }
  return {
    acquire():CollectionEvidenceHandle {
      refs++;
      let released=false;
      function request(kind:CollectionEvidenceKind,id:number,base:string,locale?:ItemMasterLocale):
        Promise<Summary>{
        if(released)return Promise.reject(new Error('COLLECTION_SOURCE_HANDLE_RELEASED'));
        return load(kind,id,base,locale);
      }
      return {
        loadAcquisition:(id,base)=>request('acquisition',id,base) as
          Promise<CollectionAcquisitionWithDistribution>,
        loadConcreteAcquisition:(id,base,locale)=>request('concrete',id,base,locale) as Promise<CollectionConcreteAcquisition>,
        loadQuests:(id,base)=>request('quests',id,base) as
          Promise<CollectionQuestSummary>,
        release:()=>{
          if(released)return;
          released=true;
          refs--;
          if(refs===0){
            abort('COLLECTION_SOURCE_INSPECTOR_DESTROYED');
            cache.clear();
          }
        }
      };
    }
  };
}

const shared=createCollectionEvidencePool(()=>new Worker(
  new URL('./source-evidence.worker.ts',import.meta.url),
  {type:'module'}
));
export const acquireCollectionEvidenceClient=()=>shared.acquire();
