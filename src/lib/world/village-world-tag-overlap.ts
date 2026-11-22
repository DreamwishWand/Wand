/**
 * DB-04 original Village source layout / Item World Tag co-occurrence evidence.
 *
 * Correlates two independently source-pinned private datasets:
 *   1) protoDb DefaultVillages -> source layout -> original GridObjects;
 *   2) original itemlist Furniture/Clothing/Trimming/ActivityItem World Tags.
 *
 * The source files do NOT directly specify that a native World Tag owns the
 * Village layout or that a layout belongs to a purchasable content pack.
 * The most common tag is NOT promoted to a World association, DLC entitlement,
 * current Collection UI world, or acquisition source.
 *
 * All processing is local and read-only, without private bytes in Git.
 */
import {WorldReferenceIndex,type WorldIdentity} from './reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT,DB04_WORLD_TAGS,
  type Db04NativeItemScopeClient,type Db04WorldTag}
  from './native-item-scope.ts';

export const DB04_VILLAGE_WORLD_TAG_OVERLAP=
  'wand.db04.village-world-tag-overlap@1' as const;
export const DB04_VILLAGE_TAG_OVERLAP_EVIDENCE=
  'source_default_gridobject_and_original_item_world_tag_cooccurrence' as const;

export interface Db04VillageTagCount {
  readonly key:Db04WorldTag;
  readonly originalReferenceRows:number;
  readonly originalInstances:number;
  readonly distinctItemIds:number;
}
export interface Db04VillageTagBucket {
  readonly originalReferenceRows:number;
  readonly originalInstances:number;
  readonly distinctItemIds:number;
}
export interface Db04VillageWorldTagOverlap {
  readonly contract:typeof DB04_VILLAGE_WORLD_TAG_OVERLAP;
  readonly evidence:typeof DB04_VILLAGE_TAG_OVERLAP_EVIDENCE;
  readonly worldId:string;
  readonly originalVillageRoot:WorldIdentity;
  readonly sourceDefaultGridObjectReferenceRows:number;
  readonly sourceDefaultGridObjectInstances:number;
  /** Original Item records carrying one of the six direct source World Tags. */
  readonly directWorldTags:readonly Db04VillageTagCount[];
  /** An original Item definition with no direct source World Tag. */
  readonly noDirectWorldTag:Db04VillageTagBucket;
  /** An Item ID not represented by the 13,202-row original Item scope. */
  readonly outsideFourNativeItemCategories:Db04VillageTagBucket;
  readonly sourceLayoutWorldRelationVerified:true;
  readonly exactOriginalPlacementTagIntersectionVerified:true;
  readonly sourceCoverageComplete:false;
  readonly villageToWorldTagAssociationVerified:false;
  readonly contentPackId:null;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly collectionGameUiMembershipVerified:false;
  readonly itemAcquisitionWorldVerified:false;
  readonly currentPlayerSavePlacementVerified:false;
}
export interface Db04VillageTagReverseResult {
  readonly contract:typeof DB04_VILLAGE_WORLD_TAG_OVERLAP;
  readonly originalWorldTagKey:Db04WorldTag;
  readonly evidence:typeof DB04_VILLAGE_TAG_OVERLAP_EVIDENCE;
  readonly status:'source_native_verified'|'unverified';
  readonly villages:readonly Readonly<{
    worldId:string;
    originalSourceReferenceRows:number;
    originalSourceInstances:number;
    distinctItemIds:number;
  }>[];
  readonly completeGameSourceCoverageVerified:false;
  readonly villageToWorldTagAssociationVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db04VillageWorldTagOverlapClient {
  readonly contract:typeof DB04_VILLAGE_WORLD_TAG_OVERLAP;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    sourceWorldManifestSha256:string;
    originalItemScopeAuditSha256:string;
    originalItemScopeRowsSha256:string;
    sourceOriginalTagSha256:string;
    privateOnly:true;
    publicationAuthorized:false;
  }>;
  listSourceVillages():readonly Db04VillageWorldTagOverlap[];
  getSourceVillage(worldId:string):Db04VillageWorldTagOverlap|null;
  byOriginalWorldTag(tag:Db04WorldTag):Db04VillageTagReverseResult;
}
type Count={references:number;instances:number;ids:Set<string>};
const SHA=/^[a-f0-9]{64}$/;
const WORLD_KEYS=new Set<string>(DB04_WORLD_TAGS);
const validId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB04_VILLAGE_WORLD_TAG_'+code);
}
function bucket():Count{return {references:0,instances:0,ids:new Set<string>()};}
function add(counter:Count,id:string,instances:number):void{
  counter.references++;
  counter.instances+=instances;
  check(Number.isSafeInteger(counter.instances),'INSTANCE_COUNT_OVERFLOW');
  counter.ids.add(id);
}
function finish(counter:Count):Db04VillageTagBucket{
  return Object.freeze({
    originalReferenceRows:counter.references,
    originalInstances:counter.instances,
    distinctItemIds:counter.ids.size
  });
}
function classify(itemId:string,client:Db04NativeItemScopeClient):
  Db04WorldTag|null|'outside'{
  const n=Number(itemId);
  if(!validId(n)||String(n)!==itemId)return 'outside';
  const original=client.getItem(n);
  if(original===null)return 'outside';
  check(original.itemId===n&&Array.isArray(original.worldsDirect)&&
    original.worldsDirect.length<=1&&
    original.worldsDirect.every(key=>WORLD_KEYS.has(key)),
    'INVALID_ORIGINAL_ITEM_TAG_REPLY');
  return original.worldsDirect[0]??null;
}

/**
 * Reuses bounded exact-ID reverse source indexes. No path-prefix DLC inference.
 * The immutable materialization contains aggregate data, not item/source bytes.
 */
export function createDb04VillageWorldTagOverlapClient(
  world:WorldReferenceIndex,nativeScope:Db04NativeItemScopeClient
):Db04VillageWorldTagOverlapClient{
  check(world instanceof WorldReferenceIndex&&
    world.target.platform==='Steam'&&world.target.gameVersion==='1.26.2'&&
    SHA.test(world.target.nativeWorldManifestSha256),
    'WORLD_SOURCE_REQUIRED');
  check(nativeScope?.contract===DB04_NATIVE_SCOPE_CLIENT&&
    nativeScope.source?.platform==='Steam'&&
    nativeScope.source.gameVersion===world.target.gameVersion&&
    nativeScope.source.privateOnly===true&&
    nativeScope.source.publicationAuthorized===false&&
    nativeScope.source.originalItemDefinitions===13202&&
    SHA.test(nativeScope.source.auditSha256)&&
    SHA.test(nativeScope.source.rowsSha256)&&
    SHA.test(nativeScope.source.originalTagSha256)&&
    typeof nativeScope.getItem==='function',
    'ORIGINAL_ITEM_SCOPE_REQUIRED');
  const found=new Map<string,Db04VillageWorldTagOverlap>();
  const villageRoots=world.listSourceWorlds().filter(entry=>
    entry.worldIdKind==='derivedLayoutKey'&&entry.worldType==='village_layout');

  for(const root of villageRoots){
    check(root.nativeUniverseTagItemId===null&&
      root.contentPackId===null&&root.contentPackRelationVerified===false&&
      root.worldCoverageComplete===false&&
      root.defaultLayoutId.length>0,
      'SOURCE_VILLAGE_IDENTITY');
    const tags=new Map<Db04WorldTag,Count>(
      DB04_WORLD_TAGS.map(tag=>[tag,bucket()]));
    const without=bucket(),outside=bucket();
    let offset=0,expectedTotal:number|null=null,
      expectedInstances:number|null=null,actualInstances=0;
    while(true){
      const page=world.originalPlacementsInWorld(root.worldId,{
        offset,limit:512
      });
      check(page.scope==='world'&&page.scopeId===root.worldId&&
        page.scopeIdentityInPartialSource===true&&
        page.sourceCoverageComplete===false&&
        page.itemOriginVerified===false&&
        page.acquisitionLocationVerified===false&&
        page.savedPlayerPlacementVerified===false&&
        page.placementLegalityVerified===false&&
        page.offset===offset&&page.limit===512&&
        Number.isSafeInteger(page.matchingReferenceRowsInSubset)&&
        page.matchingReferenceRowsInSubset>=0&&
        Number.isSafeInteger(page.matchingOriginalInstancesInSubset)&&
        page.matchingOriginalInstancesInSubset>=0,
        'SOURCE_PLACEMENT_PAGE_CONTRACT');
      if(expectedTotal===null){
        expectedTotal=page.matchingReferenceRowsInSubset;
        expectedInstances=page.matchingOriginalInstancesInSubset;
      }
      check(expectedTotal===page.matchingReferenceRowsInSubset&&
        expectedInstances===page.matchingOriginalInstancesInSubset&&
        page.rows.length===Math.min(512,expectedTotal-offset),
        'SOURCE_PLACEMENT_PAGING_MISMATCH');
      for(const row of page.rows){
        check(row.worldId===root.worldId&&
          row.relation==='nativeSourceDefaultGridObject'&&
          typeof row.itemId==='string'&&validId(row.instanceCount),
          'ORIGINAL_GRIDOBJECT_WORLD_ID_MISMATCH');
        const group=classify(row.itemId,nativeScope);
        add(group==='outside'?outside:group===null?without:tags.get(group)!,
          row.itemId,row.instanceCount);
        actualInstances+=row.instanceCount;
        check(Number.isSafeInteger(actualInstances),'INSTANCE_COUNT_OVERFLOW');
      }
      offset+=page.rows.length;
      check(page.hasNextPage===(offset<expectedTotal)&&
        page.nextOffset===(offset<expectedTotal?offset:null),
        'SOURCE_PLACEMENT_NEXT_PAGE_MISMATCH');
      if(!page.hasNextPage)break;
    }
    check(offset===expectedTotal&&actualInstances===expectedInstances,
      'SOURCE_PLACEMENT_TOTAL_CONFLICT');
    const counts=Object.freeze(DB04_WORLD_TAGS.map(key=>
      Object.freeze({key,...finish(tags.get(key)!)})));
    const village:Db04VillageWorldTagOverlap=Object.freeze({
      contract:DB04_VILLAGE_WORLD_TAG_OVERLAP,
      evidence:DB04_VILLAGE_TAG_OVERLAP_EVIDENCE,
      worldId:root.worldId,originalVillageRoot:root,
      sourceDefaultGridObjectReferenceRows:expectedTotal,
      sourceDefaultGridObjectInstances:expectedInstances,
      directWorldTags:counts,
      noDirectWorldTag:finish(without),
      outsideFourNativeItemCategories:finish(outside),
      sourceLayoutWorldRelationVerified:true as const,
      exactOriginalPlacementTagIntersectionVerified:true as const,
      sourceCoverageComplete:false as const,
      villageToWorldTagAssociationVerified:false as const,
      contentPackId:null,
      contentPackRelationVerified:false as const,
      dlcEntitlementVerified:false as const,
      collectionGameUiMembershipVerified:false as const,
      itemAcquisitionWorldVerified:false as const,
      currentPlayerSavePlacementVerified:false as const
    });
    found.set(root.worldId,village);
  }
  const villages=Object.freeze([...found.values()]);
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:'1.26.2' as const,
    sourceWorldManifestSha256:world.target.nativeWorldManifestSha256,
    originalItemScopeAuditSha256:nativeScope.source.auditSha256,
    originalItemScopeRowsSha256:nativeScope.source.rowsSha256,
    sourceOriginalTagSha256:nativeScope.source.originalTagSha256,
    privateOnly:true as const,publicationAuthorized:false as const
  });
  return Object.freeze({
    contract:DB04_VILLAGE_WORLD_TAG_OVERLAP,source,
    listSourceVillages:()=>villages,
    getSourceVillage(worldId:string):Db04VillageWorldTagOverlap|null{
      check(typeof worldId==='string'&&worldId.length>0&&worldId.length<=512,
        'INVALID_WORLD_ID');
      return found.get(worldId)??null;
    },
    byOriginalWorldTag(tag:Db04WorldTag):Db04VillageTagReverseResult{
      check(typeof tag==='string'&&WORLD_KEYS.has(tag),
        'INVALID_ORIGINAL_WORLD_TAG');
      const rows=Object.freeze(villages.flatMap(v=>{
        const n=v.directWorldTags.find(x=>x.key===tag);
        return n&&n.originalReferenceRows>0?
          [Object.freeze({worldId:v.worldId,
            originalSourceReferenceRows:n.originalReferenceRows,
            originalSourceInstances:n.originalInstances,
            distinctItemIds:n.distinctItemIds})]:[];
      }));
      return Object.freeze({
        contract:DB04_VILLAGE_WORLD_TAG_OVERLAP,
        originalWorldTagKey:tag,
        evidence:DB04_VILLAGE_TAG_OVERLAP_EVIDENCE,
        status:rows.length?'source_native_verified' as const:'unverified' as const,
        villages:rows,
        completeGameSourceCoverageVerified:false as const,
        villageToWorldTagAssociationVerified:false as const,
        contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const
      });
    }
  });
}
