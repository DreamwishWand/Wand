/**
 * DB-00 read-only Item-ID bridge to DB-02's SHA-pinned Steam v1.26.2
 * fishing, mining, timebending and growing source paths.
 *
 * The definitions prove a configured result reference, never a live drop,
 * a world unlock, a guaranteed harvest or player ownership.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  hasPinnedNativeActivityEvidence,DB02_NATIVE_ACTIVITY_SCHEMA,
  type NativeActivityResultIndex,type NativeActivityResultPath,
  type NativeActivityMethod
} from '../acquisition/public-native-activities.ts';
import type {ItemOrigin} from '../acquisition/origins.ts';

export const DB00_NATIVE_ACTIVITY_CONTRACT=
  'wand.game-db.native-activity-join@1' as const;
const METHODS=new Set<string>(['fishing','mining','timebending','farming']);
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB00_NATIVE_ACTIVITY_'+code);
}
export interface Db00NativeActivityItem {
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  /** All original definitions that reference this result Item ID. */
  readonly sourcePaths:readonly NativeActivityResultPath[];
  /** Separate from existing DB-02 origins; no silent promotion to availability. */
  readonly sourcePathOrigins:readonly ItemOrigin[];
  readonly staticSourceOnly:true;
  readonly actualOccurrenceGuaranteed:false;
  readonly currentAvailabilityVerified:false;
  readonly playerUnlockVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeActivityDefinition {
  readonly sourcePath:NativeActivityResultPath;
  readonly result:Db00NativeActivityItem;
  readonly sourceConfigurationOnly:true;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00NativeActivitySearchRequest {
  readonly method?:NativeActivityMethod;
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeActivityPage {
  readonly scope:'original_activity_result_paths_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeActivityItem[];
  readonly staticSourceOnly:true;
  readonly actualOccurrenceGuaranteed:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeActivityReader {
  readonly contract:typeof DB00_NATIVE_ACTIVITY_CONTRACT;
  readonly snapshotId:string;
  readonly sourcePaths:763;
  readonly distinctResultItemIds:489;
  readonly originalSourceOnly:true;
  readonly actualOccurrenceGuaranteed:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00NativeActivityItem;
  getDefinitionPath(definitionId:string|number):Db00NativeActivityDefinition|null;
  /** Seed is an input Item ID; never confuse it with the produced Item. */
  getSeedPath(seedItemId:string|number):Db00NativeActivityDefinition|null;
  search(request?:Db00NativeActivitySearchRequest):Db00NativeActivityPage;
}

/** DB-02 has independently pinned the public bytes and original source SHAs. */
export function createDb00NativeActivityReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativeActivityResultIndex
):Db00NativeActivityReader {
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  check(hasPinnedNativeActivityEvidence(source) &&
    source.schema===DB02_NATIVE_ACTIVITY_SCHEMA &&
    source.gameVersion==='1.26.2' &&
    source.coverage.activityDataDefinitions===2630 &&
    source.coverage.activityItemDefinitions===4050 &&
    source.coverage.nativeResultPaths===763 &&
    source.coverage.fishingPaths===282 &&
    source.coverage.miningPaths===299 &&
    source.coverage.timebendingPaths===82 &&
    source.coverage.growingPaths===100 &&
    source.coverage.distinctResultItemIds===489 &&
    source.coverage.contextAvailabilityVerified===false &&
    source.coverage.playerUnlockVerified===false &&
    source.coverage.staticPathsNotGuaranteedDrops===true &&
    source.coverage.allAcquisitionRoutesCovered===false &&
    source.paths.length===763 && source.origins.length===763 &&
    source.listResultItemIds().length===489 &&
    typeof source.getItemPaths==='function' &&
    typeof source.getDefinitionPath==='function',
    'PINNED_DB02_ACTIVITY_SOURCE_REQUIRED');

  function getItem(rawId:string|number):Db00NativeActivityItem {
    const itemId=canonicalId(rawId);
    const item=joined.getItem(itemId);
    const sourcePaths=source.getItemPaths(itemId);
    const sourcePathOrigins=source.getItemOrigins(itemId);
    check(item.itemId===itemId &&
      item.currentlyAvailableVerified===false &&
      item.playerOwnershipVerified===false &&
      sourcePaths.length===sourcePathOrigins.length &&
      sourcePaths.every(path=>
        path.resultItemId===itemId &&
        path.occurrenceGuaranteed===false &&
        path.currentAvailabilityVerified===false &&
        sourcePathOrigins.some(origin=>
          origin.itemId===itemId &&
          origin.originId==='native:path:'+path.pathId &&
          origin.routeStatus==='confirmed_source_link' &&
          origin.availability==='not_live_verified')),
      'SOURCE_ITEM_ORIGIN_JOIN_MISMATCH');
    return Object.freeze({
      itemId,item,sourcePaths,sourcePathOrigins,
      staticSourceOnly:true as const,
      actualOccurrenceGuaranteed:false as const,
      currentAvailabilityVerified:false as const,
      playerUnlockVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function wrapPath(path:NativeActivityResultPath|null):
    Db00NativeActivityDefinition|null {
    if(!path)return null;
    const result=getItem(path.resultItemId);
    check(result.sourcePaths.includes(path),'REVERSE_ITEM_PATH_MISMATCH');
    return Object.freeze({
      sourcePath:path,result,
      sourceConfigurationOnly:true as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  function search(request:Db00NativeActivitySearchRequest={}):
    Db00NativeActivityPage {
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const method=request.method;
    check(method===undefined||METHODS.has(method),'INVALID_METHOD');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const text=request.text??'';
    check(typeof text==='string'&&text.length<=120&&
      !/[\x00-\x1f]/.test(text),'INVALID_TEXT');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,
      'INVALID_PAGE');
    const needle=text.normalize('NFKC').toLocaleLowerCase().trim();
    const ids=source.listResultItemIds(method).filter(itemId=>{
      const published=database.getItem(itemId);
      if(request.publishedOnly&&!published)return false;
      return !needle||itemId.startsWith(needle)||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle);
    });
    const items=Object.freeze(ids.slice(offset,offset+limit).map(getItem));
    const next=offset+items.length;
    return Object.freeze({
      scope:'original_activity_result_paths_only' as const,
      snapshotId:database.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,
      items,staticSourceOnly:true as const,
      actualOccurrenceGuaranteed:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_ACTIVITY_CONTRACT,
    snapshotId:database.snapshotId,
    sourcePaths:763 as const,distinctResultItemIds:489 as const,
    originalSourceOnly:true as const,
    actualOccurrenceGuaranteed:false as const,
    playerOwnershipVerified:false as const,
    getItem,
    getDefinitionPath:(id:string|number)=>
      wrapPath(source.getDefinitionPath(canonicalId(id))),
    getSeedPath:(id:string|number)=>
      wrapPath(source.getSeedPath(canonicalId(id))),
    search
  });
}
