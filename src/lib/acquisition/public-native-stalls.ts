/**
 * DB-02 source-verified stall -> slot -> LootTable reference graph.
 *
 * Steam v1.26.2 original Building.StallBuildingItemData has ShopData and
 * ordered SlotLootTableItemID fields. This establishes a *configured pool*,
 * not a current shop offer, purchase price, stocked item or unlocked stall.
 *
 * The original Building/LootTable blobs never ship to the public website.
 */
import {
  hasPinnedNativeLootCandidateEvidence,
  type NativeLootCandidateIndex,type NativeLootCandidate
} from './public-native-loot.ts';
import type {ItemOrigin,OriginProvenance} from './origins.ts';

export const DB02_NATIVE_STALL_SCHEMA='wand.db02.public-native-stall-slots@1' as const;
export const DB02_NATIVE_STALL_FILE='native-stall-slots-1.26.2.json' as const;
export const DB02_NATIVE_STALL_BYTES=8775 as const;
export const DB02_NATIVE_STALL_SHA256=
  'ef18e94df460d7bd5c768ebc720c48425570ac549a49ebdac00ade34e5468d2a' as const;
export const DB02_NATIVE_STALL_BUILDING_SHA256=
  'e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0' as const;
export const DB02_NATIVE_STALL_LOOT_SHA256=
  '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c' as const;

const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const POSITIVE=/^[1-9][0-9]{0,15}$/;
const KEY=/^[A-Za-z0-9_!:.\/-]{1,128}$/;
const PINNED=new WeakSet<object>();
const NO_STALLS=Object.freeze([]) as readonly NativeStallDefinition[];
const NO_CANDIDATES=Object.freeze([]) as readonly NativeStallItemCandidate[];
const NO_SLOTS=Object.freeze([]) as readonly NativeStallLootSlot[];
const NO_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const NO_IDS=Object.freeze([]) as readonly string[];
const WINDOW=Object.freeze({start:null,endExclusive:null});
const CONDITIONS=Object.freeze([
  'Native stall slot and LootTable candidate only; stock, shop sale, eligibility and purchase are not verified'
]);
const SOURCE:OriginProvenance=Object.freeze({
  sourceId:'src02:steam1262:building:stall-slots',
  kind:'verified_game_native',
  sourceUrl:'/acquisition/public/'+DB02_NATIVE_STALL_FILE,
  checkedOn:'2026-11-23',
  gameVersion:'1.26.2',
  sha256:DB02_NATIVE_STALL_BUILDING_SHA256
});

export interface NativeStallDefinition {
  readonly stallId:string;
  /** Original source name key, not a localized/display-ready name. */
  readonly nameKey:string;
  /** Original shop configuration key, NOT observed live inventory. */
  readonly shopDataKey:string;
  /** Every slot preserved in source order, including repeated table refs. */
  readonly slotLootTableIds:readonly string[];
  readonly slotTableFieldNumber:10;
  readonly shopDataFieldNumber:9;
  readonly liveStockVerified:false;
  readonly currentPricesVerified:false;
}
export interface NativeStallSlotIndex {
  readonly schema:typeof DB02_NATIVE_STALL_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:OriginProvenance;
  readonly coverage:Readonly<{
    nativeBuildingDefinitions:478;
    staticStallDefinitions:65;
    slotLootTableReferences:335;
    distinctReferencedLootTableIds:279;
    slotExpandedCandidateRelations:1385;
    distinctCandidateItemIds:606;
    distinctStallItemPairs:745;
    distinctStallTableItemTriples:1173;
    conditionalCandidateRelations:0;
    liveShopStockVerified:false;
    livePurchasePriceVerified:false;
    purchasabilityVerified:false;
    playerUnlockVerified:false;
    staticStorePoolOnly:true;
  }>;
  readonly stalls:readonly NativeStallDefinition[];
  getStall(stallId:string|number):NativeStallDefinition|null;
  getShopDataStalls(shopDataKey:string):readonly NativeStallDefinition[];
  getLootTableStalls(tableId:string|number):readonly NativeStallDefinition[];
  listShopDataKeys():readonly string[];
}

export interface NativeStallItemCandidate {
  readonly itemId:string;
  readonly stallId:string;
  readonly stallNameKey:string;
  readonly shopDataKey:string;
  readonly slotIndex:number;
  readonly lootTableId:string;
  readonly lootGroupIndex:number;
  readonly lootCandidateOrdinal:number;
  readonly lootPathId:string;
  /** Original table contains an item definition, not a confirmed sale. */
  readonly routeStatus:'static_candidate_only';
  readonly stallSlotReferenceVerified:true;
  readonly itemInReferencedLootTableVerified:true;
  readonly staticStorePoolOnly:true;
  readonly groupHasDynamicFilters:boolean;
  readonly groupHasEligibilityGate:boolean;
  readonly conditionalLootEntry:boolean;
  readonly liveStockVerified:false;
  readonly livePriceVerified:false;
  readonly purchaseEligibilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeStallLootSlot {
  readonly stallId:string;
  readonly slotIndex:number;
  readonly lootTableId:string;
  readonly candidateItemIds:readonly string[];
  readonly candidateRelations:readonly NativeStallItemCandidate[];
  readonly hasDynamicFilterGroups:boolean;
  readonly hasEligibilityGateGroups:boolean;
  readonly liveStockVerified:false;
}
export interface NativeStallWithPools {
  readonly stall:NativeStallDefinition;
  readonly slots:readonly NativeStallLootSlot[];
  readonly candidateItemIds:readonly string[];
  readonly liveStockVerified:false;
  readonly purchaseEligibilityVerified:false;
}
export interface NativeStallSourceIndex {
  readonly schema:'wand.db02.native-stall-loot-join@1';
  readonly gameVersion:'1.26.2';
  readonly coverage:NativeStallSlotIndex['coverage'];
  readonly stallDefinitions:NativeStallSlotIndex;
  readonly lootCandidates:NativeLootCandidateIndex;
  readonly slotExpandedCandidates:readonly NativeStallItemCandidate[];
  /** Optional static candidates; NOT included in the 1255 confirmed Item origins. */
  readonly staticCandidateOrigins:readonly ItemOrigin[];
  getStall(stallId:string|number):NativeStallWithPools|null;
  getItemCandidates(itemId:string|number):readonly NativeStallItemCandidate[];
  getItemStaticOrigins(itemId:string|number):readonly ItemOrigin[];
  getTableSlots(lootTableId:string|number):readonly NativeStallLootSlot[];
  getShopDataStalls(shopDataKey:string):readonly NativeStallWithPools[];
  listCandidateItemIds():readonly string[];
}
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_NATIVE_STALL_'+code);
}
function record(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function id(raw:unknown):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof value==='string'&&POSITIVE.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function key(raw:unknown):string{
  check(typeof raw==='string'&&KEY.test(raw),'INVALID_NATIVE_KEY');
  return raw;
}
function sorted(raw:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(raw)].sort((a,b)=>Number(a)-Number(b)));
}
function add<T>(map:Map<string,T[]>,name:string,row:T):void{
  const previous=map.get(name);
  if(previous)previous.push(row);else map.set(name,[row]);
}
function freezeArrays<T>(map:Map<string,T[]>):void{
  for(const rows of map.values())Object.freeze(rows);
}
function parse(raw:unknown):NativeStallSlotIndex{
  check(record(raw)&&raw.schema===DB02_NATIVE_STALL_SCHEMA&&
    record(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&record(raw.sources)&&
    record(raw.sources.building)&&record(raw.sources.loot)&&
    raw.sources.building.file==='ddv_Data/StreamingAssets/itemlist/Building.json'&&
    raw.sources.building.sha256===DB02_NATIVE_STALL_BUILDING_SHA256&&
    raw.sources.building.bytes===531572&&
    raw.sources.loot.file==='ddv_Data/StreamingAssets/itemlist/LootTable.json'&&
    raw.sources.loot.sha256===DB02_NATIVE_STALL_LOOT_SHA256&&
    raw.sources.loot.bytes===110133&&record(raw.coverage)&&
    Array.isArray(raw.stalls)&&raw.stalls.length===65,'SOURCE_SCHEMA');
  const c=raw.coverage;
  check(c.nativeBuildingDefinitions===478&&c.staticStallDefinitions===65&&
    c.slotLootTableReferences===335&&
    c.distinctReferencedLootTableIds===279&&
    c.slotExpandedCandidateRelations===1385&&
    c.distinctCandidateItemIds===606&&
    c.distinctStallItemPairs===745&&
    c.distinctStallTableItemTriples===1173&&
    c.conditionalCandidateRelations===0&&
    c.liveShopStockVerified===false&&
    c.livePurchasePriceVerified===false&&
    c.purchasabilityVerified===false&&
    c.playerUnlockVerified===false&&
    c.staticStorePoolOnly===true,'SOURCE_CENSUS');
  const stalls:NativeStallDefinition[]=[];
  const byId=new Map<string,NativeStallDefinition>();
  const byShop=new Map<string,NativeStallDefinition[]>();
  const byTable=new Map<string,NativeStallDefinition[]>();
  const allTables=new Set<string>();
  let slots=0,previous=0;
  for(const row of raw.stalls){
    check(Array.isArray(row)&&row.length===4&&
      typeof row[0]==='number'&&Number.isSafeInteger(row[0])&&
      row[0]>=20100000&&row[0]<20200000&&row[0]>previous,
      'STALL_DEFINITION_ID_ORDER');
    previous=row[0];
    const stallId=id(row[0]),nameKey=key(row[1]),
      shopDataKey=key(row[2]);
    check(Array.isArray(row[3])&&row[3].length>0&&row[3].length<=128,
      'STALL_SLOTS');
    const tableIds:string[]=[];
    for(const rawTable of row[3]){
      check(typeof rawTable==='number'&&Number.isSafeInteger(rawTable)&&
        rawTable>=2090000000&&rawTable<2090100000,'TABLE_ID_RANGE');
      const tableId=id(rawTable);
      tableIds.push(tableId);
      allTables.add(tableId);
      slots++;
    }
    const stall:NativeStallDefinition=Object.freeze({
      stallId,nameKey,shopDataKey,slotLootTableIds:Object.freeze(tableIds),
      slotTableFieldNumber:10 as const,shopDataFieldNumber:9 as const,
      liveStockVerified:false as const,currentPricesVerified:false as const
    });
    stalls.push(stall);
    byId.set(stallId,stall);
    add(byShop,shopDataKey,stall);
    for(const tableId of new Set(tableIds))add(byTable,tableId,stall);
  }
  check(stalls.length===65&&slots===335&&allTables.size===279,
    'STALL_TABLE_COUNTS');
  freezeArrays(byShop);
  freezeArrays(byTable);
  const shops=Object.freeze([...byShop.keys()].sort());
  const index:NativeStallSlotIndex=Object.freeze({
    schema:DB02_NATIVE_STALL_SCHEMA,gameVersion:'1.26.2' as const,
    source:SOURCE,
    coverage:Object.freeze({
      nativeBuildingDefinitions:478 as const,
      staticStallDefinitions:65 as const,
      slotLootTableReferences:335 as const,
      distinctReferencedLootTableIds:279 as const,
      slotExpandedCandidateRelations:1385 as const,
      distinctCandidateItemIds:606 as const,
      distinctStallItemPairs:745 as const,
      distinctStallTableItemTriples:1173 as const,
      conditionalCandidateRelations:0 as const,
      liveShopStockVerified:false as const,
      livePurchasePriceVerified:false as const,
      purchasabilityVerified:false as const,
      playerUnlockVerified:false as const,
      staticStorePoolOnly:true as const
    }),
    stalls:Object.freeze(stalls),
    getStall(rawId:string|number){return byId.get(id(rawId))??null;},
    getShopDataStalls(rawKey:string){
      return byShop.get(key(rawKey))??NO_STALLS;
    },
    getLootTableStalls(rawId:string|number){
      return byTable.get(id(rawId))??NO_STALLS;
    },
    listShopDataKeys(){return shops;}
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedNativeStallSlotEvidence(raw:unknown):raw is NativeStallSlotIndex{
  return raw!==null&&typeof raw==='object'&&PINNED.has(raw);
}
export async function loadPinnedNativeStallSlots(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeStallSlotIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_NATIVE_STALL_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_NATIVE_STALL_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_NATIVE_STALL_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}

/** Original Building -> original LootTable join; never promote to stock. */
export function joinPinnedNativeStallLoot(
  stalls:NativeStallSlotIndex,loot:NativeLootCandidateIndex
):NativeStallSourceIndex{
  check(hasPinnedNativeStallSlotEvidence(stalls)&&
    hasPinnedNativeLootCandidateEvidence(loot)&&
    stalls.gameVersion==='1.26.2'&&loot.gameVersion==='1.26.2'&&
    stalls.source.sha256===DB02_NATIVE_STALL_BUILDING_SHA256&&
    loot.source.sha256===DB02_NATIVE_STALL_LOOT_SHA256&&
    stalls.coverage.staticStallDefinitions===65&&
    stalls.coverage.slotLootTableReferences===335&&
    loot.coverage.candidateRelations===3804&&
    loot.coverage.actualAcquisitionContextsVerified===0,
    'PINNED_ORIGINAL_SOURCES_REQUIRED');
  const candidates:NativeStallItemCandidate[]=[];
  const origins:ItemOrigin[]=[];
  const byItem=new Map<string,NativeStallItemCandidate[]>();
  const originsByItem=new Map<string,ItemOrigin[]>();
  const byTable=new Map<string,NativeStallLootSlot[]>();
  const byShop=new Map<string,NativeStallWithPools[]>();
  const byStall=new Map<string,NativeStallWithPools>();
  const allIds=new Set<string>(),stallItemPairs=new Set<string>(),
    stallTableItems=new Set<string>(),distinctTables=new Set<string>();
  let slotsCount=0,conditionalCount=0;
  for(const stall of stalls.stalls){
    const slots:NativeStallLootSlot[]=[];
    const stallItems=new Set<string>();
    stall.slotLootTableIds.forEach((tableId,slotIndex)=>{
      const table=loot.getTable(tableId);
      check(table!==null,'UNRESOLVED_STALL_LOOT_TABLE');
      const slotCandidates:NativeStallItemCandidate[]=[];
      for(const group of table.groups){
        for(const source of group.candidates){
          check(source.tableId===tableId&&
            source.routeStatus==='static_candidate_only'&&
            source.gameplayContextVerified===false,'UNVERIFIED_LOOT_CANDIDATE');
          const candidate:NativeStallItemCandidate=Object.freeze({
            itemId:source.itemId,stallId:stall.stallId,
            stallNameKey:stall.nameKey,shopDataKey:stall.shopDataKey,
            slotIndex,lootTableId:tableId,lootGroupIndex:group.groupIndex,
            lootCandidateOrdinal:source.candidateOrdinal,
            lootPathId:source.pathId,
            routeStatus:'static_candidate_only' as const,
            stallSlotReferenceVerified:true as const,
            itemInReferencedLootTableVerified:true as const,
            staticStorePoolOnly:true as const,
            groupHasDynamicFilters:group.hasDynamicFilters,
            groupHasEligibilityGate:group.hasEligibilityGate,
            conditionalLootEntry:source.conditionalEntry,
            liveStockVerified:false as const,livePriceVerified:false as const,
            purchaseEligibilityVerified:false as const,
            playerOwnershipVerified:false as const
          });
          slotCandidates.push(candidate);
          candidates.push(candidate);
          allIds.add(source.itemId);
          stallItems.add(source.itemId);
          stallItemPairs.add(stall.stallId+':'+source.itemId);
          stallTableItems.add(stall.stallId+':'+tableId+':'+source.itemId);
          if(candidate.conditionalLootEntry)conditionalCount++;
          add(byItem,source.itemId,candidate);
          const origin:ItemOrigin=Object.freeze({
            originId:'native:stall:'+stall.stallId+':'+slotIndex+':'+
              group.groupIndex+':'+source.candidateOrdinal,
            itemId:source.itemId,kind:'game_shop',
            routeStatus:'static_candidate_only',
            campaignId:null,name:'Native stall slot candidate '+stall.nameKey,
            productId:null,quantity:null,price:null,accessTier:'not_applicable',
            window:WINDOW,salePeriods:Object.freeze([]),conditions:CONDITIONS,
            source:SOURCE,availability:'not_live_verified'
          });
          origins.push(origin);
          add(originsByItem,source.itemId,origin);
        }
      }
      const slot:NativeStallLootSlot=Object.freeze({
        stallId:stall.stallId,slotIndex,lootTableId:tableId,
        candidateItemIds:sorted(slotCandidates.map(x=>x.itemId)),
        candidateRelations:Object.freeze(slotCandidates),
        hasDynamicFilterGroups:table.groups.some(g=>g.hasDynamicFilters),
        hasEligibilityGateGroups:table.groups.some(g=>g.hasEligibilityGate),
        liveStockVerified:false as const
      });
      slots.push(slot);
      add(byTable,tableId,slot);
      distinctTables.add(tableId);
      slotsCount++;
    });
    const store:NativeStallWithPools=Object.freeze({
      stall,slots:Object.freeze(slots),candidateItemIds:sorted(stallItems),
      liveStockVerified:false as const,
      purchaseEligibilityVerified:false as const
    });
    byStall.set(stall.stallId,store);
    add(byShop,stall.shopDataKey,store);
  }
  check(slotsCount===335&&distinctTables.size===279&&
    candidates.length===1385&&origins.length===1385&&
    allIds.size===606&&stallItemPairs.size===745&&
    stallTableItems.size===1173&&conditionalCount===0,
    'SOURCE_JOIN_COUNTS');
  freezeArrays(byItem);
  freezeArrays(byTable);
  freezeArrays(byShop);
  freezeArrays(originsByItem);
  const itemIds=sorted(allIds);
  return Object.freeze({
    schema:'wand.db02.native-stall-loot-join@1' as const,
    gameVersion:'1.26.2' as const,coverage:stalls.coverage,
    stallDefinitions:stalls,lootCandidates:loot,
    slotExpandedCandidates:Object.freeze(candidates),
    staticCandidateOrigins:Object.freeze(origins),
    getStall(rawId:string|number){
      return byStall.get(id(rawId))??null;
    },
    getItemCandidates(rawId:string|number){
      return byItem.get(id(rawId))??NO_CANDIDATES;
    },
    getItemStaticOrigins(rawId:string|number){
      return originsByItem.get(id(rawId))??NO_ORIGINS;
    },
    getTableSlots(rawId:string|number){
      return byTable.get(id(rawId))??NO_SLOTS;
    },
    getShopDataStalls(rawKey:string){
      return byShop.get(key(rawKey))??Object.freeze([]) as readonly NativeStallWithPools[];
    },
    listCandidateItemIds(){return itemIds;}
  });
}
