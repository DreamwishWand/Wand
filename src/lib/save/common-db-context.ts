/**
 * DB-05 read-only Item ID metadata bridge.
 * Reuse DB-00 publication and DB-01..04 source-qualified clients; never infer
 * Save ownership, editing rights, DLC entitlement, quest completion or caps.
 * This bridge does NOT parse or rewrite save data.
 */
import type { Db01CatalogClient } from '../items/index.ts';
import type { Db01Db02Join } from '../items/db02-join.ts';
import type { Db01QuestReferenceClient } from '../items/db03-evidence.ts';
import type { Db01WorldEvidenceClient } from '../items/db04-evidence.ts';

export interface Db00SaveItem {
  readonly id:string;
  readonly names:Readonly<Record<string,string>>;
  readonly nameStatus?:string;
  readonly category?:string|null;
  readonly nativeCategory?:string|null;
  readonly contentIds?:readonly string[];
}
export interface Db00SaveSnapshot {
  readonly kind:'db_snapshot';
  readonly id:string;
  readonly target:{readonly platform:string;readonly gameVersion:string|null};
  readonly coverage:{readonly complete:boolean;readonly semanticCategoriesVerified?:boolean};
  readonly items:readonly Db00SaveItem[];
}
export type Db00ItemContext={
  readonly itemId:string;
  readonly match:'current_db00'|'not_in_db00_snapshot'|'not_in_partial_db00_snapshot';
  readonly name:string|null;
  readonly nameVerified:boolean;
  readonly category:string|null;
  readonly nativeCategory:string|null;
  readonly contentIds:readonly string[];
  readonly dlcOwnershipVerified:false;
  readonly editingAllowedByCatalog:false;
};
export interface Db00SaveLookup {
  readonly catalogSnapshot:string;
  readonly gameVersion:string|null;
  readonly catalogComplete:boolean;
  readonly rows:readonly Db00ItemContext[];
}
const isId=(x:unknown):x is string=>typeof x==='string'&&
  /^[1-9][0-9]{0,19}$/.test(x)&&
  BigInt(x)<=18446744073709551615n;
const validText=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&
  x.length<=300 && !/[\x00-\x1f]/.test(x);
function nameOf(names:Readonly<Record<string,string>>):string|null{
  for(const locale of ['ja','en','fr','de']){
    const value=names[locale];
    if(validText(value))return value;
  }
  return null;
}

/** DB-00 receives only public snapshot reads; no save file, amount or identifiers
 * other than the limited item definition keys used locally for matching.
 */
export function matchSaveItemIdsToDb00(
  itemIds:readonly string[],snapshot:Db00SaveSnapshot
):Db00SaveLookup{
  if(!snapshot||snapshot.kind!=='db_snapshot'||!Array.isArray(snapshot.items)||
     !snapshot.target||!snapshot.coverage||typeof snapshot.id!=='string'||
     !Array.isArray(itemIds)||itemIds.length>20000||
     itemIds.some(id=>!isId(id)))
    throw new TypeError('DB05_DB00_LOOKUP_INVALID');
  const seen=new Set(itemIds);
  const byId=new Map<string,Db00SaveItem>();
  for(const item of snapshot.items){
    if(isId(item.id)&&seen.has(item.id))byId.set(item.id,item);
  }
  const rows=itemIds.map((itemId):Db00ItemContext=>{
    const item=byId.get(itemId);
    if(!item)return Object.freeze({
      itemId,match:snapshot.coverage.complete?'not_in_db00_snapshot':
        'not_in_partial_db00_snapshot',
      name:null,nameVerified:false,category:null,nativeCategory:null,
      contentIds:Object.freeze([]),dlcOwnershipVerified:false,
      editingAllowedByCatalog:false
    });
    return Object.freeze({
      itemId,match:'current_db00',name:nameOf(item.names),
      nameVerified:item.nameStatus==='verified',
      category:validText(item.category)?item.category:null,
      nativeCategory:validText(item.nativeCategory)?item.nativeCategory:null,
      contentIds:Object.freeze((item.contentIds??[]).filter(validText)),
      dlcOwnershipVerified:false,editingAllowedByCatalog:false
    });
  });
  return Object.freeze({
    catalogSnapshot:snapshot.id,gameVersion:snapshot.target.gameVersion,
    catalogComplete:snapshot.coverage.complete,rows:Object.freeze(rows)
  });
}

export interface VerifiedSaveOverlayClients {
  readonly db01?:Db01CatalogClient;
  readonly db02?:Db01Db02Join;
  readonly db03?:Db01QuestReferenceClient;
  readonly db04?:Db01WorldEvidenceClient;
}
export interface SaveItemStaticEvidence {
  readonly itemId:string;
  readonly db01NativeCategory:string|null;
  readonly db01JapaneseName:string|null;
  readonly db02AcquisitionPathCount:number|null;
  readonly db02PossibleShopCount:number|null;
  readonly db03QuestReferenceCount:number|null;
  readonly db04NativeCategory:string|null;
  readonly db04Footprint:Readonly<{x:number;y:number}>|null;
  readonly sourceGameVersion:string|null;
  readonly saveWritingAuthorized:false;
  readonly questCompletionVerified:false;
  readonly placementLegalityVerified:false;
  readonly dlcOwnershipVerified:false;
}
/**
 * Optional evidence from DB-01..04. Every producer must already have verified
 * source hashes/versions. No private source is auto-fetched or republished.
 * Mismatching source versions are left unresolved; they NEVER veto editing.
 */
export async function resolveSaveItemStaticEvidence(
  itemId:string,clients:VerifiedSaveOverlayClients
):Promise<SaveItemStaticEvidence>{
  if(!isId(itemId))throw new TypeError('DB05_ITEM_ID_INVALID');
  const numeric=Number(itemId);
  const validNumber=Number.isSafeInteger(numeric);
  if(!validNumber)return Object.freeze({
    itemId,db01NativeCategory:null,db01JapaneseName:null,
    db02AcquisitionPathCount:null,db02PossibleShopCount:null,
    db03QuestReferenceCount:null,db04NativeCategory:null,
    db04Footprint:null,sourceGameVersion:null,
    saveWritingAuthorized:false,questCompletionVerified:false,
    placementLegalityVerified:false,dlcOwnershipVerified:false
  });
  const referenceVersion=clients.db01?.source.gameVersion ?? null;
  const compatible=(other:string|null|undefined)=>
    referenceVersion===null || other===referenceVersion;
  const db01=clients.db01?await clients.db01.getItem(numeric):null;
  const db02=clients.db02&&compatible(clients.db02.source.gameVersion)
    ?await clients.db02.getItem(numeric):null;
  const db03=clients.db03&&
    compatible(clients.db03.source.db01GameVersion)&&
    compatible(clients.db03.source.guideGameVersion)
    ?await clients.db03.getForItem(numeric):null;
  const db04=clients.db04&&
    compatible(clients.db04.source.db01GameVersion)&&
    compatible(clients.db04.source.worldGameVersion)
    ?await clients.db04.getItem(numeric):null;
  const acquired=db02?.staticAcquisition;
  return Object.freeze({
    itemId,
    db01NativeCategory:db01?.nativeCategory??null,
    db01JapaneseName:db01?.names.ja??null,
    db02AcquisitionPathCount:Array.isArray(acquired?.acquisitionPaths)
      ?acquired.acquisitionPaths.length:null,
    db02PossibleShopCount:Array.isArray(acquired?.shopOffers)
      ?acquired.shopOffers.length:null,
    db03QuestReferenceCount:db03?.length??null,
    db04NativeCategory:db04?.nativeCategory??null,
    db04Footprint:db04?.footprint
      ?Object.freeze({x:db04.footprint.sizeX,y:db04.footprint.sizeY})
      :null,
    sourceGameVersion:referenceVersion,
    saveWritingAuthorized:false,questCompletionVerified:false,
    placementLegalityVerified:false,dlcOwnershipVerified:false
  });
}
