/** Canonical blocker reward definitions and source references.
 * Placement restrictions are not a spawn map. Conditional-event and Mission
 * references are contextual evidence, never proof of an actual spawn or grant. */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
import {createLootSourceReader,type LootTableDefinition,type LootItemSourceEvidence} from './public-loot-sources.ts';
const FURNITURE='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const uniq=(ids:readonly number[])=>[...new Set(ids)].sort((a,b)=>a-b);
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_BLOCKER_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
export interface BlockerContextReference{
  readonly sourceItemId:number;
  readonly sourcePath:string;
  readonly kind:'conditional_event'|'quest'|'recurring_event';
  readonly conditions:ItemFieldValue|null;
  readonly sourceBranch:ItemFieldValue|null;
  readonly spawnVerified:false;
}
export interface BlockerDefinition{
  readonly blockerItemId:number;
  readonly defaultRewardItemId:number|null;
  readonly rewardLootTableId:number|null;
  readonly lootTable:Readonly<LootTableDefinition>|null;
  readonly toolBreakable:ItemFieldValue|null;
  readonly placementContext:ItemFieldValue|null;
  readonly contextReferences:readonly Readonly<BlockerContextReference>[];
  readonly actualSpawnVerified:false;
  readonly actualDropVerified:false;
}
export interface BlockerSourceResult{
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed'|'not_blocker';
  readonly definition:Readonly<BlockerDefinition>|null;
}
export interface BlockerItemSourceResult{
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly direct:readonly Readonly<BlockerDefinition>[];
  readonly loot:readonly Readonly<{blocker:Readonly<BlockerDefinition>;occurrence:Readonly<LootItemSourceEvidence>}>[];
  readonly currentAvailabilityVerified:false;
}
export function createBlockerSourceReader(db:PublicCompleteItemMaster){
  const release=db.release;
  const loot=createLootSourceReader(db);
  let catalogTask:Promise<Set<string>|null>|undefined;
  function catalog(){
    if(!catalogTask){
      const task=(async()=>{
        if(release.target.platform!=='Steam'||release.sourceFilesSha256?.Furniture!==FURNITURE||
          release.sourceIl2cppDumpSha256!==DUMP)return null;
        const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return ['sourceClass','nativeCategory','source.DefaultRewardItemID','source.RewardLootTableItemID',
          'references.incoming','acquisition.nativeCandidates'].every(f=>fields.has(f))?fields:null;
      })();catalogTask=task;void task.catch(()=>{if(catalogTask===task)catalogTask=undefined;});
    }
    return catalogTask;
  }
  async function getForBlockers(ids:readonly number[]):Promise<readonly (Readonly<BlockerSourceResult>|null)[]>{
    input(ids);const fields=await catalog();
    if(!fields)return Object.freeze((await db.getItemFields(ids,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,definition:null}):null));
    const rows=await db.getItemFields(ids,['sourceClass','source.DefaultRewardItemID','source.RewardLootTableItemID',
      'source.ToolBreakable','placement.sourceContext'].filter(f=>fields.has(f)));
    const blockers=uniq(rows.flatMap(r=>r?.values.sourceClass==='FurnitureBlockerItemData'?[r.itemId]:[]));
    const tables=uniq(rows.flatMap(r=>r?.values.sourceClass==='FurnitureBlockerItemData'&&id(r.values['source.RewardLootTableItemID'])?
      [r.values['source.RewardLootTableItemID']]:[]));
    const definitions=new Map<number,Readonly<LootTableDefinition>>();
    for(const t of await loot.getForTables(tables))if(t?.definition)definitions.set(t.itemId,t.definition);
    const incoming=await db.getItemsReferences(blockers,'incoming');
    const references=new Map(blockers.map((b,i)=>[b,incoming[i]??[]]));
    const sources=uniq(incoming.flatMap(r=>(r??[]).map(e=>e[0])));
    const contexts=new Map<number,Awaited<ReturnType<typeof db.getItemFields>>[number]>();
    const rootFields=['nativeCategory','source.Conditions','source.AvailableConditions','source.Spawn',
      'source.SpawnInScenes','source.SpawnAround','source.SpecificLocation','source.ReplaceFurnitureOnGrid'];
    for(let i=0;i<sources.length;i+=10000){
      for(const r of await db.getItemFields(sources.slice(i,i+10000),rootFields.filter(f=>fields.has(f))))if(r)contexts.set(r.itemId,r);
    }
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      if(r.values.sourceClass!=='FurnitureBlockerItemData')return Object.freeze({itemId:r.itemId,status:'not_blocker' as const,definition:null});
      const v=r.values,tableId=id(v['source.RewardLootTableItemID'])?v['source.RewardLootTableItemID']:null;
      const refs:BlockerContextReference[]=[];
      for(const [sourceItemId,sourcePath] of references.get(r.itemId)??[]){
        const source=contexts.get(sourceItemId)?.values;
        const kind=source?.nativeCategory==='ConditionalEvent'?'conditional_event':
          source?.nativeCategory==='Mission'?'quest':source?.nativeCategory==='RecurringEvent'?'recurring_event':null;
        if(!kind||!source)continue;
        const root=sourcePath.match(/^source\.[A-Za-z][A-Za-z0-9_]*/)?.[0];
        refs.push(Object.freeze({sourceItemId,sourcePath,kind,
          conditions:source['source.Conditions']??source['source.AvailableConditions']??null,
          sourceBranch:root?source[root]??null:null,spawnVerified:false}));
      }
      const definition=Object.freeze({blockerItemId:r.itemId,
        defaultRewardItemId:id(v['source.DefaultRewardItemID'])?v['source.DefaultRewardItemID']:null,
        rewardLootTableId:tableId,lootTable:tableId===null?null:definitions.get(tableId)??null,
        toolBreakable:v['source.ToolBreakable']??null,placementContext:v['placement.sourceContext']??null,
        contextReferences:Object.freeze(refs),actualSpawnVerified:false as const,actualDropVerified:false as const});
      return Object.freeze({itemId:r.itemId,status:'indexed' as const,definition});
    }));
  }
  async function getForItems(ids:readonly number[]):Promise<readonly (Readonly<BlockerItemSourceResult>|null)[]>{
    input(ids);const fields=await catalog();
    if(!fields)return Object.freeze((await db.getItemFields(ids,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,direct:Object.freeze([]),loot:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    const [native,items]=await Promise.all([db.getNativeAcquisitionCandidates(ids),loot.getForItems(ids)]);
    const tables=uniq(items.flatMap(r=>r?.sources.map(s=>s.occurrence.tableItemId)??[]));
    const links=await db.getItemsReferences(tables,'incoming');
    const byTable=new Map(tables.map((t,i)=>[t,(links[i]??[]).filter(([,p])=>p==='source.RewardLootTableItemID').map(([id])=>id)]));
    const sources=uniq([...native.flatMap(r=>(r??[]).filter(e=>e[1]==='blocker_default_reward').map(e=>e[0])),...Array.from(byTable.values()).flat()]);
    const byId=new Map<number,Readonly<BlockerDefinition>>();
    for(let i=0;i<sources.length;i+=10000)for(const row of await getForBlockers(sources.slice(i,i+10000))){
      if(row?.definition)byId.set(row.itemId,row.definition);
    }
    return Object.freeze(items.map((r,i)=>{
      if(!r)return null;
      const direct=(native[i]??[]).filter(e=>e[1]==='blocker_default_reward').map(([id])=>{
        const b=byId.get(id);check(b?.defaultRewardItemId===r.itemId,'DIRECT_JOIN');return b;
      });
      const fromLoot=r.sources.flatMap(occurrence=>(byTable.get(occurrence.occurrence.tableItemId)??[]).flatMap(id=>{
        const blocker=byId.get(id);
        return blocker?.rewardLootTableId===occurrence.occurrence.tableItemId?[Object.freeze({blocker,occurrence})]:[];
      }));
      return Object.freeze({itemId:r.itemId,status:'indexed' as const,direct:Object.freeze(direct),loot:Object.freeze(fromLoot),
        currentAvailabilityVerified:false as const});
    }));
  }
  return Object.freeze({release,getForBlockers,getForItems});
}
