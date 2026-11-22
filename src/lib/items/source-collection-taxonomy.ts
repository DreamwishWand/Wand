/**
 * DB-01 source CollectionSubMenu -> CollectionSet -> source group read model.
 *
 * This composes existing private SHA-checked DB-01 menu and Item overlays.
 * It exposes original source hierarchy and per-Item reverse links WITHOUT
 * treating native menu references, source selectors or translated Set names
 * as proof of the actual Collection UI, discovery, possession or DLC rights.
 *
 * Unlike the whole-corpus Collection source index, per-Item lookup reads
 * only the requested IDs and associated CollectionSet definitions.
 */
import {DB01_LOCALES,type Db01CatalogClient,type Db01Locale} from './index.ts';
import type {Db01OriginalCollectionMenu} from './collection-menu.ts';
import type {
  Db01SharedItemClient,Db01SharedItem,Db01StaticPredicate,
} from './shared-view.ts';

export const DB01_SOURCE_COLLECTION_TAXONOMY=
  'wand.db01.original-source-collection-taxonomy@1' as const;
export type Db01CollectionPredicateOrigin=Db01StaticPredicate['origin'];

export interface Db01LocalizedOriginalCollectionSet {
  readonly collectionSetId:number;
  readonly originalSetKey:string;
  /** Null = no exact current-version LocDB name; never a translated guess. */
  readonly currentExactSetName:string|null;
  readonly collectionLabelKey:string|null;
  readonly submenuCode:number;
  readonly originalSubmenu:string;
  readonly sortPriority:number;
  readonly groupCount:number;
  readonly directListedItemCount:number;
  readonly dynamicSourceSelectorCount:number;
  readonly currentExactNameVerified:boolean;
  readonly gameUiMembershipVerified:false;
  readonly gameUiSetDisplayNameVerified:false;
}
export interface Db01OriginalCollectionSubmenu {
  readonly submenuCode:number;
  readonly originalSubmenu:string;
  /** Original IL2CPP enum identifier; not a translated game-screen heading. */
  readonly exactCurrentLocalizedHeading:null;
  readonly sourceSets:readonly Readonly<Db01LocalizedOriginalCollectionSet>[];
  readonly sourceSetCount:number;
  readonly gameUiMembershipVerified:false;
}
export interface Db01OriginalCollectionSourceGroupLink {
  readonly groupIndex:number;
  readonly originalDirectListing:boolean;
  readonly positiveSourcePredicateOrigins:readonly Db01CollectionPredicateOrigin[];
  readonly gameUiMembershipVerified:false;
}
export interface Db01ItemOriginalCollectionSourceLink {
  readonly sourceSet:Readonly<Db01LocalizedOriginalCollectionSet>;
  readonly groups:readonly Readonly<Db01OriginalCollectionSourceGroupLink>[];
  /** Only original direct listings and source-positive, non-suppressed predicates. */
  readonly sourceCandidatesOnly:true;
  readonly actualGameUiMembershipVerified:false;
  readonly possessionVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01ItemOriginalCollectionSource {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly locale:Db01Locale;
  readonly sourceLinks:readonly Readonly<Db01ItemOriginalCollectionSourceLink>[];
  /** Empty means no matched current original CollectionSet source reference. */
  readonly originalSourcePredicatesComplete:true;
  readonly actualGameUiMembershipVerified:false;
}
export interface Db01SourceCollectionTaxonomyClient {
  readonly contract:typeof DB01_SOURCE_COLLECTION_TAXONOMY;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:string;
    sourceItemsSha256:string;
    definitions:number;
    sourceSetDefinitions:number;
    sourceStaticSelectors:number;
    gameUiMembershipVerified:false;
  }>;
  /** Existing original submenu/set hierarchy in native order, not runtime UI. */
  getSourceHierarchy(locale:Db01Locale):
    Promise<readonly Readonly<Db01OriginalCollectionSubmenu>[]>;
  getItem(itemId:number,locale:Db01Locale):
    Promise<Readonly<Db01ItemOriginalCollectionSource>|null>;
  /** Bounded selective lookup; preserves duplicates, order, unknown IDs. */
  getItems(itemIds:readonly number[],locale:Db01Locale):
    Promise<readonly (Readonly<Db01ItemOriginalCollectionSource>|null)[]>;
}
const LOCALE_SET=new Set<string>(DB01_LOCALES);
const SHA=/^[a-f0-9]{64}$/;
const POSITIVE_ORIGINS=new Set<Db01CollectionPredicateOrigin>([
  'set-universe','special','activity-crafting',
]);
const id=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const nonneg=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
function check(v:unknown,why:string):asserts v{
  if(!v)throw new TypeError('DB01_SOURCE_COLLECTION_TAXONOMY_'+why);
}
function localeOk(locale:unknown):asserts locale is Db01Locale{
  check(typeof locale==='string'&&LOCALE_SET.has(locale),'INVALID_LOCALE');
}
type Menus=Readonly<{
  ordered:readonly Readonly<Db01OriginalCollectionMenu>[];
  byId:ReadonlyMap<number,Readonly<Db01OriginalCollectionMenu>>;
}>;

export function createDb01SourceCollectionTaxonomyClient(
  catalog:Db01CatalogClient,
  shared:Db01SharedItemClient,
):Db01SourceCollectionTaxonomyClient{
  const base=catalog?.source,view=shared?.source,
    evidence=shared?.getCoverage?.();
  check(base?.privateOnly===true&&base.fullCorpusParsed===true&&
    base.platform==='Steam'&&id(base.definitions)&&
    SHA.test(base.sourceItemsSha256)&&
    view?.platform===base.platform&&view.gameVersion===base.gameVersion&&
    view.sourceItemsSha256===base.sourceItemsSha256&&
    view.definitions===base.definitions&&
    typeof shared.getSourceMenus==='function'&&
    typeof shared.getItems==='function'&&
    typeof catalog.getItems==='function'&&
    evidence?.totalDefinitions===base.definitions&&
    id(evidence.sourceCollectionSetDefinitions)&&
    nonneg(evidence.directListedIds)&&
    evidence.sourceDynamicSelectorsTotal!==null&&
    evidence.sourceDynamicSelectorsTotal===evidence.sourceDynamicSelectorsResolved&&
    evidence.sourceDynamicSelectorsTotal>0,
    'INCOMPLETE_OR_MISMATCHED_CURRENT_COLLECTION_SOURCE');
  // Present Steam release has 305 original CollectionSet definitions and
  // 262 exact source selectors. A stale partial overlay must not appear complete.
  if(base.gameVersion==='1.26.2'&&base.definitions===39067)
    check(evidence.sourceCollectionSetDefinitions===305&&
      evidence.sourceDynamicSelectorsTotal===262,
      'RETIRED_PARTIAL_COLLECTION_SOURCE');
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:base.gameVersion,
    sourceItemsSha256:base.sourceItemsSha256,definitions:base.definitions,
    sourceSetDefinitions:evidence.sourceCollectionSetDefinitions,
    sourceStaticSelectors:evidence.sourceDynamicSelectorsTotal,
    gameUiMembershipVerified:false as const,
  });
  let menuCache:Promise<Menus>|null=null;
  function menus():Promise<Menus>{
    if(menuCache)return menuCache;
    const task=(async():Promise<Menus>=>{
      const records=await shared.getSourceMenus();
      check(records!==null&&Array.isArray(records)&&
        records.length===source.sourceSetDefinitions,
        'INCOMPLETE_COLLECTION_MENU');
      const byId=new Map<number,Readonly<Db01OriginalCollectionMenu>>();
      const submenuCodes=new Map<number,string>();
      let selectors=0;
      for(const m of records){
        check(m&&id(m.setId)&&typeof m.setKey==='string'&&
          m.setKey.length>0&&nonneg(m.submenuCode)&&
          typeof m.submenu==='string'&&m.submenu.length>0&&
          m.collectionLabelKey!==undefined&&
          nonneg(m.groupCount)&&m.groupCount<=4096&&
          nonneg(m.directListedItemCount)&&
          nonneg(m.dynamicSelectorsUnresolved)&&
          Number.isSafeInteger(m.sortPriority)&&
          m.gameUiVisibilityVerified===false&&!byId.has(m.setId),
          'BAD_OR_DUPLICATE_ORIGINAL_COLLECTION_SET');
        const previous=submenuCodes.get(m.submenuCode);
        check(previous===undefined||previous===m.submenu,
          'CONFLICTING_NATIVE_COLLECTION_SUBMENU');
        submenuCodes.set(m.submenuCode,m.submenu);
        selectors+=m.dynamicSelectorsUnresolved;
        check(Number.isSafeInteger(selectors),'SOURCE_SELECTOR_TOTAL_OVERFLOW');
        byId.set(m.setId,m);
      }
      check(selectors===source.sourceStaticSelectors,
        'MISSING_OR_EXTRA_SOURCE_SELECTORS');
      return Object.freeze({
        ordered:Object.freeze([...records].sort((a,b)=>
          a.submenuCode-b.submenuCode||a.sortPriority-b.sortPriority||
          a.setId-b.setId)),
        byId,
      });
    })();
    menuCache=task.catch(e=>{menuCache=null;throw e;});
    return menuCache;
  }
  const exactNameCache=new Map<string,Promise<ReadonlyMap<number,Readonly<Db01LocalizedOriginalCollectionSet>>>>();
  async function localizedSets(
    records:readonly Readonly<Db01OriginalCollectionMenu>[],locale:Db01Locale,
  ):Promise<ReadonlyMap<number,Readonly<Db01LocalizedOriginalCollectionSet>>>{
    const sortedIds=[...new Set(records.map(m=>m.setId))].sort((a,b)=>a-b);
    if(sortedIds.length===0)return new Map();
    // The full original Set hierarchy has only 305 definitions in v1.26.2.
    check(sortedIds.length<=4096,'COLLECTION_SET_BATCH_LIMIT');
    const key=locale+':'+sortedIds.join(',');
    const pending=exactNameCache.get(key);
    if(pending)return pending;
    const task=(async()=>{
      const definitions=await catalog.getItems(sortedIds);
      check(definitions.length===sortedIds.length,'COLLECTION_SET_BATCH_SHAPE');
      const nameById=new Map<number,string|null>();
      for(let i=0;i<sortedIds.length;i++){
        const record=definitions[i],original=records.find(m=>m.setId===sortedIds[i]);
        check(original!==undefined&&record!==null&&
          record.itemId===original.setId&&
          record.nativeCategory==='CollectionSet'&&
          record.nativeKey===original.setKey&&
          SHA.test(record.sourceSha256),
          'ORIGINAL_COLLECTION_SET_IDENTITY');
        const name=record.names[locale];
        check(name===null||(typeof name==='string'&&
          name.trim()===name&&name.length>0),
          'INVALID_CURRENT_COLLECTION_NAME');
        nameById.set(original.setId,name);
      }
      const resolved=new Map<number,Readonly<Db01LocalizedOriginalCollectionSet>>();
      for(const menu of records){
        const exactName=nameById.get(menu.setId);
        check(exactName!==undefined,'ORIGINAL_COLLECTION_SET_NAME_LOOKUP');
        resolved.set(menu.setId,Object.freeze({
          collectionSetId:menu.setId,originalSetKey:menu.setKey,
          currentExactSetName:exactName,
          collectionLabelKey:menu.collectionLabelKey,
          submenuCode:menu.submenuCode,originalSubmenu:menu.submenu,
          sortPriority:menu.sortPriority,groupCount:menu.groupCount,
          directListedItemCount:menu.directListedItemCount,
          dynamicSourceSelectorCount:menu.dynamicSelectorsUnresolved,
          currentExactNameVerified:exactName!==null,
          gameUiMembershipVerified:false as const,
          gameUiSetDisplayNameVerified:false as const,
        }));
      }
      return resolved as ReadonlyMap<number,Readonly<Db01LocalizedOriginalCollectionSet>>;
    })();
    exactNameCache.set(key,task);
    try{return await task;}
    catch(e){if(exactNameCache.get(key)===task)exactNameCache.delete(key);throw e;}
  }
  async function getSourceHierarchy(locale:Db01Locale):
    Promise<readonly Readonly<Db01OriginalCollectionSubmenu>[]>{
    localeOk(locale);
    const data=await menus(),localized=await localizedSets(data.ordered,locale);
    const byCode=new Map<number,{
      submenu:string;sets:Readonly<Db01LocalizedOriginalCollectionSet>[];
    }>();
    for(const menu of data.ordered){
      const set=localized.get(menu.setId);
      check(set,'LOCALIZED_SET_MISSING');
      let sub=byCode.get(menu.submenuCode);
      if(!sub){sub={submenu:menu.submenu,sets:[]};byCode.set(menu.submenuCode,sub);}
      sub.sets.push(set);
    }
    return Object.freeze([...byCode.entries()].map(([submenuCode,group])=>
      Object.freeze({
        submenuCode,originalSubmenu:group.submenu,
        exactCurrentLocalizedHeading:null as null,
        sourceSets:Object.freeze(group.sets),
        sourceSetCount:group.sets.length,
        gameUiMembershipVerified:false as const,
      })));
  }
  type MutableGroup={direct:boolean;origins:Set<Db01CollectionPredicateOrigin>};
  async function getItems(itemIds:readonly number[],locale:Db01Locale):
    Promise<readonly (Readonly<Db01ItemOriginalCollectionSource>|null)[]>{
    localeOk(locale);
    check(Array.isArray(itemIds)&&itemIds.length<=4096&&
      itemIds.every(id),'INVALID_ITEM_BATCH');
    if(itemIds.length===0)return Object.freeze([]);
    const [data,rows]=await Promise.all([
      menus(),shared.getItems(itemIds),
    ]);
    check(rows.length===itemIds.length,'SOURCE_ITEM_BATCH_LENGTH');
    const referenced=new Map<number,Map<number,MutableGroup>>();
    const byItem=new Map<number,Map<number,Map<number,MutableGroup>>>();
    function ensure(setId:number,groupIndex:number,
      sourceMenu?:Readonly<Db01OriginalCollectionMenu>|null){
      const menu=data.byId.get(setId);
      check(menu&&nonneg(groupIndex)&&groupIndex<menu.groupCount&&
        (sourceMenu===undefined||
          (sourceMenu!==null&&sourceMenu.setId===menu.setId&&
           sourceMenu.submenuCode===menu.submenuCode&&
           sourceMenu.setKey===menu.setKey)),
        'ITEM_COLLECTION_SOURCE_NOT_IN_ORIGINAL_MENU');
      return menu;
    }
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(row===null)continue;
      check(row.itemId===itemIds[i]&&row.item.itemId===row.itemId&&
        row.gameVersion===source.gameVersion&&
        row.collection.direct!==null&&
        row.collection.setUniverse!==null&&
        row.collection.special!==null&&
        row.collection.activityCrafting!==null&&
        row.collection.craftingExclusions==='available',
        'INCOMPLETE_OR_MISMATCHED_ITEM_COLLECTION_SOURCE');
      const sets=new Map<number,Map<number,MutableGroup>>();
      function group(setId:number,index:number){
        let groups=sets.get(setId);
        if(!groups){groups=new Map();sets.set(setId,groups);}
        let record=groups.get(index);
        if(!record){record={direct:false,origins:new Set()};groups.set(index,record);}
        return record;
      }
      for(const direct of row.collection.direct){
        const menu=ensure(direct.setId,direct.groupIndex);
        check(direct.evidence==='current_original_collectionset_explicit_item_list'&&
          direct.setKey===menu.setKey&&direct.submenuCode===menu.submenuCode&&
          direct.submenu===menu.submenu&&
          direct.collectionLabelKey===menu.collectionLabelKey,
          'DIRECT_ORIGINAL_SET_IDENTITY');
        group(direct.setId,direct.groupIndex).direct=true;
      }
      for(const predicate of row.collection.candidates){
        ensure(predicate.collectionSetId,predicate.groupIndex,predicate.sourceMenu);
        check(POSITIVE_ORIGINS.has(predicate.origin),
          'UNKNOWN_POSITIVE_SOURCE_PREDICATE');
        group(predicate.collectionSetId,predicate.groupIndex)
          .origins.add(predicate.origin);
      }
      // No suppressed candidates are promoted to a positive membership.
      byItem.set(i,sets);
      for(const [setId,groups] of sets)
        referenced.set(setId,groups);
    }
    const needed=[...referenced.keys()].map(setId=>data.byId.get(setId)!);
    const localized=await localizedSets(needed,locale);
    return Object.freeze(rows.map((row,index)=>{
      if(row===null)return null;
      const sets=byItem.get(index)!;
      const links=[...sets.entries()].map(([setId,groups])=>{
        const sourceSet=localized.get(setId);
        check(sourceSet,'UNRESOLVED_SET_LABEL');
        return Object.freeze({
          sourceSet,
          groups:Object.freeze([...groups.entries()]
            .sort((a,b)=>a[0]-b[0])
            .map(([groupIndex,value])=>Object.freeze({
              groupIndex,originalDirectListing:value.direct,
              positiveSourcePredicateOrigins:Object.freeze([...value.origins].sort()),
              gameUiMembershipVerified:false as const,
            }))),
          sourceCandidatesOnly:true as const,
          actualGameUiMembershipVerified:false as const,
          possessionVerified:false as const,
          worldAvailabilityVerified:false as const,
          dlcEntitlementVerified:false as const,
        });
      }).sort((a,b)=>a.sourceSet.submenuCode-b.sourceSet.submenuCode||
        a.sourceSet.sortPriority-b.sourceSet.sortPriority||
        a.sourceSet.collectionSetId-b.sourceSet.collectionSetId);
      return Object.freeze({
        itemId:row.itemId,nativeCategory:row.nativeCategory,locale,
        sourceLinks:Object.freeze(links),
        originalSourcePredicatesComplete:true as const,
        actualGameUiMembershipVerified:false as const,
      });
    }));
  }
  return Object.freeze({
    contract:DB01_SOURCE_COLLECTION_TAXONOMY,source,
    getSourceHierarchy,
    getItems,
    async getItem(itemId:number,locale:Db01Locale){
      check(id(itemId),'INVALID_ITEM_ID');
      return (await getItems([itemId],locale))[0];
    },
  });
}
