/**
 * DB-00: discover source-linked Item IDs omitted from the 13,202 published
 * native ItemList definitions. Absence from ItemList is NOT absence from the
 * game, nor proof of Collection membership or collectible acquisition.
 *
 * Reuses already verified DB-00/02/03 readers without fetching or expanding
 * the owner's unpublished 39,067-definition game archive. Source-only IDs
 * remain separate from ordinary published catalogue / Collection searches.
 */
import type {SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import type {PublicSourceCatalog} from '../acquisition/public-source-catalog.ts';
import type {OriginKind} from '../acquisition/origins.ts';
import type {GuideRewardIndex} from '../guide/reward-relations.ts';
import type {PublicQuestTargetReverseReader} from '../guide/public-quest-target-reverse.ts';

export const DB00_OUTSIDE_ITEM_SEARCH_CONTRACT=
  'wand.game-db.outside-item-search@1' as const;
export type Db00OutsideEvidenceFamily=
  'acquisition_origin'|'static_container_template'|'default_inventory_template'|
  'starpath_relation'|'quest_target_reference';
export interface Db00OutsideSourceItem{
  readonly itemId:string;
  readonly evidenceFamilies:readonly Db00OutsideEvidenceFamily[];
  readonly item:Db00SourceJoinedItem;
  /** An exact native Item ID reference is not a current Collection item. */
  readonly publishedItemDefinitionPresent:false;
  readonly gameUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00OutsideSearchRequest{
  /** Numeric Item ID prefix, not an English name query. */
  readonly idPrefix?:string;
  /** OR within families; every matched ID must have actual native ID evidence. */
  readonly evidenceFamilies?:readonly Db00OutsideEvidenceFamily[];
  /** Additional DB-02 relation condition; never includes name-only candidates. */
  readonly originKinds?:readonly OriginKind[];
  /** Source-native Quest objective reference, never a mandatory requirement. */
  readonly questTargetQuestId?:string;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00OutsideSearchResult{
  readonly scope:'source_linked_outside_published_itemlist';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00OutsideSourceItem[];
  readonly sourceCoverageComplete:false;
  readonly collectionUiMembershipVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00OutsideSourceSearch{
  readonly contract:typeof DB00_OUTSIDE_ITEM_SEARCH_CONTRACT;
  /** Number of distinct Item IDs in all supplied public source readers. */
  readonly sourceLinkedItemIds:number;
  readonly outsidePublishedItemIds:number;
  search(request?:Db00OutsideSearchRequest):Db00OutsideSearchResult;
}
const ID=/^[1-9][0-9]{0,15}$/;
const KIND=/^[a-z][a-z_]{1,31}$/;
const FAMILIES:ReadonlySet<string>=new Set([
  'acquisition_origin','static_container_template','default_inventory_template',
  'starpath_relation','quest_target_reference'
]);
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB00_OUTSIDE_ITEM_SEARCH_'+code);
}
function validId(value:unknown):value is string{
  return typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value));
}

/** Builds one immutable positive-evidence index from the pinned source readers. */
export function createDb00OutsideSourceSearch(
  db:SharedGameDatabase,joined:Db00SourceJoinedReader,
  acquisition:PublicSourceCatalog,guide:GuideRewardIndex,
  questTargets:PublicQuestTargetReverseReader,
  /** IDs from the already DB-03 validated public Quest catalogue. */
  questIds:readonly string[]
):Db00OutsideSourceSearch{
  assert(db?.contract==='wand.game-db.shared@1'&&
    db.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db.itemCount===13202&&
    db.target.platform==='Steam'&&db.target.gameVersion==='1.26.2'&&
    joined?.contract==='wand.game-db.source-join@1'&&
    joined.snapshotId===db.snapshotId&&
    acquisition?.schema==='wand.db02.public-source-catalog@1'&&
    acquisition.gameVersion==='1.26.2'&&
    acquisition.coverage.combinedSourceRoutes===1255&&
    acquisition.coverage.staticContainerCandidateRoutes===146&&
    acquisition.coverage.configuredDefaultInventoryEntries===289&&
    acquisition.coverage.requiresPrivateGameArchive===false&&
    guide?.contract==='wand.db03.reward-relations@1'&&
    guide.evidence.integrity==='pinned_public_sha256'&&
    guide.evidence.gameVersion==='1.26.2'&&
    guide.coverage.currentAvailabilityVerified===false&&
    questTargets?.schema==='wand.db03.public-quest-target-reverse@1'&&
    questTargets.coverage.knownQuests===733&&
    questTargets.coverage.sourceCandidateOccurrences===4897&&
    questTargets.coverage.distinctItemIds===2551&&
    questTargets.coverage.playerProgressVerified===false&&
    questTargets.coverage.mandatoryRequirementVerified===false&&
    Array.isArray(questIds)&&questIds.length===733&&
    questIds.every(validId)&&new Set(questIds).size===733,
    'EXACT_PUBLIC_SOURCE_REQUIRED');
  const byId=new Map<string,Set<Db00OutsideEvidenceFamily>>();
  const attach=(id:string,family:Db00OutsideEvidenceFamily):void=>{
    assert(validId(id),'INVALID_SOURCE_ITEM_ID');
    let rows=byId.get(id);
    if(!rows){rows=new Set();byId.set(id,rows);}
    rows.add(family);
  };
  const {origins,staticContainerSource,defaultInventorySource}=acquisition;
  let originRoutes=0;
  for(const id of origins.listLinkedItemIds()){
    const rows=origins.getItem(id).origins;
    assert(rows.length>0&&rows.every(row=>row.itemId===id&&
      row.availability==='not_live_verified'&&
      (row.routeStatus==='confirmed_source_link'||
        row.routeStatus==='static_candidate_only')),
      'INVALID_ORIGIN_EVIDENCE');
    originRoutes+=rows.length;attach(id,'acquisition_origin');
  }
  assert(originRoutes===1255,'ORIGIN_CENSUS');
  let templates=0;
  for(const id of staticContainerSource.linkedItemIds){
    const rows=staticContainerSource.getItemCandidates(id);
    assert(rows.length>0&&rows.every(row=>row.itemId===id&&
      row.routeStatus==='static_candidate_only'),'INVALID_TEMPLATE_EVIDENCE');
    templates+=rows.length;attach(id,'static_container_template');
  }
  assert(templates===146,'TEMPLATE_CENSUS');
  let defaults=0;
  for(const id of defaultInventorySource.linkedItemIds){
    const rows=defaultInventorySource.getItemCandidates(id);
    assert(rows.length>0&&rows.every(row=>row.itemId===id&&
      row.routeStatus==='static_candidate_only'),'INVALID_DEFAULT_EVIDENCE');
    defaults+=rows.length;attach(id,'default_inventory_template');
  }
  assert(defaults===289,'DEFAULT_CENSUS');
  for(const id of guide.itemIds){
    const rows=guide.getItemRelations(id);
    assert(rows.length>0&&rows.every(row=>row.itemId===id&&
      row.configuredRewardOnly===true&&row.playerOwnershipVerified===false),
      'INVALID_STARPATH_REFERENCE');
    attach(id,'starpath_relation');
  }
  let questReferences=0;
  const questItemIds=new Set<string>();
  const questsWithCandidates=new Set<string>();
  for(const questId of questIds){
    const rows=questTargets.getQuestCandidates(questId);
    if(rows.length)questsWithCandidates.add(questId);
    for(const row of rows){
      assert(row.questId===questId&&validId(row.itemId)&&
        (row.role==='direct'||row.role==='alternative')&&
        row.sourceCandidateOnly===true&&
        row.mandatoryRequirementVerified===false&&
        row.playerProgressVerified===false,
        'INVALID_QUEST_TARGET_EVIDENCE');
      attach(row.itemId,'quest_target_reference');
      questItemIds.add(row.itemId);questReferences++;
    }
  }
  assert(questReferences===4897&&questItemIds.size===2551&&
    questsWithCandidates.size===627,'QUEST_TARGET_CENSUS');
  const outside=Object.freeze([...byId.entries()]
    .filter(([id])=>db.getItem(id)===null)
    .sort(([a],[b])=>Number(a)-Number(b))
    .map(([id,families])=>Object.freeze({
      itemId:id,evidenceFamilies:Object.freeze([...families])
    })));
  const all=byId.size;
  function search(request:Db00OutsideSearchRequest={}):Db00OutsideSearchResult{
    assert(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const idPrefix=request.idPrefix;
    assert(idPrefix===undefined||validId(idPrefix),'INVALID_ID_PREFIX');
    const familyFilter=request.evidenceFamilies;
    assert(familyFilter===undefined||Array.isArray(familyFilter)&&
      familyFilter.length>0&&familyFilter.length<=5&&
      familyFilter.every(x=>FAMILIES.has(x))&&
      new Set(familyFilter).size===familyFilter.length,
      'INVALID_EVIDENCE_FAMILIES');
    const originKinds=request.originKinds;
    assert(originKinds===undefined||Array.isArray(originKinds)&&
      originKinds.length>0&&originKinds.length<=22&&
      originKinds.every(kind=>typeof kind==='string'&&KIND.test(kind))&&
      new Set(originKinds).size===originKinds.length,
      'INVALID_ORIGIN_KINDS');
    const questId=request.questTargetQuestId;
    assert(questId===undefined||validId(questId),'INVALID_QUEST_ID');
    const offset=request.offset??0,limit=request.limit??100;
    assert(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const matches=outside.filter(row=>{
      if(idPrefix&&!row.itemId.startsWith(idPrefix))return false;
      if(familyFilter&&!familyFilter.some(f=>row.evidenceFamilies.includes(f)))return false;
      if(originKinds&&!origins.getItem(row.itemId).origins.some(
        origin=>originKinds.includes(origin.kind)))return false;
      if(questId&&!questTargets.getItemCandidates(row.itemId).some(
        candidate=>candidate.questId===questId))return false;
      return true;
    });
    const selected=matches.slice(offset,offset+limit);
    const joinedItems=joined.getItems(selected.map(x=>x.itemId));
    const items=selected.map((row,i):Db00OutsideSourceItem=>{
      const item=joinedItems[i];
      assert(item.itemId===row.itemId&&item.catalog===null&&
        item.catalogStatus==='outside_published_item_scope',
        'ITEMLIST_SCOPE_MISMATCH');
      return Object.freeze({
        itemId:row.itemId,evidenceFamilies:row.evidenceFamilies,item,
        publishedItemDefinitionPresent:false as const,
        gameUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const
      });
    });
    const next=offset+selected.length;
    return Object.freeze({
      scope:'source_linked_outside_published_itemlist' as const,
      snapshotId:db.snapshotId,
      total:matches.length,offset,
      nextOffset:next<matches.length?next:null,
      items:Object.freeze(items),
      sourceCoverageComplete:false as const,
      collectionUiMembershipVerified:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_OUTSIDE_ITEM_SEARCH_CONTRACT,
    sourceLinkedItemIds:all,outsidePublishedItemIds:outside.length,search
  });
}
