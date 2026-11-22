/**
 * SHA-pinned original-game STATIC container template inventory, NOT player chests.
 *
 * Steam 1.26.1 original StreamingAssets/protoDb.bin was independently confirmed
 * byte-identical to 1.26.2. Definitions are Meta.ContainerInventory records,
 * original repeated Inventory[3], Slot.ItemID[1], Slot.Amount[2].
 *
 * These are merely configured initial contents. No template instantiation,
 * quest completion, access to this container, current player contents or
 * actual obtainable loot is asserted. In particular, blank source slots do
 * NOT indicate a new item, and duplicate slots remain separate occurrences.
 * Never load private saves or infer general random loot table grants here.
 */
import type {ItemOrigin,OriginProvenance} from './origins.ts';

export const DB02_STATIC_CONTAINER_SCHEMA='wand.db02.static-container-contents@1' as const;
export const DB02_STATIC_CONTAINER_FILE='container-inventory-1.26.2.json' as const;
export const DB02_STATIC_CONTAINER_BYTES=6705 as const;
export const DB02_STATIC_CONTAINER_SHA=
  'f0830f95341b52386a2268e146c2541229f02f1801b6f2ae2398b4b9b3b18e2f' as const;
const ORIGINAL_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const ID=/^[1-9][0-9]{0,15}$/;
const NAME=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,100}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PINNED=new WeakSet<object>();
const NO_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const NO_NAMES=Object.freeze([]) as readonly string[];

export interface StaticContainerSlot{
  readonly sourceSlotIndex:number;
  readonly itemId:string;
  readonly quantity:number;
  /** No user-save or runtime claim. */
  readonly initialTemplateOnly:true;
}
export interface StaticContainerTemplate{
  readonly name:string;
  readonly slots:readonly StaticContainerSlot[];
  readonly containsConfiguredItems:boolean;
  readonly contentsNotLiveVerified:true;
}
export interface PinnedStaticContainerContents{
  readonly schema:typeof DB02_STATIC_CONTAINER_SCHEMA;
  readonly sourceIntegrity:'original_protoDb_sha256_and_public_projection_sha256';
  readonly templates:readonly StaticContainerTemplate[];
  readonly origins:readonly ItemOrigin[];
  readonly linkedItemIds:readonly string[];
  readonly coverage:Readonly<{
    readonly definitionRecords:88;
    readonly populatedDefinitions:84;
    readonly totalSourceSlots:147;
    readonly populatedSourceSlots:146;
    readonly blankSourceSlots:1;
    readonly distinctItemIds:115;
    readonly liveContentsVerified:false;
    readonly containerSpawnVerified:false;
    readonly guaranteedLootVerified:false;
    readonly personalSaveContentsIncluded:false;
  }>;
  getTemplate(name:string):StaticContainerTemplate|null;
  getTemplateOrigins(name:string):readonly ItemOrigin[];
  getOrigin(originId:string):readonly ItemOrigin[];
  getItemCandidates(itemId:string|number):readonly ItemOrigin[];
  getItemTemplateNames(itemId:string|number):readonly string[];
}
function ensure(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_STATIC_CONTAINER_'+code);
}
function obj(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function parseId(raw:string|number):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  ensure(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function projection(raw:unknown,url:string):PinnedStaticContainerContents{
  ensure(obj(raw)&&raw.schema===DB02_STATIC_CONTAINER_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&
    obj(raw.source)&&obj(raw.coverage)&&
    Array.isArray(raw.containers)&&raw.containers.length===88,
    'PROJECTION_SCHEMA');
  const source=raw.source,census=raw.coverage;
  ensure(source.originalSourceGameVersion==='1.26.1'&&
    source.originalFileEquivalentTo1262===true&&
    source.originalProtoDbSha256===ORIGINAL_SHA&&
    source.originalProtoDbBytes===1335720&&
    source.originalFile==='StreamingAssets/protoDb.bin'&&
    source.originalRecordType==='Meta.ContainerInventory'&&
    source.originalSlotType==='Meta.ContainerInventory.Types.Slot'&&
    source.slotListField===3&&source.slotItemIdField===1&&
    source.slotAmountField===2&&source.checkedOn==='2026-11-23'&&
    source.liveContentsVerified===false&&
    source.containerSpawnVerified===false&&
    source.guaranteedLootVerified===false&&
    source.personalSaveContentsIncluded===false,
    'ORIGINAL_SOURCE');
  ensure(census.definitionRecords===88&&census.populatedDefinitions===84&&
    census.totalSourceSlots===147&&census.populatedSourceSlots===146&&
    census.blankSourceSlots===1&&census.distinctItemIds===115&&
    census.liveContentsVerified===false&&census.guaranteedLootVerified===false,
    'ORIGINAL_CENSUS');

  const provenance:OriginProvenance=Object.freeze({
    sourceId:'db02:native:steam-1262:container-template',
    kind:'verified_game_native' as const,sourceUrl:url,
    gameVersion:'1.26.2',checkedOn:'2026-11-23',sha256:ORIGINAL_SHA
  });
  const window=Object.freeze({start:null,endExclusive:null});
  const salePeriods=Object.freeze([]);
  const templates:StaticContainerTemplate[]=[];
  const origins:ItemOrigin[]=[];
  const byName=new Map<string,StaticContainerTemplate>();
  const byTemplate=new Map<string,readonly ItemOrigin[]>();
  const byOrigin=new Map<string,readonly ItemOrigin[]>();
  const byItem=new Map<string,ItemOrigin[]>();
  const itemNames=new Map<string,Set<string>>();
  let templateCount=0,slotCount=0,blankCount=0;
  for(const entry of raw.containers){
    ensure(Array.isArray(entry)&&entry.length===2&&
      typeof entry[0]==='string'&&NAME.test(entry[0])&&
      Array.isArray(entry[1]),'TEMPLATE_TUPLE');
    const [name,rows]=entry as [string,unknown[]];
    ensure(!byName.has(name)&&rows.length<=100,'TEMPLATE_IDENTITY');
    const slots:StaticContainerSlot[]=[];
    const templateOrigins:ItemOrigin[]=[];
    let lastIndex=-1;
    const conditions=Object.freeze([
      'Source-native static Meta.ContainerInventory definition: '+name,
      'Configured initial slot only; no runtime container instantiation, player ownership, loot eligibility or guaranteed grant',
      'Original protoDb SHA-256: '+ORIGINAL_SHA
    ]);
    for(const record of rows){
      ensure(Array.isArray(record)&&record.length===3&&
        typeof record[0]==='number'&&Number.isSafeInteger(record[0])&&
        record[0]>=0&&record[0]<=200&&record[0]>lastIndex&&
        typeof record[1]==='string'&&ID.test(record[1])&&
        Number.isSafeInteger(Number(record[1]))&&
        typeof record[2]==='number'&&Number.isSafeInteger(record[2])&&
        record[2]>0&&record[2]<=2147483647,
        'SOURCE_SLOT');
      const [position,itemId,quantity]=record as [number,string,number];
      blankCount+=position-lastIndex-1;
      lastIndex=position;
      const slot=Object.freeze({
        sourceSlotIndex:position,itemId,quantity,
        initialTemplateOnly:true as const
      });
      slots.push(slot);
      const origin:ItemOrigin=Object.freeze({
        originId:'db02:container:'+name+':'+position,
        itemId,kind:'loot' as const,
        routeStatus:'static_candidate_only' as const,
        campaignId:null,name:'Container template: '+name,
        productId:null,quantity,
        price:null,accessTier:'not_applicable' as const,
        window,salePeriods,conditions,
        source:provenance,availability:'not_live_verified' as const
      });
      templateOrigins.push(origin);
      ensure(!byOrigin.has(origin.originId),'DUPLICATE_ORIGIN');
      byOrigin.set(origin.originId,Object.freeze([origin]));
      origins.push(origin);
      const prior=byItem.get(itemId)??[];
      prior.push(origin);byItem.set(itemId,prior);
      const sourceNames=itemNames.get(itemId)??new Set<string>();
      sourceNames.add(name);itemNames.set(itemId,sourceNames);
    }
    slotCount+=rows.length;
    if(rows.length>0)templateCount++;
    const template:StaticContainerTemplate=Object.freeze({
      name,slots:Object.freeze(slots),containsConfiguredItems:rows.length>0,
      contentsNotLiveVerified:true as const
    });
    templates.push(template);
    byName.set(name,template);
    byTemplate.set(name,Object.freeze(templateOrigins));
  }
  // An observed empty slot at index zero is represented by the first
  // populated index being 1 in VendingMachine03; no fabricated Item ID.
  ensure(templateCount===84&&slotCount===146&&blankCount===1&&
    byItem.size===115&&origins.length===146,'SOURCE_SLOT_CENSUS');
  for(const rows of byItem.values())Object.freeze(rows);
  const nameByItem=new Map<string,readonly string[]>();
  for(const [id,names] of itemNames){
    nameByItem.set(id,Object.freeze([...names]));
  }
  const index:PinnedStaticContainerContents=Object.freeze({
    schema:DB02_STATIC_CONTAINER_SCHEMA,
    sourceIntegrity:'original_protoDb_sha256_and_public_projection_sha256' as const,
    templates:Object.freeze(templates),origins:Object.freeze(origins),
    linkedItemIds:Object.freeze([...byItem.keys()].sort((a,b)=>Number(a)-Number(b))),
    coverage:Object.freeze({
      definitionRecords:88 as const,populatedDefinitions:84 as const,
      totalSourceSlots:147 as const,populatedSourceSlots:146 as const,
      blankSourceSlots:1 as const,distinctItemIds:115 as const,
      liveContentsVerified:false as const,
      containerSpawnVerified:false as const,
      guaranteedLootVerified:false as const,
      personalSaveContentsIncluded:false as const
    }),
    getTemplate(name:string){return byName.get(name)??null;},
    getTemplateOrigins(name:string){return byTemplate.get(name)??NO_ORIGINS;},
    getOrigin(originId:string){return byOrigin.get(originId)??NO_ORIGINS;},
    getItemCandidates(itemId:string|number){
      return byItem.get(parseId(itemId))??NO_ORIGINS;
    },
    getItemTemplateNames(itemId:string|number){
      return nameByItem.get(parseId(itemId))??NO_NAMES;
    }
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedStaticContainerEvidence(
  x:unknown
):x is PinnedStaticContainerContents{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
export async function loadPinnedStaticContainerContents(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedStaticContainerContents>{
  ensure(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+DB02_STATIC_CONTAINER_FILE;
  const response=await fetcher(url);
  ensure(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength===DB02_STATIC_CONTAINER_BYTES,'PUBLIC_SIZE');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  ensure(digest===DB02_STATIC_CONTAINER_SHA,'PUBLIC_SHA');
  return projection(JSON.parse(new TextDecoder().decode(bytes)),url);
}
