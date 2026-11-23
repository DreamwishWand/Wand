/** One lazily created Collection Worker shared by both inspector panels.
 * This is UI transport/cache only; exact game-source verification stays in
 * the Worker and the independently validated DB-00/02/03 readers. */
import type {CollectionAcquisitionSummary} from './acquisition-summary.ts';
import type {CollectionQuestSummary} from './quest-evidence.ts';

export type CollectionEvidenceKind='acquisition'|'quests';
export interface CollectionEvidenceRequest {
  readonly requestId:number;
  readonly kind:CollectionEvidenceKind;
  readonly itemId:number;
  readonly basePath:string;
}
type Summary=CollectionAcquisitionSummary|CollectionQuestSummary;
export type CollectionEvidenceReply=
  | Readonly<Omit<CollectionEvidenceRequest,'basePath'> & {
      ok:true;summary:CollectionAcquisitionSummary|CollectionQuestSummary;
    }>
  | Readonly<Omit<CollectionEvidenceRequest,'basePath'> & {ok:false}>;

export interface CollectionSourceWorker {
  onmessage:((event:MessageEvent<CollectionEvidenceReply>)=>void)|null;
  onerror:((event:Event)=>void)|null;
  postMessage(message:CollectionEvidenceRequest):void;
  terminate():void;
}
export interface CollectionEvidenceHandle {
  loadAcquisition(itemId:number,basePath:string):
    Promise<CollectionAcquisitionSummary>;
  loadQuests(itemId:number,basePath:string):
    Promise<CollectionQuestSummary>;
  release():void;
}
interface Pending {
  readonly key:string;
  readonly kind:CollectionEvidenceKind;
  readonly itemId:number;
  resolve:(value:Summary)=>void;
  reject:(error:Error)=>void;
}
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

function isSummary(raw:unknown,kind:CollectionEvidenceKind,id:number):
  raw is Summary{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return false;
  const s=raw as Record<string,unknown>;
  if(s.itemId!==id||s.staticSourceOnly!==true)return false;
  return kind==='acquisition'
    ?Array.isArray(s.kinds)&&Array.isArray(s.candidates)&&
      s.availabilityVerified===false&&s.ownershipVerified===false
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
         message.ok!==true||!isSummary(message.summary,entry.kind,entry.itemId)){
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
  function load(kind:CollectionEvidenceKind,itemId:number,basePath:string):
    Promise<Summary>{
    if(!Number.isSafeInteger(itemId)||itemId<=0||
       typeof basePath!=='string'||
       (basePath!==''&&!BASE.test(basePath)))
      return Promise.reject(new TypeError('COLLECTION_SOURCE_REQUEST_INVALID'));
    const key=basePath+'|'+kind+'|'+itemId;
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
    pending.set(requestId,{key,kind,itemId,resolve,reject});
    inflight.set(key,result);
    try{running.postMessage({requestId,kind,itemId,basePath});}
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
      function request(kind:CollectionEvidenceKind,id:number,base:string):
        Promise<Summary>{
        if(released)return Promise.reject(new Error('COLLECTION_SOURCE_HANDLE_RELEASED'));
        return load(kind,id,base);
      }
      return {
        loadAcquisition:(id,base)=>request('acquisition',id,base) as
          Promise<CollectionAcquisitionSummary>,
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
