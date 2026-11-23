/** DB-00 acquisition reads are opt-in and isolated from the Collection UI.
 * Game sources are always loaded from public SHA-verified releases. */
import {openPublicSharedGameSources,type PublicSharedGameSources}
  from '../game-db/public-sources.ts';
import {summarizeCollectionAcquisition}
  from './acquisition-summary.ts';
import type {CollectionAcquisitionSummary}
  from './acquisition-summary.ts';

interface Request {readonly requestId:number;readonly itemId:number;readonly basePath:string}
type Reply=
  | Readonly<{requestId:number;itemId:number;ok:true;summary:CollectionAcquisitionSummary}>
  | Readonly<{requestId:number;itemId:number;ok:false}>;

let sources:Promise<PublicSharedGameSources>|null=null;
let activeBase:string|null=null;
function validRequest(input:unknown):input is Request{
  if(input===null||typeof input!=='object'||Array.isArray(input))return false;
  const r=input as Partial<Request>;
  return Number.isSafeInteger(r.requestId)&&(r.requestId??-1)>=0&&
    Number.isSafeInteger(r.itemId)&&(r.itemId??0)>0&&
    typeof r.basePath==='string'&&
    (r.basePath===''||/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(r.basePath));
}
self.addEventListener('message',(event:MessageEvent<unknown>)=>{
  if(!validRequest(event.data))return;
  const request=event.data;
  void(async()=>{
    try{
      if(sources===null||activeBase!==request.basePath){
        activeBase=request.basePath;
        sources=openPublicSharedGameSources(request.basePath);
      }
      const catalog=await sources;
      if(catalog.snapshotId!=='steam-1.26.2-native-itemlist-v1'||
         catalog.database.target.platform!=='Steam'||
         catalog.database.target.gameVersion!=='1.26.2')
        throw new Error('COLLECTION_ACQUISITION_VERSION_MISMATCH');
      const [evidence,stalls]=await Promise.all([
        catalog.getAllNativeAcquisitionEvidence(request.itemId),
        catalog.acquisition.loadNativeStallSources()
      ]);
      const summary=summarizeCollectionAcquisition(evidence,stalls);
      const reply:Reply={requestId:request.requestId,itemId:request.itemId,
        ok:true,summary};
      self.postMessage(reply);
    }catch{
      // A failed fetch must be retryable; never fall back to unverified sources.
      sources=null;
      const reply:Reply={requestId:request.requestId,itemId:request.itemId,ok:false};
      self.postMessage(reply);
    }
  })();
});
