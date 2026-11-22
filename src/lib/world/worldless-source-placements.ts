/**
 * DB-04 source-only geography evidence for the 2,920 Steam 1.26.2 Items
 * that carry no direct World Tag in their original Item definitions.
 *
 * It joins the already SHA-checked 13,202-Item native scope index with the
 * independently version-pinned partial World/GridObject reference graph.
 * An original GridObject World link proves only where that source object
 * was placed at the game's original layout: NOT item world association,
 * source of acquisition, DLC ownership or current player save location.
 *
 * The reverse index deliberately never assigns one of the six collection
 * worlds to an item lacking the original native World Tag. No network,
 * private ZIP distribution or save-file write is involved.
 */
import {WorldReferenceIndex, type NativeSourceItemReference} from
  './reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT, type Db04NativeItemScopeClient,
  type Db04NativeCategory} from './native-item-scope.ts';

export const DB04_WORLDLESS_SOURCE_PLACEMENTS =
  'wand.db04.worldless-source-placements@1' as const;
export type WorldlessInitialEvidenceKind =
  'source_default_gridobject_with_world'|
  'source_default_gridobject_unlinked_world'|
  'no_default_gridobject_in_partial_source';

export interface WorldlessSourcePlacementEvidence {
  readonly itemId:number;
  readonly nativeCategory:Db04NativeCategory;
  readonly nativeWorldTagPresent:false;
  readonly kind:WorldlessInitialEvidenceKind;
  /** Original WorldData/layout identity, NOT the item's origin World. */
  readonly sourceDefaultWorldIds:readonly string[];
  readonly originalDefaultReferenceRows:number;
  readonly originalDefaultInstances:number;
  readonly originalDefaultsWithoutWorldLink:number;
  readonly originalSourcePlacementEvidenceVerified:boolean;
  readonly nativeWorldAssociationVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly savedPlayerPlacementVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly sourceCoverageComplete:false;
}
export interface WorldlessSourcePlacementPage {
  readonly contract:typeof DB04_WORLDLESS_SOURCE_PLACEMENTS;
  readonly scope:'evidence_kind'|'source_default_world';
  readonly scopeId:string;
  readonly scopeIdentityInPartialSource:boolean;
  readonly status:'source_native_verified'|'unverified';
  readonly itemIds:readonly number[];
  readonly matchingItemIdsInSubset:number;
  readonly offset:number;
  readonly limit:number;
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly nativeWorldAssociationVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly savedPlayerPlacementVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly sourceCoverageComplete:false;
}
export interface WorldlessSourcePlacementSummary {
  readonly missingNativeWorldTagDefinitions:2920;
  readonly sourceDefaultWithWorld:number;
  readonly sourceDefaultWithoutWorld:number;
  readonly noSourceDefaultInPartialGraph:number;
  readonly sourceDefaultNativeWorlds:readonly string[];
  readonly nativeWorldAssociationVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly sourceCoverageComplete:false;
}
export interface Db04WorldlessSourcePlacementClient {
  readonly contract:typeof DB04_WORLDLESS_SOURCE_PLACEMENTS;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    originalItemScopeRowsSha256:string;
    originalItemScopeAuditSha256:string;
    worldManifestSha256:string;
    privateOnly:true;
    publicationAuthorized:false;
  }>;
  readonly summary:WorldlessSourcePlacementSummary;
  getItem(itemId:number):WorldlessSourcePlacementEvidence|null;
  byEvidenceKind(kind:WorldlessInitialEvidenceKind,
    page?:Readonly<{offset:number;limit:number}>):WorldlessSourcePlacementPage;
  bySourceDefaultWorld(worldId:string,
    page?:Readonly<{offset:number;limit:number}>):WorldlessSourcePlacementPage;
}
const SHA=/^[a-f0-9]{64}$/;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const goodId=(v:unknown):v is number=>nonnegative(v)&&v>0;
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const KINDS:readonly WorldlessInitialEvidenceKind[]=Object.freeze([
  'source_default_gridobject_with_world',
  'source_default_gridobject_unlinked_world',
  'no_default_gridobject_in_partial_source',
]);
function check(v:unknown,reason:string):asserts v{
  if(!v)throw new TypeError('DB04_WORLDLESS_PLACEMENTS_'+reason);
}
function pageOf(scope:WorldlessSourcePlacementPage['scope'],id:string,
  sourcePresent:boolean,ids:readonly number[],
  page:Readonly<{offset:number;limit:number}>={offset:0,limit:128}
):WorldlessSourcePlacementPage{
  check(object(page)&&nonnegative(page.offset)&&
    nonnegative(page.limit)&&page.limit>=1&&page.limit<=512,
    'INVALID_PAGE');
  const end=Math.min(ids.length,page.offset+page.limit);
  const next=end<ids.length;
  return Object.freeze({
    contract:DB04_WORLDLESS_SOURCE_PLACEMENTS,scope,
    scopeId:id,scopeIdentityInPartialSource:sourcePresent,
    status:ids.length&&scope!=='evidence_kind'?
      'source_native_verified' as const:
      ids.length&&id!=='no_default_gridobject_in_partial_source'?
        'source_native_verified' as const:'unverified' as const,
    itemIds:Object.freeze(ids.slice(page.offset,end)),
    matchingItemIdsInSubset:ids.length,
    offset:page.offset,limit:page.limit,
    hasNextPage:next,nextOffset:next?end:null,
    nativeWorldAssociationVerified:false as const,
    acquisitionWorldVerified:false as const,
    savedPlayerPlacementVerified:false as const,
    dlcEntitlementVerified:false as const,
    sourceCoverageComplete:false as const
  });
}
/**
 * Build once from validated PRIVATE clients. Work is bounded by 2,920
 * source-unclassified Item definitions and uses no extra original-file I/O.
 */
export function createDb04WorldlessSourcePlacementClient(
  world:WorldReferenceIndex,
  nativeScope:Db04NativeItemScopeClient
):Db04WorldlessSourcePlacementClient{
  check(world instanceof WorldReferenceIndex&&
    world.target.platform==='Steam'&&world.target.gameVersion==='1.26.2'&&
    SHA.test(world.target.nativeWorldManifestSha256),
    'WORLD_PRIVATE_EXACT_VERSION_REQUIRED');
  check(nativeScope?.contract===DB04_NATIVE_SCOPE_CLIENT&&
    nativeScope.source?.platform==='Steam'&&
    nativeScope.source.gameVersion===world.target.gameVersion&&
    nativeScope.source.privateOnly===true&&
    nativeScope.source.publicationAuthorized===false&&
    nativeScope.source.originalItemDefinitions===13202&&
    SHA.test(nativeScope.source.auditSha256)&&
    SHA.test(nativeScope.source.rowsSha256)&&
    typeof nativeScope.getItem==='function'&&
    typeof nativeScope.withoutWorldTag==='function',
    'ORIGINAL_SCOPE_PRIVATE_EXACT_VERSION_REQUIRED');

  const rows=new Map<number,WorldlessSourcePlacementEvidence>();
  const byKind=new Map<WorldlessInitialEvidenceKind,number[]>(
    KINDS.map(k=>[k,[]]));
  const byWorld=new Map<string,number[]>();
  let count=0,previous=0;
  const pageLimit=512;
  for(let offset=0;offset<2920;offset+=pageLimit){
    const expectedCount=Math.min(pageLimit,2920-offset);
    const page=nativeScope.withoutWorldTag({offset,limit:pageLimit});
    check(page.evidenceKind==='no_world_tag_in_original_item_record'&&
      page.status==='unverified'&&
      page.matchingItemIdsInSourceSubset===2920&&
      page.offset===offset&&page.limit===pageLimit&&
      page.itemIds.length===expectedCount&&
      page.sourceCoverageComplete===false&&
      page.gameUiMembershipVerified===false&&
      page.acquisitionWorldVerified===false&&
      page.dlcEntitlementVerified===false&&
      page.hasNextPage===(offset+expectedCount<2920)&&
      page.nextOffset===(offset+expectedCount<2920?offset+expectedCount:null),
      'SOURCE_WORLDLESS_PAGE_CONFLICT');
    for(const id of page.itemIds){
      check(goodId(id)&&id>previous,'INVALID_OR_DUPLICATE_WORLDLESS_ITEM_ID');
      previous=id;
      const item=nativeScope.getItem(id);
      check(item?.itemId===id&&
        item.worldsDirect.length===0,'SOURCE_WORLDLESS_TAG_IDENTITY_MISMATCH');
      const relations=world.itemWorldRelations(id);
      const originals=relations.nativeSourceInitialPlacement;
      check(originals.status===(originals.values.length?
        'source_native_verified':'unverified'),
        'SOURCE_PLACEMENT_INDEX_INCONSISTENT');
      const worlds=new Set<string>();
      let instances=0,unlinked=0;
      for(const ref of originals.values){
        check(ref.relation==='nativeSourceDefaultGridObject'&&
          ref.itemId===String(id)&&goodId(ref.instanceCount)&&
          (ref.worldId===null||world.getWorld(ref.worldId)!==null)&&
          (ref.areaRefId===null||world.getArea(ref.areaRefId)!==null),
          'SOURCE_DEFAULT_GRIDOBJECT_INCONSISTENT');
        instances+=ref.instanceCount;
        check(Number.isSafeInteger(instances),'SOURCE_INSTANCE_OVERFLOW');
        if(ref.worldId===null)unlinked+=ref.instanceCount;
        else worlds.add(ref.worldId);
      }
      const worldIds=Object.freeze([...worlds].sort());
      const kind:WorldlessInitialEvidenceKind=worldIds.length?
        'source_default_gridobject_with_world':
        originals.values.length?'source_default_gridobject_unlinked_world':
          'no_default_gridobject_in_partial_source';
      const evidence:WorldlessSourcePlacementEvidence=Object.freeze({
        itemId:id,nativeCategory:item.nativeCategory,nativeWorldTagPresent:false,
        kind,sourceDefaultWorldIds:worldIds,
        originalDefaultReferenceRows:originals.values.length,
        originalDefaultInstances:instances,
        originalDefaultsWithoutWorldLink:unlinked,
        originalSourcePlacementEvidenceVerified:originals.values.length>0,
        nativeWorldAssociationVerified:false as const,
        acquisitionWorldVerified:false as const,
        savedPlayerPlacementVerified:false as const,
        dlcEntitlementVerified:false as const,
        sourceCoverageComplete:false as const
      });
      rows.set(id,evidence);count++;
      byKind.get(kind)!.push(id);
      for(const w of worldIds){
        const ids=byWorld.get(w)??[];
        ids.push(id);byWorld.set(w,ids);
      }
    }
  }
  check(count===2920&&rows.size===2920&&
    KINDS.reduce((n,k)=>n+byKind.get(k)!.length,0)===2920,
    'SOURCE_WORLDLESS_TOTAL_CONFLICT');
  for(const ids of byKind.values())Object.freeze(ids);
  for(const ids of byWorld.values())Object.freeze(ids);
  const summary:WorldlessSourcePlacementSummary=Object.freeze({
    missingNativeWorldTagDefinitions:2920 as const,
    sourceDefaultWithWorld:byKind.get('source_default_gridobject_with_world')!.length,
    sourceDefaultWithoutWorld:byKind.get('source_default_gridobject_unlinked_world')!.length,
    noSourceDefaultInPartialGraph:byKind.get('no_default_gridobject_in_partial_source')!.length,
    sourceDefaultNativeWorlds:Object.freeze([...byWorld.keys()].sort()),
    nativeWorldAssociationVerified:false as const,
    acquisitionWorldVerified:false as const,
    dlcEntitlementVerified:false as const,
    sourceCoverageComplete:false as const
  });
  return Object.freeze({
    contract:DB04_WORLDLESS_SOURCE_PLACEMENTS,
    source:Object.freeze({
      platform:'Steam' as const,gameVersion:'1.26.2' as const,
      originalItemScopeRowsSha256:nativeScope.source.rowsSha256,
      originalItemScopeAuditSha256:nativeScope.source.auditSha256,
      worldManifestSha256:world.target.nativeWorldManifestSha256,
      privateOnly:true as const,publicationAuthorized:false as const
    }),
    summary,
    getItem(itemId:number):WorldlessSourcePlacementEvidence|null{
      check(goodId(itemId),'INVALID_ITEM_ID');
      return rows.get(itemId)??null;
    },
    byEvidenceKind(kind:WorldlessInitialEvidenceKind,
      config?:Readonly<{offset:number;limit:number}>):WorldlessSourcePlacementPage{
      check(KINDS.includes(kind),'INVALID_EVIDENCE_KIND');
      return pageOf('evidence_kind',kind,true,byKind.get(kind)??[],config);
    },
    bySourceDefaultWorld(worldId:string,
      config?:Readonly<{offset:number;limit:number}>):WorldlessSourcePlacementPage{
      check(typeof worldId==='string'&&worldId.length>0&&worldId.length<=512,
        'INVALID_WORLD_ID');
      return pageOf('source_default_world',worldId,world.getWorld(worldId)!==null,
        byWorld.get(worldId)??[],config);
    }
  });
}
