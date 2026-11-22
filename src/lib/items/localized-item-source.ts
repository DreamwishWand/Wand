/**
 * Per-Item original World-context / Disney Universe Tag read API for Wand.
 *
 * Uses the complete DB-01 source-indexed definition catalog (including
 * non-inventory definitions), and DB-04's original Tag/LocDB taxonomy.
 * A source Tag association NEVER proves an acquisition world, content pack,
 * player entitlement or the live Collection screen's category.
 *
 * Private source bytes remain at the caller's existing provider. The module
 * only composes SHA-verified local clients and never fetches game assets.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import type {Db01ItemType} from './item-types.ts';
import type {Db01SharedItemClient,Db01SharedItem} from './shared-view.ts';
import {
  DB04_NATIVE_TAG_TAXONOMY,
  type Db04NativeTagTaxonomyClient,type Db04LocalizedNativeTag,
} from '../world/native-tag-taxonomy.ts';

export const DB01_ITEM_LOCALIZED_SOURCE_TAGS=
  'wand.db01.item-localized-source-tags@1' as const;
export type Db01SourceScopeFacet='worldContextTag'|'disneyUniverse';

export interface Db01LocalizedItemSourceTag {
  readonly facet:Db01SourceScopeFacet;
  readonly tagId:number;
  readonly originalTagKey:string;
  readonly displayName:string;
  readonly locale:Db01Locale;
  /** Exact original fields in this Item definition carrying the Tag ID. */
  readonly wireFields:readonly number[];
  readonly originalSourceAssociationVerified:true;
  readonly currentLocDbNameVerified:true;
  readonly gameUiCollectionCategoryVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01LocalizedItemSource {
  readonly itemId:number;
  readonly gameVersion:string;
  readonly nativeCategory:string;
  /** No cross-language or historical-name substitution. */
  readonly currentExactName:string|null;
  readonly verifiedIconGuid:string|null;
  /** Source-native ItemType/IL2CPP metadata; not a UI subcategory. */
  readonly originalItemType:Readonly<Db01ItemType>|null;
  readonly worldContextTags:readonly Readonly<Db01LocalizedItemSourceTag>[];
  readonly disneyUniverseTags:readonly Readonly<Db01LocalizedItemSourceTag>[];
  /** Empty arrays mean no original tags in the currently verified definition. */
  readonly completeCurrentDefinitionTagScan:true;
  readonly gameUiCategoryVerified:false;
  readonly gameUiSubcategoryVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly contentPackVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly runtimeCollectionMembershipVerified:false;
}
export interface Db01LocalizedItemSourceClient {
  readonly contract:typeof DB01_ITEM_LOCALIZED_SOURCE_TAGS;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:string;
    sourceItemsSha256:string;
    definitions:number;
    taggedDefinitions:number;
    completeCurrentDefinitionTagScanRequired:true;
    originalGameUiClassificationVerified:false;
    acquisitionWorldVerified:false;
  }>;
  getItem(itemId:number,locale:Db01Locale):
    Promise<Readonly<Db01LocalizedItemSource>|null>;
  /** Input order preserved, including duplicate IDs and unknown source IDs. */
  getItems(itemIds:readonly number[],locale:Db01Locale):
    Promise<readonly (Readonly<Db01LocalizedItemSource>|null)[]>;
}
type TagIndex=Readonly<{
  worlds:ReadonlyMap<number,Readonly<Db04LocalizedNativeTag>>;
  universes:ReadonlyMap<number,Readonly<Db04LocalizedNativeTag>>;
}>;
const LOCALES=new Set<string>(DB01_LOCALES);
const SHA=/^[a-f0-9]{64}$/;
const id=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_ITEM_LOCALIZED_TAGS_'+code);
}

export function createDb01LocalizedItemSourceClient(
  shared:Db01SharedItemClient,
  taxonomy:Db04NativeTagTaxonomyClient,
):Db01LocalizedItemSourceClient{
  const base=shared?.source,tagSource=taxonomy?.source,
    coverage=shared?.getCoverage?.();
  check(base?.platform==='Steam'&&typeof base.gameVersion==='string'&&
    /^\d+\.\d+\.\d+$/.test(base.gameVersion)&&
    SHA.test(base.sourceItemsSha256)&&id(base.definitions)&&
    coverage?.totalDefinitions===base.definitions&&
    coverage.tagAssociatedDefinitions!==null&&
    Number.isSafeInteger(coverage.tagAssociatedDefinitions)&&
    coverage.tagAssociatedDefinitions>=0&&
    coverage.tagAssociatedDefinitions<=base.definitions&&
    typeof shared.getItems==='function'&&
    taxonomy?.contract===DB04_NATIVE_TAG_TAXONOMY&&
    tagSource?.privateOnly===true&&tagSource.publicationAuthorized===false&&
    tagSource.platform===base.platform&&
    tagSource.gameVersion===base.gameVersion&&
    tagSource.db01SourceItemsSha256===base.sourceItemsSha256&&
    (tagSource.originalTagSha256===null||
      SHA.test(tagSource.originalTagSha256))&&
    typeof taxonomy.listWorldTags==='function'&&
    typeof taxonomy.listUniverseTags==='function',
    'MISMATCHED_OR_INCOMPLETE_PRIVATE_SOURCE');
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:base.gameVersion,
    sourceItemsSha256:base.sourceItemsSha256,
    definitions:base.definitions,taggedDefinitions:coverage.tagAssociatedDefinitions,
    completeCurrentDefinitionTagScanRequired:true as const,
    originalGameUiClassificationVerified:false as const,
    acquisitionWorldVerified:false as const,
  });
  const localeCache=new Map<Db01Locale,Promise<TagIndex>>();
  async function labelIndex(locale:Db01Locale):Promise<TagIndex>{
    const pending=localeCache.get(locale);
    if(pending)return pending;
    const task=(async():Promise<TagIndex>=>{
      const [worldLabels,universeLabels]=await Promise.all([
        taxonomy.listWorldTags(locale),taxonomy.listUniverseTags(locale),
      ]);
      check(Array.isArray(worldLabels)&&worldLabels.length>0&&
        Array.isArray(universeLabels)&&universeLabels.length>0,
        'MISSING_NATIVE_TAG_TAXONOMY');
      let originalTagSha:string|null=null;
      function index(
        rows:readonly Readonly<Db04LocalizedNativeTag>[],
        kind:'world_context_tag'|'disney_universe_tag',
      ):ReadonlyMap<number,Readonly<Db04LocalizedNativeTag>>{
        const mapped=new Map<number,Readonly<Db04LocalizedNativeTag>>();
        const keys=new Set<string>();
        for(const row of rows){
          check(row&&id(row.tagItemId)&&row.kind===kind&&
            row.locale===locale&&
            typeof row.nativeKey==='string'&&row.nativeKey.length>0&&
            typeof row.displayName==='string'&&
            row.displayName.trim()===row.displayName&&row.displayName.length>0&&
            row.sourceExactCurrentLocDbName===true&&
            row.originalTagDefinitionVerified===true&&
            row.sourceWorldOrUniverseTagVerified===true&&
            row.gameUiCollectionMembershipVerified===false&&
            row.itemAcquisitionWorldVerified===false&&
            SHA.test(row.originalTagDefinitionSha256)&&
            !mapped.has(row.tagItemId)&&!keys.has(row.nativeKey),
            'INCONSISTENT_ORIGINAL_TAG_LABEL');
          if(originalTagSha!==null)
            check(originalTagSha===row.originalTagDefinitionSha256,
              'CONFLICTING_ORIGINAL_TAG_HASH');
          else originalTagSha=row.originalTagDefinitionSha256;
          keys.add(row.nativeKey);
          mapped.set(row.tagItemId,row);
        }
        return mapped;
      }
      const worlds=index(worldLabels,'world_context_tag'),
        universes=index(universeLabels,'disney_universe_tag');
      check(tagSource.originalTagSha256===null||
        originalTagSha===tagSource.originalTagSha256,
        'TAXONOMY_ORIGINAL_TAG_HASH_MISMATCH');
      for(const [itemId] of worlds)
        check(!universes.has(itemId),'WORLD_UNIVERSE_ID_COLLISION');
      return Object.freeze({worlds,universes});
    })();
    localeCache.set(locale,task);
    try{return await task;}
    catch(e){if(localeCache.get(locale)===task)localeCache.delete(locale);throw e;}
  }
  function localizedTags(item:Readonly<Db01SharedItem>,locale:Db01Locale,
    index:TagIndex,facet:Db01SourceScopeFacet,
  ):readonly Readonly<Db01LocalizedItemSourceTag>[]{
    const byId=new Map<number,{label:Readonly<Db04LocalizedNativeTag>;fields:Set<number>}>();
    const taxonomyIndex=facet==='worldContextTag'?index.worlds:index.universes;
    for(const ref of item.originalTags!.tagReferences){
      if(ref.facet!==facet)continue;
      check(id(ref.tagId)&&typeof ref.tagKey==='string'&&
        Number.isSafeInteger(ref.wireField)&&ref.wireField>0,
        'INVALID_ORIGINAL_SOURCE_TAG_REF');
      const label=taxonomyIndex.get(ref.tagId);
      check(label&&label.nativeKey===ref.tagKey,
        'SOURCE_ITEM_TAG_NOT_IN_CURRENT_TAXONOMY');
      let association=byId.get(ref.tagId);
      if(!association){
        association={label,fields:new Set<number>()};
        byId.set(ref.tagId,association);
      }
      association.fields.add(ref.wireField);
    }
    return Object.freeze([...byId.entries()].sort((a,b)=>a[0]-b[0])
      .map(([tagId,associated])=>Object.freeze({
        facet,tagId,originalTagKey:associated.label.nativeKey,
        displayName:associated.label.displayName,locale,
        wireFields:Object.freeze([...associated.fields].sort((a,b)=>a-b)),
        originalSourceAssociationVerified:true as const,
        currentLocDbNameVerified:true as const,
        gameUiCollectionCategoryVerified:false as const,
        acquisitionWorldVerified:false as const,
        dlcEntitlementVerified:false as const,
      })));
  }
  async function getItems(itemIds:readonly number[],locale:Db01Locale):
    Promise<readonly (Readonly<Db01LocalizedItemSource>|null)[]>{
    check(typeof locale==='string'&&LOCALES.has(locale),'INVALID_LOCALE');
    check(Array.isArray(itemIds)&&itemIds.length<=4096&&
      itemIds.every(id),'INVALID_ITEM_IDS');
    if(itemIds.length===0)return Object.freeze([]);
    const [rows,index]=await Promise.all([
      shared.getItems(itemIds),labelIndex(locale),
    ]);
    check(Array.isArray(rows)&&rows.length===itemIds.length,
      'SOURCE_BATCH_LENGTH');
    return Object.freeze(rows.map((row,i)=>{
      if(row===null)return null;
      check(row.itemId===itemIds[i]&&row.gameVersion===source.gameVersion&&
        row.item.itemId===row.itemId&&row.item.nativeCategory===row.nativeCategory&&
        row.originalTags!==null&&
        row.originalTags.itemId===row.itemId&&
        row.originalTags.nativeCategory===row.nativeCategory&&
        row.originalTags.nativeKey===row.item.nativeKey&&
        row.originalTags.sourceSha256===row.item.sourceSha256&&
        Array.isArray(row.originalTags.tagReferences),
        'MISSING_OR_INCONSISTENT_ITEM_TAG_SOURCE');
      const currentExactName=row.item.names[locale];
      check(currentExactName===null||
        (typeof currentExactName==='string'&&currentExactName.trim().length>0),
        'INVALID_CURRENT_EXACT_NAME');
      return Object.freeze({
        itemId:row.itemId,gameVersion:source.gameVersion,
        nativeCategory:row.nativeCategory,
        currentExactName,verifiedIconGuid:row.item.verifiedIconGuid,
        originalItemType:row.originalItemType,
        worldContextTags:localizedTags(row,locale,index,'worldContextTag'),
        disneyUniverseTags:localizedTags(row,locale,index,'disneyUniverse'),
        completeCurrentDefinitionTagScan:true as const,
        gameUiCategoryVerified:false as const,
        gameUiSubcategoryVerified:false as const,
        acquisitionWorldVerified:false as const,
        contentPackVerified:false as const,
        dlcEntitlementVerified:false as const,
        runtimeCollectionMembershipVerified:false as const,
      });
    }));
  }
  return Object.freeze({
    contract:DB01_ITEM_LOCALIZED_SOURCE_TAGS,source,
    getItems,
    async getItem(itemId:number,locale:Db01Locale){
      check(id(itemId),'INVALID_ITEM_ID');
      return (await getItems([itemId],locale))[0];
    },
  });
}
