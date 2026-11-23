/** DB-01 unified, source-bound Item-ID read model shared by Collection, Guide,
 * Save Editor, Decorate and Presets.
 *
 * A native definition class and an IL2CPP enum are NOT a game-screen category.
 * Static Collection predicate matches are NOT actual visibility/ownership.
 * Private SHA-checked data is supplied by callers; this module never fetches
 * from URLs, writes saves, or publishes game-derived assets.
 */
import type {Db01CatalogClient,Db01Item} from './index.ts';
import type {Db01Classification,Db01ClassificationClient} from './classification.ts';
import type {Db01ItemType,Db01ItemTypeClient} from './item-types.ts';
import type {
  Db01OriginalCollectionListing,Db01OriginalCollectionMenu,
  Db01OriginalCollectionMenuClient,
} from './collection-menu.ts';
import type {
  Db01UniversePredicateClient,Db01UniversePredicateMatch,
} from './collection-universe.ts';
import type {Db01SpecialClient,Db01SpecialMembership} from './collection-special.ts';
import type {
  Db01RemainingClient,Db01RemainingPositive,Db01RemainingNegative,
  Db01RemainingResult,
} from './collection-remaining.ts';
import {
  DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_SIX_CATEGORY_TOTAL,
  DB01_SIX_CATEGORY_POSITIVE,
  DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE,
  DB01_SIX_CATEGORY_NO_IHAS_TAGS,
  DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN,
  type Db01SixSourceClient,type Db01SixSourceItem,
} from './native-positive-area-six-categories.ts';

export interface Db01EvidenceSources{
  readonly catalog:Db01CatalogClient;
  readonly itemTypes?:Db01ItemTypeClient;
  readonly tags?:Db01ClassificationClient;
  readonly directMenus?:Db01OriginalCollectionMenuClient;
  readonly universePredicates?:Db01UniversePredicateClient;
  readonly specialPredicates?:Db01SpecialClient;
  readonly activityCrafting?:Db01RemainingClient;
  /** Optional verified six-domain original CollectionArea reader (Steam 1.26.2). */
  readonly nativeAreas?:Db01SixSourceClient;
}
export type Db01StaticPredicate=
  |ReadOnlyUniverse
  |ReadOnlySpecial
  |ReadOnlyActivityCrafting;
export interface ReadOnlyUniverse{
  readonly origin:'set-universe';
  readonly collectionSetId:number;
  readonly groupIndex:number;
  /** Original CollectionSubMenu/category; null when the source-menu overlay is absent. */
  readonly sourceMenu:Readonly<Db01OriginalCollectionMenu>|null;
  readonly evidence:Readonly<Db01UniversePredicateMatch>;
}
export interface ReadOnlySpecial{
  readonly origin:'special';
  readonly collectionSetId:number;
  readonly groupIndex:number;
  readonly sourceMenu:Readonly<Db01OriginalCollectionMenu>|null;
  readonly evidence:Readonly<Db01SpecialMembership>;
}
export interface ReadOnlyActivityCrafting{
  readonly origin:'activity-crafting';
  readonly collectionSetId:number;
  readonly groupIndex:number;
  readonly sourceMenu:Readonly<Db01OriginalCollectionMenu>|null;
  readonly evidence:Readonly<Db01RemainingPositive>;
}
export interface Db01SourceSuppression{
  /** The matched positive rule is retained for inspection, not discarded. */
  readonly candidate:Db01StaticPredicate;
  /** Original negative Crafting selectors in the same CollectionSet/group. */
  readonly exclusions:readonly Readonly<Db01RemainingNegative>[];
}
export interface Db01CollectionEvidence{
  /** Null = original CollectionSet file not connected. [] = no listed entry. */
  readonly direct:readonly Readonly<Db01OriginalCollectionListing>[]|null;
  /** Null = the original universe predicate overlay was not connected. */
  readonly setUniverse:readonly Readonly<Db01UniversePredicateMatch>[]|null;
  /** Null = original Character/Memory/Pet/etc. predicate overlay unavailable. */
  readonly special:readonly Readonly<Db01SpecialMembership>[]|null;
  /** Null = original Activity/Crafting positive/negative overlay unavailable. */
  readonly activityCrafting:Readonly<Db01RemainingResult>|null;
  /** Positive source predicates after available same-group Crafting exclusions. */
  readonly candidates:readonly Db01StaticPredicate[];
  /** Matched source predicates suppressed by explicit original Crafting negatives. */
  readonly suppressed:readonly Db01SourceSuppression[];
  /** 'unavailable' means negative rules could not be applied: NOT zero exclusions. */
  readonly craftingExclusions:'available'|'unavailable';
  readonly actualGameUiMembershipVerified:false;
}
export interface Db01SharedItem{
  readonly itemId:number;
  readonly gameVersion:string;
  readonly nativeCategory:string;
  /** Original native name and eight current-language names/icons remain intact. */
  readonly item:Readonly<Db01Item>;
  /** Null means IL2CPP type release not connected, not 'no subtype'. */
  readonly originalItemType:Readonly<Db01ItemType>|null;
  /** Null means source Tag release not connected, not 'no tags'. */
  readonly originalTags:Readonly<Db01Classification>|null;
  /** Null if not connected OR outside the six confirmed original domains. */
  readonly originalNativeAreas:Readonly<Db01SixSourceItem>|null;
  /** Source lookup status; outside domains does NOT imply lack of world tags. */
  readonly nativeAreaSourceStatus:
    'reader_not_connected'|'outside_six_verified_domains'|'original_source_record';
  readonly collection:Readonly<Db01CollectionEvidence>;
  readonly screenCategory:null;
  readonly screenSubcategory:null;
  readonly availableWorlds:null;
  readonly dlcEntitlements:null;
  readonly contentIds:null;
  readonly runtimeCollectionState:null;
  readonly publicationAuthorized:false;
}
export interface Db01UnifiedCoverage{
  readonly totalDefinitions:number;
  readonly itemTypeVerified:number|null;
  readonly subtypeNameVerified:number|null;
  readonly tagAssociatedDefinitions:number|null;
  readonly directListedIds:number|null;
  readonly sourceCollectionSetDefinitions:number|null;
  readonly universePredicateCandidateIds:number|null;
  readonly specialPredicateCandidateIds:number|null;
  readonly activityCraftingPositiveIds:number|null;
  readonly activityCraftingNegativeIds:number|null;
  /** Counts *distinct source selector definitions*, never Item IDs. */
  readonly sourceDynamicSelectorsResolved:number;
  readonly sourceDynamicSelectorsTotal:number|null;
  readonly actualGameUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01SharedItemClient{
  readonly source:Readonly<Pick<Db01CatalogClient['source'],
    'platform'|'gameVersion'|'sourceItemsSha256'|'definitions'>>;
  getItem(id:number):Promise<Readonly<Db01SharedItem>|null>;
  getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01SharedItem>|null)[]>;
  /** Original source menus, not proven runtime screen sections. Null if unavailable. */
  getSourceMenus():Promise<readonly Readonly<Db01OriginalCollectionMenu>[]|null>;
  getCoverage():Readonly<Db01UnifiedCoverage>;
}

const validId=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_UNIFIED_'+code);
}
function keep<T>(items:readonly T[]):readonly T[]{
  return Object.freeze([...items]);
}
function ensureAligned(
  base:readonly (Readonly<Db01Item>|null)[],
  rows:Readonly<{length:number}>,
  code:string,
):void{
  assert(rows.length===base.length,'BATCH_'+code);
}
function sameSource(item:Readonly<Db01Item>,supplement:{
  itemId:number;nativeCategory:string;sourceSha256:string;
},code:string):void{
  assert(supplement.itemId===item.itemId&&
    supplement.nativeCategory===item.nativeCategory&&
    supplement.sourceSha256===item.sourceSha256,code);
}

export function createDb01SharedItemClient(inputs:Db01EvidenceSources):Db01SharedItemClient{
  const {catalog,itemTypes,tags,directMenus,universePredicates,
    specialPredicates,activityCrafting,nativeAreas}=inputs;
  assert(catalog?.source?.privateOnly===true&&
    catalog.source.platform==='Steam'&&
    typeof catalog.getItems==='function'&&typeof catalog.getItem==='function',
    'PRIVATE_CATALOG_REQUIRED');
  const base=catalog.source;
  if(nativeAreas){
    assert(nativeAreas.schema===DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA&&
      nativeAreas.gameVersion===base.gameVersion&&
      typeof nativeAreas.getItem==='function'&&
      typeof nativeAreas.getCoverage==='function'&&
      typeof nativeAreas.search==='function',
      'NATIVE_AREA_VERSION_OR_CONTRACT');
  }
  const overlays=[
    itemTypes&&{name:'ITEM_TYPES',version:itemTypes.source.gameVersion,
      sha:itemTypes.source.sourceItemsSha256,count:itemTypes.source.definitionCount,
      sqlite:itemTypes.source.sourceSqliteSha256,
      dump:itemTypes.source.sourceIl2cppDumpSha256},
    tags&&{name:'TAGS',version:tags.source.gameVersion,
      sha:tags.source.sourceItemsSha256,count:tags.source.definitionCount,
      sqlite:tags.source.sourceSqliteSha256},
    directMenus&&{name:'DIRECT_MENUS',version:directMenus.source.gameVersion,
      sha:directMenus.source.sourceItemsSha256,
      count:directMenus.source.catalogDefinitions,
      dump:directMenus.source.sourceIl2cppDumpSha256},
    universePredicates&&{name:'UNIVERSE',version:universePredicates.source.gameVersion,
      sha:universePredicates.source.sourceItemsSha256,
      count:universePredicates.source.sourceDefinitionCount,
      sqlite:universePredicates.source.sourceSqliteSha256,
      dump:universePredicates.source.sourceIl2cppDumpSha256},
    specialPredicates&&{name:'SPECIAL',version:specialPredicates.source.gameVersion,
      sha:specialPredicates.source.sourceItemsSha256,
      count:specialPredicates.source.definitionCount,
      sqlite:specialPredicates.source.sourceSqliteSha256,
      dump:specialPredicates.source.sourceIl2cppDumpSha256},
    activityCrafting&&{name:'ACTIVITY_CRAFTING',version:activityCrafting.source.gameVersion,
      sha:activityCrafting.source.sourceItemsSha256,
      count:activityCrafting.source.definitionCount,
      sqlite:activityCrafting.source.sourceSqliteSha256,
      dump:activityCrafting.source.sourceIl2cppDumpSha256},
  ].filter((v):v is NonNullable<typeof v>=>!!v);
  let sqliteHash:string|null=null,il2cppHash:string|null=null;
  for(const overlay of overlays){
    assert(overlay.version===base.gameVersion&&overlay.sha===base.sourceItemsSha256&&
      overlay.count===base.definitions,'VERSION_OR_CATALOG_'+overlay.name);
    if('sqlite' in overlay&&overlay.sqlite){
      assert(sqliteHash===null||sqliteHash===overlay.sqlite,'SQLITE_SHA_CONFLICT');
      sqliteHash=overlay.sqlite;
    }
    if('dump' in overlay&&overlay.dump){
      assert(il2cppHash===null||il2cppHash===overlay.dump,'IL2CPP_SHA_CONFLICT');
      il2cppHash=overlay.dump;
    }
  }
  const nativeSelectors=(universePredicates?.source.resolvedSourcePredicateSelectors??0)+
    (specialPredicates?.source.handledSourceSelectors??0)+
    (activityCrafting?.source.sourceSelectorCount??0);
  const selectorTotals=[
    universePredicates?.source.dynamicSelectorCount,
    specialPredicates?.source.totalDynamicSelectors,
  ].filter((v):v is number=>v!==undefined);
  assert(selectorTotals.every(v=>v===selectorTotals[0]),'SELECTOR_TOTAL_MISMATCH');
  const selectorTotal=selectorTotals[0]??null;
  assert(selectorTotal===null||nativeSelectors<=selectorTotal,'SELECTOR_COVERAGE_OVERFLOW');
  const coverage:Readonly<Db01UnifiedCoverage>=Object.freeze({
    totalDefinitions:base.definitions,
    itemTypeVerified:itemTypes?.source.sourceItemTypeVerified??null,
    subtypeNameVerified:itemTypes?.source.sourceSubtypeNameVerified??null,
    tagAssociatedDefinitions:tags?.source.taggedDefinitions??null,
    directListedIds:directMenus?.source.directListedItemIds??null,
    sourceCollectionSetDefinitions:directMenus?.source.collectionSetDefinitions??null,
    universePredicateCandidateIds:universePredicates?.source.candidateItemIds??null,
    specialPredicateCandidateIds:specialPredicates?.source.candidateItemIds??null,
    activityCraftingPositiveIds:activityCrafting?.source.sourceMatchedPositiveItemIds??null,
    activityCraftingNegativeIds:activityCrafting?.source.sourceMatchedNegativeItemIds??null,
    sourceDynamicSelectorsResolved:nativeSelectors,
    sourceDynamicSelectorsTotal:selectorTotal,
    actualGameUiMembershipVerified:false,
    worldAvailabilityVerified:false,
    dlcOwnershipVerified:false,
  });
  const source=Object.freeze({
    platform:base.platform,
    gameVersion:base.gameVersion,
    sourceItemsSha256:base.sourceItemsSha256,
    definitions:base.definitions,
  });

  const nativeAreaDomains=new Set<string>([
    'Furniture','Clothing','Trimming','Makeup','Companion','Skin',
  ]);
  let nativeAreaCoverageTask:Promise<void>|null=null;
  function checkNativeAreaCoverage():Promise<void> {
    if(!nativeAreas)return Promise.resolve();
    if(nativeAreaCoverageTask)return nativeAreaCoverageTask;
    nativeAreaCoverageTask=(async()=>{
      const c=await nativeAreas.getCoverage();
      assert(c.gameVersion===base.gameVersion&&
        c.sourceDefinitions===DB01_SIX_CATEGORY_TOTAL&&
        c.sourcePositiveAreaItems===DB01_SIX_CATEGORY_POSITIVE&&
        c.sourceIHasTagsWithoutPositiveArea===
          DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE&&
        c.sourceWithoutIHasTags===DB01_SIX_CATEGORY_NO_IHAS_TAGS&&
        c.critterSceneUnresolved===DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN&&
        c.nativeAllAreasDefaultVerified===false&&
        c.gameCollectionUiMembershipVerified===false&&
        c.runtimeSkinClassIndependentlyVerified===false&&
        c.runtimeCritterSceneResolved===false,
        'NATIVE_AREA_SOURCE_COVERAGE');
    })().catch(error=>{nativeAreaCoverageTask=null;throw error;});
    return nativeAreaCoverageTask;
  }
  async function lookupNativeAreas(
    items:readonly (Readonly<Db01Item>|null)[],
  ):Promise<ReadonlyMap<number,Readonly<Db01SixSourceItem>>> {
    const found=new Map<number,Readonly<Db01SixSourceItem>>();
    if(!nativeAreas)return found;
    await checkNativeAreaCoverage();
    const chosen=new Map<number,Readonly<Db01Item>>();
    for(const item of items){
      if(item&&nativeAreaDomains.has(item.nativeCategory)){
        chosen.set(item.itemId,item);
      }
    }
    const ids=[...chosen.keys()];
    let next=0;
    async function worker():Promise<void>{
      while(next<ids.length){
        const id=ids[next++];
        const row=await nativeAreas!.getItem(id);
        const item=chosen.get(id)!;
        assert(row?.originalSourceVerified===true&&
          row.itemId===id&&row.nativeCategory===item.nativeCategory&&
          row.nativeAllAreasDefaultVerified===false&&
          row.gameCollectionUiMembershipVerified===false&&
          row.worldAvailabilityVerified===false&&
          row.playerOwnershipVerified===false&&
          row.dlcEntitlementVerified===false&&
          row.runtimeSkinClassIndependentlyVerified===false&&
          row.runtimeCritterSceneResolved===false&&
          (row.positiveAreaCodes===null?
            (row.sourceAreaEvidence==='requires_profile_world_scene'&&
              row.nativeCategory==='Companion')||
            (row.sourceAreaEvidence==='original_interface_absent'&&
              row.nativeCategory==='Skin'):
            Array.isArray(row.positiveAreaCodes)&&
            row.positiveAreaCodes.length<=1&&
            row.sourceAreaEvidence===(row.positiveAreaCodes.length?
              'native_positive_tag':'native_ihastags_without_positive_tag')),
          'NATIVE_AREA_CANONICAL_IDENTITY_OR_PROOF');
        found.set(id,row);
      }
    }
    await Promise.all(Array.from(
      {length:Math.min(ids.length,16)},()=>worker()));
    return found;
  }

  async function getItems(ids:readonly number[]):Promise<
    readonly (Readonly<Db01SharedItem>|null)[]
  >{
    assert(Array.isArray(ids)&&ids.length<=4096&&ids.every(validId),'INVALID_IDS');
    if(!ids.length)return Object.freeze([]);
    const items=await catalog.getItems(ids);
    assert(items.length===ids.length,'CATALOG_BATCH_SIZE');
    // Independent SHA-pinned private buckets can load concurrently. Existing
    // underlying clients deduplicate repeated ID-bucket reads.
    const [originalTypes,tagRecords,directRecords,
      universeRecords,specialRecords,remainingRecords,sourceMenus,nativeAreaRecords]=await Promise.all([
      itemTypes?itemTypes.getItems(ids):Promise.resolve(null),
      tags?tags.getItems(ids):Promise.resolve(null),
      directMenus?directMenus.getDirectListingsBatch(ids):Promise.resolve(null),
      universePredicates?universePredicates.getItems(ids):Promise.resolve(null),
      specialPredicates?specialPredicates.getItems(ids):Promise.resolve(null),
      activityCrafting?activityCrafting.getItems(ids):Promise.resolve(null),
      directMenus?directMenus.getMenus():Promise.resolve(null),
      nativeAreas?lookupNativeAreas(items):Promise.resolve(null),
    ]);
    const menus=new Map<number,Readonly<Db01OriginalCollectionMenu>>();
    if(sourceMenus){
      assert(sourceMenus.length===directMenus!.source.collectionSetDefinitions,
        'SOURCE_MENU_COUNT');
      for(const menu of sourceMenus){
        assert(!menus.has(menu.setId),'DUPLICATE_COLLECTION_SET_ID');
        menus.set(menu.setId,menu);
      }
    }
    function sourceMenu(setId:number):Readonly<Db01OriginalCollectionMenu>|null{
      if(!sourceMenus)return null;
      const menu=menus.get(setId);
      assert(menu,'COLLECTION_SET_NOT_IN_CURRENT_ORIGINAL');
      return menu;
    }
    for(const [name,result] of [
      ['ITEMTYPE',originalTypes],['TAGS',tagRecords],['DIRECT',directRecords],
      ['UNIVERSE',universeRecords],['SPECIAL',specialRecords],
      ['CRAFTING',remainingRecords],
    ] as const){
      if(result)ensureAligned(items,result,name);
    }
    return Object.freeze(items.map((item,index)=>{
      if(item===null)return null;
      const originalType=originalTypes?.[index]??null;
      const originalTags=tagRecords?.[index]??null;
      const crafting=remainingRecords?.[index]??null;
      const originalNativeAreas=nativeAreaRecords?.get(item.itemId)??null;
      const nativeAreaSourceStatus=!nativeAreas?'reader_not_connected' as const:
        !nativeAreaDomains.has(item.nativeCategory)?
          'outside_six_verified_domains' as const:
          'original_source_record' as const;
      if(originalTypes)assert(originalType,'MISSING_ORIGINAL_TYPE');
      if(tagRecords)assert(originalTags,'MISSING_TAG_SOURCE');
      if(originalType)sameSource(item,originalType,'ITEM_TYPE_IDENTITY');
      if(originalTags){
        sameSource(item,originalTags,'TAG_IDENTITY');
        assert(originalTags.nativeKey===item.nativeKey,'TAG_NATIVE_KEY_MISMATCH');
      }
      if(crafting)sameSource(item,crafting,'CRAFTING_IDENTITY');

      const direct=directRecords?keep(directRecords[index]):null;
      const universe=universeRecords?keep(universeRecords[index]):null;
      const special=specialRecords?keep(specialRecords[index]):null;
      if(universe)assert(universe.every(v=>v.nativeCategory===item.nativeCategory),
        'UNIVERSE_NATIVE_CLASS');
      if(special)assert(special.every(v=>v.nativeCategory===item.nativeCategory),
        'SPECIAL_NATIVE_CLASS');

      const raw:Db01StaticPredicate[]=[
        ...(universe??[]).map((record):ReadOnlyUniverse=>Object.freeze({
          origin:'set-universe',collectionSetId:record.setId,
          groupIndex:record.groupIndex,sourceMenu:sourceMenu(record.setId),
          evidence:record,
        })),
        ...(special??[]).map((record):ReadOnlySpecial=>Object.freeze({
          origin:'special',collectionSetId:record.setId,
          groupIndex:record.groupIndex,sourceMenu:sourceMenu(record.setId),
          evidence:record,
        })),
        ...(crafting?.positive??[]).map((record):ReadOnlyActivityCrafting=>
          Object.freeze({origin:'activity-crafting',
            collectionSetId:record.collectionSetId,
            groupIndex:record.groupIndex,
            sourceMenu:sourceMenu(record.collectionSetId),evidence:record})),
      ];
      const exclusionGroups=new Map<string,Db01RemainingNegative[]>();
      for(const negative of crafting?.negative??[]){
        const key=negative.collectionSetId+':'+negative.groupIndex;
        const entries=exclusionGroups.get(key)??[];
        entries.push(negative);
        exclusionGroups.set(key,entries);
      }
      const candidates:Db01StaticPredicate[]=[];
      const suppressed:Db01SourceSuppression[]=[];
      for(const match of raw){
        const exclusions=exclusionGroups.get(match.collectionSetId+':'+match.groupIndex);
        if(exclusions?.length){
          suppressed.push(Object.freeze({
            candidate:match,exclusions:keep(exclusions),
          }));
        }else candidates.push(match);
      }
      const collection:Db01CollectionEvidence=Object.freeze({
        direct,setUniverse:universe,special,activityCrafting:crafting,
        candidates:keep(candidates),suppressed:keep(suppressed),
        craftingExclusions:activityCrafting?'available':'unavailable',
        actualGameUiMembershipVerified:false,
      });
      return Object.freeze({
        itemId:item.itemId,gameVersion:base.gameVersion,
        nativeCategory:item.nativeCategory,item,
        originalItemType:originalType,originalTags,
        originalNativeAreas,nativeAreaSourceStatus,
        collection,
        screenCategory:null,screenSubcategory:null,
        availableWorlds:null,dlcEntitlements:null,contentIds:null,
        runtimeCollectionState:null,publicationAuthorized:false,
      }) satisfies Db01SharedItem;
    }));
  }
  async function getItem(id:number){
    assert(validId(id),'INVALID_ID');
    return (await getItems([id]))[0];
  }
  async function getSourceMenus(){
    return directMenus?await directMenus.getMenus():null;
  }
  return Object.freeze({source,getItem,getItems,getSourceMenus,getCoverage:()=>coverage});
}
