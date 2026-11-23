/**
 * Lazy, SHA-verified PRIVATE Steam 1.26.2 Furniture subtype + HasTag reader.
 *
 * Original Furniture.json includes SEVEN different protobuf classes with
 * different Tags fields, despite sharing the top-level native ItemType.
 * The private Python extractor SHA-pins the complete source itemlist,
 * original Tag/Set definitions, and the original IL2CPP field layout.
 * No original assets/data are bundled here; the consumer supplies a private
 * File/Worker/origin reader. Never infer Collection UI membership, purchases
 * or world availability from Tag membership.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';
import {
  evaluateOriginalNativeHasTag,
  type Db01OriginalHasTagItem,
  type Db01OriginalHasTagResult,
} from './native-has-tag.ts';

export const DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA=
  'wand.db01.original-furniture-ihastags-steam-1262@1' as const;
export const DB01_ORIGINAL_FURNITURE_SOURCE_SHA256=
  'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196' as const;
export const DB01_ORIGINAL_FURNITURE_SET_SHA256=
  '3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f' as const;
export const DB01_ORIGINAL_FURNITURE_TAG_SHA256=
  'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4' as const;
export const DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256=
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;

/** [original protobuf Tags field, original runtime IHasSet support] */
export const DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS=Object.freeze({
  FurnitureItemData:Object.freeze({tagsFieldNumber:9,hasSet:true,count:5288}),
  LandscapingItemData:Object.freeze({tagsFieldNumber:9,hasSet:false,count:526}),
  FurnitureBlockerItemData:Object.freeze({tagsFieldNumber:14,hasSet:false,count:422}),
  FenceAndRoadItemData:Object.freeze({tagsFieldNumber:10,hasSet:false,count:395}),
  FurnitureRequestItemData:Object.freeze({tagsFieldNumber:7,hasSet:false,count:85}),
  FurnitureSnippetTrapItemData:Object.freeze({tagsFieldNumber:7,hasSet:false,count:18}),
  FurnitureAncientMachineItemData:Object.freeze({tagsFieldNumber:9,hasSet:false,count:12}),
} as const);
export type Db01OriginalFurnitureSubtype=
  keyof typeof DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS;

export interface Db01OriginalFurnitureHasTagManifest{
  readonly schema:typeof DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly sourceFurnitureSha256:typeof DB01_ORIGINAL_FURNITURE_SOURCE_SHA256;
  readonly sourceSetSha256:typeof DB01_ORIGINAL_FURNITURE_SET_SHA256;
  readonly sourceTagSha256:typeof DB01_ORIGINAL_FURNITURE_TAG_SHA256;
  readonly sourceIl2cppDumpSha256:typeof DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256;
  readonly originalNativeClassCounts:Readonly<Record<Db01OriginalFurnitureSubtype,number>>;
  readonly sourceDefinitionCount:6746;
  readonly bucketCount:256;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
  readonly nativeIHasTagsSubtypesVerified:true;
  readonly originalSetLookupComplete:true;
  readonly nativeCollectionUiMembershipVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01OriginalFurnitureHasTagRow{
  readonly itemId:number;
  readonly nativeKey:string;
  readonly originalNativeClass:Db01OriginalFurnitureSubtype;
  readonly tagsFieldNumber:number;
  readonly nativeTags:readonly number[];
  readonly setLookup:Db01OriginalHasTagItem['setLookup'];
  readonly nativeHasTagSchemaVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01OriginalFurnitureHasTagItem{
  readonly original:Readonly<Db01OriginalFurnitureHasTagRow>;
  readonly gameVersion:'1.26.2';
  readonly input:Readonly<Db01OriginalHasTagItem>;
  readonly sourceShardHashVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
}
export interface Db01OriginalFurnitureHasTagClient{
  readonly schema:typeof DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA;
  readonly source:Readonly<Pick<Db01OriginalFurnitureHasTagManifest,
    'gameVersion'|'sourceFurnitureSha256'|'sourceSetSha256'|
    'sourceTagSha256'|'sourceIl2cppDumpSha256'|'originalNativeClassCounts'>>;
  getItem(id:number):Promise<Readonly<Db01OriginalFurnitureHasTagItem>|null>;
  /** Source-sorted or arbitrary Item IDs, up to 4096 per batch.
   * Shards are verified once and catalog identity is checked in one call.
   */ 
  getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01OriginalFurnitureHasTagItem>|null)[]>;
  hasTag(id:number,tagId:number):Promise<Readonly<Db01OriginalHasTagResult>|null>;
}

const specs:Readonly<Record<string,Readonly<{tagsFieldNumber:number;hasSet:boolean;count:number}>>>=
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS;
const known=new Set(Object.keys(specs));
const sha=/^[0-9a-f]{64}$/;
const obj=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const nativeKey=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&
  !/[\x00-\x1f]/.test(v);
function fail(code:string):never{
  throw new TypeError('DB01_FURNITURE_SUBTYPE_'+code);
}
function require(ok:unknown,code:string):asserts ok{
  if(!ok)fail(code);
}
function bucket(id:number):string{
  return 'id/'+(id%256).toString(16).padStart(2,'0')+'.json';
}

export function validateDb01OriginalFurnitureHasTagManifest(
  raw:unknown,
):asserts raw is Db01OriginalFurnitureHasTagManifest{
  require(obj(raw),'MANIFEST_REQUIRED');
  require(raw.schema===DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA&&
    raw.platform==='Steam'&&raw.gameVersion==='1.26.2'&&
    raw.privateOnly===true&&raw.publicationAuthorized===false&&
    raw.sourceFurnitureSha256===DB01_ORIGINAL_FURNITURE_SOURCE_SHA256&&
    raw.sourceSetSha256===DB01_ORIGINAL_FURNITURE_SET_SHA256&&
    raw.sourceTagSha256===DB01_ORIGINAL_FURNITURE_TAG_SHA256&&
    raw.sourceIl2cppDumpSha256===DB01_ORIGINAL_FURNITURE_IL2CPP_SHA256&&
    raw.sourceDefinitionCount===6746&&raw.bucketCount===256&&
    raw.nativeIHasTagsSubtypesVerified===true&&
    raw.originalSetLookupComplete===true&&
    raw.nativeCollectionUiMembershipVerified===false&&
    raw.dlcEntitlementVerified===false&&raw.playerOwnershipVerified===false,
    'ORIGINAL_SOURCE_CONTRACT');
  const classCounts=raw.originalNativeClassCounts;
  require(obj(classCounts)&&
    Object.keys(classCounts).length===known.size&&
    [...known].every(name=>classCounts[name]===specs[name].count),
    'SOURCE_CLASS_CENSUS');
  require(obj(raw.files)&&Object.keys(raw.files).length===256,
    'SOURCE_SHARD_LEDGER');
  const ledger=raw.files;
  let total=0;
  for(let i=0;i<256;i++){
    const key='id/'+i.toString(16).padStart(2,'0')+'.json';
    const meta=ledger[key];
    require(obj(meta)&&typeof meta.sha256==='string'&&sha.test(meta.sha256)&&
      nonnegative(meta.count)&&nonnegative(meta.bytes)&&meta.bytes>=3&&
      meta.bytes<10_000_000,'SOURCE_SHARD_META');
    total+=meta.count;
  }
  require(total===6746,'SOURCE_SHARD_CENSUS');
}

function readRow(
  raw:unknown,path:string,
):Readonly<Db01OriginalFurnitureHasTagRow>{
  require(obj(raw)&&positive(raw.itemId)&&bucket(raw.itemId)===path&&
    Math.floor(raw.itemId/10_000_000)===4&&
    nativeKey(raw.nativeKey)&&
    typeof raw.originalNativeClass==='string'&&
    known.has(raw.originalNativeClass)&&
    raw.nativeHasTagSchemaVerified===true&&
    raw.gameUiCollectionMembershipVerified===false&&
    raw.dlcEntitlementVerified===false,
    'INVALID_ORIGINAL_ROW');
  const spec=specs[raw.originalNativeClass as string];
  require(raw.tagsFieldNumber===spec.tagsFieldNumber&&
    Array.isArray(raw.nativeTags)&&raw.nativeTags.length<=10000&&
    raw.nativeTags.every(positive)&&
    new Set(raw.nativeTags).size===raw.nativeTags.length,
    'ORIGINAL_TAG_FIELD');
  const lookup=raw.setLookup;
  require(obj(lookup),'INCOMPLETE_SET_LOOKUP');
  if(spec.hasSet){
    require(lookup.kind==='has_set'&&nonnegative(lookup.setItemId)&&
      obj(lookup.definition),'ORIGINAL_HAS_SET_INTERFACE');
    if(lookup.setItemId===0){
      require(lookup.definition.kind==='missing_original_set_definition',
        'ZERO_SET_REFERENCE');
    }else{
      require(lookup.definition.kind==='original_set_definition'&&
        lookup.definition.itemId===lookup.setItemId&&
        Array.isArray(lookup.definition.nativeTags)&&
        lookup.definition.nativeTags.length<=10000&&
        lookup.definition.nativeTags.every(positive)&&
        new Set(lookup.definition.nativeTags).size===
          lookup.definition.nativeTags.length,
        'UNRESOLVED_ORIGINAL_SET_REFERENCE');
      Object.freeze(lookup.definition.nativeTags);
    }
    Object.freeze(lookup.definition);
  }else{
    // In particular, FurnitureAncientMachineItemData has a SetItemID
    // serialized field but DOES NOT implement the runtime IHasSet interface.
    require(lookup.kind==='not_ihas_set','FORBIDDEN_NON_INTERFACE_INHERITANCE');
  }
  Object.freeze(raw.nativeTags);
  Object.freeze(lookup);
  return Object.freeze(raw as unknown as Db01OriginalFurnitureHasTagRow);
}

export function createDb01OriginalFurnitureHasTagClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient,
):Db01OriginalFurnitureHasTagClient{
  validateDb01OriginalFurnitureHasTagManifest(raw);
  require(typeof loadBytes==='function'&&
    catalog?.source?.privateOnly===true&&
    catalog.source.platform==='Steam'&&
    catalog.source.gameVersion==='1.26.2'&&
    catalog.source.fullCorpusParsed===true&&
    typeof catalog.getItem==='function'&&
    typeof catalog.getItems==='function',
    'ORIGINAL_CATALOG_SOURCE_REQUIRED');
  const m=raw;
  const fileLedger=m.files;
  const cache=new Map<string,Promise<readonly Readonly<Db01OriginalFurnitureHasTagRow>[]>>();
  async function readBucket(path:string):
    Promise<readonly Readonly<Db01OriginalFurnitureHasTagRow>[]>{
    const found=cache.get(path);
    if(found)return found;
    const promise=(async()=>{
      const meta=fileLedger[path];
      require(meta,'UNKNOWN_SOURCE_ASSET');
      const rawData=await loadBytes(path);
      const bytes=rawData instanceof ArrayBuffer?new Uint8Array(rawData):rawData;
      require(bytes instanceof Uint8Array&&bytes.byteLength===meta.bytes,
        'SOURCE_ASSET_BYTES');
      const snapshot=new Uint8Array(bytes);
      require(!!globalThis.crypto?.subtle,'DIGEST_UNAVAILABLE');
      const hash=Array.from(new Uint8Array(
        await crypto.subtle.digest('SHA-256',snapshot)),v=>
          v.toString(16).padStart(2,'0')).join('');
      require(hash===meta.sha256,'SOURCE_ASSET_SHA256');
      const parsed:unknown=JSON.parse(
        new TextDecoder('utf-8',{fatal:true}).decode(snapshot));
      require(Array.isArray(parsed)&&parsed.length===meta.count,
        'SOURCE_ASSET_COUNT');
      const unique=new Set<number>();
      const rows:Readonly<Db01OriginalFurnitureHasTagRow>[]=[];
      for(const value of parsed){
        const row=readRow(value,path);
        require(!unique.has(row.itemId),'DUPLICATE_ORIGINAL_ID');
        unique.add(row.itemId);
        rows.push(row);
      }
      return Object.freeze(rows);
    })();
    cache.set(path,promise);
    try{return await promise;}
    catch(error){cache.delete(path);throw error;}
  }
  async function getItem(id:number):
    Promise<Readonly<Db01OriginalFurnitureHasTagItem>|null>{
    require(positive(id),'INVALID_ITEM_ID');
    const source=(await readBucket(bucket(id))).find(
      row=>row.itemId===id)??null;
    if(!source)return null;
    const catalogRow=await catalog.getItem(id);
    require(catalogRow?.catalogDomain==='item'&&
      catalogRow.nativeCategory==='Furniture'&&
      catalogRow.nativeKey===source.nativeKey&&
      catalogRow.sourceSha256===DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
      'ORIGINAL_CATALOG_ITEM_MISMATCH');
    const input=Object.freeze({
      itemId:id,gameVersion:'1.26.2' as const,
      nativeTags:source.nativeTags,setLookup:source.setLookup,
    });
    return Object.freeze({
      original:source,gameVersion:'1.26.2',
      input,sourceShardHashVerified:true,
      gameUiCollectionMembershipVerified:false,
    });
  }
  async function getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01OriginalFurnitureHasTagItem>|null)[]>{
    require(Array.isArray(ids)&&ids.length<=4096&&ids.every(positive),
      'INVALID_ITEM_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(bucket))];
    const found=new Map<number,Readonly<Db01OriginalFurnitureHasTagRow>>();
    let cursor=0;
    async function readWorker():Promise<void>{
      while(cursor<paths.length){
        const path=paths[cursor++];
        for(const row of await readBucket(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from(
      {length:Math.min(8,paths.length)},()=>readWorker()));
    const originals=ids.map(id=>found.get(id)??null);
    const catalogRows=await catalog.getItems(ids);
    require(catalogRows.length===originals.length,'CATALOG_BATCH_SIZE');
    return Object.freeze(originals.map((source,index)=>{
      if(!source)return null;
      const catalogRow=catalogRows[index];
      require(catalogRow?.catalogDomain==='item'&&
        catalogRow.nativeCategory==='Furniture'&&
        catalogRow.itemId===source.itemId&&
        catalogRow.nativeKey===source.nativeKey&&
        catalogRow.sourceSha256===DB01_ORIGINAL_FURNITURE_SOURCE_SHA256,
        'ORIGINAL_CATALOG_ITEM_MISMATCH');
      const input=Object.freeze({
        itemId:source.itemId,gameVersion:'1.26.2' as const,
        nativeTags:source.nativeTags,setLookup:source.setLookup,
      });
      return Object.freeze({
        original:source,gameVersion:'1.26.2' as const,
        input,sourceShardHashVerified:true as const,
        gameUiCollectionMembershipVerified:false as const,
      });
    }));
  }
  async function hasTag(id:number,tagId:number):
    Promise<Readonly<Db01OriginalHasTagResult>|null>{
    require(nonnegative(tagId),'INVALID_TAG_ID');
    const item=await getItem(id);
    return item?evaluateOriginalNativeHasTag(item.input,tagId):null;
  }
  return Object.freeze({
    schema:DB01_ORIGINAL_FURNITURE_SUBTYPES_SCHEMA,
    source:Object.freeze({
      gameVersion:m.gameVersion,
      sourceFurnitureSha256:m.sourceFurnitureSha256,
      sourceSetSha256:m.sourceSetSha256,
      sourceTagSha256:m.sourceTagSha256,
      sourceIl2cppDumpSha256:m.sourceIl2cppDumpSha256,
      originalNativeClassCounts:Object.freeze({...m.originalNativeClassCounts}),
    }),
    getItem,getItems,hasTag,
  });
}
