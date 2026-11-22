/**
 * Steam v1.26.2 native Collection UI axes: independent CollectionArea (area
 * tab) and CollectionSubMenu (category filter) axes, source-name-correlated
 * with current LocDB. Category and area title strings are verified LocDB
 * text; their association to enum codes is name-correlated, NOT a proven
 * runtime label-binding call. Original Item membership/availability is NOT
 * inferred. No original game assets are embedded or fetched here.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import type {
  Db01OriginalCollectionMenuClient,Db01OriginalCollectionMenu,
} from './collection-menu.ts';
import type {
  Db01OriginalCollectionLocaleClient,Db01OriginalCollectionUiLabel,
} from './collection-locales.ts';

export const DB01_COLLECTION_UI_AXES='wand.db01.collection-native-ui-axes@1' as const;
/** SHA-256 of original Steam v1.26.2 Il2CppDump/dump.cs, independently
 * verified against the same original dump used by DB-01 CollectionSet.
 */
export const DB01_COLLECTION_UI_IL2CPP_SHA256=
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;

/** Original Mdl.Ui.CollectionArea enum. Values must not be renumbered:
 * Honeywood=4097 is NOT the next sequential numeric member.
 */
export const DB01_ORIGINAL_COLLECTION_AREAS=Object.freeze([
  {code:0,enumName:'AllAreas',locDbKey:'area_title_all_areas'},
  {code:1,enumName:'DreamlightValley',locDbKey:'area_title_dreamlight_valley'},
  {code:2,enumName:'EternityIsle',locDbKey:'area_title_eternity_isle'},
  {code:3,enumName:'StorybookVale',locDbKey:'area_title_storybook_vale'},
  {code:4,enumName:'WishblossomRanch',locDbKey:'area_title_wishblossom_ranch'},
  {code:5,enumName:'SeaOfSecrets',locDbKey:'area_title_sea_of_secrets'},
  {code:4097,enumName:'Honeywood',locDbKey:'area_title_honeywood'},
] as const);

/** Original Definitions.Items.CollectionSubMenu enum. Two enum values
 * (17,19) currently have zero original CollectionSet definitions; their
 * existence is not evidence of runtime visibility/hidden state.
 *
 * The paired LocDB keys are original-name CORRELATIONS, not a recovered
 * runtime string-binding map. Stories/LorekeeperTales and Crop/Ingredients
 * are named matches only; never assert strict code-to-label verification.
 * Original tab_title_critters has no corresponding SubMenu enum member.
 */
export const DB01_ORIGINAL_COLLECTION_SUBMENUS=Object.freeze([
  {code:0,enumName:'Crop',locDbKey:'tab_title_crops'},
  {code:1,enumName:'Fish',locDbKey:'tab_title_fish'},
  {code:2,enumName:'Meals',locDbKey:'tab_title_meals'},
  {code:3,enumName:'FurnitureSets',locDbKey:'tab_title_furniture'},
  {code:4,enumName:'ClothingSets',locDbKey:'tab_title_clothing'},
  {code:6,enumName:'Memories',locDbKey:'tab_title_memories'},
  {code:7,enumName:'Characters',locDbKey:'tab_title_characters'},
  {code:8,enumName:'Foraging',locDbKey:'tab_title_foraging'},
  {code:9,enumName:'Minerals',locDbKey:'tab_title_minerals'},
  {code:10,enumName:'Crafting',locDbKey:'tab_title_crafting'},
  {code:11,enumName:'TimeBending',locDbKey:'tab_title_time_bending'},
  {code:12,enumName:'BoardGame',locDbKey:'tab_title_board_game'},
  {code:13,enumName:'Snippets',locDbKey:'tab_title_snippets'},
  {code:14,enumName:'Stories',locDbKey:'tab_title_lorekeeper_tales'},
  {code:15,enumName:'Companions',locDbKey:'tab_title_companions'},
  {code:16,enumName:'Mounts',locDbKey:'tab_title_mounts'},
  {code:17,enumName:'PhotoGallery',locDbKey:'tab_title_photo_gallery'},
  {code:18,enumName:'QuestPuzzles',locDbKey:'tab_title_quest_puzzles'},
  {code:19,enumName:'Exhibition',locDbKey:'tab_title_exhibition'},
  {code:20,enumName:'Sidekicks',locDbKey:'tab_title_sidekick'},
] as const);

export interface Db01CollectionNativeAreaOption {
  readonly areaCode:number;
  readonly originalEnumName:string;
  readonly originalLocDbKey:string;
  readonly displayName:string;
  readonly locale:Db01Locale;
  readonly nativeCollectionAreaEnumVerified:true;
  readonly collectionAreaTabButtonFieldVerified:true;
  readonly currentOriginalLocDbNameVerified:true;
  readonly codeToRuntimeLabelBindingVerified:false;
  readonly itemWorldAvailabilityVerified:false;
}
export interface Db01CollectionNativeCategoryOption {
  readonly submenuCode:number;
  readonly originalEnumName:string;
  readonly originalLocDbKey:string;
  readonly displayName:string;
  readonly locale:Db01Locale;
  readonly originalCollectionSetCount:number;
  readonly originalCollectionSubMenuEnumVerified:true;
  readonly collectionCategoryFilterFieldVerified:true;
  readonly currentOriginalLocDbNameVerified:true;
  /** Name/semantic alignment, NOT execution evidence of UI string binding. */
  readonly codeToRuntimeLabelBindingVerified:false;
  readonly runtimeCategoryVisibleVerified:false;
  readonly itemGameUiMembershipVerified:false;
}
/** One exact original CollectionSet under a source CollectionSubMenu.
 * Native CollectionSet Groups have no CollectionArea field. Area is a
 * separate runtime aggregation, so Item/Set area membership remains null.
 */
export interface Db01CollectionNativeSourceSet {
  readonly setId:number;
  readonly nativeSetKey:string;
  readonly submenuCode:number;
  readonly originalSetSortPriority:number;
  readonly sourceGroupCount:number;
  readonly sourceDirectItemCount:number;
  readonly originalStaticSelectorCount:number;
  readonly collectionLabelKey:string;
  readonly locale:Db01Locale;
  /** Current exact CollectionSet.locbin label, or its non-display sentinel. */
  readonly currentExactSetName:string|null;
  readonly currentOriginalLocDbLabelVerified:boolean;
  readonly nativeCollectionSubMenuAssociationVerified:true;
  readonly nativeCollectionAreaCode:null;
  readonly sourceCategoryIsGameScreenMembershipVerified:false;
  readonly playerOwnedVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01CollectionUnmatchedUiLabel {
  readonly originalLocDbKey:string;
  readonly displayName:string;
  readonly locale:Db01Locale;
  readonly originalNameVerified:true;
  readonly collectionSubMenuEnumAssociation:null;
  readonly runtimeVisibilityVerified:false;
}
export interface Db01CollectionNativeUiAxesClient {
  readonly contract:typeof DB01_COLLECTION_UI_AXES;
  readonly source:Readonly<{
    gameVersion:'1.26.2';
    sourceItemsSha256:string;
    sourceCollectionSetSha256:string;
    sourceIl2cppDumpSha256:typeof DB01_COLLECTION_UI_IL2CPP_SHA256;
    privateLocaleOverlaySha256:string;
    nativeCollectionSubMenuDefinitions:20;
    nativeCollectionAreaDefinitions:7;
    originalCollectionSetDefinitions:305;
    sourceSubMenuWithOriginalSets:18;
    runtimeStringBindingVerified:false;
    actualGameUiMembershipVerified:false;
    worldAvailabilityVerified:false;
  }>;
  /** Seven original CollectionArea code/options, including AllAreas and 4097. */
  getAreaOptions(locale:Db01Locale):Promise<readonly Db01CollectionNativeAreaOption[]>;
  /** Twenty source enum category options, including two with zero original Sets. */
  getCategoryOptions(locale:Db01Locale):
    Promise<readonly Db01CollectionNativeCategoryOption[]>;
  /** Ordered current original CollectionSet definitions for a native
   * category; does not imply game-screen visibility or CollectionArea.
   * A valid category with no source definitions returns an empty array.
   */
  getCategorySourceSets(locale:Db01Locale,submenuCode:number):
    Promise<readonly Db01CollectionNativeSourceSet[]>;
  /** Source LocDB labels without an original CollectionSubMenu enum member. */
  getUnmatchedTabLabels(locale:Db01Locale):
    Promise<readonly Db01CollectionUnmatchedUiLabel[]>;
}

const SHA=/^[a-f0-9]{64}$/;
const LOCALES=new Set<string>(DB01_LOCALES);
const safeId=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function check(value:unknown,code:string):asserts value {
  if(!value)throw new TypeError('DB01_COLLECTION_NATIVE_AXES_'+code);
}
function validLocale(locale:unknown):asserts locale is Db01Locale{
  check(typeof locale==='string'&&LOCALES.has(locale),'INVALID_LOCALE');
}
type Names=Readonly<{
  area:ReadonlyMap<string,Readonly<Db01OriginalCollectionUiLabel>>;
  tab:ReadonlyMap<string,Readonly<Db01OriginalCollectionUiLabel>>;
}>;
const sourceAreaKeys=new Set<string>(DB01_ORIGINAL_COLLECTION_AREAS.map(x=>x.locDbKey));
const sourceTabKeys=new Set<string>(DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>x.locDbKey));
check(DB01_ORIGINAL_COLLECTION_AREAS.length===7&&
  sourceAreaKeys.size===7&&
  new Set(DB01_ORIGINAL_COLLECTION_AREAS.map(x=>x.code)).size===7&&
  DB01_ORIGINAL_COLLECTION_SUBMENUS.length===20&&
  sourceTabKeys.size===20&&
  new Set(DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>x.code)).size===20,
  'INVALID_INTERNAL_NATIVE_ENUM_SNAPSHOT');

export function createDb01CollectionNativeUiAxesClient(
  menus:Db01OriginalCollectionMenuClient,
  labels:Db01OriginalCollectionLocaleClient,
):Db01CollectionNativeUiAxesClient{
  const original=menus?.source,local=labels?.source;
  check(original&&local&&original.gameVersion==='1.26.2'&&
    original.collectionSetDefinitions===305&&
    original.sourceIl2cppDumpSha256===DB01_COLLECTION_UI_IL2CPP_SHA256&&
    SHA.test(original.sourceItemsSha256)&&
    SHA.test(original.sourceCollectionSetSha256)&&
    local.gameVersion===original.gameVersion&&
    local.sourceItemsSha256===original.sourceItemsSha256&&
    local.sourceCollectionSetSha256===original.sourceCollectionSetSha256&&
    local.privateOnly===true&&
    local.originalGameUiTabLabelsVerified===true&&
    local.originalGameUiAreaLabelsVerified===true&&
    local.collectionSubmenuToUiTabMappingVerified===false&&
    local.actualCollectionUiMembershipVerified===false&&
    SHA.test(local.privateOverlaySha256)&&
    typeof menus.getMenus==='function'&&
    typeof labels.getUiTabTitles==='function'&&
    typeof labels.getUiAreaTitles==='function'&&
    typeof labels.getSetLabels==='function',
    'PINNED_ORIGINAL_SOURCE_REQUIRED');
  const source=Object.freeze({
    gameVersion:'1.26.2' as const,
    sourceItemsSha256:original.sourceItemsSha256,
    sourceCollectionSetSha256:original.sourceCollectionSetSha256,
    sourceIl2cppDumpSha256:DB01_COLLECTION_UI_IL2CPP_SHA256,
    privateLocaleOverlaySha256:local.privateOverlaySha256,
    nativeCollectionSubMenuDefinitions:20 as const,
    nativeCollectionAreaDefinitions:7 as const,
    originalCollectionSetDefinitions:305 as const,
    sourceSubMenuWithOriginalSets:18 as const,
    runtimeStringBindingVerified:false as const,
    actualGameUiMembershipVerified:false as const,
    worldAvailabilityVerified:false as const,
  });
  // Cache source definitions once, grouped by original enum code.
  // The 305 current CollectionSet definitions each carry exactly one
  // source CollectionGroup. Runtime CollectionArea grouping is separate.
  let sourceGroups:Promise<ReadonlyMap<number,
    readonly Readonly<Db01OriginalCollectionMenu>[]>>|null=null;
  function groups():Promise<ReadonlyMap<number,
    readonly Readonly<Db01OriginalCollectionMenu>[]>>{
    if(!sourceGroups){
      sourceGroups=(async()=>{
        const raw=await menus.getMenus();
        check(Array.isArray(raw)&&raw.length===305,'INCOMPLETE_SOURCE_SETS');
        const seen=new Set<number>();
        const byCode=new Map<number,Db01OriginalCollectionMenu[]>();
        const enumByCode=new Map<number,string>(
          DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>[x.code,x.enumName] as const));
        for(const menu of raw){
          check(safeId(menu.setId)&&!seen.has(menu.setId)&&
            enumByCode.get(menu.submenuCode)===menu.submenu&&
            typeof menu.setKey==='string'&&menu.setKey.length>0&&
            typeof menu.collectionLabelKey==='string'&&
            menu.collectionLabelKey.startsWith('CollectionSet.')&&
            menu.groupCount===1&&
            Number.isSafeInteger(menu.sortPriority)&&
            Number.isSafeInteger(menu.directListedItemCount)&&
            menu.directListedItemCount>=0&&
            Number.isSafeInteger(menu.dynamicSelectorsUnresolved)&&
            menu.dynamicSelectorsUnresolved>=0&&
            menu.gameUiVisibilityVerified===false,
            'UNKNOWN_OR_MISMATCHED_ORIGINAL_SUBMENU');
          seen.add(menu.setId);
          const records=byCode.get(menu.submenuCode)??[];
          records.push(menu);
          byCode.set(menu.submenuCode,records);
        }
        check(byCode.size===18&&
          byCode.get(17)===undefined&&byCode.get(19)===undefined&&
          [...byCode.values()].reduce((n,entries)=>n+entries.length,0)===305,
          'ORIGINAL_SOURCE_MENU_CENSUS');
        for(const [code,records] of byCode){
          records.sort((a,b)=>a.sortPriority-b.sortPriority||a.setId-b.setId);
          byCode.set(code,Object.freeze(records) as Db01OriginalCollectionMenu[]);
        }
        return byCode as ReadonlyMap<number,
          readonly Readonly<Db01OriginalCollectionMenu>[]>;
      })().catch(e=>{sourceGroups=null;throw e;});
    }
    return sourceGroups;
  }
  const localizedSetNames=new Map<Db01Locale,
    Promise<ReadonlyMap<number,{setKey:string;labelKey:string;
      exactName:string|null;labelVerified:boolean}>>>();
  async function setNames(locale:Db01Locale){
    validLocale(locale);
    const cached=localizedSetNames.get(locale);
    if(cached)return cached;
    const task=(async()=>{
      const rows=await labels.getSetLabels(locale);
      check(Array.isArray(rows)&&rows.length===305,
        'INCOMPLETE_SOURCE_SET_LOCALE');
      const names=new Map<number,{setKey:string;labelKey:string;
        exactName:string|null;labelVerified:boolean}>();
      for(const row of rows){
        check(safeId(row.setId)&&!names.has(row.setId)&&
          row.locale===locale&&
          typeof row.setKey==='string'&&row.setKey.length>0&&
          typeof row.collectionLabelKey==='string'&&
          row.collectionLabelKey.startsWith('CollectionSet.')&&
          (row.currentExactName===null||
            (typeof row.currentExactName==='string'&&
             row.currentExactName.trim().length>0))&&
          row.originalLocDbLabelVerified===(row.currentExactName!==null)&&
          row.gameUiMembershipVerified===false,
          'INVALID_OR_DUPLICATE_ORIGINAL_SET_LOCALE');
        names.set(row.setId,{
          setKey:row.setKey,labelKey:row.collectionLabelKey,
          exactName:row.currentExactName,
          labelVerified:row.originalLocDbLabelVerified,
        });
      }
      check([...names.values()].filter(x=>x.labelVerified).length===304,
        'ORIGINAL_SET_LABEL_COVERAGE');
      return names as ReadonlyMap<number,{
        setKey:string;labelKey:string;exactName:string|null;labelVerified:boolean
      }>;
    })();
    localizedSetNames.set(locale,task);
    try{return await task;}
    catch(e){
      if(localizedSetNames.get(locale)===task)localizedSetNames.delete(locale);
      throw e;
    }
  }
  const localized=new Map<Db01Locale,Promise<Names>>();
  async function names(locale:Db01Locale):Promise<Names>{
    validLocale(locale);
    const cached=localized.get(locale);
    if(cached)return cached;
    const task=(async()=>{
      const [areas,tabs]=await Promise.all([
        labels.getUiAreaTitles(locale),labels.getUiTabTitles(locale),
      ]);
      function index(
        records:readonly Readonly<Db01OriginalCollectionUiLabel>[],
        expected:number,
        prefix:string,
      ):ReadonlyMap<string,Readonly<Db01OriginalCollectionUiLabel>>{
        check(Array.isArray(records)&&records.length===expected,
          'CURRENT_LOCALE_TITLE_CENSUS');
        const byKey=new Map<string,Readonly<Db01OriginalCollectionUiLabel>>();
        for(const label of records){
          check(typeof label.originalLocDbKey==='string'&&
            label.originalLocDbKey.startsWith(prefix)&&
            label.locale===locale&&
            typeof label.displayName==='string'&&label.displayName.trim()!==''&&
            label.sourceExactCurrentLocDbName===true&&
            label.collectionSubmenuMappingVerified===false&&
            !byKey.has(label.originalLocDbKey),
            'UNTRUSTED_OR_DUPLICATE_ORIGINAL_LOCALE_TITLE');
          byKey.set(label.originalLocDbKey,label);
        }
        return byKey;
      }
      const area=index(areas,7,'area_title_'),tab=index(tabs,21,'tab_title_');
      check(sourceAreaKeys.size===area.size&&
        [...area.keys()].every(key=>sourceAreaKeys.has(key))&&
        [...sourceTabKeys].every(key=>tab.has(key))&&
        [...tab.keys()].filter(key=>!sourceTabKeys.has(key)).length===1&&
        tab.has('tab_title_critters'),'ORIGINAL_LOCDB_ENUM_NAME_CORRELATION');
      return Object.freeze({area,tab});
    })();
    localized.set(locale,task);
    try{return await task;}
    catch(e){if(localized.get(locale)===task)localized.delete(locale);throw e;}
  }
  return Object.freeze({
    contract:DB01_COLLECTION_UI_AXES,source,
    async getAreaOptions(locale:Db01Locale){
      const index=(await names(locale)).area;
      return Object.freeze(DB01_ORIGINAL_COLLECTION_AREAS.map(entry=>
        Object.freeze({
          areaCode:entry.code,originalEnumName:entry.enumName,
          originalLocDbKey:entry.locDbKey,
          displayName:index.get(entry.locDbKey)!.displayName,locale,
          nativeCollectionAreaEnumVerified:true as const,
          collectionAreaTabButtonFieldVerified:true as const,
          currentOriginalLocDbNameVerified:true as const,
          codeToRuntimeLabelBindingVerified:false as const,
          itemWorldAvailabilityVerified:false as const,
        })));
    },
    async getCategoryOptions(locale:Db01Locale){
      // Reject unsupported locale BEFORE touching private CollectionSet bytes.
      // Otherwise the concurrent counts() request runs even if names() rejects.
      validLocale(locale);
      const [index,groupsByCode]=await Promise.all([names(locale),groups()]);
      return Object.freeze(DB01_ORIGINAL_COLLECTION_SUBMENUS.map(entry=>
        Object.freeze({
          submenuCode:entry.code,originalEnumName:entry.enumName,
          originalLocDbKey:entry.locDbKey,
          displayName:index.tab.get(entry.locDbKey)!.displayName,locale,
          originalCollectionSetCount:groupsByCode.get(entry.code)?.length??0,
          originalCollectionSubMenuEnumVerified:true as const,
          collectionCategoryFilterFieldVerified:true as const,
          currentOriginalLocDbNameVerified:true as const,
          codeToRuntimeLabelBindingVerified:false as const,
          runtimeCategoryVisibleVerified:false as const,
          itemGameUiMembershipVerified:false as const,
        })));
    },
    async getCategorySourceSets(locale:Db01Locale,submenuCode:number){
      validLocale(locale);
      // Do not read any private original bytes for an invalid native code.
      check(Number.isSafeInteger(submenuCode)&&
        DB01_ORIGINAL_COLLECTION_SUBMENUS.some(x=>x.code===submenuCode),
        'UNKNOWN_ORIGINAL_COLLECTION_SUBMENU_CODE');
      const [byCode,names]=await Promise.all([groups(),setNames(locale)]);
      return Object.freeze((byCode.get(submenuCode)??[]).map(menu=>{
        const localized=names.get(menu.setId);
        check(localized&&localized.setKey===menu.setKey&&
          localized.labelKey===menu.collectionLabelKey,
          'SOURCE_SET_LOCALE_IDENTITY_MISMATCH');
        return Object.freeze({
          setId:menu.setId,nativeSetKey:menu.setKey,
          submenuCode:menu.submenuCode,
          originalSetSortPriority:menu.sortPriority,
          sourceGroupCount:menu.groupCount,
          sourceDirectItemCount:menu.directListedItemCount,
          originalStaticSelectorCount:menu.dynamicSelectorsUnresolved,
          collectionLabelKey:menu.collectionLabelKey,
          locale,currentExactSetName:localized.exactName,
          currentOriginalLocDbLabelVerified:localized.labelVerified,
          nativeCollectionSubMenuAssociationVerified:true as const,
          nativeCollectionAreaCode:null as null,
          sourceCategoryIsGameScreenMembershipVerified:false as const,
          playerOwnedVerified:false as const,
          worldAvailabilityVerified:false as const,
          dlcEntitlementVerified:false as const,
        });
      }));
    },
    async getUnmatchedTabLabels(locale:Db01Locale){
      const index=(await names(locale)).tab;
      const unmatched=[...index.keys()].filter(key=>!sourceTabKeys.has(key));
      return Object.freeze(unmatched.map(key=>Object.freeze({
        originalLocDbKey:key,displayName:index.get(key)!.displayName,locale,
        originalNameVerified:true as const,
        collectionSubMenuEnumAssociation:null,
        runtimeVisibilityVerified:false as const,
      })));
    },
  });
}
