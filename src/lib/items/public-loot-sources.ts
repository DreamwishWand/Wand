/** Original LootTable occurrences and their group settings from the same
 * current Item master. Explicit candidates are not guaranteed rewards,
 * and raw weights are not drop probabilities. Dynamic filters are retained
 * without enumerating their possible runtime outputs.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';

const SOURCE='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v);
const num=(v:unknown)=>integer(v)?v:null;
const bool=(v:unknown)=>typeof v==='boolean'?v:null;
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_LOOT_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
function array(v:unknown):readonly ItemFieldValue[]{check(v===undefined||Array.isArray(v),'ARRAY');return v??[] as readonly ItemFieldValue[];}
export interface LootSourceGroup {
  readonly groupIndex:number;
  readonly minimum:number|null;
  readonly maximum:number|null;
  readonly weight:number|null;
  readonly emptyField:boolean|null;
  readonly prioritizeNewItems:boolean|null;
  readonly availableWhen:ItemFieldValue|null;
  readonly types:readonly ItemFieldValue[];
  readonly rarities:readonly ItemFieldValue[];
  readonly minRarity:number|null;
  readonly maxRarity:number|null;
  readonly filters:readonly ItemFieldValue[];
  readonly originalGroup:Obj;
}
export interface LootItemOccurrence {
  readonly tableItemId:number;
  readonly itemId:number;
  readonly sourcePath:string;
  readonly groupIndex:number;
  readonly itemIndex:number;
  readonly conditionalGroupIndex:number|null;
  readonly conditions:ItemFieldValue|null;
  readonly state:ItemFieldValue|null;
}
export interface LootTableDefinition {
  readonly tableItemId:number;
  readonly groups:readonly Readonly<LootSourceGroup>[];
  readonly occurrences:readonly Readonly<LootItemOccurrence>[];
  readonly currentAvailabilityVerified:false;
  readonly guaranteedRewardVerified:false;
}
export interface LootItemSourceEvidence {
  readonly occurrence:Readonly<LootItemOccurrence>;
  readonly group:Readonly<LootSourceGroup>;
}
export interface LootItemEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly sources:readonly Readonly<LootItemSourceEvidence>[];
  readonly guaranteedRewardVerified:false;
  readonly currentAvailabilityVerified:false;
}
function definition(tableItemId:number,rewards:unknown):Readonly<LootTableDefinition>{
  check(obj(rewards),'REWARDS');
  const groups:LootSourceGroup[]=[],occurrences:LootItemOccurrence[]=[];
  for(const [groupIndex,g] of array(rewards.SubLootTables).entries()){
    check(obj(g),'GROUP');
    const prefix='source.Rewards.SubLootTables['+groupIndex+']';
    groups.push(Object.freeze({groupIndex,minimum:num(g.Min),maximum:num(g.Max),weight:num(g.Weight),
      emptyField:bool(g.Empty),prioritizeNewItems:bool(g.PrioToNewItems),availableWhen:g.AvailableWhen??null,
      types:array(g.Types_??g.Types),rarities:array(g.Rarities),minRarity:num(g.MinRarity),maxRarity:num(g.MaxRarity),
      filters:array(g.Filters),originalGroup:g}));
    const emit=(raw:ItemFieldValue,itemIndex:number,conditionalGroupIndex:number|null,conditions:ItemFieldValue|null)=>{
      check(obj(raw)&&id(raw.ItemID),'ITEM');
      const path=conditionalGroupIndex===null?prefix+'.Items['+itemIndex+']':
        prefix+'.ItemsConditional['+conditionalGroupIndex+'].Items['+itemIndex+']';
      occurrences.push(Object.freeze({tableItemId,itemId:raw.ItemID,sourcePath:path+'.ItemID',groupIndex,itemIndex,
        conditionalGroupIndex,conditions,state:raw.State??null}));
    };
    array(g.Items).forEach((raw,i)=>emit(raw,i,null,null));
    array(g.ItemsConditional).forEach((c,i)=>{
      check(obj(c),'CONDITIONAL_GROUP');
      array(c.Items).forEach((raw,j)=>emit(raw,j,i,c.Conditions??null));
    });
  }
  return Object.freeze({tableItemId,groups:Object.freeze(groups),occurrences:Object.freeze(occurrences),
    currentAvailabilityVerified:false,guaranteedRewardVerified:false});
}
export function createLootSourceReader(db:PublicCompleteItemMaster){
  const release=db.release;
  const pinned=release.target.platform==='Steam'&&release.sourceFilesSha256?.LootTable===SOURCE&&release.sourceIl2cppDumpSha256===DUMP;
  let indexTask:Promise<boolean>|undefined;
  function indexed(){
    if(!indexTask){
      const task=(async()=>{
        const c=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return pinned&&['source.Rewards','nativeCategory','acquisition.nativeCandidates'].every(f=>c.has(f));
      })();indexTask=task;void task.catch(()=>{if(indexTask===task)indexTask=undefined;});
    }
    return indexTask;
  }
  async function getForTables(tableIds:readonly number[]){
    input(tableIds);const available=await indexed();
    const rows=await db.getItemFields(tableIds,available?['nativeCategory','source.Rewards']:['itemId']);
    return Object.freeze(rows.map(r=>!r?null:Object.freeze({itemId:r.itemId,
      status:!available?'not_indexed' as const:r.values.nativeCategory==='LootTable'?'indexed' as const:'not_loot_table' as const,
      definition:available&&r.values.nativeCategory==='LootTable'?definition(r.itemId,r.values['source.Rewards']):null})));
  }
  async function getForItems(itemIds:readonly number[]):Promise<readonly (Readonly<LootItemEvidence>|null)[]>{
    input(itemIds);const available=await indexed();
    if(!available)return Object.freeze((await db.getItemFields(itemIds,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,sources:Object.freeze([]),guaranteedRewardVerified:false as const,currentAvailabilityVerified:false as const}):null));
    const incoming=await db.getNativeAcquisitionCandidates(itemIds);
    const groups=incoming.map(r=>r===null?null:r.filter(e=>e[1]==='loot_table_candidate'));
    const tableIds=[...new Set(groups.flatMap(g=>(g??[]).map(e=>e[0])))].sort((a,b)=>a-b);
    const definitions=new Map<number,Readonly<LootTableDefinition>>();
    for(let i=0;i<tableIds.length;i+=10000){
      for(const r of await getForTables(tableIds.slice(i,i+10000))){
        check(r?.definition,'TABLE_JOIN');definitions.set(r.itemId,r.definition);
      }
    }
    const occurrences=new Map<string,Readonly<LootItemSourceEvidence>>();
    for(const table of definitions.values())for(const occurrence of table.occurrences){
      const group=table.groups[occurrence.groupIndex];check(group,'GROUP_JOIN');
      occurrences.set(table.tableItemId+':'+occurrence.sourcePath,Object.freeze({occurrence,group}));
    }
    return Object.freeze(groups.map((g,i)=>g===null?null:Object.freeze({itemId:itemIds[i],status:'indexed' as const,
      sources:Object.freeze(g.map(e=>{
        const r=occurrences.get(e[0]+':'+e[2]);check(r&&r.occurrence.itemId===itemIds[i],'OCCURRENCE_JOIN');return r;
      })),guaranteedRewardVerified:false as const,currentAvailabilityVerified:false as const})));
  }
  return Object.freeze({release,getForTables,getForItems});
}
