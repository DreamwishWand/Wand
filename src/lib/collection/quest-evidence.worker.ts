/** Opt-in, SHA-verified DB-00 Quest reverse links, isolated from UI. */
import {openPublicSharedGameSources,type PublicSharedGameSources}
  from '../game-db/public-sources.ts';
import {summarizeCollectionQuests} from './quest-evidence.ts';
import type {CollectionQuestSummary} from './quest-evidence.ts';

interface Request {
  readonly requestId:number;
  readonly itemId:number;
  readonly basePath:string;
}
type Reply=
  | Readonly<{requestId:number;itemId:number;ok:true;summary:CollectionQuestSummary}>
  | Readonly<{requestId:number;itemId:number;ok:false}>;

let sources:Promise<PublicSharedGameSources>|null=null;
let activeBase:string|null=null;
function validRequest(raw:unknown):raw is Request{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return false;
  const r=raw as Partial<Request>;
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
      const db=await sources;
      if(db.snapshotId!=='steam-1.26.2-native-itemlist-v1'||
         db.database.target.platform!=='Steam'||
         db.database.target.gameVersion!=='1.26.2')
        throw new Error('COLLECTION_QUEST_VERSION_MISMATCH');
      const reader=await db.loadNativeQuestSources();
      const summary=summarizeCollectionQuests(
        reader.getItem(request.itemId),reader
      );
      const reply:Reply={requestId:request.requestId,itemId:request.itemId,
        ok:true,summary};
      self.postMessage(reply);
    }catch{
      // Incomplete or stale source bytes must not be rendered as empty results.
      sources=null;
      const reply:Reply={requestId:request.requestId,itemId:request.itemId,ok:false};
      self.postMessage(reply);
    }
  })();
});
