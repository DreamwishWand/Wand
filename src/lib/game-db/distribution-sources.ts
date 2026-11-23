/**
 * DB-00 public, browser-ready Item ID -> distribution source evidence.
 *
 * DB-02 owns source hashing and the three-way route classifier:
 * ordinary gameplay, gameplay-clock conditions, real-world distribution.
 * These are evidence ROUTES, not three exclusive item rarity groups.
 * A single Item ID can have multiple evidence families. No native category,
 * store/name candidate, historical campaign or Tag verifies actual purchase,
 * current availability, grant, player ownership, or Collection UI membership.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {
  Db00SourceJoinedItem,Db00SourceJoinedReader
} from './source-join.ts';
import {
  DB02_DISTRIBUTION_SCOPE_SCHEMA,
  type DistributionScopeIndex,type DistributionScopeItem,
  type DistributionScope,type DistributionEvidenceKind
} from '../acquisition/distribution-scopes.ts';

export const DB00_DISTRIBUTION_SOURCE_CONTRACT=
  'wand.game-db.distribution-source-search@1' as const;
const SCOPES=Object.freeze([
  'ordinary_gameplay','gameplay_time_condition','real_world_distribution'
] as const);
const EVIDENCE=Object.freeze([
  'native_online_category','native_pet_source_category',
  'configured_item_origin','campaign_or_shop_name_candidate'
] as const);
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB00_DISTRIBUTION_'+code);
}
export interface Db00DistributionSourceItem{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly distribution:DistributionScopeItem;
  /** Some Item IDs have both gameplay and real-world paths. */
  readonly canHaveMultipleScopes:true;
  readonly sourceCoverageComplete:false;
  readonly exclusiveTimeLimitedItemVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
}
export interface Db00DistributionSearchRequest{
  readonly scope?:DistributionScope;
  readonly evidenceKind?:DistributionEvidenceKind;
  /** Use only DB-02 original exact configured ItemOrigin links. */
  readonly exactConfiguredItemIdLinkOnly?:true;
  /** Filter to 13,202 public ItemList rows; default keeps outside IDs too. */
  readonly publishedOnly?:true;
  /** Original Item ID prefix or published localized Item name substring. */
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00DistributionSearchPage{
  readonly scope:'distribution_source_evidence';
  readonly snapshotId:string;
  readonly filterScope:DistributionScope|null;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00DistributionSourceItem[];
  readonly sourceCoverageComplete:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly exclusiveTimeLimitedItemVerified:false;
}
export interface Db00DistributionSourceReader{
  readonly contract:typeof DB00_DISTRIBUTION_SOURCE_CONTRACT;
  readonly snapshotId:string;
  readonly coveredSourceItemCount:number;
  readonly nativeOnlineCategoryRows:2198;
  readonly nativePetSourceRows:134;
  /** Unmodified original published DB-02 ledger routes. */
  readonly configuredOriginRoutes:1255;
  /** Full original source relations including 1943 recipes and 763 paths. */
  readonly indexedOriginalSourceRoutes:3961;
  readonly nameOnlyCandidateRelations:number;
  readonly sourceCoverageComplete:false;
  readonly exclusiveTimeLimitedItemVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00DistributionSourceItem;
  search(request?:Db00DistributionSearchRequest):
    Db00DistributionSearchPage;
}

export function createDb00DistributionSourceReader(
  db:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:DistributionScopeIndex
):Db00DistributionSourceReader{
  check(db?.contract==='wand.game-db.shared@1' &&
    db.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    db.target.platform==='Steam'&&db.target.gameVersion==='1.26.2'&&
    db.itemCount===13202 &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===db.snapshotId &&
    source?.schema===DB02_DISTRIBUTION_SCOPE_SCHEMA &&
    source.gameVersion==='1.26.2'&&
    source.scopeCoverageComplete===false &&
    source.coverage?.nativeOnlineCategoryRows===2198 &&
    source.coverage.nativePetSourceRows===134 &&
    source.coverage.existingSourceOriginRoutes===1255 &&
    source.coverage.nativeRecipeDefinitionRoutes===1943 &&
    source.coverage.nativeActivityResultRoutes===763 &&
    source.coverage.indexedOriginalSourceRoutes===3961 &&
    source.coverage.expandedNativeSourceEvidenceLoaded===true &&
    source.coverage.currentAvailabilityVerified===false &&
    source.coverage.exclusiveTimeLimitedItemVerified===false &&
    source.coverage.playerOwnershipVerified===false &&
    typeof source.getItem==='function' &&
    typeof source.listItemIds==='function',
    'EXACT_DB00_DB02_CURRENT_SOURCE_REQUIRED');
  const ids=source.listItemIds();
  check(Array.isArray(ids) &&
    ids.length===source.coverage.distinctItemsWithSourceEvidence&&
    ids.every((id,i)=>typeof id==='string'&&
      canonicalId(id)===id&&
      (i===0||Number(id)>Number(ids[i-1]))),
    'SOURCE_ITEM_ID_ORDER_OR_CENSUS');
  const scopesById=new Map<string,DistributionScopeItem>();
  const evidenceTotals=new Map<string,number>(EVIDENCE.map(x=>[x,0]));
  for(const id of ids){
    const record=source.getItem(id);
    check(record.itemId===id &&
      record.unknownBecauseNoEvidence===false &&
      record.scopeCoverageComplete===false &&
      record.exclusiveTimeLimitedItemVerified===false &&
      record.currentAvailabilityVerified===false &&
      record.playerOwnershipVerified===false &&
      Array.isArray(record.evidence)&&record.evidence.length>0&&
      Array.isArray(record.scopes)&&record.scopes.length>0 &&
      record.scopes.every(x=>SCOPES.includes(x)) &&
      new Set(record.scopes).size===record.scopes.length &&
      SCOPES.filter(x=>record.scopes.includes(x)).every(
        (x,i)=>record.scopes[i]===x),
      'SOURCE_ITEM_OR_SCOPES_CORRUPT');
    for(const e of record.evidence){
      check(e.itemId===id &&
        SCOPES.includes(e.scope) &&
        EVIDENCE.includes(e.evidenceKind) &&
        e.relation?.itemId===id &&
        e.liveAvailabilityVerified===false &&
        e.exclusiveTimeLimitedItemVerified===false &&
        e.playerOwnershipVerified===false &&
        typeof e.exactConfiguredItemIdLink==='boolean' &&
        typeof e.acquisitionMethodVerified==='boolean' &&
        typeof e.nameMatchOnly==='boolean' &&
        record.scopes.includes(e.scope) &&
        (e.evidenceKind==='configured_item_origin' ||
          (!e.exactConfiguredItemIdLink&&!e.acquisitionMethodVerified)) &&
        (e.evidenceKind==='campaign_or_shop_name_candidate'?
          e.nameMatchOnly===true&&
          e.exactConfiguredItemIdLink===false:
          e.nameMatchOnly===false),
        'SOURCE_EVIDENCE_INFLATED_OR_CORRUPT');
      evidenceTotals.set(e.evidenceKind,
        evidenceTotals.get(e.evidenceKind)!+1);
    }
    check(record.scopes.every(scope=>
      record.evidence.some(x=>x.scope===scope)),
      'SOURCE_SCOPE_WITHOUT_EVIDENCE');
    scopesById.set(id,record);
  }
  check(evidenceTotals.get('native_online_category')===2198 &&
    evidenceTotals.get('native_pet_source_category')===134 &&
    evidenceTotals.get('configured_item_origin')===3961 &&
    evidenceTotals.get('campaign_or_shop_name_candidate')===
      source.coverage.nameOnlyCandidateRelations &&
    scopesById.size===ids.length,
    'PINNED_EVIDENCE_FAMILY_CENSUS_DRIFT');
  const byScope=new Map<DistributionScope,readonly string[]>();
  for(const scope of SCOPES){
    const listed=source.listItemIds(scope);
    const expected=ids.filter(id=>scopesById.get(id)!.scopes.includes(scope));
    check(Array.isArray(listed)&&
      listed.length===expected.length&&
      listed.every((id,i)=>id===expected[i]) &&
      listed.length===source.coverage[
        scope==='ordinary_gameplay'?'ordinaryGameplayItemIds':
        scope==='gameplay_time_condition'?'gameplayTimeConditionItemIds':
          'realWorldDistributionItemIds'
      ],'SCOPE_REVERSE_INDEX_OR_CENSUS_MISMATCH');
    byScope.set(scope,Object.freeze([...listed]));
  }
  const ALL=Object.freeze([...ids]);
  function getItem(raw:string|number):Db00DistributionSourceItem{
    const id=canonicalId(raw);
    const shared=joined.getItem(id);
    const distribution=scopesById.get(id)??source.getItem(id);
    check(shared.itemId===id &&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false &&
      distribution.itemId===id &&
      distribution.scopeCoverageComplete===false &&
      distribution.exclusiveTimeLimitedItemVerified===false &&
      distribution.currentAvailabilityVerified===false &&
      distribution.playerOwnershipVerified===false &&
      (scopesById.has(id)||(
        distribution.unknownBecauseNoEvidence===true &&
        distribution.scopes.length===0&&
        distribution.evidence.length===0)),
      'DB00_ITEM_OR_EMPTY_EVIDENCE_MISMATCH');
    return Object.freeze({
      itemId:id,shared,distribution,
      canHaveMultipleScopes:true as const,
      sourceCoverageComplete:false as const,
      exclusiveTimeLimitedItemVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      gameCollectionUiMembershipVerified:false as const
    });
  }
  function search(request:Db00DistributionSearchRequest={}):
    Db00DistributionSearchPage{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const scope=request.scope;
    check(scope===undefined||SCOPES.includes(scope),
      'INVALID_SCOPE');
    const kind=request.evidenceKind;
    check(kind===undefined||EVIDENCE.includes(kind),
      'INVALID_EVIDENCE_KIND');
    check(request.exactConfiguredItemIdLinkOnly===undefined||
      request.exactConfiguredItemIdLinkOnly===true,
      'INVALID_EXACT_SOURCE_FILTER');
    check(request.publishedOnly===undefined||
      request.publishedOnly===true,'INVALID_PUBLISHED_FILTER');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    check(typeof raw==='string'&&raw.length<=120&&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,
      'INVALID_PAGE');
    const text=raw.normalize('NFKC').toLocaleLowerCase().trim();
    const candidates=scope===undefined?ALL:byScope.get(scope)!;
    const matched=candidates.filter(id=>{
      const record=scopesById.get(id)!;
      if(kind!==undefined||request.exactConfiguredItemIdLinkOnly){
        const has=record.evidence.some(e=>
          (scope===undefined||e.scope===scope) &&
          (kind===undefined||e.evidenceKind===kind) &&
          (!request.exactConfiguredItemIdLinkOnly||
            e.evidenceKind==='configured_item_origin'&&
            e.exactConfiguredItemIdLink===true)
        );
        if(!has)return false;
      }
      const catalog=db.getItem(id);
      if(request.publishedOnly&&catalog===null)return false;
      if(text&&!(id.startsWith(text)||
        !!catalog?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(text)))return false;
      return true;
    });
    const items=Object.freeze(
      matched.slice(offset,offset+limit).map(getItem)
    );
    const next=offset+items.length;
    return Object.freeze({
      scope:'distribution_source_evidence' as const,
      snapshotId:db.snapshotId,filterScope:scope??null,
      total:matched.length,offset,
      nextOffset:next<matched.length?next:null,
      items,
      sourceCoverageComplete:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      exclusiveTimeLimitedItemVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_DISTRIBUTION_SOURCE_CONTRACT,
    snapshotId:db.snapshotId,
    coveredSourceItemCount:ALL.length,
    nativeOnlineCategoryRows:2198 as const,
    nativePetSourceRows:134 as const,
    configuredOriginRoutes:1255 as const,
    indexedOriginalSourceRoutes:3961 as const,
    nameOnlyCandidateRelations:
      source.coverage.nameOnlyCandidateRelations,
    sourceCoverageComplete:false as const,
    exclusiveTimeLimitedItemVerified:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem,search
  });
}
