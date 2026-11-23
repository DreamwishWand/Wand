/**
 * Source-pinned static Meta.DefaultInventories templates from Steam 1.26.2.
 *
 * These are original GAME DEFAULTS, not a user's actual Collection ownership,
 * the contents of a loaded save, online entitlements, or guaranteed new-profile
 * grants. In particular ListInventory.Data.Amount can be 1, 2 or 3 in this
 * original definition; it is preserved as configuredAmount without interpreting
 * purchase/unlock state or inferring live quantity.
 *
 * Source 1.26.1 protoDb is byte-identical to Steam 1.26.2. No private file,
 * save or server connection is required to consume this sanitized projection.
 */
import type {ItemOrigin,OriginProvenance} from './origins.ts';

export const DB02_DEFAULT_INVENTORIES_SCHEMA='wand.db02.static-default-inventories@1' as const;
export const DB02_DEFAULT_INVENTORIES_FILE='default-inventories-1.26.2.json' as const;
export const DB02_DEFAULT_INVENTORIES_BYTES=6574 as const;
export const DB02_DEFAULT_INVENTORIES_SHA=
  '35f22a0dd42826921ce462c93b7a21910b2ff7c653a9b93a127a12bbeaab5813' as const;

const SOURCE_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const NAMES=Object.freeze([
  'Backpack','HomeStorage','Catalog','Wardrobe','Pantry','Makeup',
  'Trimming','Buildings','Decals','Skins','AvatarFeatures',
  'Figurines','PhotoMode','MountGear','EnvironmentalFX'
]);
const COUNTS=Object.freeze([0,3,4,74,0,42,8,6,90,14,25,0,12,11,0]);
const PINNED=new WeakSet<object>();
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_NAMES=Object.freeze([]) as readonly string[];

export interface StaticDefaultInventoryEntry{
  readonly sourceEntryIndex:number;
  readonly itemId:string;
  /** The source ListInventory.Data.Amount / ContainerInventory.Slot.Amount. */
  readonly configuredAmount:number;
  readonly playerOwnershipVerified:false;
}
export interface StaticDefaultInventoryGroup{
  readonly name:string;
  readonly originalFieldNumber:number;
  readonly nativeInventoryType:'container'|'list';
  readonly entries:readonly StaticDefaultInventoryEntry[];
  readonly liveContentsVerified:false;
}
export interface PinnedDefaultInventorySource{
  readonly schema:typeof DB02_DEFAULT_INVENTORIES_SCHEMA;
  readonly sourceIntegrity:'source_protoDb_and_public_sha256_pinned';
  readonly groups:readonly StaticDefaultInventoryGroup[];
  readonly origins:readonly ItemOrigin[];
  readonly linkedItemIds:readonly string[];
  readonly coverage:Readonly<{
    readonly groups:15;
    readonly configuredEntries:289;
    readonly distinctItemIds:288;
    readonly containerEntries:3;
    readonly listEntries:286;
    readonly playerInventoryVerified:false;
    readonly newPlayerGrantVerified:false;
    readonly onlineOwnershipVerified:false;
    readonly privateSaveIncluded:false;
    readonly sourceCoverageComplete:false;
  }>;
  getGroup(name:string):StaticDefaultInventoryGroup|null;
  getGroupOrigins(name:string):readonly ItemOrigin[];
  getItemCandidates(itemId:string|number):readonly ItemOrigin[];
  getItemGroupNames(itemId:string|number):readonly string[];
  getOrigin(originId:string):readonly ItemOrigin[];
}
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_DEFAULT_INVENTORIES_'+code);
}
function object(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function key(raw:string|number):string{
  const val=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof val==='string'&&ID.test(val)&&
    Number.isSafeInteger(Number(val)),'INVALID_ITEM_ID');
  return val;
}
function decode(raw:unknown,url:string):PinnedDefaultInventorySource{
  check(object(raw)&&raw.schema===DB02_DEFAULT_INVENTORIES_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&
    object(raw.source)&&object(raw.coverage)&&
    Array.isArray(raw.groups)&&raw.groups.length===15,
    'SCHEMA');
  const source=raw.source,census=raw.coverage;
  check(source.originalProtoDbSha256===SOURCE_SHA&&
    source.originalProtoDbBytes===1335720&&
    source.originalFile==='StreamingAssets/protoDb.bin'&&
    source.sourceGameVersion==='1.26.1'&&
    source.byteEquivalentToTargetVersion===true&&
    source.recordType==='Meta.DefaultInventories'&&
    source.containerInventoryField===3&&
    source.listInventoryField===2&&
    source.listItemIdMapKeyField===1&&
    source.listValueField===2&&
    source.listAmountField===1&&
    source.checkedOn==='2026-11-23'&&
    source.configuredDefaultsOnly===true&&
    source.playerInventoryVerified===false&&
    source.newPlayerGrantVerified===false&&
    source.onlineOwnershipVerified===false&&
    source.privateSaveIncluded===false,'SOURCE_PIN');
  check(census.groups===15&&census.configuredEntries===289&&
    census.distinctItemIds===288&&census.containerEntries===3&&
    census.listEntries===286&&census.playerInventoryVerified===false&&
    census.newPlayerGrantVerified===false&&
    census.sourceCoverageComplete===false,'SOURCE_CENSUS');
  const provenance:OriginProvenance=Object.freeze({
    sourceId:'db02:static:default-inventories:steam-1262',
    kind:'verified_game_native' as const,
    sourceUrl:url,sha256:SOURCE_SHA,checkedOn:'2026-11-23',
    gameVersion:'1.26.2'
  });
  const window=Object.freeze({start:null,endExclusive:null});
  const sales=Object.freeze([]);
  const groups:StaticDefaultInventoryGroup[]=[];
  const origins:ItemOrigin[]=[];
  const groupByName=new Map<string,StaticDefaultInventoryGroup>();
  const originByGroup=new Map<string,readonly ItemOrigin[]>();
  const originByIdentity=new Map<string,readonly ItemOrigin[]>();
  const byItem=new Map<string,ItemOrigin[]>();
  const namesByItem=new Map<string,Set<string>>();
  let containerCount=0,listCount=0;
  for(let i=0;i<raw.groups.length;i++){
    const entry=raw.groups[i];
    check(Array.isArray(entry)&&entry.length===4&&
      entry[0]===NAMES[i]&&entry[1]===i+1&&
      entry[2]===(i<2?'container':'list')&&
      Array.isArray(entry[3])&&entry[3].length===COUNTS[i],
      'GROUP_SHAPE');
    const [name,field,kind,rows]=entry as [string,number,'container'|'list',unknown[]];
    const candidates:ItemOrigin[]=[];
    const members:StaticDefaultInventoryEntry[]=[];
    const usedItems=new Set<string>();
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
      const row=rows[rowIndex];
      check(Array.isArray(row)&&row.length===3&&
        row[0]===rowIndex&&typeof row[1]==='string'&&
        ID.test(row[1])&&Number.isSafeInteger(Number(row[1]))&&
        typeof row[2]==='number'&&Number.isSafeInteger(row[2])&&
        row[2]>0&&row[2]<=2147483647,
        'GROUP_ENTRY');
      const [sourceEntryIndex,itemId,configuredAmount]=row as [number,string,number];
      check(kind!=='list'||!usedItems.has(itemId),'DUPLICATE_LIST_ITEM');
      usedItems.add(itemId);
      members.push(Object.freeze({
        sourceEntryIndex,itemId,configuredAmount,
        playerOwnershipVerified:false as const
      }));
      const route:ItemOrigin=Object.freeze({
        originId:'db02:default-inventory:'+name+':'+sourceEntryIndex,
        itemId,kind:'other' as const,
        routeStatus:'static_candidate_only' as const,
        campaignId:null,
        name:'Configured default '+name,
        productId:null,quantity:configuredAmount,
        price:null,accessTier:'not_applicable' as const,
        window,salePeriods:sales,
        conditions:Object.freeze([
          'Static original game Meta.DefaultInventories.'+name+' definition',
          'Configured defaults only; does not confirm a new-player grant or an existing profile inventory',
          'Game source verified, actual ownership/online synchronization not checked'
        ]),
        source:provenance,availability:'not_live_verified' as const
      });
      check(!originByIdentity.has(route.originId),'ORIGIN_ID_DUPLICATE');
      originByIdentity.set(route.originId,Object.freeze([route]));
      candidates.push(route);origins.push(route);
      const itemRoutes=byItem.get(itemId)??[];
      itemRoutes.push(route);byItem.set(itemId,itemRoutes);
      const sources=namesByItem.get(itemId)??new Set<string>();
      sources.add(name);namesByItem.set(itemId,sources);
    }
    const group:StaticDefaultInventoryGroup=Object.freeze({
      name,originalFieldNumber:field,nativeInventoryType:kind,
      entries:Object.freeze(members),liveContentsVerified:false as const
    });
    groups.push(group);
    groupByName.set(name,group);
    originByGroup.set(name,Object.freeze(candidates));
    if(kind==='container')containerCount+=members.length;
    else listCount+=members.length;
  }
  check(origins.length===289&&byItem.size===288&&
    containerCount===3&&listCount===286,'RELATION_CENSUS');
  for(const routes of byItem.values())Object.freeze(routes);
  const itemGroups=new Map<string,readonly string[]>();
  for(const [id,names] of namesByItem)itemGroups.set(id,Object.freeze([...names]));
  const index:PinnedDefaultInventorySource=Object.freeze({
    schema:DB02_DEFAULT_INVENTORIES_SCHEMA,
    sourceIntegrity:'source_protoDb_and_public_sha256_pinned' as const,
    groups:Object.freeze(groups),origins:Object.freeze(origins),
    linkedItemIds:Object.freeze([...byItem.keys()].sort((a,b)=>Number(a)-Number(b))),
    coverage:Object.freeze({
      groups:15 as const,configuredEntries:289 as const,
      distinctItemIds:288 as const,containerEntries:3 as const,
      listEntries:286 as const,
      playerInventoryVerified:false as const,
      newPlayerGrantVerified:false as const,
      onlineOwnershipVerified:false as const,
      privateSaveIncluded:false as const,
      sourceCoverageComplete:false as const
    }),
    getGroup(name:string){return groupByName.get(name)??null;},
    getGroupOrigins(name:string){return originByGroup.get(name)??EMPTY_ORIGINS;},
    getItemCandidates(itemId:string|number){return byItem.get(key(itemId))??EMPTY_ORIGINS;},
    getItemGroupNames(itemId:string|number){return itemGroups.get(key(itemId))??EMPTY_NAMES;},
    getOrigin(originId:string){return originByIdentity.get(originId)??EMPTY_ORIGINS;}
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedDefaultInventoryEvidence(
  value:unknown
):value is PinnedDefaultInventorySource{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
export async function loadPinnedDefaultInventorySource(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedDefaultInventorySource>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+DB02_DEFAULT_INVENTORIES_FILE;
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_DEFAULT_INVENTORIES_BYTES,'PROJECTION_SIZE');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  check(hash===DB02_DEFAULT_INVENTORIES_SHA,'PROJECTION_SHA');
  return decode(JSON.parse(new TextDecoder().decode(bytes)),url);
}
