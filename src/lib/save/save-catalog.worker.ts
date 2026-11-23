/**
 * Read-only DB-00 item labels for DB-05's owned-slot selector. The remote
 * requests fetch ONLY immutable public DB-00 shards, never local Save bytes,
 * user-owned quantities or dynamic URLs containing saved item IDs.
 * This Worker must not grant editing permissions or DLC entitlements.
 */
import {loadCurrentGameDatabase} from '../game-db/client.ts';
import {matchSaveItemIdsToDb00,type Db00SaveSnapshot,
  type Db00SaveLookup} from './common-db-context';

type Reply =
  | {kind:'error'}
  | {kind:'resolved';contract:'wand.db05.db00-visible-item-mapping@1';
      lookup:Db00SaveLookup;editPermissionFromDb:false};
interface WorkerScope {
  onmessage:((event:MessageEvent<unknown>)=>Promise<void>)|null;
  postMessage:(reply:Reply)=>void;
  close:()=>void;
}
const scope=self as unknown as WorkerScope;
const positiveId=(id:unknown):id is string=>
  typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id)&&
  BigInt(id)<=18446744073709551615n;
let started=false;
scope.onmessage=async ({data})=>{
  if(started)return;
  started=true;
  let response:Reply={kind:'error'};
  try{
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).sort().join(',')!=='base,command,ids')
      throw new TypeError('DB05_DB00_REQUEST_INVALID');
    const input=data as {base:unknown;command:unknown;ids:unknown};
    if(input.command!=='resolve-db00-item-ids'||
       typeof input.base!=='string'||
       !/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(input.base)||
       !Array.isArray(input.ids)||input.ids.length>20000||
       !input.ids.every(positiveId))
      throw new TypeError('DB05_DB00_REQUEST_INVALID');
    // The existing DB-00 client verifies the active pointer + every
    // release index/shard hash and schema. Do not reimplement DB-00.
    const source=await loadCurrentGameDatabase(input.base);
    if(source.kind!=='db_snapshot')throw new TypeError('DB05_DB00_NOT_READY');
    const ids=[...new Set(input.ids as string[])];
    const lookup=matchSaveItemIdsToDb00(
      ids,source as unknown as Db00SaveSnapshot
    );
    response={kind:'resolved',contract:'wand.db05.db00-visible-item-mapping@1',
      lookup,editPermissionFromDb:false};
  }catch{
    // Missing catalog is never a reason to reject an editor action.
    // Do not forward dynamic error messages or potentially private inputs.
  }
  scope.postMessage(response);
  scope.close();
};
