/** Canonical static CritterItemData configuration; neither a live spawn
 * forecast nor a confirmed feeding or unlock operation. Preserve original
 * schedule order and selector modes, including filters and empty days.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
import {createItemFilterCandidateReader,type QuestFilterCandidateResult} from './public-quest-filter-candidates.ts';
const SOURCE='62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const integer=(v:unknown):number|null=>nonnegative(v)?v:null;
function check(v:unknown,why:string):asserts v{if(!v)throw TypeError('DB01_CRITTER_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
const SELECTOR_PATH=/^source\.(LikeItem|FavoriteItem)\.(?:Item\.(?:Item|ItemIngredient)\.Item|ItemList\.(?:Item|ItemIngredient)\.ItemList\.List\[\d+\]\.Item)$/;
export interface CritterFoodReference {
  readonly itemId:number;
  readonly sourcePath:string;
}
export interface CritterFoodSelector {
  readonly mode:'Item'|'ItemList'|'ItemGenerator'|'FilterGenerator'|'unresolved';
  readonly original:Obj;
  readonly explicitItems:readonly Readonly<CritterFoodReference>[];
  readonly runtimeAcceptanceVerified:false;
}
export interface CritterScheduleInterval {
  readonly startHour:number;
  readonly endHour:number;
  readonly startFieldPresent:boolean;
  readonly endFieldPresent:boolean;
}
export interface CritterSourceDefinition {
  readonly critterItemId:number;
  readonly location:Readonly<{kind:'village_area';areaCode:number}|{kind:'scene';sceneItemId:number}>|null;
  readonly schedule:readonly (readonly Readonly<CritterScheduleInterval>[])[];
  readonly optionalSpawnAt:ItemFieldValue|null;
  readonly appearanceConditions:ItemFieldValue|null;
  readonly foodActivitySubtypeCode:number|null;
  readonly like:Readonly<CritterFoodSelector>;
  readonly favorite:Readonly<CritterFoodSelector>;
  readonly feedingBeforeRewards:number|null;
  readonly feedingBeforeUnlock:number|null;
  readonly likeLootTableItemId:number|null;
  readonly favoriteLootTableItemId:number|null;
  readonly befriendingPetItemId:number|null;
  readonly currentAvailabilityVerified:false;
}
export interface CritterSourceResult {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed'|'not_critter';
  readonly definition:Readonly<CritterSourceDefinition>|null;
}
export interface CritterFoodFilterResult {
  readonly critterItemId:number;
  readonly status:CritterSourceResult['status'];
  readonly like:Readonly<QuestFilterCandidateResult>|null;
  readonly favorite:Readonly<QuestFilterCandidateResult>|null;
  readonly runtimeAcceptanceVerified:false;
}
export interface CritterFoodFilterReference {
  readonly critterItemId:number;
  readonly preference:'like'|'favorite';
  readonly evidence:QuestFilterCandidateResult['candidates'][number];
  readonly facts:QuestFilterCandidateResult['facts'];
}
export interface CritterFoodFilterInverse {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly references:readonly Readonly<CritterFoodFilterReference>[];
  readonly runtimeAcceptanceVerified:false;
}
export interface CritterFoodResult {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly sources:readonly Readonly<{critterItemId:number;preference:'like'|'favorite';sourcePath:string}>[];
  readonly filterEligibilityVerified:false;
}
const fields=['sourceClass','source.Location','source.Scene','source.DailySchedule','source.OptionalSpawnAt',
  'source.AppearanceConditions','source.ItemTypeWanted','source.LikeItem','source.FavoriteItem',
  'source.NumberOfFeedingBeforeRewards','source.NumberOfFeedingBeforeUnlock','source.LikeRewardLootTableItemID',
  'source.FavoriteRewardLootTableItemID','source.BefriendingPetRewardItemID'];
function schedule(raw:unknown):CritterSourceDefinition['schedule']{
  check(Array.isArray(raw)&&raw.length===7,'SCHEDULE_DAYS');
  return Object.freeze(raw.map(day=>{
    check(obj(day),'SCHEDULE_DAY');
    const intervals=day.Schedule??[];
    check(Array.isArray(intervals),'SCHEDULE_INTERVALS');
    return Object.freeze(intervals.map(s=>{
      check(obj(s)&&(s.Start===undefined||nonnegative(s.Start)&&s.Start<=24)&&
        (s.End===undefined||nonnegative(s.End)&&s.End<=24),'SCHEDULE_INTERVAL');
      return Object.freeze({startHour:s.Start??0,endHour:s.End??0,
        startFieldPresent:s.Start!==undefined,endFieldPresent:s.End!==undefined});
    }));
  }));
}
function selector(raw:unknown,refs:readonly (readonly [number,string])[],field:'LikeItem'|'FavoriteItem'):Readonly<CritterFoodSelector>{
  check(obj(raw),'SELECTOR');
  const keys=(['Item','ItemList','ItemGenerator','FilterGenerator'] as const).filter(k=>Object.hasOwn(raw,k));
  const mode=keys.length===1?keys[0]:'unresolved';
  const explicitItems=refs.filter(([,path])=>SELECTOR_PATH.exec(path)?.[1]===field).map(([itemId,sourcePath])=>Object.freeze({itemId,sourcePath}));
  return Object.freeze({mode,original:raw,explicitItems:Object.freeze(explicitItems),runtimeAcceptanceVerified:false});
}
function definition(itemId:number,v:Obj,refs:readonly (readonly [number,string])[]):Readonly<CritterSourceDefinition>{
  const area=v['source.Location'],scene=v['source.Scene'];
  check((area===undefined||nonnegative(area))&&(scene===undefined||id(scene))&&
    !(area!==undefined&&scene!==undefined),'LOCATION');
  const location:CritterSourceDefinition['location']=nonnegative(area)?Object.freeze({kind:'village_area',areaCode:area}):
    id(scene)?Object.freeze({kind:'scene',sceneItemId:scene}):null;
  return Object.freeze({critterItemId:itemId,location,schedule:schedule(v['source.DailySchedule']),
    optionalSpawnAt:v['source.OptionalSpawnAt']??null,appearanceConditions:v['source.AppearanceConditions']??null,
    foodActivitySubtypeCode:integer(v['source.ItemTypeWanted']),
    like:selector(v['source.LikeItem'],refs,'LikeItem'),favorite:selector(v['source.FavoriteItem'],refs,'FavoriteItem'),
    feedingBeforeRewards:integer(v['source.NumberOfFeedingBeforeRewards']),
    feedingBeforeUnlock:integer(v['source.NumberOfFeedingBeforeUnlock']),
    likeLootTableItemId:integer(v['source.LikeRewardLootTableItemID']),
    favoriteLootTableItemId:integer(v['source.FavoriteRewardLootTableItemID']),
    befriendingPetItemId:integer(v['source.BefriendingPetRewardItemID']),currentAvailabilityVerified:false});
}
// Keep caches scoped to the immutable canonical reader, never to a global
// game version. Shared-detail calls reuse the same configuration index and
// filter resolutions without retaining old master revisions.
const readers=new WeakMap<PublicCompleteItemMaster,ReturnType<typeof buildCritterSourceReader>>();
export function createCritterSourceReader(db:PublicCompleteItemMaster){
  const existing=readers.get(db);
  if(existing)return existing;
  const reader=buildCritterSourceReader(db);
  readers.set(db,reader);
  return reader;
}
function buildCritterSourceReader(db:PublicCompleteItemMaster){
  const release=db.release;
  const pinned=release.target.platform==='Steam'&&release.sourceFilesSha256?.Companion===SOURCE&&release.sourceIl2cppDumpSha256===DUMP;
  const filters=createItemFilterCandidateReader(db,'critter');
  let indexTask:Promise<ReadonlySet<string>|null>|undefined;
  function index(){
    if(!indexTask){
      const task=(async()=>{
        if(!pinned)return null;
        const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return ['sourceClass','source.DailySchedule','source.LikeItem','source.FavoriteItem',
          'source.AppearanceConditions','source.BefriendingPetRewardItemID',
          'references.incoming','references.outgoing'].every(f=>catalog.has(f))?catalog:null;
      })();indexTask=task;void task.catch(()=>{if(indexTask===task)indexTask=undefined;});
    }
    return indexTask;
  }
  async function getForCritters(ids:readonly number[]):Promise<readonly (Readonly<CritterSourceResult>|null)[]>{
    input(ids);const catalog=await index();
    const rows=await db.getItemFields(ids,catalog?fields.filter(f=>catalog.has(f)):['itemId']);
    const refs=catalog?await db.getItemsReferences(ids,'outgoing'):[];
    return Object.freeze(rows.map((r,i)=>{
      if(!r)return null;
      const status:CritterSourceResult['status']=!catalog?'not_indexed':r.values.sourceClass==='CritterItemData'?'indexed':'not_critter';
      return Object.freeze({itemId:r.itemId,status,definition:status==='indexed'?definition(r.itemId,r.values,refs[i]??[]):null});
    }));
  }
  async function getForFood(ids:readonly number[]):Promise<readonly (Readonly<CritterFoodResult>|null)[]>{
    input(ids);const catalog=await index();
    if(!catalog)return Object.freeze((await db.getItemFields(ids,['itemId'])).map(r=>r?Object.freeze({itemId:r.itemId,
      status:'not_indexed' as const,sources:Object.freeze([]),filterEligibilityVerified:false as const}):null));
    const refs=await db.getItemsReferences(ids,'incoming');
    const candidateIds=[...new Set(refs.flatMap(r=>(r??[]).filter(([,path])=>SELECTOR_PATH.test(path)).map(([i])=>i)))];
    const critters=new Set<number>();
    for(let i=0;i<candidateIds.length;i+=10000)for(const row of await db.getItemFields(candidateIds.slice(i,i+10000),['sourceClass'])){
      if(row?.values.sourceClass==='CritterItemData')critters.add(row.itemId);
    }
    return Object.freeze(refs.map((r,i)=>r===null?null:Object.freeze({itemId:ids[i],status:'indexed' as const,
      sources:Object.freeze(r.flatMap(([critterItemId,sourcePath])=>{
        const m=SELECTOR_PATH.exec(sourcePath);
        return m&&critters.has(critterItemId)?[Object.freeze({critterItemId,sourcePath,
          preference:m[1]==='LikeItem'?'like' as const:'favorite' as const})]:[];
      })),filterEligibilityVerified:false as const})));
  }
  // Cache only the distinct configured filters, not copies for each critter.
  const filterTasks=new Map<string,Promise<Readonly<QuestFilterCandidateResult>>>();
  function resolveFoodFilter(selector:Readonly<CritterFoodSelector>){
    if(selector.mode!=='FilterGenerator')return Promise.resolve(null);
    const raw=selector.original.FilterGenerator;
    check(obj(raw),'FOOD_FILTER');
    const key=JSON.stringify(raw);
    let task=filterTasks.get(key);
    if(!task){
      const started=filters.resolve(raw);
      filterTasks.set(key,started);
      void started.catch(()=>{if(filterTasks.get(key)===started)filterTasks.delete(key);});
      task=started;
    }
    return task;
  }
  /** All source type-matched candidates are preserved, including negative
   * direct-tag evidence and unresolved runtime constraints. Explicit lists
   * are returned separately by getForCritters/getForFood. */
  async function getFoodFilterCandidates(ids:readonly number[]):Promise<readonly (Readonly<CritterFoodFilterResult>|null)[]>{
    const rows=await getForCritters(ids);
    return Object.freeze(await Promise.all(rows.map(async r=>{
      if(!r)return null;
      const [like,favorite]=r.definition?await Promise.all([
        resolveFoodFilter(r.definition.like),resolveFoodFilter(r.definition.favorite)
      ]):[null,null];
      return Object.freeze({critterItemId:r.itemId,status:r.status,like,favorite,runtimeAcceptanceVerified:false as const});
    })));
  }
  let allFilters:Promise<readonly (Readonly<CritterFoodFilterResult>|null)[]>|undefined;
  async function getForFoodFilterCandidates(ids:readonly number[]):Promise<readonly (Readonly<CritterFoodFilterInverse>|null)[]>{
    input(ids);
    const catalog=await index();
    const items=await db.getItemFields(ids,['itemId']);
    if(!catalog)return Object.freeze(items.map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,references:Object.freeze([]),runtimeAcceptanceVerified:false as const}):null));
    if(!allFilters){
      const task=db.findItemIdsByField('sourceClass',{kind:'equals',value:'CritterItemData'}).then(getFoodFilterCandidates);
      allFilters=task;void task.catch(()=>{if(allFilters===task)allFilters=undefined;});
    }
    const wanted=new Set(ids);
    const byItem=new Map<number,CritterFoodFilterReference[]>();
    const resolved=await allFilters;
    const indexed=resolved.every(r=>r&&r.status==='indexed'&&[r.like,r.favorite].every(f=>!f||f.status==='source_definition_candidates'));
    if(indexed)for(const row of resolved){
      if(!row)continue;
      for(const preference of ['like','favorite'] as const){
        const filter=row[preference];if(!filter)continue;
        for(const evidence of filter.candidates){
          if(!wanted.has(evidence.itemId))continue;
          const ref=Object.freeze({critterItemId:row.critterItemId,preference,evidence,facts:filter.facts});
          const list=byItem.get(evidence.itemId);
          if(list)list.push(ref);else byItem.set(evidence.itemId,[ref]);
        }
      }
    }
    return Object.freeze(items.map(r=>r?Object.freeze({itemId:r.itemId,
      status:indexed?'indexed' as const:'not_indexed' as const,
      references:Object.freeze(byItem.get(r.itemId)??[]),runtimeAcceptanceVerified:false as const}):null));
  }
  return Object.freeze({release,getForCritters,getForFood,getFoodFilterCandidates,getForFoodFilterCandidates});
}
