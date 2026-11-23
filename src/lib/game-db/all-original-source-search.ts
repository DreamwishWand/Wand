/**
 * DB-00 public search over DB-02's authenticated 8,200 original Item-source
 * relations, retaining the original 3,961 definition/result references and
 * 4,239 UNVERIFIED static candidates as separate evidence.
 *
 * DB-02 owns source parsing, SHA checks, original relation identity and all
 * same-row predicates. This adapter only adds shared Item IDs/locale names.
 * Never interpret LootTable occurrence, default-inventory template or
 * container slot as a guaranteed drop, player grant or current availability.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA,
  type AllOriginalItemSourceBrowser,type ItemSourceBrowserRow,
  type ItemSourceFilter,type ItemSourceBrowserResult
} from '../acquisition/item-source-browser.ts';

export const DB00_ALL_ORIGINAL_SOURCE_SEARCH_CONTRACT=
  'wand.game-db.all-original-item-source-search@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
const SAFE_TEXT=/^[^\x00-\x1f]{0,120}$/;
const BATCH=500,MAX_PAGE=120;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_ALL_ORIGINAL_SOURCE_'+reason);
}
export interface Db00AllOriginalSourceItem{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  /** Only the original relations matching the requested source predicates. */
  readonly original:ItemSourceBrowserRow;
  readonly confirmedDefinitionReferences:number;
  readonly unverifiedStaticCandidates:number;
  readonly noIndexedSourceEvidence:boolean;
  readonly originalSourceOnly:true;
  readonly completeAcquisitionCoverage:false;
  readonly actualLootOrHarvestVerified:false;
  readonly guaranteedDropVerified:false;
  readonly playerGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
}
export interface Db00AllOriginalSearchRequest{
  /** DB-02 applies ALL predicates against one and the same source relation. */
  readonly source?:ItemSourceFilter;
  /** Item ID prefix or localized CURRENT published Item name. */
  readonly text?:string;
  readonly locale?:DbLocale;
  /** When true, omit original source Item IDs outside DB-00's ItemList. */
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00AllOriginalSearchPage{
  readonly snapshotId:string;
  readonly scope:'original_definition_and_unverified_static_candidates';
  readonly totalItemIds:number;
  readonly totalSourceRelations:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00AllOriginalSourceItem[];
  readonly originalSourceOnly:true;
  readonly completeAcquisitionCoverage:false;
  readonly actualLootOrHarvestVerified:false;
  readonly guaranteedDropVerified:false;
  readonly playerGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
}
export interface Db00AllOriginalSourceReader{
  readonly contract:typeof DB00_ALL_ORIGINAL_SOURCE_SEARCH_CONTRACT;
  readonly snapshotId:string;
  readonly originalDefinitionReferences:3961;
  readonly unverifiedStaticCandidateReferences:4239;
  readonly indexedSourceRelations:8200;
  readonly sourceItemIds:number;
  readonly completeAcquisitionCoverage:false;
  readonly guaranteedDropVerified:false;
  readonly playerGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  getItem(itemId:string|number):Db00AllOriginalSourceItem;
  search(query?:Db00AllOriginalSearchRequest):Db00AllOriginalSearchPage;
}

/** Source data is supplied by DB-02's already source-authenticated loader. */
export function createDb00AllOriginalSourceReader(
  db:SharedGameDatabase,joined:Db00SourceJoinedReader,
  source:AllOriginalItemSourceBrowser
):Db00AllOriginalSourceReader{
  check(db?.contract==='wand.game-db.shared@1'&&
    db.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db.itemCount===13202&&db.target.platform==='Steam'&&
    db.target.gameVersion==='1.26.2'&&
    joined?.contract==='wand.game-db.source-join@1'&&
    joined.snapshotId===db.snapshotId&&
    source?.schema==='wand.db02.item-source-browser@1'&&
    source.combinedSchema===DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA&&
    source.gameVersion==='1.26.2'&&
    source.sourceEvidenceOnly===true&&
    source.originCoverageComplete===false&&
    source.liveAvailabilityVerified===false&&
    source.coverage?.baselinePublishedRoutes===1255&&
    source.coverage.nativeRecipeAndActivityRoutes===2706&&
    source.coverage.originalSourceRelations===3961&&
    source.coverage.staticCandidateRelations===4239&&
    source.coverage.combinedSourceRelations===8200&&
    source.coverage.actualLootGrantedVerified===false&&
    source.coverage.completeAcquisitionCoverage===false&&
    source.coverage.currentAvailabilityVerified===false&&
    source.coverage.playerOwnershipVerified===false&&
    typeof source.query==='function'&&typeof source.getItem==='function'&&
    Array.isArray(source.knownLinkedItemIds)&&
    source.knownLinkedItemIds.length===
      source.coverage.distinctReferencedItemIds,
    'SOURCE_AUTHENTICATED_CURRENT_SNAPSHOT_REQUIRED');
  const census=source.query({},{offset:0,limit:1});
  check(census.totalOriginRelations===8200&&
    census.totalItemIds===source.knownLinkedItemIds.length&&
    census.sourceEvidenceOnly===true&&
    census.originCoverageComplete===false&&
    census.liveAvailabilityVerified===false&&
    source.knownLinkedItemIds.every((id,i)=>
      canonicalId(id)===id&&
      (i===0||Number(id)>Number(source.knownLinkedItemIds[i-1]))),
    'SOURCE_ORIGINAL_CENSUS_MISMATCH');
  function makeRow(row:ItemSourceBrowserRow):Db00AllOriginalSourceItem{
    const shared=joined.getItem(row.itemId);
    check(shared.itemId===row.itemId&&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false&&
      row.availabilityVerified===false&&
      Array.isArray(row.origins)&&
      Array.isArray(row.confirmedSourceLinks)&&
      Array.isArray(row.staticCandidates)&&
      row.origins.length===
        row.confirmedSourceLinks.length+row.staticCandidates.length&&
      row.confirmedSourceLinks.every(r=>
        r.itemId===row.itemId&&
        r.routeStatus==='confirmed_source_link'&&
        row.origins.includes(r))&&
      row.staticCandidates.every(r=>
        r.itemId===row.itemId&&
        r.routeStatus==='static_candidate_only'&&
        row.origins.includes(r))&&
      row.origins.every(r=>
        r.itemId===row.itemId&&
        r.availability==='not_live_verified'&&
        (r.routeStatus==='confirmed_source_link'||
          r.routeStatus==='static_candidate_only')),
      'SOURCE_ORIGINAL_ROW_INVALID');
    return Object.freeze({
      itemId:row.itemId,shared,original:row,
      confirmedDefinitionReferences:row.confirmedSourceLinks.length,
      unverifiedStaticCandidates:row.staticCandidates.length,
      noIndexedSourceEvidence:row.origins.length===0,
      originalSourceOnly:true as const,
      completeAcquisitionCoverage:false as const,
      actualLootOrHarvestVerified:false as const,
      guaranteedDropVerified:false as const,
      playerGrantVerified:false as const,
      currentAvailabilityVerified:false as const,
      gameCollectionUiMembershipVerified:false as const
    });
  }
  function getItem(raw:string|number){
    const id=canonicalId(raw);
    return makeRow(source.getItem(id));
  }
  function parseQuery(q:Db00AllOriginalSearchRequest){
    check(q!==null&&typeof q==='object'&&!Array.isArray(q),
      'INVALID_QUERY');
    const filter=q.source??{};
    check(filter!==null&&typeof filter==='object'&&!Array.isArray(filter),
      'INVALID_SOURCE_FILTER');
    const locale=q.locale??'en',text=q.text??'';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    check(typeof text==='string'&&SAFE_TEXT.test(text),
      'INVALID_TEXT');
    check(q.publishedOnly===undefined||q.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=q.offset??0,limit=q.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=MAX_PAGE,
      'INVALID_PAGING');
    return {filter,locale,text:text.normalize('NFKC').toLocaleLowerCase().trim(),
      publishedOnly:q.publishedOnly===true,offset,limit};
  }
  function verifyPage(page:ItemSourceBrowserResult,offset:number,limit:number,
    expectedTotal:number|null):void{
    check(page?.offset===offset&&page.limit===limit&&
      Number.isSafeInteger(page.totalItemIds)&&
      page.totalItemIds>=0&&
      page.totalItemIds<=source.knownLinkedItemIds.length&&
      Number.isSafeInteger(page.totalOriginRelations)&&
      page.totalOriginRelations>=0&&page.totalOriginRelations<=8200&&
      Array.isArray(page.items)&&page.items.length<=limit&&
      page.items.length<=Math.max(0,page.totalItemIds-offset)&&
      (offset>=page.totalItemIds||page.items.length>0)&&
      page.hasMore===(offset+page.items.length<page.totalItemIds)&&
      page.sourceEvidenceOnly===true&&
      page.originCoverageComplete===false&&
      page.liveAvailabilityVerified===false&&
      (expectedTotal===null||page.totalItemIds===expectedTotal)&&
      page.items.every((row,i)=>
        typeof row.itemId==='string'&&
        (i===0||Number(row.itemId)>Number(page.items[i-1].itemId))),
      'SOURCE_FILTERED_PAGE_INVALID');
  }
  function wrap(rows:readonly ItemSourceBrowserRow[],totalItemIds:number,
    totalSourceRelations:number,offset:number):Db00AllOriginalSearchPage{
    const items=Object.freeze(rows.map(makeRow));
    const next=offset+items.length;
    return Object.freeze({
      snapshotId:db.snapshotId,
      scope:'original_definition_and_unverified_static_candidates' as const,
      totalItemIds,totalSourceRelations,offset,
      nextOffset:next<totalItemIds?next:null,
      items,
      originalSourceOnly:true as const,
      completeAcquisitionCoverage:false as const,
      actualLootOrHarvestVerified:false as const,
      guaranteedDropVerified:false as const,
      playerGrantVerified:false as const,
      currentAvailabilityVerified:false as const,
      gameCollectionUiMembershipVerified:false as const
    });
  }
  function search(query:Db00AllOriginalSearchRequest={}):
    Db00AllOriginalSearchPage{
    const q=parseQuery(query);
    // Pure source predicates are resolved in one DB-02 query. Name/publication
    // filters are applied *after* original row filters, before page slicing.
    if(!q.text&&!q.publishedOnly){
      const raw=source.query(q.filter,{offset:q.offset,limit:q.limit});
      verifyPage(raw,q.offset,q.limit,null);
      return wrap(raw.items,raw.totalItemIds,raw.totalOriginRelations,q.offset);
    }
    let cursor=0,totalItemIds:number|null=null,totalRelations:number|null=null;
    const filtered:ItemSourceBrowserRow[]=[];
    let matchedRelations=0,matched=0;
    for(;;){
      const raw=source.query(q.filter,{offset:cursor,limit:BATCH});
      verifyPage(raw,cursor,BATCH,totalItemIds);
      if(totalItemIds===null){
        totalItemIds=raw.totalItemIds;
        totalRelations=raw.totalOriginRelations;
      }
      check(raw.totalOriginRelations===totalRelations,
        'SOURCE_RELATION_COUNT_CHANGED');
      for(const row of raw.items){
        const current=db.getItem(row.itemId);
        if(q.publishedOnly&&!current)continue;
        if(q.text&&!row.itemId.startsWith(q.text)&&
          !current?.names[q.locale]?.normalize('NFKC')
            .toLocaleLowerCase().includes(q.text))continue;
        matched++;matchedRelations+=row.origins.length;
        if(matched>q.offset&&filtered.length<q.limit)filtered.push(row);
      }
      cursor+=raw.items.length;
      if(!raw.hasMore)break;
      check(raw.items.length>0,'SOURCE_CURSOR_STALLED');
    }
    return wrap(filtered,matched,matchedRelations,q.offset);
  }
  return Object.freeze({
    contract:DB00_ALL_ORIGINAL_SOURCE_SEARCH_CONTRACT,
    snapshotId:db.snapshotId,
    originalDefinitionReferences:3961 as const,
    unverifiedStaticCandidateReferences:4239 as const,
    indexedSourceRelations:8200 as const,
    sourceItemIds:source.knownLinkedItemIds.length,
    completeAcquisitionCoverage:false as const,
    guaranteedDropVerified:false as const,
    playerGrantVerified:false as const,
    currentAvailabilityVerified:false as const,
    getItem,search
  });
}
