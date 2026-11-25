/** Original LootTable occurrences and their group settings from the same
 * current Item master. Explicit candidates are not guaranteed rewards,
 * and raw weights are not drop probabilities. Dynamic filters are retained
 * without enumerating their possible runtime outputs.
 */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemFieldValue,type ItemMasterLocale} from './public-item-master.ts';

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
export type LootReferrerRole='stall_slot'|'loot_present'|'ephemeral_treasure'|'consummable_default_item'|
  'blocker_reward'|'critter_like_reward'|'critter_favorite_reward'|'snippet_reward'|'quest_override_reward'|
  'recurring_weed_override'|'other_reference';
export interface LootTableReferrer {
  readonly sourceItemId:number;
  readonly sourceCategory:string;
  readonly sourceClass:string|null;
  readonly sourcePath:string;
  readonly role:LootReferrerRole;
  readonly name:string|null;
  readonly iconGuid:string|null;
  readonly locale:ItemMasterLocale;
  readonly acquisitionContextVerified:false;
}
export interface LootTableReferrers {
  readonly tableItemId:number;
  readonly status:'indexed'|'not_indexed'|'not_loot_table';
  readonly referrers:readonly Readonly<LootTableReferrer>[];
  readonly coverageComplete:false;
}
function referrerRole(cls:string|null,category:string,path:string):LootReferrerRole{
  if(cls==='StallBuildingItemData'&&/^source\.SlotLootTableItemID\[\d+\]$/.test(path))return 'stall_slot';
  if(cls==='LootPresentItemData'&&path==='source.LootTableItemID')return 'loot_present';
  if(cls==='EphemeralItemData'&&path==='source.TreasureLootTable')return 'ephemeral_treasure';
  if(cls==='ConsummableItemData'&&path==='source.DefaultItem.ItemID')return 'consummable_default_item';
  if(cls==='FurnitureBlockerItemData'&&path==='source.RewardLootTableItemID')return 'blocker_reward';
  if(cls==='CritterItemData'&&path==='source.LikeRewardLootTableItemID')return 'critter_like_reward';
  if(cls==='CritterItemData'&&path==='source.FavoriteRewardLootTableItemID')return 'critter_favorite_reward';
  if(cls==='SnippetItemData'&&path==='source.RewardLootTableItemID')return 'snippet_reward';
  if(category==='Mission'&&/^source\.OverrideRewards\.Rewards\[\d+\]$/.test(path))return 'quest_override_reward';
  if(category==='RecurringEvent'&&path==='source.WeedOverrides.WeedLootTable')return 'recurring_weed_override';
  return 'other_reference';
}
export interface LootItemSourceEvidence {
  readonly occurrence:Readonly<LootItemOccurrence>;
  readonly group:Readonly<LootSourceGroup>;
  /** Only loaded when a locale is explicitly requested. */
  readonly tableReferrers?:Readonly<LootTableReferrers>;
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
  async function getTableReferrers(tableIds:readonly number[],locale:ItemMasterLocale):Promise<readonly (Readonly<LootTableReferrers>|null)[]>{
    input(tableIds);check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
    const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
    const available=await indexed()&&catalog.has('references.incoming')&&catalog.has('sourceClass')&&catalog.has('names.'+locale)&&catalog.has('iconGuid');
    const rows=await db.getItemFields(tableIds,['nativeCategory']);
    const wanted=[...new Set(rows.flatMap(r=>r?.values.nativeCategory==='LootTable'?[r.itemId]:[]))].sort((a,b)=>a-b);
    const incoming=available?await db.getItemsReferences(wanted,'incoming'):[];
    const refs=new Map(wanted.map((id,i)=>[id,incoming[i]??[]]));
    const sourceIds=[...new Set(incoming.flatMap(r=>(r??[]).map(e=>e[0])))].sort((a,b)=>a-b);
    const identities=new Map<number,Readonly<Omit<LootTableReferrer,'sourcePath'|'role'>>>();
    for(let start=0;start<sourceIds.length;start+=10000){
      for(const row of await db.getItemFields(sourceIds.slice(start,start+10000),['nativeCategory','sourceClass','names.'+locale,'iconGuid'])){
        if(!row)continue;
        const v=row.values,name=v['names.'+locale],cls=v.sourceClass,icon=v.iconGuid;
        check(typeof v.nativeCategory==='string','REFERRER_CATEGORY');
        identities.set(row.itemId,Object.freeze({sourceItemId:row.itemId,sourceCategory:v.nativeCategory,
          sourceClass:typeof cls==='string'?cls:null,name:typeof name==='string'&&name.length?name:null,
          iconGuid:typeof icon==='string'&&/^[a-f0-9]{32}$/.test(icon)?icon:null,locale,acquisitionContextVerified:false}));
      }
    }
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const status:LootTableReferrers['status']=!available?'not_indexed':r.values.nativeCategory==='LootTable'?'indexed':'not_loot_table';
      const referrers=status==='indexed'?(refs.get(r.itemId)??[]).map(([id,sourcePath])=>{
        const identity=identities.get(id);check(identity,'REFERRER_IDENTITY');
        return Object.freeze({...identity,sourcePath,role:referrerRole(identity.sourceClass,identity.sourceCategory,sourcePath)});
      }):[];
      return Object.freeze({tableItemId:r.itemId,status,referrers:Object.freeze(referrers),coverageComplete:false as const});
    }));
  }
  async function getForItems(itemIds:readonly number[],locale?:ItemMasterLocale):Promise<readonly (Readonly<LootItemEvidence>|null)[]>{
    input(itemIds);check(locale===undefined||ITEM_MASTER_LOCALES.includes(locale),'LOCALE');const available=await indexed();
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
    const tableReferrers=new Map<number,Readonly<LootTableReferrers>>();
    if(locale!==undefined)for(let start=0;start<tableIds.length;start+=10000){
      for(const context of await getTableReferrers(tableIds.slice(start,start+10000),locale)){
        if(context)tableReferrers.set(context.tableItemId,context);
      }
    }
    const occurrences=new Map<string,Readonly<LootItemSourceEvidence>>();
    for(const table of definitions.values())for(const occurrence of table.occurrences){
      const group=table.groups[occurrence.groupIndex];check(group,'GROUP_JOIN');
      const context=tableReferrers.get(table.tableItemId);
      occurrences.set(table.tableItemId+':'+occurrence.sourcePath,Object.freeze({occurrence,group,...(context?{tableReferrers:context}:{})}));
    }
    return Object.freeze(groups.map((g,i)=>g===null?null:Object.freeze({itemId:itemIds[i],status:'indexed' as const,
      sources:Object.freeze(g.map(e=>{
        const r=occurrences.get(e[0]+':'+e[2]);check(r&&r.occurrence.itemId===itemIds[i],'OCCURRENCE_JOIN');return r;
      })),guaranteedRewardVerified:false as const,currentAvailabilityVerified:false as const})));
  }
  return Object.freeze({release,getForTables,getForItems,getTableReferrers});
}
