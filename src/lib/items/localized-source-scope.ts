/**
 * Localized original source World/Disney Universe filter choices for DB-01.
 *
 * Compose DB-04's source-exact current LocDB names with DB-01's full native
 * Item/Tag facet index. Nothing here infers where an Item can be acquired,
 * which DLC it belongs to or how the live Collection screen groups Items.
 * Consumers can pass the returned Tag IDs to the existing DB-01 source menu
 * query via native.facets.worldContextTag / native.facets.disneyUniverse.
 *
 * No second localization archive, private source asset URL or production JS.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import {
  DB01_NATIVE_FILTER_CONTRACT,
  type Db01NativeFacetFilterClient,type Db01FacetOption,
} from './native-facet-filters.ts';
import {
  DB04_NATIVE_TAG_TAXONOMY,
  type Db04NativeTagTaxonomyClient,type Db04LocalizedNativeTag,
} from '../world/native-tag-taxonomy.ts';

export const DB01_LOCALIZED_SOURCE_SCOPE='wand.db01.localized-source-scope@1' as const;
export type Db01ScopeFacet='worldContextTag'|'disneyUniverse';

export interface Db01LocalizedSourceScopeOption {
  readonly facet:Db01ScopeFacet;
  readonly tagId:number;
  readonly originalTagKey:string;
  readonly locale:Db01Locale;
  readonly displayName:string;
  /** Exact matching original Tag references among the native Item definitions. */
  readonly matchingNativeItemIds:number;
  readonly sourceTagDefinitionVerified:true;
  readonly currentLocDbNameVerified:true;
  readonly nativeItemTagIndexVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly itemAcquisitionWorldVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01LocalizedSourceScopeClient {
  readonly contract:typeof DB01_LOCALIZED_SOURCE_SCOPE;
  readonly source:Readonly<{
    gameVersion:string;
    sourceItemsSha256:string;
    /** A complete original-native Item scan does not mean all definitions. */
    sourceNativeItemScanRequired:true;
    actualWorldAvailabilityVerified:false;
    gameUiClassificationVerified:false;
  }>;
  listWorldContextOptions(locale:Db01Locale):
    Promise<readonly Readonly<Db01LocalizedSourceScopeOption>[]>;
  listDisneyUniverseOptions(locale:Db01Locale):
    Promise<readonly Readonly<Db01LocalizedSourceScopeOption>[]>;
}
const LOCALES=new Set<string>(DB01_LOCALES);
const SHA=/^[a-f0-9]{64}$/;
const goodId=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_LOCALIZED_SCOPE_'+code);
}
export function createDb01LocalizedSourceScopeClient(
  native:Db01NativeFacetFilterClient,
  taxonomy:Db04NativeTagTaxonomyClient,
):Db01LocalizedSourceScopeClient{
  const ns=native?.source,ts=taxonomy?.source;
  check(ns!==undefined&&ts!==undefined&&
    native?.contract===DB01_NATIVE_FILTER_CONTRACT&&
    taxonomy?.contract===DB04_NATIVE_TAG_TAXONOMY&&
    typeof native.getCoverage==='function'&&
    typeof native.getFacetOptions==='function'&&
    typeof taxonomy.listWorldTags==='function'&&
    typeof taxonomy.listUniverseTags==='function'&&
    ts?.privateOnly===true&&ts.publicationAuthorized===false&&
    ts.platform==='Steam'&&
    ts.gameVersion===ns?.gameVersion&&
    ts.db01SourceItemsSha256===ns?.sourceItemsSha256&&
    typeof ns.sourceSqliteSha256==='string'&&SHA.test(ns.sourceSqliteSha256)&&
    typeof ns.sourceIl2cppDumpSha256==='string'&&SHA.test(ns.sourceIl2cppDumpSha256),
    'UNVERIFIED_OR_MISMATCHED_SOURCE');
  const source=Object.freeze({
    gameVersion:ns.gameVersion,sourceItemsSha256:ns.sourceItemsSha256,
    sourceNativeItemScanRequired:true as const,
    actualWorldAvailabilityVerified:false as const,
    gameUiClassificationVerified:false as const,
  });
  async function read(facet:Db01ScopeFacet,locale:Db01Locale):
    Promise<readonly Readonly<Db01LocalizedSourceScopeOption>[]>{
    check(typeof locale==='string'&&LOCALES.has(locale),'INVALID_LOCALE');
    const [labels,nativeOptions,coverage]=await Promise.all([
      facet==='worldContextTag'?taxonomy.listWorldTags(locale):
        taxonomy.listUniverseTags(locale),
      native.getFacetOptions(facet),
      native.getCoverage(),
    ]);
    check(coverage.completeSourceNativeItemScan===true&&
      Number.isSafeInteger(coverage.fullNativeDefinitions)&&
      coverage.fullNativeDefinitions>0&&
      coverage.gameVersion===source.gameVersion&&
      coverage.sourceItemsSha256===source.sourceItemsSha256,
      'INCOMPLETE_OR_CONFLICTING_NATIVE_ITEM_SCAN');
    check(Array.isArray(labels)&&labels.length>0&&
      Array.isArray(nativeOptions),'MISSING_ORIGINAL_TAG_CHOICES');
    const byId=new Map<number,Readonly<Db04LocalizedNativeTag>>();
    const keys=new Set<string>();
    let originalTagSha:string|null=null;
    for(const label of labels){
      check(label&&goodId(label.tagItemId)&&
        label.kind===(facet==='worldContextTag'?'world_context_tag':'disney_universe_tag')&&
        label.locale===locale&&
        typeof label.nativeKey==='string'&&label.nativeKey.length>0&&
        typeof label.displayName==='string'&&label.displayName.trim().length>0&&
        label.displayName===label.displayName.trim()&&
        label.sourceExactCurrentLocDbName===true&&
        label.originalTagDefinitionVerified===true&&
        label.sourceWorldOrUniverseTagVerified===true&&
        label.itemAcquisitionWorldVerified===false&&
        label.gameUiCollectionMembershipVerified===false&&
        typeof label.originalTagDefinitionSha256==='string'&&
        SHA.test(label.originalTagDefinitionSha256)&&
        !byId.has(label.tagItemId)&&!keys.has(label.nativeKey),
        'INVALID_OR_DUPLICATE_ORIGINAL_TAG_NAME');
      if(originalTagSha!==null)
        check(originalTagSha===label.originalTagDefinitionSha256,
          'MIXED_ORIGINAL_TAG_SOURCE');
      else originalTagSha=label.originalTagDefinitionSha256;
      byId.set(label.tagItemId,label);keys.add(label.nativeKey);
    }
    if(ts.originalTagSha256!==null)
      check(ts.originalTagSha256===originalTagSha,'TAXONOMY_TAG_SHA_MISMATCH');
    const matchCounts=new Map<number,number>();
    for(const option of nativeOptions as readonly Db01FacetOption[]){
      check(option&&option.facet===facet&&goodId(option.tagId)&&
        Number.isSafeInteger(option.matchingNativeItemIds)&&
        option.matchingNativeItemIds>0&&
        option.matchingNativeItemIds<=coverage.fullNativeDefinitions&&
        option.sourceTagAssociationVerified===true&&
        option.gameUiFilterVerified===false&&
        byId.get(option.tagId)?.nativeKey===option.originalTagKey&&
        !matchCounts.has(option.tagId),
        'UNKNOWN_OR_CONFLICTING_NATIVE_FACET');
      matchCounts.set(option.tagId,option.matchingNativeItemIds);
    }
    return Object.freeze(labels.map(label=>Object.freeze({
      facet,tagId:label.tagItemId,originalTagKey:label.nativeKey,
      locale,displayName:label.displayName,
      matchingNativeItemIds:matchCounts.get(label.tagItemId)??0,
      sourceTagDefinitionVerified:true as const,
      currentLocDbNameVerified:true as const,
      nativeItemTagIndexVerified:true as const,
      gameUiCollectionMembershipVerified:false as const,
      itemAcquisitionWorldVerified:false as const,
      contentPackRelationVerified:false as const,
      dlcEntitlementVerified:false as const,
    })));
  }
  return Object.freeze({
    contract:DB01_LOCALIZED_SOURCE_SCOPE,
    source,
    listWorldContextOptions:(locale:Db01Locale)=>read('worldContextTag',locale),
    listDisneyUniverseOptions:(locale:Db01Locale)=>read('disneyUniverse',locale),
  });
}
