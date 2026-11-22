/** Steam original CollectionSet direct Item-ID associations (private read model).
 *
 * This proves source-listed IDs within a CollectionSet. Dynamic selectors,
 * ignored IDs, runtime visibility, DLC entitlement and world acquisition are
 * NOT inferred; the original CollectionSubMenu enum name is authoritative.
 */
import type { Db01CatalogClient, Db01LoadBytes } from './index.ts';

export const DB01_COLLECTION_MENU_SCHEMA='wand.db01.collection-menu-direct@1' as const;
export const DB01_COLLECTION_MENU_EVIDENCE=
  'current_original_collectionset_explicit_item_list' as const;

export interface Db01OriginalCollectionMenu {
  readonly setId:number;
  readonly setKey:string;
  readonly submenuCode:number;
  readonly submenu:string;
  readonly collectionLabelKey:string|null;
  readonly sortPriority:number;
  readonly groupCount:number;
  readonly directListedItemCount:number;
  readonly dynamicSelectorsUnresolved:number;
  readonly gameUiVisibilityVerified:false;
}
export interface Db01OriginalCollectionListing {
  readonly setId:number;
  readonly setKey:string;
  readonly submenuCode:number;
  readonly submenu:string;
  readonly collectionLabelKey:string|null;
  readonly groupIndex:number;
  readonly evidence:typeof DB01_COLLECTION_MENU_EVIDENCE;
  readonly gameUiVisibilityVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01OriginalCollectionMenuManifest {
  readonly schema:typeof DB01_COLLECTION_MENU_SCHEMA;
  readonly platform:'Steam';readonly gameVersion:string;
  readonly privateOnly:true;readonly publicationAuthorized:false;
  readonly sourceSqliteSha256:string;
  readonly sourceItemsSha256:string;
  readonly sourceCollectionSetSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly catalogDefinitions:number;
  readonly collectionSetDefinitions:number;
  readonly directListedItemIds:number;
  readonly directListedAssociations:number;
  readonly dynamicSelectorsUnresolved:number;
  readonly ignoredExplicitListEntries:number;
  readonly emptySourceGroups:number;
  readonly menusBySubmenu:Readonly<Record<string,number>>;
  readonly directAssociationsBySubmenu:Readonly<Record<string,number>>;
  readonly gameUiVisibilityComplete:false;
  readonly dynamicSelectorsEvaluated:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
  readonly files:Readonly<Record<'menus.json'|'direct-items.json',
    Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01OriginalCollectionMenuClient {
  readonly source:Readonly<Pick<Db01OriginalCollectionMenuManifest,
    'gameVersion'|'sourceItemsSha256'|'sourceCollectionSetSha256'|
    'sourceIl2cppDumpSha256'|'catalogDefinitions'|'collectionSetDefinitions'|
    'directListedItemIds'|'directListedAssociations'|'dynamicSelectorsUnresolved'>>;
  getMenus():Promise<readonly Readonly<Db01OriginalCollectionMenu>[]>;
  getDirectListings(itemId:number):Promise<readonly Readonly<Db01OriginalCollectionListing>[]>;
  getDirectListingsBatch(ids:readonly number[]):Promise<
    readonly (readonly Readonly<Db01OriginalCollectionListing>[])[]
  >;
}

const SHA=/^[0-9a-f]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const safeId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const safeStr=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\x00-\x1f]/.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_COLLECTION_MENU_'+code);
}
const nonnegative=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const fileNames=['menus.json','direct-items.json'] as const;

export function validateDb01CollectionMenuManifest(v:unknown):
  asserts v is Db01OriginalCollectionMenuManifest{
  check(obj(v),'MANIFEST_REQUIRED');
  check(v.schema===DB01_COLLECTION_MENU_SCHEMA&&v.platform==='Steam'&&
    typeof v.gameVersion==='string'&&VERSION.test(v.gameVersion)&&
    v.privateOnly===true&&v.publicationAuthorized===false&&
    v.gameUiVisibilityComplete===false&&v.dynamicSelectorsEvaluated===false&&
    v.worldAvailabilityVerified===false&&v.dlcOwnershipVerified===false,
    'PRIVATE_SOURCE_REQUIRED');
  check([v.sourceSqliteSha256,v.sourceItemsSha256,v.sourceCollectionSetSha256,
    v.sourceIl2cppDumpSha256].every(x=>typeof x==='string'&&SHA.test(x)),
    'SOURCE_SHA');
  for(const name of ['catalogDefinitions','collectionSetDefinitions','directListedItemIds',
    'directListedAssociations','dynamicSelectorsUnresolved','ignoredExplicitListEntries',
    'emptySourceGroups']){
    check(nonnegative(v[name]),'INVALID_COUNT');
  }
  check(Number(v.catalogDefinitions)>0&&Number(v.collectionSetDefinitions)>0&&
    Number(v.collectionSetDefinitions)<=Number(v.catalogDefinitions)&&
    Number(v.directListedItemIds)<=Number(v.directListedAssociations)&&
    Number(v.directListedItemIds)<=Number(v.catalogDefinitions),
    'COVERAGE_COUNT');
  check(obj(v.files)&&Object.keys(v.files).length===fileNames.length&&
    fileNames.every(name=>Object.prototype.hasOwnProperty.call(v.files,name)),
    'FILE_SET');
  for(const name of fileNames){
    const file=v.files[name];
    check(obj(file)&&typeof file.sha256==='string'&&SHA.test(file.sha256)&&
      nonnegative(file.bytes)&&Number(file.bytes)>=3&&Number(file.bytes)<8_000_000&&
      nonnegative(file.count),'FILE_META');
  }
  const validatedFiles=v.files as Record<string,{count:number}>;
  check(validatedFiles['menus.json'].count===v.collectionSetDefinitions&&
    validatedFiles['direct-items.json'].count===v.directListedItemIds,'FILE_COUNTS');
  check(obj(v.menusBySubmenu)&&obj(v.directAssociationsBySubmenu),'SUBMENU_COUNTS');
  const menusBySubmenu=v.menusBySubmenu;
  const directBySubmenu=v.directAssociationsBySubmenu;
  check(Object.entries(menusBySubmenu).every(([name,n])=>
    safeStr(name)&&nonnegative(n)&&Number(n)>0)&&
    Object.values(menusBySubmenu).reduce<number>((sum,n)=>sum+Number(n),0)===
      Number(v.collectionSetDefinitions),'MENU_COUNT_TOTAL');
  check(Object.entries(directBySubmenu).every(([name,n])=>
    name in menusBySubmenu&&nonnegative(n)&&Number(n)>0)&&
    Object.values(directBySubmenu).reduce<number>((sum,n)=>sum+Number(n),0)===
      Number(v.directListedAssociations),'DIRECT_COUNT_TOTAL');
}

function validateMenu(value:unknown):asserts value is Db01OriginalCollectionMenu{
  check(obj(value)&&safeId(value.setId)&&safeStr(value.setKey)&&
    nonnegative(value.submenuCode)&&safeStr(value.submenu)&&
    (value.collectionLabelKey===null||safeStr(value.collectionLabelKey))&&
    Number.isSafeInteger(value.sortPriority)&&
    nonnegative(value.groupCount)&&nonnegative(value.directListedItemCount)&&
    nonnegative(value.dynamicSelectorsUnresolved)&&
    value.gameUiVisibilityVerified===false,'MENU_IDENTITY');
}
function validateListing(value:unknown):asserts value is Db01OriginalCollectionListing{
  check(obj(value)&&safeId(value.setId)&&safeStr(value.setKey)&&
    nonnegative(value.submenuCode)&&safeStr(value.submenu)&&
    (value.collectionLabelKey===null||safeStr(value.collectionLabelKey))&&
    nonnegative(value.groupIndex)&&
    value.evidence===DB01_COLLECTION_MENU_EVIDENCE&&
    value.gameUiVisibilityVerified===false&&value.worldAvailabilityVerified===false&&
    value.dlcOwnershipVerified===false,'LISTING_IDENTITY');
}

/** Never embeds private URLs. The loader must read only its owner-private asset source. */
export function createDb01OriginalCollectionMenuClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient
):Db01OriginalCollectionMenuClient{
  validateDb01CollectionMenuManifest(raw);
  check(typeof loadBytes==='function'&&catalog?.source?.privateOnly===true&&
    typeof catalog.getItem==='function'&&typeof catalog.getItems==='function'&&
    catalog.source.platform===raw.platform&&
    catalog.source.gameVersion===raw.gameVersion&&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256&&
    catalog.source.definitions===raw.catalogDefinitions,
    'CATALOG_SOURCE_MISMATCH');
  const manifest:Db01OriginalCollectionMenuManifest=Object.freeze({
    ...raw,
    menusBySubmenu:Object.freeze({...raw.menusBySubmenu}),
    directAssociationsBySubmenu:Object.freeze({...raw.directAssociationsBySubmenu}),
    files:Object.freeze(Object.fromEntries(fileNames.map(name=>
      [name,Object.freeze({...raw.files[name]})]))) as
      Db01OriginalCollectionMenuManifest['files'],
  });
  async function readAsset(path:typeof fileNames[number]):Promise<unknown>{
    const file=manifest.files[path];
    const data=await loadBytes(path);
    const bytes=data instanceof ArrayBuffer?new Uint8Array(data):data;
    check(bytes instanceof Uint8Array&&bytes.byteLength===file.bytes,'FILE_SIZE');
    const stable=new Uint8Array(bytes);
    check(globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
    const result=await crypto.subtle.digest('SHA-256',stable);
    const actual=Array.from(new Uint8Array(result),byte=>
      byte.toString(16).padStart(2,'0')).join('');
    check(actual===file.sha256,'FILE_SHA');
    const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stable));
    check(Array.isArray(parsed)&&parsed.length===file.count,'FILE_COUNT');
    return parsed;
  }
  type Index={
    menus:readonly Readonly<Db01OriginalCollectionMenu>[];
    items:ReadonlyMap<number,readonly Readonly<Db01OriginalCollectionListing>[]>;
  };
  let loading:Promise<Index>|null=null;
  async function load():Promise<Index>{
    if(loading)return loading;
    const task=(async()=>{
      const [menusRaw,itemsRaw]=await Promise.all([
        readAsset('menus.json'),readAsset('direct-items.json'),
      ]);
      check(Array.isArray(menusRaw)&&Array.isArray(itemsRaw),'INVALID_ASSETS');
      const menus=new Map<number,Readonly<Db01OriginalCollectionMenu>>();
      const menuCounts=new Map<number,Set<number>>();
      const submenuCounts=new Map<string,number>();
      let totalSelectors=0;
      for(const value of menusRaw){
        validateMenu(value);
        check(!menus.has(value.setId),'DUPLICATE_MENU');
        menus.set(value.setId,Object.freeze(value));
        menuCounts.set(value.setId,new Set());
        submenuCounts.set(value.submenu,(submenuCounts.get(value.submenu)??0)+1);
        totalSelectors+=value.dynamicSelectorsUnresolved;
      }
      check(totalSelectors===manifest.dynamicSelectorsUnresolved,'SELECTOR_LEDGER');
      for(const [label,count] of Object.entries(manifest.menusBySubmenu))
        check(submenuCounts.get(label)===count,'MENU_SUBMENU_LEDGER');
      const menuIds=[...menus.keys()];
      for(let start=0;start<menuIds.length;start+=4096){
        const ids=menuIds.slice(start,start+4096);
        const exact=await catalog.getItems(ids);
        check(exact.length===ids.length,'CATALOG_MENU_BATCH');
        for(let i=0;i<ids.length;i++){
          const found=exact[i];
          const menu=menus.get(ids[i])!;
          check(found&&found.itemId===menu.setId&&found.nativeCategory==='CollectionSet'&&
            found.nativeKey===menu.setKey&&
            found.sourceSha256===manifest.sourceCollectionSetSha256,'ORIGINAL_MENU_MISMATCH');
        }
      }
      const byItem=new Map<number,readonly Readonly<Db01OriginalCollectionListing>[]>();
      const associationBySubmenu=new Map<string,number>();
      let directTotal=0;
      for(const record of itemsRaw){
        check(obj(record)&&safeId(record.itemId)&&Array.isArray(record.memberships)&&
          record.memberships.length>0&&!byItem.has(record.itemId),'DIRECT_ROW');
        const unique=new Set<string>();
        const listings:Readonly<Db01OriginalCollectionListing>[]=[];
        for(const ref of record.memberships){
          validateListing(ref);
          const menu=menus.get(ref.setId);
          check(menu&&menu.setKey===ref.setKey&&
            menu.submenuCode===ref.submenuCode&&menu.submenu===ref.submenu&&
            menu.collectionLabelKey===ref.collectionLabelKey&&
            ref.groupIndex<menu.groupCount,'LISTING_MENU_MISMATCH');
          const marker=String(ref.setId)+':'+String(ref.groupIndex);
          check(!unique.has(marker),'DUPLICATE_ITEM_LISTING');
          unique.add(marker);
          menuCounts.get(ref.setId)!.add(record.itemId);
          associationBySubmenu.set(ref.submenu,
            (associationBySubmenu.get(ref.submenu)??0)+1);
          listings.push(Object.freeze(ref));
          directTotal++;
        }
        byItem.set(record.itemId,Object.freeze(listings));
      }
      check(byItem.size===manifest.directListedItemIds&&
        directTotal===manifest.directListedAssociations,'DIRECT_ASSOCIATION_COUNT');
      for(const [id,menu] of menus)
        check(menuCounts.get(id)!.size===menu.directListedItemCount,
          'DIRECT_MENU_COUNTS');
      for(const [label,count] of Object.entries(manifest.directAssociationsBySubmenu))
        check(associationBySubmenu.get(label)===count,'DIRECT_SUBMENU_COUNTS');
      // Ensure all explicitly referenced IDs belong to the current canonical
      // game source, including non-four-item original definition classes.
      const directIds=[...byItem.keys()];
      for(let start=0;start<directIds.length;start+=4096){
        const ids=directIds.slice(start,start+4096);
        const exact=await catalog.getItems(ids);
        check(exact.length===ids.length&&exact.every((row,i)=>row?.itemId===ids[i]),
          'DIRECT_TARGET_NOT_IN_CATALOG');
      }
      return Object.freeze({
        menus:Object.freeze([...menus.values()]),
        items:byItem,
      }) as Index;
    })();
    loading=task;
    try{return await task;}catch(e){loading=null;throw e;}
  }
  async function getMenus(){return (await load()).menus;}
  async function getDirectListings(itemId:number):
    Promise<readonly Readonly<Db01OriginalCollectionListing>[]>{
    check(safeId(itemId),'INVALID_ID');
    const found=await catalog.getItem(itemId);
    if(!found)return Object.freeze([]);
    return (await load()).items.get(itemId)??Object.freeze([]);
  }
  async function getDirectListingsBatch(ids:readonly number[]):Promise<
    readonly (readonly Readonly<Db01OriginalCollectionListing>[])[]
  >{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(safeId),'INVALID_BATCH');
    if(!ids.length)return Object.freeze([]);
    const matches=await catalog.getItems(ids);
    check(matches.length===ids.length,'CATALOG_BATCH_LENGTH');
    const index=await load();
    return Object.freeze(ids.map((id,i)=>
      matches[i]?.itemId===id ? index.items.get(id)??Object.freeze([]) : Object.freeze([])));
  }
  return Object.freeze({
    source:Object.freeze({
      gameVersion:manifest.gameVersion,sourceItemsSha256:manifest.sourceItemsSha256,
      sourceCollectionSetSha256:manifest.sourceCollectionSetSha256,
      sourceIl2cppDumpSha256:manifest.sourceIl2cppDumpSha256,
      catalogDefinitions:manifest.catalogDefinitions,
      collectionSetDefinitions:manifest.collectionSetDefinitions,
      directListedItemIds:manifest.directListedItemIds,
      directListedAssociations:manifest.directListedAssociations,
      dynamicSelectorsUnresolved:manifest.dynamicSelectorsUnresolved,
    }),
    getMenus,getDirectListings,getDirectListingsBatch,
  });
}
