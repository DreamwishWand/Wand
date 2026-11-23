/** Shared on-demand Collection source worker.
 * Acquisition and Quest evidence reuse ONE SHA-pinned DB-00 / DB-03 loader.
 * Never load an owner-private source, a Save, or unverified UI membership. */
import {openPublicSharedGameSources,type PublicSharedGameSources}
  from '../game-db/public-sources.ts';
import {summarizeCollectionAcquisition} from './acquisition-summary.ts';
import {summarizeCollectionQuests} from './quest-evidence.ts';
import type {CollectionEvidenceRequest,CollectionEvidenceReply}
  from './source-evidence-client.ts';

let sources:Promise<PublicSharedGameSources>|null=null;
let activeBase:string|null=null;

function validRequest(raw:unknown):raw is CollectionEvidenceRequest{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return false;
  const r=raw as Partial<CollectionEvidenceRequest>;
  return Number.isSafeInteger(r.requestId)&&(r.requestId??-1)>0&&
    Number.isSafeInteger(r.itemId)&&(r.itemId??0)>0&&
    (r.kind==='acquisition'||r.kind==='quests')&&
    typeof r.basePath==='string'&&
    (r.basePath===''||
      /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(r.basePath));
}
function source(base:string):Promise<PublicSharedGameSources>{
  if(!sources||base!==activeBase){
    activeBase=base;
    sources=openPublicSharedGameSources(base);
  }
  return sources;
}
self.addEventListener('message',(event:MessageEvent<unknown>)=>{
  if(!validRequest(event.data))return;
  const request=event.data;
  void(async()=>{
    try{
      const catalog=await source(request.basePath);
      if(catalog.snapshotId!=='steam-1.26.2-native-itemlist-v1'||
         catalog.database.target.platform!=='Steam'||
         catalog.database.target.gameVersion!=='1.26.2'||
         catalog.hasPrivateGameSource!==false||
         catalog.playerOwnershipVerified!==false)
        throw new Error('COLLECTION_SOURCE_VERSION_MISMATCH');
      if(request.kind==='acquisition'){
        const [evidence,stalls]=await Promise.all([
          catalog.getAllNativeAcquisitionEvidence(request.itemId),
          catalog.acquisition.loadNativeStallSources()
        ]);
        const summary=summarizeCollectionAcquisition(evidence,stalls);
        const reply:CollectionEvidenceReply={
          requestId:request.requestId,kind:request.kind,
          itemId:request.itemId,ok:true,summary
        };
        self.postMessage(reply);
      }else{
        const reader=await catalog.loadNativeQuestSources();
        const summary=summarizeCollectionQuests(reader.getItem(request.itemId),reader);
        const reply:CollectionEvidenceReply={
          requestId:request.requestId,kind:request.kind,
          itemId:request.itemId,ok:true,summary
        };
        self.postMessage(reply);
      }
    }catch{
      // No degraded or partial source-only fallback; allow a new exact retry.
      if(activeBase===request.basePath)sources=null;
      const reply:CollectionEvidenceReply={
        requestId:request.requestId,kind:request.kind,
        itemId:request.itemId,ok:false
      };
      self.postMessage(reply);
    }
  })();
});
