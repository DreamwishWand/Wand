/** Exact configured stall slot -> loot table -> item occurrence links.
 * Uses canonical source fields and references, not the legacy stall sidecar.
 * Repeated slot references are intentional. Never infer current stock or price.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
import {createLootSourceReader,type LootTableDefinition,type LootItemSourceEvidence} from './public-loot-sources.ts';
const BUILDING='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0';
const LOOT='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(v:unknown,why:string):asserts v{if(!v)throw TypeError('DB01_STALL_LOOT_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
const unique=(values:readonly number[])=>[...new Set(values)].sort((a,b)=>a-b);
const int=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)?v:null;
export interface StallSourceDefinition {
  readonly stallItemId:number;
  readonly slotLootTableIds:readonly number[];
  readonly shopDataKey:string|null;
  readonly dialogueStall:ItemFieldValue|null;
  readonly employeeItemIds:readonly number[]|null;
  readonly unlockWithItemId:number|null;
  readonly unlockAtLevel:number|null;
  readonly unlockCost:ItemFieldValue|null;
  readonly upgrades:ItemFieldValue|null;
}
export interface StallSlotEvidence {
  readonly slotIndex:number;
  readonly lootTableId:number;
  readonly table:Readonly<LootTableDefinition>;
}
export interface StallLootEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed'|'not_stall';
  readonly definition:Readonly<StallSourceDefinition>|null;
  readonly slots:readonly Readonly<StallSlotEvidence>[];
  readonly currentAvailabilityVerified:false;
}
export interface StallItemSourceEvidence {
  readonly stall:Readonly<StallSourceDefinition>;
  readonly slotIndex:number;
  readonly loot:Readonly<LootItemSourceEvidence>;
}
export interface StallItemEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly sources:readonly Readonly<StallItemSourceEvidence>[];
  readonly currentAvailabilityVerified:false;
}
const slotField='source.SlotLootTableItemID';
const fields=['sourceClass',slotField,'source.ShopData','source.DialogueStall',
  'building.stallEmployeeItemIds','building.stallUnlockWithItemId','source.UnlockAtLevel',
  'source.UnlockCost','source.UpgradeInfo'];
function definition(stallItemId:number,v:Obj):Readonly<StallSourceDefinition>{
  const slots=v[slotField]??[],employees=v['building.stallEmployeeItemIds'];
  check(Array.isArray(slots)&&slots.every(id),'SLOTS');
  check(employees===undefined||Array.isArray(employees)&&employees.every(x=>x===0||id(x)),'EMPLOYEES');
  return Object.freeze({stallItemId,slotLootTableIds:Object.freeze([...slots] as number[]),
    shopDataKey:typeof v['source.ShopData']==='string'?v['source.ShopData']:null,
    dialogueStall:v['source.DialogueStall']??null,
    employeeItemIds:employees===undefined?null:Object.freeze([...employees] as number[]),
    unlockWithItemId:int(v['building.stallUnlockWithItemId']),
    unlockAtLevel:int(v['source.UnlockAtLevel']),unlockCost:v['source.UnlockCost']??null,
    upgrades:v['source.UpgradeInfo']??null});
}
export function createStallLootReader(db:PublicCompleteItemMaster){
  const release=db.release,source=release.sourceFilesSha256;
  const pinned=release.target.platform==='Steam'&&release.sourceIl2cppDumpSha256===DUMP&&
    source?.Building===BUILDING&&source?.LootTable===LOOT;
  const loot=createLootSourceReader(db);
  let task:Promise<ReadonlySet<string>|null>|undefined;
  function index(){
    if(!task){
      const promise=(async()=>{
        if(!pinned)return null;
        const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return [slotField,'sourceClass','nativeCategory','source.Rewards','acquisition.nativeCandidates',
          'references.incoming'].every(f=>catalog.has(f))?catalog:null;
      })();task=promise;void promise.catch(()=>{if(task===promise)task=undefined;});
    }
    return task;
  }
  async function readStalls(ids:readonly number[],catalog:ReadonlySet<string>){
    return (await db.getItemFields(ids,fields.filter(f=>catalog.has(f)))).map(row=>!row?null:{
      itemId:row.itemId,definition:row.values.sourceClass==='StallBuildingItemData'?definition(row.itemId,row.values):null
    });
  }
  async function getForStalls(stallIds:readonly number[]):Promise<readonly (Readonly<StallLootEvidence>|null)[]>{
    input(stallIds);const catalog=await index();
    if(!catalog)return Object.freeze((await db.getItemFields(stallIds,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,definition:null,slots:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    const rows=await readStalls(stallIds,catalog);
    const tableIds=unique(rows.flatMap(r=>r?.definition?.slotLootTableIds??[]));
    const tables=new Map<number,Readonly<LootTableDefinition>>();
    for(const r of await loot.getForTables(tableIds)){
      check(r?.definition,'TABLE_JOIN');tables.set(r.itemId,r.definition);
    }
    return Object.freeze(rows.map(r=>r?Object.freeze({itemId:r.itemId,status:r.definition?'indexed' as const:'not_stall' as const,
      definition:r.definition,slots:Object.freeze((r.definition?.slotLootTableIds??[]).map((lootTableId,slotIndex)=>{
        const table=tables.get(lootTableId);check(table,'SLOT_JOIN');
        return Object.freeze({slotIndex,lootTableId,table});
      })),currentAvailabilityVerified:false as const}):null));
  }
  async function getForItems(itemIds:readonly number[]):Promise<readonly (Readonly<StallItemEvidence>|null)[]>{
    input(itemIds);const catalog=await index();
    if(!catalog)return Object.freeze((await db.getItemFields(itemIds,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,sources:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    const rows=await loot.getForItems(itemIds);
    const tableIds=unique(rows.flatMap(r=>r?.sources.map(s=>s.occurrence.tableItemId)??[]));
    const references=await db.getItemsReferences(tableIds,'incoming');
    const refs=new Map<number,{stallId:number;slotIndex:number}[]>();
    const stallIds:number[]=[];
    for(const [i,tableId] of tableIds.entries()){
      const links=references[i];check(links,'TABLE_REFERENCES');
      const slots:{stallId:number;slotIndex:number}[]=[];
      for(const [stallId,path] of links){
        const m=/^source\.SlotLootTableItemID\[(\d+)\]$/.exec(path);
        if(!m)continue;
        slots.push({stallId,slotIndex:Number(m[1])});stallIds.push(stallId);
      }
      refs.set(tableId,slots);
    }
    const stalls=new Map<number,Readonly<StallSourceDefinition>>();
    for(const r of await readStalls(unique(stallIds),catalog)){
      check(r?.definition,'STALL_JOIN');stalls.set(r.itemId,r.definition);
    }
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const sources=r.sources.flatMap(source=>(refs.get(source.occurrence.tableItemId)??[]).map(({stallId,slotIndex})=>{
        const stall=stalls.get(stallId);
        check(stall&&stall.slotLootTableIds[slotIndex]===source.occurrence.tableItemId,'SLOT_REFERENCE');
        return Object.freeze({stall,slotIndex,loot:source});
      }));
      return Object.freeze({itemId:r.itemId,status:r.status,sources:Object.freeze(sources),
        currentAvailabilityVerified:false as const});
    }));
  }
  return Object.freeze({release,getForStalls,getForItems});
}
