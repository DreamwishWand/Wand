/**
 * DB-02 acquisition source-object presentation for Collection/Guide/Save.
 *
 * Original ActivityItem/Furniture -> LootTable IDs have source-file evidence.
 * Potential Item ID drops do NOT: source-object links are explicitly read-only
 * and must not be presented as guaranteed, currently available, or owned.
 *
 * DB-00: public, verified Steam 1.26.2 name fallback.
 * DB-01: caller-provided private SHA-pinned item names, class and icon GUID.
 * SRC-04: optional, caller-provided SHA-pinned private WebP image index/bytes.
 *
 * Never guesses missing names, generates media URLs, uploads private bytes,
 * or fetches private assets behind the caller's back.
 */
import type {CurrentDb02OriginCatalog} from './current-catalog.ts';
import type {
  NativeLootObjectReference,ItemLootObjectCandidate
} from './native-loot-object-references.ts';
import {
  DB02_LOOT_OBJECT_REFERENCES_SCHEMA,
  DB02_LOOT_OBJECT_ORIGINAL_SHA256
} from './native-loot-object-references.ts';
import type {Db01CatalogClient,Db01Locale,Db01Item} from '../items/index.ts';
import type {PrivateMediaV2Row,PrivateMediaV2BytesProvider} from '../items/media-overlay-v2.ts';
import type {createPrivateDb01MediaOverlayV2} from '../items/media-overlay-v2.ts';

export const DB02_LOOT_SOURCE_DISPLAY_SCHEMA='wand.db02.loot-source-display@1' as const;
const PUBLIC_SOURCE_SHA='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const LOCALES=new Set<string>(['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']);
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly LootSourceObjectDisplay[];
const NONDISPLAY=/^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i;
type Db01MediaClient=ReturnType<typeof createPrivateDb01MediaOverlayV2>;

export interface LootSourceVerifiedThumbnailReference {
  /** Private SRC-04 relative file path, NOT a public URL. */
  readonly privatePath:string;
  readonly sha256:string;
  readonly bytes:number;
  readonly width:number;
  readonly height:number;
  readonly source:'sha_pinned_private_src04_manifest';
  /** Actual image bytes are checked only by readVerifiedThumbnail(). */
  readonly bytesReadAndVerified:false;
}
export interface LootSourceObjectDisplay {
  readonly sourceObjectItemId:string;
  readonly sourceFamily:'ActivityItem'|'Furniture';
  readonly sourceCategoryLabel:string|null;
  /** Exact native class, not a game Collection subcategory. */
  readonly nativeCategory:'ActivityItem'|'Furniture';
  /** Original DB-01 field-2 identity, when available. */
  readonly nativeKey:string|null;
  readonly name:string|null;
  readonly nameLocale:Db01Locale|null;
  readonly nameEvidence:'db01_current_exact_locdb'|'db00_current_verified'|'missing';
  readonly requestedLocale:Db01Locale;
  readonly displayLanguageFallbackUsed:boolean;
  readonly sourceDefinition:NativeLootObjectReference;
  readonly matchedItemId:string|null;
  readonly matchedLootOriginId:string|null;
  readonly verifiedIconGuid:string|null;
  /** Returns null when SRC-04 image bytes/index are not provided. */
  readonly thumbnail:LootSourceVerifiedThumbnailReference|null;
  readonly sourceDefinitionRefVerified:true;
  readonly staticLootItemCandidateOnly:true;
  readonly actualDropVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly collectionOwnershipVerified:false;
}
export interface LootSourceDisplayClient {
  readonly schema:typeof DB02_LOOT_SOURCE_DISPLAY_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly imagesRequirePrivateVerifiedBytes:true;
  getItemPotentialSourceObjects(itemId:string|number,locale?:Db01Locale):
    Promise<readonly LootSourceObjectDisplay[]>;
  getLootTableSourceObjects(tableId:string|number,locale?:Db01Locale):
    Promise<readonly LootSourceObjectDisplay[]>;
  getObjectLootTableSources(objectId:string|number,locale?:Db01Locale):
    Promise<readonly LootSourceObjectDisplay[]>;
  /** Never produces a URL or returns unverified WebP data. */
  readVerifiedThumbnail(objectId:string|number,
    loadImageBytes:PrivateMediaV2BytesProvider):Promise<Uint8Array|null>;
}
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB02_LOOT_SOURCE_DISPLAY_'+code);
}
function id(raw:unknown):string{
  const val=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof val==='string'&&ID.test(val)&&
    Number.isSafeInteger(Number(val)),'INVALID_ID');
  return val;
}
function isLocale(raw:unknown):raw is Db01Locale{
  return typeof raw==='string'&&LOCALES.has(raw);
}
function validName(raw:unknown):raw is string{
  return typeof raw==='string'&&raw.trim().length>0&&
    raw.trim().length<=512&&!NONDISPLAY.test(raw)&&
    !/[\x00-\x1f]/.test(raw);
}
function sourceSha(family:'ActivityItem'|'Furniture'):string{
  return family==='ActivityItem'?DB02_LOOT_OBJECT_ORIGINAL_SHA256.activityItem:
    DB02_LOOT_OBJECT_ORIGINAL_SHA256.furniture;
}
function publicCategory(family:'ActivityItem'|'Furniture'):string{
  return family==='ActivityItem'?'Source Activity Items':'Furniture';
}

/**
 * Caller supplies the authenticated full DB-00/SRC-02 catalog from the normal
 * loadCurrentDb02OriginCatalog() entrypoint. Private DB-01 media is optional;
 * without a real source image the icon reference is null, not a fabricated URL.
 */
export function createLootSourceDisplayClient(
  catalog:CurrentDb02OriginCatalog,
  db01:Db01CatalogClient|null=null,
  media:Db01MediaClient|null=null
):LootSourceDisplayClient{
  check(catalog?.schema==='wand.db02.current-db00-origins@1'&&
    catalog.gameVersion==='1.26.2'&&
    catalog.source==='verified_public_db00_and_local_private_src02_r5'&&
    catalog.db00?.sourceVersion==='1.26.2'&&
    catalog.lootObjectSources?.schema===DB02_LOOT_OBJECT_REFERENCES_SCHEMA&&
    typeof catalog.getItemPotentialLootObjects==='function'&&
    typeof catalog.lookup==='function',
    'CURRENT_CATALOG_REQUIRED');
  if(db01!==null){
    check(db01.source?.privateOnly===true&&
      db01.source.platform==='Steam'&&
      db01.source.gameVersion==='1.26.2'&&
      db01.source.nativeSourceManifestSha256===PUBLIC_SOURCE_SHA&&
      typeof db01.getItems==='function','EXACT_PRIVATE_DB01_REQUIRED');
  }
  if(media!==null){
    check(db01!==null&&media.privateOnly===true&&
      media.publicationAuthorized===false&&
      media.sourceItemsSha256===db01.source.sourceItemsSha256&&
      typeof media.getItemIcon==='function'&&
      typeof media.readVerifiedImage==='function',
      'MATCHING_PRIVATE_SRC04_REQUIRED');
  }

  async function render(
    rows:readonly {ref:NativeLootObjectReference; itemId:string|null;originId:string|null}[],
    locale:Db01Locale
  ):Promise<readonly LootSourceObjectDisplay[]>{
    check(isLocale(locale),'INVALID_LOCALE');
    if(!rows.length)return EMPTY;
    // DB-01's existing getter internally batches into at most eight hash-pinned
    // shard reads, rather than serially fetching a shard for each object.
    const unique=[...new Set(rows.map(x=>Number(id(x.ref.sourceObjectItemId))))];
    check(unique.length<=375,'SOURCE_QUERY_TOO_LARGE');
    const detail=db01?await db01.getItems(unique):unique.map(()=>null);
    check(detail.length===unique.length,'PRIVATE_DB01_BATCH_MISMATCH');
    const byId=new Map<number,Readonly<Db01Item>|null>();
    for(let i=0;i<unique.length;i++)byId.set(unique[i],detail[i]);
    const icons=new Map<number,Readonly<PrivateMediaV2Row>|null>();
    if(media){
      // limit concurrent private index reads; SRC-04 already memoizes buckets
      let next=0;
      async function worker():Promise<void>{
        while(next<unique.length){
          const itemId=unique[next++];
          icons.set(itemId,await media!.getItemIcon(itemId));
        }
      }
      await Promise.all(Array.from({length:Math.min(8,unique.length)},()=>worker()));
    }
    const out:LootSourceObjectDisplay[]=[];
    for(const row of rows){
      const ref=row.ref, objectId=id(ref.sourceObjectItemId),itemId=Number(objectId);
      check(ref.sourceDefinitionRefVerified===true&&
        ref.actualDropVerified===false&&
        ref.lootContextVerified===false&&
        ref.sourceOriginalSha256===sourceSha(ref.sourceFamily),
        'DIRECT_NATIVE_DEFINITION_REQUIRED');
      const published=catalog.lookup(objectId);
      check(published.catalogClassification==='published_db00_item'&&
        published.catalogItem?.id===objectId&&
        published.catalogItem.category===publicCategory(ref.sourceFamily),
        'PUBLISHED_DB00_SOURCE_OBJECT_REQUIRED');
      const native=byId.get(itemId)??null;
      if(native!==null)check(native.itemId===itemId&&
        native.nativeCategory===ref.sourceFamily&&
        native.catalogDomain==='item'&&
        native.sourceSha256===ref.sourceOriginalSha256,
        'PRIVATE_DB01_IDENTITY_MISMATCH');
      const foundIcon=icons.get(itemId)??null;
      if(foundIcon!==null)check(native!==null&&
        foundIcon.itemId===itemId&&
        foundIcon.status==='verified'&&
        foundIcon.iconGuid===native.verifiedIconGuid,
        'SRC04_PRIVATE_ICON_IDENTITY_MISMATCH');
      const locName=native?.names[locale];
      const englishNative=native?.names.en;
      const pub=published.catalogItem.names;
      let name:string|null=null;
      let chosenLocale:Db01Locale|null=null;
      let evidence:LootSourceObjectDisplay['nameEvidence']='missing';
      if(validName(locName)){
        name=locName;chosenLocale=locale;evidence='db01_current_exact_locdb';
      }else if(validName(pub[locale])){
        name=pub[locale];chosenLocale=locale;evidence='db00_current_verified';
      }else if(locale!=='en'&&validName(englishNative)){
        name=englishNative;chosenLocale='en';evidence='db01_current_exact_locdb';
      }else if(locale!=='en'&&validName(pub.en)){
        name=pub.en;chosenLocale='en';evidence='db00_current_verified';
      }
      const thumb=foundIcon?.image.thumbnail;
      out.push(Object.freeze({
        sourceObjectItemId:objectId,
        sourceFamily:ref.sourceFamily,
        sourceCategoryLabel:published.catalogItem.category,
        nativeCategory:ref.sourceFamily,
        nativeKey:native?.nativeKey??null,
        name,nameLocale:chosenLocale,nameEvidence:evidence,
        requestedLocale:locale,
        displayLanguageFallbackUsed:chosenLocale!==null&&chosenLocale!==locale,
        sourceDefinition:ref,
        matchedItemId:row.itemId,
        matchedLootOriginId:row.originId,
        verifiedIconGuid:native?.verifiedIconGuid??null,
        thumbnail:thumb?Object.freeze({
          privatePath:thumb.path,sha256:thumb.sha256,bytes:thumb.bytes,
          width:thumb.width,height:thumb.height,
          source:'sha_pinned_private_src04_manifest' as const,
          bytesReadAndVerified:false as const
        }):null,
        sourceDefinitionRefVerified:true as const,
        staticLootItemCandidateOnly:true as const,
        actualDropVerified:false as const,
        currentAvailabilityVerified:false as const,
        collectionOwnershipVerified:false as const
      }));
    }
    return Object.freeze(out);
  }
  function refsToRows(refs:readonly NativeLootObjectReference[]){
    return refs.map(ref=>({ref,itemId:null,originId:null}));
  }
  return Object.freeze({
    schema:DB02_LOOT_SOURCE_DISPLAY_SCHEMA,
    gameVersion:'1.26.2' as const,
    imagesRequirePrivateVerifiedBytes:true as const,
    async getItemPotentialSourceObjects(raw:string|number,locale:Db01Locale='ja'){
      const itemId=id(raw);
      const original=catalog.getItemPotentialLootObjects(itemId);
      const rows=original.map((candidate:ItemLootObjectCandidate)=>{
        check(candidate.itemId===itemId&&
          candidate.sourceDefinitionRefVerified===true&&
          candidate.actualDropVerified===false&&
          candidate.currentAvailabilityVerified===false,
          'SOURCE_ITEM_CANDIDATE_UNVERIFIED');
        return {ref:candidate.sourceObject,itemId,originId:candidate.lootOriginId};
      });
      return render(rows,locale);
    },
    async getLootTableSourceObjects(raw:string|number,locale:Db01Locale='ja'){
      return render(refsToRows(catalog.lootObjectSources.getLootTableReferrers(id(raw))),locale);
    },
    async getObjectLootTableSources(raw:string|number,locale:Db01Locale='ja'){
      return render(refsToRows(catalog.lootObjectSources.getObjectLootTableReferences(id(raw))),locale);
    },
    async readVerifiedThumbnail(raw:string|number,loadImageBytes:PrivateMediaV2BytesProvider){
      const objectId=Number(id(raw));
      check(typeof loadImageBytes==='function','IMAGE_PROVIDER_REQUIRED');
      check(catalog.lootObjectSources.getObjectLootTableReferences(objectId).length>0&&
        catalog.db00.lookup(objectId).catalogItem!==null,
        'PUBLISHED_DB00_SOURCE_OBJECT_REQUIRED');
      if(!media)return null;
      const icon=await media.getItemIcon(objectId);
      if(!icon)return null;
      return media.readVerifiedImage(icon,'thumbnail',loadImageBytes);
    }
  });
}
