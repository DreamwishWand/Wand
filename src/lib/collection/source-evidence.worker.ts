/** Shared on-demand Collection source worker.
 * Acquisition and Quest evidence reuse ONE SHA-pinned DB-00 / DB-03 loader.
 * Never load an owner-private source, a Save, or unverified UI membership. */
import {openPublicSharedGameSources,type PublicSharedGameSources}
  from '../game-db/public-sources.ts';
import {summarizeCollectionAcquisition} from './acquisition-summary.ts';
import {summarizeCollectionQuests} from './quest-evidence.ts';
import {summarizeCollectionDistribution,type CollectionAcquisitionWithDistribution}
  from './distribution-evidence.ts';
import type {CollectionEvidenceRequest,CollectionEvidenceReply}
  from './source-evidence-client.ts';

import {openCurrentItemDatabase,ITEM_MASTER_LOCALES,type PublicCompleteItemMaster} from '../items/public-item-master.ts';
import {readCollectionConcreteAcquisition} from './concrete-acquisition.ts';
let current:Promise<PublicCompleteItemMaster>|null=null;
let currentBase:string|null=null;
function currentSource(base:string){
  if(!current||currentBase!==base){
    currentBase=base;
    const task=openCurrentItemDatabase(base);
    current=task;void task.catch(()=>{if(current===task)current=null;});
  }
  return current;
}
let sources:Promise<PublicSharedGameSources>|null=null;
let activeBase:string|null=null;

function validRequest(raw:unknown):raw is CollectionEvidenceRequest{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return false;
  const r=raw as Partial<CollectionEvidenceRequest>;
  return Number.isSafeInteger(r.requestId)&&(r.requestId??-1)>0&&
    Number.isSafeInteger(r.itemId)&&(r.itemId??0)>0&&
    (r.kind==='acquisition'||r.kind==='quests'||r.kind==='concrete')&&
    (r.kind==='concrete'?r.locale!==undefined&&ITEM_MASTER_LOCALES.includes(r.locale):r.locale===undefined)&&
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
      if(request.kind==='concrete'){
        if(request.locale===undefined)throw new Error('COLLECTION_SOURCE_LOCALE');
        const summary=await readCollectionConcreteAcquisition(await currentSource(request.basePath),request.itemId,request.locale);
        const reply:CollectionEvidenceReply={requestId:request.requestId,kind:request.kind,itemId:request.itemId,ok:true,summary};
        self.postMessage(reply);return;
      }
      const catalog=await source(request.basePath);
      if(catalog.snapshotId!=='steam-1.26.2-native-itemlist-v1'||
         catalog.database.target.platform!=='Steam'||
         catalog.database.target.gameVersion!=='1.26.2'||
         catalog.hasPrivateGameSource!==false||
         catalog.playerOwnershipVerified!==false)
        throw new Error('COLLECTION_SOURCE_VERSION_MISMATCH');
      if(request.kind==='acquisition'){
        const [evidence,stalls,distribution]=await Promise.all([
          catalog.getAllNativeAcquisitionEvidence(request.itemId),
          catalog.acquisition.loadNativeStallSources(),
          catalog.getItemDistributionEvidence(request.itemId)
        ]);
        const summary:CollectionAcquisitionWithDistribution=Object.freeze({
          ...summarizeCollectionAcquisition(evidence,stalls),
          distribution:summarizeCollectionDistribution(distribution)
        });
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
      if(request.kind==='concrete'){
        if(currentBase===request.basePath)current=null;
      }else if(activeBase===request.basePath)sources=null;
      const reply:CollectionEvidenceReply={
        requestId:request.requestId,kind:request.kind,
        itemId:request.itemId,ok:false
      };
      self.postMessage(reply);
    }
  })();
});
