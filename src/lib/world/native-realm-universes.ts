/**
 * DB-04 WorldData.UniverseTagItemId -> DB-01 native Tag definition join.
 *
 * This is an exact original-source relationship between Realm WorldData and
 * a Tag definition. A Realm's Disney universe is NOT a DLC entitlement,
 * Collection item origin, acquisition world, placement rule or UI category.
 * Original village layouts have no native WorldData UniverseTagItemId; we
 * never manufacture an id for them from an expansion path/filename.
 *
 * The caller loads both private, version-pinned indices locally. No network
 * requests, source file writes, game bytes or Save uploads occur here.
 */
import type {Db01CatalogClient,Db01Item} from '../items/index.ts';
import {WorldReferenceIndex,type WorldIdentity} from './reference-graph.ts';

export const DB04_REALM_UNIVERSE_JOIN =
  'wand.db04.realm-universe-tag-join@1' as const;
export const DB04_REALM_UNIVERSE_PROOF =
  'protoDb.Worlds.WorldData.universeTagItemId_to_itemlist.Tag.ID' as const;

export interface Db04RealmUniverseEvidence {
  readonly contract:typeof DB04_REALM_UNIVERSE_JOIN;
  readonly worldId:string;
  readonly sourceWorld:WorldIdentity|null;
  readonly status:'source_native_verified'|'unverified';
  readonly universeTagItemId:number|null;
  readonly universeTagKey:string|null;
  readonly originalTagDefinitionSha256:string|null;
  readonly sourceProof:typeof DB04_REALM_UNIVERSE_PROOF|null;
  readonly originalRealmTagLinkVerified:boolean;
  readonly originalTagDefinitionVerified:boolean;
  readonly gameUiUniverseGroupingVerified:false;
  readonly collectionItemWorldVerified:false;
  readonly itemAcquisitionWorldVerified:false;
  readonly playerSaveLocationVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly completeGameWorldCoverageVerified:false;
}

export interface Db04RealmUniversePage {
  readonly contract:typeof DB04_REALM_UNIVERSE_JOIN;
  readonly status:'source_native_verified'|'unverified';
  readonly universeTagItemId:number;
  readonly universeTagKey:string|null;
  readonly sourceWorlds:readonly WorldIdentity[];
  readonly totalSourceRealmWorlds:number;
  readonly offset:number;
  readonly limit:number;
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly completeGameWorldCoverageVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly gameUiUniverseGroupingVerified:false;
}

export interface Db04RealmUniverseGroup {
  readonly tagItemId:number;
  readonly tagKey:string;
  readonly originalTagDefinitionSha256:string;
  readonly sourceRealmWorldIds:readonly string[];
  readonly sourceWorldSubsetOnly:true;
  readonly completeGameWorldCoverageVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}

export interface Db04RealmUniverseClient {
  readonly contract:typeof DB04_REALM_UNIVERSE_JOIN;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:string;
    worldManifestSha256:string;
    db01NativeManifestSha256:string;
    db01SourceItemsSha256:string;
    privateOnly:true;
    publicationAuthorized:false;
    completeGameWorldCoverageVerified:false;
    allContentPacksVerified:false;
  }>;
  getWorld(worldId:string):Promise<Db04RealmUniverseEvidence>;
  byNativeUniverseTag(tagItemId:number,
    page?:Readonly<{offset:number;limit:number}>):Promise<Db04RealmUniversePage>;
  listNativeUniverseTags():Promise<readonly Db04RealmUniverseGroup[]>;
}
const SHA=/^[a-f0-9]{64}$/;
const NAME=/^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const goodId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(value:unknown,reason:string):asserts value{
  if(!value)throw new TypeError('DB04_REALM_UNIVERSE_'+reason);
}
function checkedPage(value:unknown):{offset:number;limit:number}{
  check(obj(value)&&nonnegative(value.offset)&&nonnegative(value.limit)&&
    value.limit>=1&&value.limit<=512,'INVALID_PAGE');
  return {offset:value.offset,limit:value.limit};
}
/** Only native Realm WorldData may carry original universe Tag references. */
function validWorld(world:WorldIdentity):boolean{
  const id=world.nativeUniverseTagItemId;
  return id===null||
    (goodId(id)&&world.worldIdKind==='nativeWorldName'&&
     world.worldType==='realm');
}
function validOriginalTag(value:Db01Item|null,id:number):value is Db01Item{
  return value!==null&&value.itemId===id&&value.nativeCategory==='Tag'&&
    value.catalogDomain==='definition_unclassified'&&
    NAME.test(value.nativeKey)&&SHA.test(value.sourceSha256);
}

/** DB-00/Guide/Save/Collection can share this without any game source in Git. */
export function createDb04RealmUniverseClient(
  world:WorldReferenceIndex,db01:Db01CatalogClient
):Db04RealmUniverseClient{
  check(world instanceof WorldReferenceIndex,'WORLD_SOURCE_REQUIRED');
  check(db01?.source?.platform==='Steam'&&
    db01.source.privateOnly===true &&
    db01.source.gameVersion===world.target.gameVersion &&
    SHA.test(db01.source.nativeSourceManifestSha256) &&
    SHA.test(db01.source.sourceItemsSha256) &&
    typeof db01.getItem==='function' &&
    typeof db01.getItems==='function','DB01_PRIVATE_EXACT_SOURCE_REQUIRED');
  const all=world.listSourceWorlds();
  check(all.every(validWorld),'INVALID_ORIGINAL_WORLD_TAG_IDENTITY');
  const availableIds=[...new Set(all.map(w=>w.nativeUniverseTagItemId)
    .filter(goodId))].sort((a,b)=>a-b);
  const knownIds=new Set(availableIds);
  const resolved=new Map<number,Promise<Readonly<Db01Item>>>();
  function definition(id:number):Promise<Readonly<Db01Item>>{
    const existing=resolved.get(id);
    if(existing)return existing;
    const task=(async()=>{
      const result=await db01.getItem(id);
      check(validOriginalTag(result,id),'NATIVE_TAG_DEFINITION_IDENTITY');
      return Object.freeze({...result});
    })();
    resolved.set(id,task);
    task.catch(()=>{if(resolved.get(id)===task)resolved.delete(id);});
    return task;
  }
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:world.target.gameVersion,
    worldManifestSha256:world.target.nativeWorldManifestSha256,
    db01NativeManifestSha256:db01.source.nativeSourceManifestSha256,
    db01SourceItemsSha256:db01.source.sourceItemsSha256,
    privateOnly:true as const,publicationAuthorized:false as const,
    completeGameWorldCoverageVerified:false as const,
    allContentPacksVerified:false as const
  });
  return Object.freeze({
    contract:DB04_REALM_UNIVERSE_JOIN,source,
    async getWorld(worldId:string):Promise<Db04RealmUniverseEvidence>{
      check(typeof worldId==='string'&&worldId.length>0&&
        worldId.length<=512,'INVALID_WORLD_ID');
      const value=world.getWorld(worldId);
      check(value===null||validWorld(value),'INVALID_ORIGINAL_WORLD_TAG_IDENTITY');
      const tagId=value?.nativeUniverseTagItemId??null;
      const tag=tagId===null?null:await definition(tagId);
      const verified=value!==null&&tag!==null;
      return Object.freeze({
        contract:DB04_REALM_UNIVERSE_JOIN,
        worldId,sourceWorld:value,
        status:verified?'source_native_verified' as const:'unverified' as const,
        universeTagItemId:tagId,universeTagKey:tag?.nativeKey??null,
        originalTagDefinitionSha256:tag?.sourceSha256??null,
        sourceProof:verified?DB04_REALM_UNIVERSE_PROOF:null,
        originalRealmTagLinkVerified:verified,
        originalTagDefinitionVerified:tag!==null,
        gameUiUniverseGroupingVerified:false as const,
        collectionItemWorldVerified:false as const,
        itemAcquisitionWorldVerified:false as const,
        playerSaveLocationVerified:false as const,
        contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const,
        completeGameWorldCoverageVerified:false as const
      });
    },
    async byNativeUniverseTag(tagItemId:number,
      page:Readonly<{offset:number;limit:number}>={offset:0,limit:128}
    ):Promise<Db04RealmUniversePage>{
      check(goodId(tagItemId),'INVALID_TAG_ITEM_ID');
      const {offset,limit}=checkedPage(page);
      const sourceWorlds=world.sourceRealmWorldsForUniverseTag(tagItemId).values;
      // Unknown IDs are not silently cast to Disney Universe tags.
      check(sourceWorlds.length===0||knownIds.has(tagItemId),
        'SOURCE_WORLD_TAG_INDEX_MISMATCH');
      const tag=sourceWorlds.length?await definition(tagItemId):null;
      const end=Math.min(sourceWorlds.length,offset+limit);
      const hasNextPage=end<sourceWorlds.length;
      return Object.freeze({
        contract:DB04_REALM_UNIVERSE_JOIN,
        status:tag!==null?'source_native_verified' as const:'unverified' as const,
        universeTagItemId:tagItemId,universeTagKey:tag?.nativeKey??null,
        sourceWorlds:Object.freeze(sourceWorlds.slice(offset,end)),
        totalSourceRealmWorlds:sourceWorlds.length,
        offset,limit,hasNextPage,nextOffset:hasNextPage?end:null,
        completeGameWorldCoverageVerified:false as const,
        contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const,
        gameUiUniverseGroupingVerified:false as const
      });
    },
    async listNativeUniverseTags():Promise<readonly Db04RealmUniverseGroup[]>{
      const tags=await Promise.all(availableIds.map(definition));
      return Object.freeze(tags.map(tag=>{
        const linked=world.sourceRealmWorldsForUniverseTag(tag.itemId).values;
        check(linked.length>0,'UNEXPECTED_MISSING_UNIVERSE_WORLD');
        return Object.freeze({
          tagItemId:tag.itemId,
          tagKey:tag.nativeKey,
          originalTagDefinitionSha256:tag.sourceSha256,
          sourceRealmWorldIds:Object.freeze(linked.map(w=>w.worldId)),
          sourceWorldSubsetOnly:true as const,
          completeGameWorldCoverageVerified:false as const,
          contentPackRelationVerified:false as const,
          dlcEntitlementVerified:false as const
        });
      }));
    }
  });
}
