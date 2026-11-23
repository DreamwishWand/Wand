/**
 * DB-00 read-only Item-ID crosswalk to DB-02 original LootTable candidates.
 *
 * These are STATIC table entry references; the underlying game may gate a
 * table, group, entry or spawn. Nothing here proves a loot drop, obtainable
 * item, gameplay context, DLC entitlement or player possession.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  hasPinnedNativeLootCandidateEvidence,DB02_NATIVE_LOOT_SCHEMA,
  type NativeLootCandidateIndex,type NativeLootCandidate,
  type NativeLootTable,type NativeLootGroup
} from '../acquisition/public-native-loot.ts';
import type {ItemOrigin} from '../acquisition/origins.ts';

export const DB00_NATIVE_LOOT_CONTRACT=
  'wand.game-db.native-loot-candidate-join@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB00_NATIVE_LOOT_'+why);
}
export interface Db00NativeLootItem{
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  /** Static candidates; NOT confirmed acquisitions or guaranteed drops. */
  readonly candidates:readonly NativeLootCandidate[];
  readonly staticCandidateOrigins:readonly ItemOrigin[];
  readonly sourceCandidateOnly:true;
  readonly actualGameplayContextVerified:false;
  readonly guaranteedDropVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeLootEntry{
  readonly candidate:NativeLootCandidate;
  readonly item:Db00NativeLootItem;
  readonly sourceCandidateOnly:true;
  readonly guaranteedDropVerified:false;
}
export interface Db00NativeLootGroup{
  readonly originalGroup:NativeLootGroup;
  readonly entries:readonly Db00NativeLootEntry[];
  readonly sourceCandidateOnly:true;
  readonly groupRuntimeEligibilityVerified:false;
}
export interface Db00NativeLootTable{
  readonly originalTable:NativeLootTable;
  readonly groups:readonly Db00NativeLootGroup[];
  readonly sourceCandidateOnly:true;
  readonly tableUsageContextVerified:false;
}
export interface Db00NativeLootSearchRequest{
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeLootPage{
  readonly scope:'original_static_loot_candidates_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeLootItem[];
  readonly guaranteedDropVerified:false;
  readonly actualGameplayContextVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeLootReader{
  readonly contract:typeof DB00_NATIVE_LOOT_CONTRACT;
  readonly snapshotId:string;
  readonly originalTables:960;
  readonly originalGroups:2087;
  readonly staticCandidateRelations:3804;
  readonly distinctCandidateItemIds:1100;
  readonly sourceCandidateOnly:true;
  readonly guaranteedDropVerified:false;
  readonly actualGameplayContextVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00NativeLootItem;
  getTable(tableId:string|number):Db00NativeLootTable|null;
  getGroup(tableId:string|number,groupIndex:number):Db00NativeLootGroup|null;
  search(request?:Db00NativeLootSearchRequest):Db00NativeLootPage;
}

export function createDb00NativeLootReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativeLootCandidateIndex
):Db00NativeLootReader{
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  const coverage=source?.coverage;
  check(hasPinnedNativeLootCandidateEvidence(source) &&
    source.schema===DB02_NATIVE_LOOT_SCHEMA &&
    source.gameVersion==='1.26.2' &&
    source.source.kind==='verified_game_native' &&
    source.source.gameVersion==='1.26.2' &&
    source.source.sha256===
      '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c' &&
    coverage.nativeTables===960 &&
    coverage.nativeGroups===2087 &&
    coverage.groupsWithoutExplicitItems===198 &&
    coverage.candidateRelations===3804 &&
    coverage.distinctCandidateItemIds===1100 &&
    coverage.unconditionalEntryReferences===3744 &&
    coverage.conditionalEntryReferences===60 &&
    coverage.dynamicFilterGroups===163 &&
    coverage.eligibilityGateGroups===11 &&
    coverage.actualAcquisitionContextsVerified===0 &&
    coverage.guaranteedDropsVerified===0 &&
    coverage.liveAvailabilityVerified===false &&
    coverage.playerOwnershipVerified===false &&
    coverage.sourceCoverageComplete===false &&
    source.tables.length===960 &&
    source.candidates.length===3804 &&
    source.staticCandidateOrigins.length===3804 &&
    source.listTableIds().length===960 &&
    source.listCandidateItemIds().length===1100 &&
    typeof source.getItemCandidates==='function' &&
    typeof source.getTable==='function',
    'PINNED_DB02_LOOT_SOURCE_REQUIRED');

  function getItem(rawId:string|number):Db00NativeLootItem{
    const itemId=canonicalId(rawId);
    const item=joined.getItem(itemId);
    const candidates=source.getItemCandidates(itemId);
    const staticCandidateOrigins=source.getItemStaticOrigins(itemId);
    check(item.itemId===itemId &&
      item.currentlyAvailableVerified===false &&
      item.playerOwnershipVerified===false &&
      candidates.length===staticCandidateOrigins.length &&
      candidates.every(candidate=>
        candidate.itemId===itemId &&
        candidate.routeStatus==='static_candidate_only' &&
        candidate.gameplayContextVerified===false &&
        candidate.itemGrantVerified===false &&
        staticCandidateOrigins.some(origin=>
          origin.itemId===itemId &&
          origin.originId==='native:path:'+candidate.pathId &&
          origin.kind==='loot' &&
          origin.routeStatus==='static_candidate_only' &&
          origin.availability==='not_live_verified')),
      'SOURCE_ITEM_CANDIDATE_JOIN_MISMATCH');
    return Object.freeze({
      itemId,item,candidates,staticCandidateOrigins,
      sourceCandidateOnly:true as const,
      actualGameplayContextVerified:false as const,
      guaranteedDropVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function wrapGroup(group:NativeLootGroup|null):Db00NativeLootGroup|null{
    if(group===null)return null;
    const entries=Object.freeze(group.candidates.map(candidate=>{
      const item=getItem(candidate.itemId);
      check(item.candidates.includes(candidate),'TABLE_ITEM_REVERSE_MISMATCH');
      return Object.freeze({
        candidate,item,sourceCandidateOnly:true as const,
        guaranteedDropVerified:false as const
      });
    }));
    check(group.guaranteedLoot===false &&
      entries.length===group.candidates.length,
      'UNVERIFIED_GROUP_GUARANTEE');
    return Object.freeze({
      originalGroup:group,entries,sourceCandidateOnly:true as const,
      groupRuntimeEligibilityVerified:false as const
    });
  }
  function search(request:Db00NativeLootSearchRequest={}):Db00NativeLootPage{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    check(typeof raw==='string'&&raw.length<=120 &&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const needle=raw.normalize('NFKC').toLocaleLowerCase().trim();
    const ids=source.listCandidateItemIds().filter(itemId=>{
      const published=database.getItem(itemId);
      if(request.publishedOnly&&!published)return false;
      return !needle||itemId.startsWith(needle)||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle);
    });
    const items=Object.freeze(ids.slice(offset,offset+limit).map(getItem));
    const next=offset+items.length;
    return Object.freeze({
      scope:'original_static_loot_candidates_only' as const,
      snapshotId:database.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,
      items,guaranteedDropVerified:false as const,
      actualGameplayContextVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_LOOT_CONTRACT,
    snapshotId:database.snapshotId,
    originalTables:960 as const,originalGroups:2087 as const,
    staticCandidateRelations:3804 as const,distinctCandidateItemIds:1100 as const,
    sourceCandidateOnly:true as const,
    guaranteedDropVerified:false as const,
    actualGameplayContextVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem,
    getTable(id:string|number):Db00NativeLootTable|null{
      const table=source.getTable(canonicalId(id));
      if(table===null)return null;
      const groups=Object.freeze(table.groups.map(group=>wrapGroup(group)!));
      check(table.gameplayContextVerified===false &&
        groups.length===table.groups.length,'SOURCE_TABLE_CONTEXT_MISMATCH');
      return Object.freeze({
        originalTable:table,groups,sourceCandidateOnly:true as const,
        tableUsageContextVerified:false as const
      });
    },
    getGroup(id:string|number,groupIndex:number):Db00NativeLootGroup|null{
      return wrapGroup(source.getGroup(canonicalId(id),groupIndex));
    },
    search
  });
}
