/**
 * DB-04 shared localized World/Disney Universe taxonomy, sourced entirely
 * from the EXISTING current-version DB-01 Tag definition/LocDB catalog.
 *
 * Original Tag names are not proof of Collection UI membership, item origin,
 * acquisition area, a DLC purchase or save-world placement. No second label
 * archive, hard-coded translated names or new source extraction is required.
 *
 * All source data is loaded locally through the private DB-01 caller; no
 * game data, private archive or Save file is transmitted by this client.
 */
import {DB01_LOCALES,type Db01CatalogClient,type Db01Locale,type Db01Item}
  from '../items/index.ts';
import {DB04_WORLD_TAGS,type Db04WorldTag,type Db04NativeItemScopeClient,
  DB04_NATIVE_SCOPE_CLIENT} from './native-item-scope.ts';

export const DB04_NATIVE_TAG_TAXONOMY='wand.db04.native-tag-taxonomy@1' as const;
export type Db04TaxonomyKind='world_context_tag'|'disney_universe_tag';
export interface Db04LocalizedNativeTag {
  readonly kind:Db04TaxonomyKind;
  readonly tagItemId:number;
  readonly nativeKey:string;
  readonly locale:Db01Locale;
  readonly displayName:string;
  readonly originalTagDefinitionSha256:string;
  readonly sourceExactCurrentLocDbName:true;
  readonly originalTagDefinitionVerified:true;
  readonly sourceWorldOrUniverseTagVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly itemOriginWorldVerified:false;
  readonly itemAcquisitionWorldVerified:false;
  readonly contentPackRelationVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db04NativeTagTaxonomyClient {
  readonly contract:typeof DB04_NATIVE_TAG_TAXONOMY;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    db01NativeManifestSha256:string;
    db01SourceItemsSha256:string;
    originalTagSha256:string;
    nativeScopeCrosschecked:boolean;
    privateOnly:true;
    publicationAuthorized:false;
    gameUiCollectionMembershipVerified:false;
    contentPackRelationVerified:false;
  }>;
  /** All six verified original World-context Tag definitions in game order. */
  listWorldTags(locale:Db01Locale):Promise<readonly Db04LocalizedNativeTag[]>;
  getWorldTag(key:Db04WorldTag,locale:Db01Locale):Promise<Db04LocalizedNativeTag>;
  /** 67 source-native Disney Universe Tag definitions; not UI-visible claims. */
  listUniverseTags(locale:Db01Locale):Promise<readonly Db04LocalizedNativeTag[]>;
  getUniverseTag(tagItemId:number,locale:Db01Locale):Promise<Db04LocalizedNativeTag|null>;
  getUniverseTagByKey(key:string,locale:Db01Locale):
    Promise<Db04LocalizedNativeTag|null>;
}
const SHA=/^[0-9a-f]{64}$/;
const KEY=/^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const WORLD_SET=new Set<string>(DB04_WORLD_TAGS);
const LOCALE_SET=new Set<string>(DB01_LOCALES);
const safeId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const tagWorldId=(n:number)=>n>=2001200000&&n<2001300000;
const tagUniverseId=(n:number)=>n>=2000500000&&n<2000600000;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB04_NATIVE_TAG_TAXONOMY_'+code);
}
function validLocale(locale:unknown):asserts locale is Db01Locale{
  check(typeof locale==='string'&&LOCALE_SET.has(locale),'INVALID_LOCALE');
}
function checkNames(row:Readonly<Db01Item>):void{
  check(row.names!==null&&typeof row.names==='object'&&
    Object.keys(row.names).length===DB01_LOCALES.length&&
    DB01_LOCALES.every(locale=>typeof row.names[locale]==='string'&&
      row.names[locale]!.trim().length>0&&
      row.names[locale]!.trim()===row.names[locale]&&
      !/[\x00-\x1f]/.test(row.names[locale]!)),
    'CURRENT_EXACT_LOCDB_NAME_REQUIRED');
}
function label(kind:Db04TaxonomyKind,row:Readonly<Db01Item>,locale:Db01Locale):
  Db04LocalizedNativeTag{
  const name=row.names[locale];
  check(typeof name==='string'&&name.length>0,
    'CURRENT_EXACT_LOCDB_NAME_REQUIRED');
  return Object.freeze({
    kind,tagItemId:row.itemId,nativeKey:row.nativeKey,locale,
    displayName:name,
    originalTagDefinitionSha256:row.sourceSha256,
    sourceExactCurrentLocDbName:true as const,
    originalTagDefinitionVerified:true as const,
    sourceWorldOrUniverseTagVerified:true as const,
    gameUiCollectionMembershipVerified:false as const,
    itemOriginWorldVerified:false as const,
    itemAcquisitionWorldVerified:false as const,
    contentPackRelationVerified:false as const,
    dlcEntitlementVerified:false as const,
  });
}
/**
 * The immutable DB-01 private Tag shard is already source-SHA checked.
 * Optional original scope evidence independently pins Tag.json from the
 * 13,202 native Item World/Universe record extractor.
 */
export function createDb04NativeTagTaxonomyClient(
  db01:Db01CatalogClient,
  nativeScope:Db04NativeItemScopeClient|null=null
):Db04NativeTagTaxonomyClient{
  check(db01?.source?.platform==='Steam'&&
    db01.source.gameVersion==='1.26.2'&&
    db01.source.privateOnly===true&&
    db01.source.fullCorpusParsed===true&&
    db01.source.definitions===39067&&
    SHA.test(db01.source.nativeSourceManifestSha256)&&
    SHA.test(db01.source.sourceItemsSha256)&&
    typeof db01.getCategory==='function',
    'DB01_PRIVATE_COMPLETE_SOURCE_REQUIRED');
  if(nativeScope!==null){
    check(nativeScope.contract===DB04_NATIVE_SCOPE_CLIENT&&
      nativeScope.source?.privateOnly===true &&
      nativeScope.source.publicationAuthorized===false &&
      nativeScope.source.platform==='Steam' &&
      nativeScope.source.gameVersion===db01.source.gameVersion &&
      SHA.test(nativeScope.source.auditSha256)&&
      SHA.test(nativeScope.source.originalTagSha256),
      'SCOPE_ORIGINAL_SOURCE_REQUIRED');
  }
  type Loaded=Readonly<{
    worlds:ReadonlyMap<string,Readonly<Db01Item>>;
    universesById:ReadonlyMap<number,Readonly<Db01Item>>;
    universesByKey:ReadonlyMap<string,Readonly<Db01Item>>;
    universeItems:readonly Readonly<Db01Item>[];
    originalTagSha256:string;
  }>;
  let cached:Promise<Loaded>|null=null;
  function data():Promise<Loaded>{
    if(cached)return cached;
    const task=(async():Promise<Loaded>=>{
      const records=await db01.getCategory('Tag');
      // Steam v1.26.2 original Tag.json is pinned to exactly 409 records.
      check(Array.isArray(records)&&records.length===409,'TAG_CATEGORY_COUNT');
      const keys=new Map<string,Readonly<Db01Item>>();
      const ids=new Set<number>();
      let sha:string|null=null;
      const universeItems:Readonly<Db01Item>[]=[];
      for(const raw of records){
        check(raw&&safeId(raw.itemId)&&
          raw.nativeCategory==='Tag'&&
          raw.catalogDomain==='definition_unclassified'&&
          KEY.test(raw.nativeKey)&&SHA.test(raw.sourceSha256)&&
          !keys.has(raw.nativeKey)&&!ids.has(raw.itemId),
          'ORIGINAL_TAG_IDENTITY');
        ids.add(raw.itemId);keys.set(raw.nativeKey,raw);
        if(sha!==null)check(sha===raw.sourceSha256,'MIXED_ORIGINAL_TAG_SHA');
        else sha=raw.sourceSha256;
        if(tagUniverseId(raw.itemId))universeItems.push(raw);
      }
      check(sha!==null&&
        (nativeScope===null||nativeScope.source.originalTagSha256===sha),
        'INDEPENDENT_ORIGINAL_TAG_SHA_MISMATCH');
      const worlds=new Map<string,Readonly<Db01Item>>();
      for(const key of DB04_WORLD_TAGS){
        const row=keys.get(key);
        check(row!==undefined&&tagWorldId(row.itemId),'MISSING_NATIVE_WORLD_TAG');
        checkNames(row);worlds.set(key,row);
      }
      check(universeItems.length===67,'NATIVE_UNIVERSE_TAG_COUNT');
      universeItems.sort((a,b)=>a.itemId-b.itemId);
      const universesById=new Map<number,Readonly<Db01Item>>();
      const universesByKey=new Map<string,Readonly<Db01Item>>();
      for(const row of universeItems){
        checkNames(row);
        check(!universesByKey.has(row.nativeKey),'DUPLICATE_UNIVERSE_TAG_KEY');
        universesById.set(row.itemId,row);
        universesByKey.set(row.nativeKey,row);
      }
      // A native World Tag and a universe Tag are distinct, not interchangeable.
      check(universeItems.every(row=>!WORLD_SET.has(row.nativeKey)),
        'WORLD_UNIVERSE_TAG_COLLISION');
      return Object.freeze({
        worlds,universesById,universesByKey,
        universeItems:Object.freeze(universeItems),
        originalTagSha256:sha
      });
    })();
    cached=task;
    task.catch(()=>{if(cached===task)cached=null;});
    return task;
  }
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:'1.26.2' as const,
    db01NativeManifestSha256:db01.source.nativeSourceManifestSha256,
    db01SourceItemsSha256:db01.source.sourceItemsSha256,
    originalTagSha256:nativeScope?.source.originalTagSha256??'',
    nativeScopeCrosschecked:nativeScope!==null,
    privateOnly:true as const,publicationAuthorized:false as const,
    gameUiCollectionMembershipVerified:false as const,
    contentPackRelationVerified:false as const
  });
  // Missing Tag SHA in the caller-visible client source is deliberate when
  // the optional independent scope audit was not attached: category data()
  // still verifies every original record carries the same pinned DB-01 SHA.
  return Object.freeze({
    contract:DB04_NATIVE_TAG_TAXONOMY,source,
    async listWorldTags(locale:Db01Locale){
      validLocale(locale);
      const d=await data();
      return Object.freeze(DB04_WORLD_TAGS.map(key=>
        label('world_context_tag',d.worlds.get(key)!,locale)));
    },
    async getWorldTag(key:Db04WorldTag,locale:Db01Locale){
      validLocale(locale);
      check(typeof key==='string'&&WORLD_SET.has(key),'UNKNOWN_WORLD_TAG');
      const d=await data();
      return label('world_context_tag',d.worlds.get(key)!,locale);
    },
    async listUniverseTags(locale:Db01Locale){
      validLocale(locale);
      const d=await data();
      return Object.freeze(d.universeItems.map(row=>
        label('disney_universe_tag',row,locale)));
    },
    async getUniverseTag(tagItemId:number,locale:Db01Locale){
      validLocale(locale);
      check(safeId(tagItemId),'INVALID_UNIVERSE_TAG_ID');
      const d=await data();
      const tag=d.universesById.get(tagItemId);
      return tag?label('disney_universe_tag',tag,locale):null;
    },
    async getUniverseTagByKey(key:string,locale:Db01Locale){
      validLocale(locale);
      check(typeof key==='string'&&KEY.test(key),'INVALID_UNIVERSE_TAG_KEY');
      const d=await data();
      const tag=d.universesByKey.get(key);
      return tag?label('disney_universe_tag',tag,locale):null;
    }
  });
}
