import {readCollectionOwnership} from '../collection/runtime';
import {sanitizePositiveListInventoryOwnership} from '../collection/saved-list-positive-ownership.mjs';
export interface OwnershipView{available:boolean;ids:ReadonlySet<number>}
export async function readRecordedOwnership():Promise<OwnershipView>{
  return readCollectionOwnership();
}
/** Reuse the same local read-only Save Worker and sanitizer as Collection.
 * No persistence, upload or write-back; stale selection is rejected by caller. */
export function readSelectedOwnership(file:File,signal:AbortSignal):Promise<OwnershipView>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const w=new Worker(new URL('../collection/saved-store.worker.ts',import.meta.url),{type:'module'});
    let done=false;
    const finish=(result?:OwnershipView,error?:unknown)=>{
      if(done)return;done=true;signal.removeEventListener('abort',abort);w.terminate();
      if(result)resolve(result);else reject(error??Error('OWNERSHIP_UNAVAILABLE'));
    };
    const abort=()=>finish(undefined,new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    w.onerror=()=>finish();
    w.onmessageerror=()=>finish();
    w.onmessage=event=>{
      try{
        if(event.data?.kind!=='result')throw Error('SAVE_READ_FAILED');
        const result=sanitizePositiveListInventoryOwnership(event.data.result.positiveOwnership);
        const available=['positive_stock_observed','observed_no_positive_stock','partial_inconclusive'].includes(result.status)&&result.matchedRoles>0;
        finish({available,ids:new Set<number>(result.entries.map((row:{itemId:number})=>row.itemId))});
      }catch(e){finish(undefined,e);}
    };
    void file.arrayBuffer().then(buffer=>{if(!done)w.postMessage({command:'inspect-local-save',bytes:new Uint8Array(buffer)},[buffer]);}).catch(e=>finish(undefined,e));
  });
}
