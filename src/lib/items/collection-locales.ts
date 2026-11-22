/**
 * Private, SHA-checked current-game Collection labels. Reads precisely the
 * existing CollectionSet.locbin / collection.locbin sources, not Item names.
 *
 * These are confirmed ORIGINAL UI TEXT values, not confirmed runtime
 * CollectionSubMenu-to-tab mapping, visibility, acquisition or ownership.
 * Callers supply private bytes and an independently trusted release SHA.
 * No embedded asset URLs, source datasets or new production JavaScript.
 */
import {DB01_LOCALES,type Db01Locale} from './index.ts';
import type {
  Db01OriginalCollectionMenuClient,Db01OriginalCollectionMenu,
} from './collection-menu.ts';

export const DB01_ORIGINAL_COLLECTION_LOCALES=
  'wand.db01.collection-original-locales.private@1' as const;
const SHA=/^[a-f0-9]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const LOCALES=new Set<string>(DB01_LOCALES);
const isObj=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const name=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=1024&&x.trim()===x&&
  !/\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i.test(x)&&
  !/[\u0000-\u001f\u200b\u200c\u200d\ufeff]/.test(x)&&
  !/<\/?nobr>/i.test(x);
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_ORIGINAL_COLLECTION_LOCALES_'+code);
}
function goodNames(v:unknown,nullable:boolean):v is Record<Db01Locale,string|null>{
  if(!isObj(v)||Object.keys(v).length!==DB01_LOCALES.length||
    !DB01_LOCALES.every(k=>Object.hasOwn(v,k)))return false;
  return DB01_LOCALES.every(k=>name(v[k])||(nullable&&v[k]===null));
}
function checkLocale(locale:unknown):asserts locale is Db01Locale{
  check(typeof locale==='string'&&LOCALES.has(locale),'INVALID_LOCALE');
}

export interface Db01OriginalCollectionSetLabel {
  readonly setId:number;
  readonly setKey:string;
  readonly collectionLabelKey:string;
  readonly locale:Db01Locale;
  /** Null only for the original non-display translation sentinel. */
  readonly currentExactName:string|null;
  readonly originalLocDbLabelVerified:boolean;
  readonly gameUiMembershipVerified:false;
}
export interface Db01OriginalCollectionUiLabel {
  readonly originalLocDbKey:string;
  readonly locale:Db01Locale;
  readonly displayName:string;
  readonly sourceExactCurrentLocDbName:true;
  readonly collectionSubmenuMappingVerified:false;
}
export interface Db01OriginalCollectionLocaleClient {
  readonly contract:typeof DB01_ORIGINAL_COLLECTION_LOCALES;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:string;
    sourceItemsSha256:string;
    sourceCollectionSetSha256:string;
    privateOverlaySha256:string;
    privateOnly:true;
    originalGameUiTabLabelsVerified:true;
    originalGameUiAreaLabelsVerified:true;
    collectionSubmenuToUiTabMappingVerified:false;
    actualCollectionUiMembershipVerified:false;
  }>;
  getSetLabels(locale:Db01Locale):Promise<readonly Db01OriginalCollectionSetLabel[]>;
  getUiTabTitles(locale:Db01Locale):Promise<readonly Db01OriginalCollectionUiLabel[]>;
  getUiAreaTitles(locale:Db01Locale):Promise<readonly Db01OriginalCollectionUiLabel[]>;
}

type RawSet=Readonly<{
  setId:number;setKey:string;collectionLabelKey:string;
  names:Readonly<Record<Db01Locale,string|null>>;
}>;
type RawUi=Readonly<{
  key:string;names:Readonly<Record<Db01Locale,string>>;
}>;
type Loaded=Readonly<{
  sets:readonly RawSet[];
  tabs:readonly RawUi[];
  areas:readonly RawUi[];
}>;

/** At most ~0.5MB private, loaded lazily and validated against the original
 * Collection menu client and its original CollectionSet source SHA.
 */
export function createDb01OriginalCollectionLocaleClient(args:{
  menus:Db01OriginalCollectionMenuClient;
  load:()=>Promise<Uint8Array>;
  expectedSha256:string;
}):Db01OriginalCollectionLocaleClient{
  const sourceMenus=args?.menus?.source;
  check(sourceMenus&&VERSION.test(sourceMenus.gameVersion)&&
    SHA.test(sourceMenus.sourceItemsSha256)&&
    SHA.test(sourceMenus.sourceCollectionSetSha256)&&
    sourceMenus.collectionSetDefinitions===305&&
    typeof args.menus.getMenus==='function'&&
    typeof args.load==='function'&&
    typeof args.expectedSha256==='string'&&SHA.test(args.expectedSha256),
    'ORIGINAL_SOURCE_AND_TRUSTED_RELEASE_SHA_REQUIRED');
  const source=Object.freeze({
    platform:'Steam' as const,
    gameVersion:sourceMenus.gameVersion,
    sourceItemsSha256:sourceMenus.sourceItemsSha256,
    sourceCollectionSetSha256:sourceMenus.sourceCollectionSetSha256,
    privateOverlaySha256:args.expectedSha256,
    privateOnly:true as const,
    originalGameUiTabLabelsVerified:true as const,
    originalGameUiAreaLabelsVerified:true as const,
    collectionSubmenuToUiTabMappingVerified:false as const,
    actualCollectionUiMembershipVerified:false as const,
  });
  let cache:Promise<Loaded>|null=null;
  async function build():Promise<Loaded>{
    const bytes=await args.load();
    check(bytes instanceof Uint8Array&&
      bytes.byteLength>0&&bytes.byteLength<=800_000,'PRIVATE_OVERLAY_SIZE');
    check(globalThis.crypto?.subtle,'WEBCRYPTO_REQUIRED');
    const copy=new Uint8Array(bytes);
    const digest=await crypto.subtle.digest('SHA-256',copy);
    const hex=Array.from(new Uint8Array(digest),x=>
      x.toString(16).padStart(2,'0')).join('');
    check(hex===args.expectedSha256,'INDEPENDENT_OVERLAY_SHA_MISMATCH');
    const raw:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));
    check(isObj(raw)&&raw.schema===DB01_ORIGINAL_COLLECTION_LOCALES&&
      raw.platform==='Steam'&&raw.gameVersion===source.gameVersion&&
      raw.privateOnly===true&&raw.publicationAuthorized===false&&
      raw.sourceItemsSha256===source.sourceItemsSha256&&
      raw.sourceCollectionSetSha256===source.sourceCollectionSetSha256&&
      raw.sourceLabelKeyVerified===true&&
      raw.originalUiTabNameVerified===true&&
      raw.originalUiAreaNameVerified===true&&
      raw.sourceSubmenuToUiTabMappingVerified===false&&
      raw.actualCollectionUiMembershipVerified===false&&
      raw.dlcEntitlementVerified===false&&
      SHA.test(raw.sourceMenuArchiveSha256 as string)&&
      SHA.test(raw.sourceMenuManifestSha256 as string)&&
      SHA.test(raw.sourceMenuRowsSha256 as string)&&
      isObj(raw.localeZipSha256)&&
      Object.keys(raw.localeZipSha256).length===DB01_LOCALES.length&&
      DB01_LOCALES.every(k=>SHA.test(
        (raw.localeZipSha256 as Record<string,unknown>)[k] as string))&&
      isObj(raw.localeMembersSha256)&&
      Object.keys(raw.localeMembersSha256).length===DB01_LOCALES.length&&
      DB01_LOCALES.every(k=>{
        const row=raw.localeMembersSha256 as Record<string,unknown>;
        return isObj(row[k])&&Object.keys(row[k]).length===2&&
          SHA.test(row[k]['CollectionSet.locbin'] as string)&&
          SHA.test(row[k]['collection.locbin'] as string);
      })&&isObj(raw.coverage)&&
      raw.coverage.collectionSetDefinitions===305&&
      raw.coverage.sourceLocalizedSetsAllEight===304&&
      raw.coverage.originalCollectionTabTitles===21&&
      raw.coverage.originalCollectionAreaTitles===7&&
      Array.isArray(raw.coverage.nonDisplaySetIds)&&
      raw.coverage.nonDisplaySetIds.length===1&&
      id(raw.coverage.nonDisplaySetIds[0])&&
      Array.isArray(raw.sets)&&raw.sets.length===305&&
      Array.isArray(raw.tabTitles)&&raw.tabTitles.length===21&&
      Array.isArray(raw.areaTitles)&&raw.areaTitles.length===7,
      'SOURCE_VERSION_AND_LABEL_CENSUS');
    const original=await args.menus.getMenus();
    check(original.length===305,'ORIGINAL_MENU_COUNT');
    const native=new Map<number,Readonly<Db01OriginalCollectionMenu>>();
    for(const menu of original){
      check(id(menu.setId)&&!native.has(menu.setId),'DUPLICATE_SOURCE_SET_ID');
      native.set(menu.setId,menu);
    }
    const sets:RawSet[]=[];
    let prevId=0;
    const missingIds:number[]=[];
    for(const sourceRecord of raw.sets){
      check(isObj(sourceRecord)&&id(sourceRecord.setId)&&
        sourceRecord.setId>prevId&&name(sourceRecord.setKey)&&
        name(sourceRecord.collectionLabelKey)&&
        typeof sourceRecord.collectionLabelKey==='string'&&
        sourceRecord.collectionLabelKey.startsWith('CollectionSet.')&&
        goodNames(sourceRecord.names,true),'INVALID_COLLECTION_SET_ROW');
      const menu=native.get(sourceRecord.setId);
      check(menu?.setKey===sourceRecord.setKey&&
        menu.collectionLabelKey===sourceRecord.collectionLabelKey,
        'COLLECTION_SET_LABEL_NOT_IN_ORIGINAL');
      prevId=sourceRecord.setId;
      if(DB01_LOCALES.some(k=>
        (sourceRecord.names as Record<Db01Locale,string|null>)[k]===null)){
        check(DB01_LOCALES.every(k=>
          (sourceRecord.names as Record<Db01Locale,string|null>)[k]===null),
          'PARTIAL_ORIGINAL_SENTINEL');
        missingIds.push(sourceRecord.setId);
      }
      sets.push(Object.freeze({
        setId:sourceRecord.setId,setKey:sourceRecord.setKey as string,
        collectionLabelKey:sourceRecord.collectionLabelKey as string,
        names:Object.freeze({...sourceRecord.names}) as Record<Db01Locale,string|null>,
      }));
    }
    check(missingIds.length===1&&
      missingIds[0]===raw.coverage.nonDisplaySetIds[0]&&
      sets.filter(s=>DB01_LOCALES.every(k=>s.names[k]!==null)).length===304,
      'CURRENT_LOCDB_DISPLAY_NAME_COVERAGE');
    function uiLabels(rawLabels:unknown,kind:'tab'|'area'):readonly RawUi[]{
      check(Array.isArray(rawLabels),'UI_LABEL_ARRAY');
      const rows:RawUi[]=[];
      const seen=new Set<string>();
      for(const row of rawLabels){
        check(isObj(row)&&typeof row.key==='string'&&
          row.key.startsWith(kind==='tab'?'tab_title_':'area_title_')&&
          !seen.has(row.key)&&goodNames(row.names,false),
          'INVALID_CURRENT_UI_LABEL');
        if(rows.length)check(row.key>(rows[rows.length-1].key),
          'UI_LABEL_SORT_ORDER');
        seen.add(row.key);
        rows.push(Object.freeze({
          key:row.key,
          names:Object.freeze({...row.names}) as Record<Db01Locale,string>,
        }));
      }
      return Object.freeze(rows);
    }
    return Object.freeze({
      sets:Object.freeze(sets),
      tabs:uiLabels(raw.tabTitles,'tab'),
      areas:uiLabels(raw.areaTitles,'area'),
    });
  }
  function load():Promise<Loaded>{
    if(cache)return cache;
    cache=build().catch(e=>{cache=null;throw e;});
    return cache;
  }
  function uiResult(locale:Db01Locale,rows:readonly RawUi[]):
    readonly Db01OriginalCollectionUiLabel[]{
    return Object.freeze(rows.map(v=>Object.freeze({
      originalLocDbKey:v.key,locale,displayName:v.names[locale],
      sourceExactCurrentLocDbName:true as const,
      collectionSubmenuMappingVerified:false as const,
    })));
  }
  return Object.freeze({
    contract:DB01_ORIGINAL_COLLECTION_LOCALES,source,
    async getSetLabels(locale:Db01Locale){
      checkLocale(locale);
      const rows=(await load()).sets;
      return Object.freeze(rows.map(v=>Object.freeze({
        setId:v.setId,setKey:v.setKey,
        collectionLabelKey:v.collectionLabelKey,locale,
        currentExactName:v.names[locale],
        originalLocDbLabelVerified:v.names[locale]!==null,
        gameUiMembershipVerified:false as const,
      })));
    },
    async getUiTabTitles(locale:Db01Locale){
      checkLocale(locale);
      return uiResult(locale,(await load()).tabs);
    },
    async getUiAreaTitles(locale:Db01Locale){
      checkLocale(locale);
      return uiResult(locale,(await load()).areas);
    },
  });
}
