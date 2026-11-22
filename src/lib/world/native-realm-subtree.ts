/**
 * DB-04 exact-original Realm hierarchy and aggregate default GridObjects.
 *
 * Source WorldData field-2 parent links are the ONLY hierarchy evidence.
 * A WorldData record with no parent field is a root CANDIDATE, never proof
 * that no parent exists outside the partial original-source extract.
 *
 * An initial GridObject in a source Realm is NOT player-save placement,
 * an item's origin/acquisition, a legal placement or DLC ownership.
 * This read-only client uses the existing private, SHA-pinned DB-04 graph.
 */
import {WorldReferenceIndex,
  type WorldIdentity,type NativeSourceItemReference,
} from './reference-graph.ts';

export const DB04_REALM_SUBTREE='wand.db04.native-realm-subtree@1' as const;
export const DB04_REALM_PARENT_EVIDENCE=
  'protoDb.Worlds.WorldData.nativeParentWorldId' as const;
export type Db04NativeRealmRootStatus=
  'no_parent_link_in_partial_original_source'|'native_parent_link_verified';
export interface Db04NativeRealmNode {
  readonly worldId:string;
  readonly sourceWorld:Readonly<WorldIdentity>;
  readonly nativeParentWorldId:string|null;
  readonly nativeParentLinkVerified:boolean;
  readonly sourceRootStatus:Db04NativeRealmRootStatus;
  readonly directNativeChildWorldIds:readonly string[];
  readonly recordedNativeAncestorWorldIds:readonly string[];
  readonly nativeUniverseTagItemId:number|null;
  readonly sourceOriginalDefaultReferenceRows:number;
  readonly sourceOriginalDefaultInstances:number;
  readonly sourceOriginalDefaultDistinctItemIds:number;
  readonly completeRealmHierarchyVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly sourceDefaultIsNotPlayerSavePlacement:true;
}
export interface Db04NativeRealmSubtree {
  readonly contract:typeof DB04_REALM_SUBTREE;
  readonly sourceWorldId:string;
  readonly rootIsVerifiedGameRoot:false;
  readonly nativeParentRelation:typeof DB04_REALM_PARENT_EVIDENCE;
  readonly nodes:readonly Db04NativeRealmNode[];
  readonly nativeWorldIdsPreorder:readonly string[];
  readonly nativeUniverseTagItemIds:readonly number[];
  readonly sourceOriginalDefaultReferenceRows:number;
  readonly sourceOriginalDefaultInstances:number;
  readonly sourceOriginalDefaultDistinctItemIds:number;
  readonly sourceCoverageComplete:false;
  readonly worldAcquisitionOrOriginVerified:false;
  readonly playerSavePlacementVerified:false;
  readonly placementLegalityVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db04NativeRealmPlacementPage {
  readonly contract:typeof DB04_REALM_SUBTREE;
  readonly sourceWorldId:string;
  readonly relation:'nativeSourceDefaultGridObject';
  readonly rows:readonly Readonly<NativeSourceItemReference>[];
  readonly matchingSourceReferenceRows:number;
  readonly matchingOriginalDefaultInstances:number;
  readonly matchingDistinctItemIds:number;
  readonly offset:number;
  readonly limit:number;
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly sourceOnly:true;
  readonly sourceCoverageComplete:false;
  readonly itemOriginVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly playerSavePlacementVerified:false;
  readonly placementLegalityVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db04NativeRealmSubtreeClient {
  readonly contract:typeof DB04_REALM_SUBTREE;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    worldManifestSha256:string;
    privateOnly:true;
    publicationAuthorized:false;
    nativeParentLinksSourceSubsetOnly:true;
    completeRealmHierarchyVerified:false;
  }>;
  /** Only Realm WorldData with NO parent recorded in this partial source. */
  listSourceRealmRootCandidates():readonly Db04NativeRealmNode[];
  /** Exact recorded WorldData ancestors; no root inference. */
  getSourceRealmSubtree(worldId:string):Db04NativeRealmSubtree|null;
  /** Paged original placement rows from self and native child WorldData. */
  originalPlacementsInSourceRealmSubtree(
    worldId:string,
    page?:Readonly<{offset:number;limit:number}>
  ):Db04NativeRealmPlacementPage|null;
}
const SHA=/^[a-f0-9]{64}$/;
const goodId=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const nonnegative=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const obj=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
function check(value:unknown,reason:string):asserts value{
  if(!value)throw new TypeError('DB04_NATIVE_REALM_SUBTREE_'+reason);
}
function checkedPage(value:unknown):{offset:number;limit:number}{
  check(obj(value)&&nonnegative(value.offset)&&nonnegative(value.limit)&&
    value.limit>=1&&value.limit<=512,'INVALID_PAGE');
  return {offset:value.offset,limit:value.limit};
}
type Computed=Readonly<{
  subtree:Db04NativeRealmSubtree;
  sourceRows:readonly Readonly<NativeSourceItemReference>[];
}>;
export function createDb04NativeRealmSubtreeClient(
  world:WorldReferenceIndex
):Db04NativeRealmSubtreeClient{
  check(world instanceof WorldReferenceIndex&&
    world.target.platform==='Steam'&&
    world.target.gameVersion==='1.26.2'&&
    SHA.test(world.target.nativeWorldManifestSha256),
    'EXACT_PRIVATE_WORLD_SOURCE_REQUIRED');
  const sourceWorlds=world.listSourceWorlds();
  const originalRealms=new Map<string,Readonly<WorldIdentity>>();
  for(const item of sourceWorlds){
    if(item.worldType!=='realm')continue;
    check(item.worldIdKind==='nativeWorldName'&&
      typeof item.worldId==='string'&&item.worldId.length>0&&
      item.worldId.length<=512&&!originalRealms.has(item.worldId)&&
      item.contentPackId===null&&
      item.contentPackRelationVerified===false&&
      item.worldCoverageComplete===false&&
      (item.nativeUniverseTagItemId===null||
        goodId(item.nativeUniverseTagItemId)),
      'ORIGINAL_REALM_IDENTITY');
    originalRealms.set(item.worldId,Object.freeze({...item}));
  }
  check(originalRealms.size>0,'NO_SOURCE_REALMS');
  const byParent=new Map<string,string[]>();
  for(const item of originalRealms.values()){
    const parent=item.nativeParentWorldId??null;
    if(parent===null){
      check(item.nativeParentWorldRelationVerified!==true,
        'UNKNOWN_PARENT_CLAIMED_VERIFIED');
      continue;
    }
    check(item.nativeParentWorldRelationVerified===true&&
      originalRealms.has(parent)&&parent!==item.worldId,
      'INVALID_ORIGINAL_PARENT');
    const ids=byParent.get(parent)??[];
    ids.push(item.worldId);
    byParent.set(parent,ids);
  }
  // Cross-check against the existing exact original parent index.
  for(const [parent,ids] of byParent){
    const original=world.childWorlds(parent);
    check(original.status==='source_native_verified'&&
      original.values.length===ids.length&&
      original.values.every((x,i)=>x.worldId===ids[i]),
      'PARENT_REVERSE_INDEX_MISMATCH');
  }
  const cache=new Map<string,Computed>();
  function compute(id:string):Computed|null{
    const prior=cache.get(id);
    if(prior)return prior;
    const original=originalRealms.get(id);
    if(!original)return null;
    const visited=new Set<string>();
    const descendants:string[]=[];
    function collect(nodeId:string):void{
      check(!visited.has(nodeId),'ORIGINAL_PARENT_CYCLE');
      visited.add(nodeId);
      descendants.push(nodeId);
      for(const childId of byParent.get(nodeId)??[])collect(childId);
    }
    collect(id);
    const nodes:Db04NativeRealmNode[]=[];
    const allRows:Readonly<NativeSourceItemReference>[]=[];
    const distinct=new Set<string>();
    let totalInstances=0;
    const universeIds=new Set<number>();
    for(const sourceWorldId of descendants){
      const w=originalRealms.get(sourceWorldId)!;
      if(w.nativeUniverseTagItemId!==null)universeIds.add(w.nativeUniverseTagItemId);
      const ancestors=world.worldAncestors(sourceWorldId).values;
      const ancestorIds=Object.freeze(ancestors.map(x=>x.worldId));
      const expectedParent=w.nativeParentWorldId??null;
      check((expectedParent===null&&ancestors.length===0)||
        (expectedParent!==null&&ancestors[0]?.worldId===expectedParent),
        'ORIGINAL_ANCESTRY_CONFLICT');
      const children=byParent.get(sourceWorldId)??[];
      const pageSize=512;
      let offset=0;
      let directInstances=0,directTotal:number|null=null,
        directSourceInstances:number|null=null;
      const nodeDistinct=new Set<string>();
      while(true){
        const page=world.originalPlacementsInWorld(sourceWorldId,{
          offset,limit:pageSize
        });
        check(page.scope==='world'&&
          page.scopeId===sourceWorldId&&
          page.scopeIdentityInPartialSource===true&&
          page.sourceCoverageComplete===false&&
          page.itemOriginVerified===false&&
          page.acquisitionLocationVerified===false&&
          page.savedPlayerPlacementVerified===false&&
          page.placementLegalityVerified===false&&
          page.offset===offset&&page.limit===pageSize&&
          nonnegative(page.matchingReferenceRowsInSubset)&&
          nonnegative(page.matchingOriginalInstancesInSubset),
          'WORLD_SOURCE_PAGE_CONTRACT');
        if(directTotal===null){
          directTotal=page.matchingReferenceRowsInSubset;
          directSourceInstances=page.matchingOriginalInstancesInSubset;
        }
        check(directTotal===page.matchingReferenceRowsInSubset&&
          directSourceInstances===page.matchingOriginalInstancesInSubset&&
          page.rows.length===Math.min(pageSize,directTotal-offset),
          'WORLD_SOURCE_PAGE_COUNT');
        for(const row of page.rows){
          check(row.worldId===sourceWorldId&&
            row.relation==='nativeSourceDefaultGridObject'&&
            goodId(row.instanceCount),'WORLD_SOURCE_ROW_IDENTITY');
          directInstances+=row.instanceCount;
          totalInstances+=row.instanceCount;
          check(Number.isSafeInteger(directInstances)&&
            Number.isSafeInteger(totalInstances),
            'SOURCE_INSTANCE_OVERFLOW');
          nodeDistinct.add(row.itemId);
          distinct.add(row.itemId);
          allRows.push(row);
        }
        offset+=page.rows.length;
        check(page.hasNextPage===(offset<directTotal)&&
          page.nextOffset===(offset<directTotal?offset:null),
          'WORLD_SOURCE_NEXT_PAGE');
        if(!page.hasNextPage)break;
      }
      check(directInstances===directSourceInstances,
        'WORLD_DEFAULT_INSTANCE_CONFLICT');
      const parent=expectedParent;
      nodes.push(Object.freeze({
        worldId:sourceWorldId,
        sourceWorld:w,
        nativeParentWorldId:parent,
        nativeParentLinkVerified:parent!==null,
        sourceRootStatus:parent!==null?
          'native_parent_link_verified' as const:
          'no_parent_link_in_partial_original_source' as const,
        directNativeChildWorldIds:Object.freeze([...children]),
        recordedNativeAncestorWorldIds:ancestorIds,
        nativeUniverseTagItemId:w.nativeUniverseTagItemId,
        sourceOriginalDefaultReferenceRows:offset,
        sourceOriginalDefaultInstances:directInstances,
        sourceOriginalDefaultDistinctItemIds:nodeDistinct.size,
        completeRealmHierarchyVerified:false as const,
        contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const,
        sourceDefaultIsNotPlayerSavePlacement:true as const
      }));
    }
    const subtree:Db04NativeRealmSubtree=Object.freeze({
      contract:DB04_REALM_SUBTREE,
      sourceWorldId:id,
      rootIsVerifiedGameRoot:false as const,
      nativeParentRelation:DB04_REALM_PARENT_EVIDENCE,
      nodes:Object.freeze(nodes),
      nativeWorldIdsPreorder:Object.freeze(descendants),
      nativeUniverseTagItemIds:Object.freeze([...universeIds].sort((a,b)=>a-b)),
      sourceOriginalDefaultReferenceRows:allRows.length,
      sourceOriginalDefaultInstances:totalInstances,
      sourceOriginalDefaultDistinctItemIds:distinct.size,
      sourceCoverageComplete:false as const,
      worldAcquisitionOrOriginVerified:false as const,
      playerSavePlacementVerified:false as const,
      placementLegalityVerified:false as const,
      contentPackRelationVerified:false as const,
      dlcEntitlementVerified:false as const
    });
    const data=Object.freeze({
      subtree,sourceRows:Object.freeze(allRows)
    });
    cache.set(id,data);
    return data;
  }
  return Object.freeze({
    contract:DB04_REALM_SUBTREE,
    source:Object.freeze({
      platform:'Steam' as const,gameVersion:'1.26.2' as const,
      worldManifestSha256:world.target.nativeWorldManifestSha256,
      privateOnly:true as const,publicationAuthorized:false as const,
      nativeParentLinksSourceSubsetOnly:true as const,
      completeRealmHierarchyVerified:false as const
    }),
    listSourceRealmRootCandidates():readonly Db04NativeRealmNode[]{
      return Object.freeze([...originalRealms.values()]
        .filter(row=>(row.nativeParentWorldId??null)===null)
        .map(row=>compute(row.worldId)!.subtree.nodes[0]));
    },
    getSourceRealmSubtree(worldId:string):Db04NativeRealmSubtree|null{
      check(typeof worldId==='string'&&worldId.length>0&&worldId.length<=512,
        'INVALID_WORLD_ID');
      return compute(worldId)?.subtree??null;
    },
    originalPlacementsInSourceRealmSubtree(
      worldId:string,
      page:Readonly<{offset:number;limit:number}>={offset:0,limit:128}
    ):Db04NativeRealmPlacementPage|null{
      check(typeof worldId==='string'&&worldId.length>0&&worldId.length<=512,
        'INVALID_WORLD_ID');
      const {offset,limit}=checkedPage(page);
      const data=compute(worldId);
      if(data===null)return null;
      const end=Math.min(data.sourceRows.length,offset+limit);
      const hasNextPage=end<data.sourceRows.length;
      return Object.freeze({
        contract:DB04_REALM_SUBTREE,
        sourceWorldId:worldId,
        relation:'nativeSourceDefaultGridObject' as const,
        rows:Object.freeze(data.sourceRows.slice(offset,end)),
        matchingSourceReferenceRows:data.subtree.sourceOriginalDefaultReferenceRows,
        matchingOriginalDefaultInstances:data.subtree.sourceOriginalDefaultInstances,
        matchingDistinctItemIds:data.subtree.sourceOriginalDefaultDistinctItemIds,
        offset,limit,hasNextPage,
        nextOffset:hasNextPage?end:null,
        sourceOnly:true as const,
        sourceCoverageComplete:false as const,
        itemOriginVerified:false as const,
        acquisitionWorldVerified:false as const,
        playerSavePlacementVerified:false as const,
        placementLegalityVerified:false as const,
        contentPackRelationVerified:false as const,
        dlcEntitlementVerified:false as const
      });
    }
  });
}
