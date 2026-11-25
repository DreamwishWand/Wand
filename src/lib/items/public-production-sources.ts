/** Source-defined mining, timebending and seed production routes. A route
 * is original configuration, not proof of live availability or drop rate.
 * Preserve separate activity rows even when they yield the same Item ID. */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';

const ACTIVITY='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296';
const ITEMS='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v);
const nonnegative=(v:unknown):v is number=>integer(v)&&v>=0;
function check(ok:unknown,code:string):asserts ok{if(!ok)throw new TypeError('DB01_PRODUCTION_'+code);}
const number=(v:ItemFieldValue|undefined)=>integer(v)?v:null;
const bool=(v:ItemFieldValue|undefined)=>typeof v==='boolean'?v:null;
const text=(v:ItemFieldValue|undefined)=>typeof v==='string'?v:null;
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
export type ActivityLocation=Readonly<{kind:'village_area';areaCode:number}|{kind:'scene';sceneItemId:number}|{kind:'unresolved';original:ItemFieldValue}>;
function location(raw:ItemFieldValue):ActivityLocation{
  if(obj(raw)&&Object.keys(raw).length===1){
    if(nonnegative(raw.VillageArea))return Object.freeze({kind:'village_area',areaCode:raw.VillageArea});
    if(id(raw.Scene))return Object.freeze({kind:'scene',sceneItemId:raw.Scene});
  }
  return Object.freeze({kind:'unresolved',original:raw});
}
function locations(raw:ItemFieldValue|undefined):readonly ActivityLocation[]{
  if(raw===undefined)return Object.freeze([]);
  check(Array.isArray(raw),'LOCATION_LIST');
  return Object.freeze(raw.map(location));
}
export interface SourceDuration {
  readonly seconds:number|null;
  readonly nanos:number|null;
  readonly configuredSeconds:number|null;
  readonly original:ItemFieldValue;
}
function duration(raw:ItemFieldValue|undefined):Readonly<SourceDuration>|null{
  if(raw===undefined)return null;
  if(!obj(raw))return Object.freeze({seconds:null,nanos:null,configuredSeconds:null,original:raw});
  const seconds=number(raw.Seconds),nanos=number(raw.Nanos);
  const reviewed=Object.keys(raw).every(k=>k==='Seconds'||k==='Nanos')&&
    (raw.Seconds===undefined||seconds!==null)&&(raw.Nanos===undefined||nanos!==null&&Math.abs(nanos)<1e9);
  return Object.freeze({seconds,nanos,configuredSeconds:reviewed?(seconds??0)+(nanos??0)/1e9:null,original:raw});
}
export interface MiningSourceDefinition {
  readonly kind:'mining';
  readonly activityItemId:number;
  readonly resultItemId:number;
  readonly location:ActivityLocation|null;
  readonly rarityCode:number;
  readonly rarityFieldPresent:boolean;
  readonly valuableField:boolean|null;
  readonly weightPercentage:number|null;
  readonly failureProbabilityPerHit:number|null;
  readonly minimumHits:number|null;
  readonly maximumHits:number|null;
  readonly hiddenField:boolean|null;
}
export interface TimebendingSourceDefinition {
  readonly kind:'timebending';
  readonly activityItemId:number;
  readonly resultItemId:number;
  readonly locations:readonly ActivityLocation[];
  readonly locationsFieldPresent:boolean;
  readonly configuredAmount:number|null;
  readonly configuredRange:Readonly<{minimum:number|null;maximum:number|null;original:ItemFieldValue}>|null;
  readonly missionField:boolean|null;
  readonly category:string|null;
  readonly probabilityWeight:number|null;
  readonly minimumHourglassLevel:number|null;
  readonly conditions:ItemFieldValue|null;
  readonly baseMaterialization:number|null;
  readonly materializationAmountMultiplier:number|null;
  readonly sameUniverseMultiplier:number|null;
  readonly chosenItemMultiplier:ItemFieldValue|null;
}
export interface SeedSourceDefinition {
  readonly kind:'seed_production';
  readonly seedItemId:number;
  readonly resultItemId:number|null;
  readonly producesItemField:boolean|null;
  readonly configuredYield:number|null;
  readonly growthPeriod:Readonly<SourceDuration>|null;
  readonly productionPeriod:Readonly<SourceDuration>|null;
  readonly wateringCount:number|null;
  readonly growthPeriodCount:number|null;
  readonly selfDestructField:boolean|null;
  readonly hasGrowthBoostField:boolean|null;
  readonly noGrowthBuffField:boolean|null;
  readonly villageAreaCodes:readonly number[]|null;
  readonly missionField:boolean|null;
  readonly missionSeedLocationRestriction:ItemFieldValue|null;
  readonly missionSeedBlockHarvest:boolean|null;
  readonly minimumStallLevel:number|null;
}
export type ProductionSourceDefinition=MiningSourceDefinition|TimebendingSourceDefinition|SeedSourceDefinition;
export interface ProductionItemEvidence {
  readonly itemId:number;
  readonly activityStatus:'indexed'|'not_indexed';
  readonly seedStatus:'indexed'|'not_indexed';
  readonly sources:readonly Readonly<ProductionSourceDefinition>[];
  readonly currentAvailabilityVerified:false;
}
const activityFields=['source.Result.ItemID','source.Location','source.Locations','source.Rarity','source.IsValuable',
  'source.WeightPercentage','source.FailureProbabilityPerHit','source.MininumNumberOfHits','source.MaximumNumberOfHits','source.IsHidden',
  'source.Amount','source.MinMax','source.IsForMission','source.Category','source.ProbabilityWeight','source.MinHourglassLevel',
  'source.Conditions','source.BaseMaterialization','source.MaterializationAmountMultiplier','source.HangoutWithSameUniverseMultiplier',
  'source.ChosenItemMultiplier'];
const seedFields=['source.ProducedItemID','source.ProducesItem','source.ProducedAmount','source.GrowthPeriod','source.ProductionPeriod',
  'source.NumberOfWateringRequired','source.NumberOfGrowthPeriods','source.SelfDestructAfterAllGrowthPeriods','source.HasGrowthBoost',
  'source.NoGrowthBuff','source.VillageAreas','source.IsMissionItem','source.MissionSeedLocationRestriction','source.MissionSeedBlockHarvest','source.MinimumStallLevel'];
function mining(activityItemId:number,v:Obj):Readonly<MiningSourceDefinition>{
  const resultItemId=v['source.Result.ItemID'],rarity=v['source.Rarity'];
  check(id(resultItemId)&&(rarity===undefined||nonnegative(rarity)&&rarity<=4),'MINING_RESULT');
  return Object.freeze({kind:'mining',activityItemId,resultItemId,
    location:v['source.Location']===undefined?null:location(v['source.Location']),
    rarityCode:rarity??0,rarityFieldPresent:rarity!==undefined,
    valuableField:bool(v['source.IsValuable']),weightPercentage:number(v['source.WeightPercentage']),
    failureProbabilityPerHit:number(v['source.FailureProbabilityPerHit']),
    minimumHits:number(v['source.MininumNumberOfHits']),maximumHits:number(v['source.MaximumNumberOfHits']),
    hiddenField:bool(v['source.IsHidden'])});
}
function timebending(activityItemId:number,v:Obj):Readonly<TimebendingSourceDefinition>{
  const resultItemId=v['source.Result.ItemID'],range=v['source.MinMax'],amount=v['source.Amount'];
  check(id(resultItemId)&&(range===undefined||obj(range))&&(amount===undefined||nonnegative(amount))&&
    (amount===undefined||range===undefined),'TIMEBENDING_RESULT');
  return Object.freeze({kind:'timebending',activityItemId,resultItemId,
    locations:locations(v['source.Locations']),locationsFieldPresent:v['source.Locations']!==undefined,
    configuredAmount:number(amount),configuredRange:obj(range)?Object.freeze({minimum:number(range.Min),maximum:number(range.Max),original:range}):null,
    missionField:bool(v['source.IsForMission']),category:text(v['source.Category']),
    probabilityWeight:number(v['source.ProbabilityWeight']),minimumHourglassLevel:number(v['source.MinHourglassLevel']),
    conditions:v['source.Conditions']??null,baseMaterialization:number(v['source.BaseMaterialization']),
    materializationAmountMultiplier:number(v['source.MaterializationAmountMultiplier']),
    sameUniverseMultiplier:number(v['source.HangoutWithSameUniverseMultiplier']),chosenItemMultiplier:v['source.ChosenItemMultiplier']??null});
}
function seed(seedItemId:number,v:Obj):Readonly<SeedSourceDefinition>{
  const result=v['source.ProducedItemID'],areas=v['source.VillageAreas'];
  check(result===undefined||id(result),'SEED_RESULT');
  check(areas===undefined||Array.isArray(areas)&&areas.every(nonnegative),'SEED_AREAS');
  return Object.freeze({kind:'seed_production',seedItemId,resultItemId:result??null,
    producesItemField:bool(v['source.ProducesItem']),configuredYield:number(v['source.ProducedAmount']),
    growthPeriod:duration(v['source.GrowthPeriod']),productionPeriod:duration(v['source.ProductionPeriod']),
    wateringCount:number(v['source.NumberOfWateringRequired']),growthPeriodCount:number(v['source.NumberOfGrowthPeriods']),
    selfDestructField:bool(v['source.SelfDestructAfterAllGrowthPeriods']),hasGrowthBoostField:bool(v['source.HasGrowthBoost']),
    noGrowthBuffField:bool(v['source.NoGrowthBuff']),
    villageAreaCodes:areas===undefined?null:Object.freeze([...areas] as number[]),
    missionField:bool(v['source.IsMissionItem']),missionSeedLocationRestriction:v['source.MissionSeedLocationRestriction']??null,
    missionSeedBlockHarvest:bool(v['source.MissionSeedBlockHarvest']),minimumStallLevel:number(v['source.MinimumStallLevel'])});
}
export function createProductionSourceReader(db:PublicCompleteItemMaster){
  const release=db.release,s=release.sourceFilesSha256;
  const schemaVerified=release.target.platform==='Steam'&&release.sourceIl2cppDumpSha256===DUMP;
  let indexTask:Promise<Readonly<{available:ReadonlySet<string>;activity:boolean;seed:boolean}>>|undefined;
  function index(){
    if(!indexTask){
      const task=(async()=>{
        const available=new Set((await db.getFieldCatalog()).map(f=>f.field));
        const common=available.has('sourceClass')&&available.has('acquisition.nativeCandidates');
        return {available,activity:schemaVerified&&s?.ActivityData===ACTIVITY&&common&&
          ['source.Result.ItemID','source.Location','source.Locations','source.Rarity','source.Amount','source.MinMax'].every(f=>available.has(f)),
          seed:schemaVerified&&s?.ActivityItem===ITEMS&&common&&['source.ProducedItemID','source.ProducesItem','source.ProducedAmount','source.GrowthPeriod','source.ProductionPeriod'].every(f=>available.has(f))};
      })();
      indexTask=task;void task.catch(()=>{if(indexTask===task)indexTask=undefined;});
    }
    return indexTask;
  }
  async function getForSeeds(seedIds:readonly number[]){
    input(seedIds);const {available,seed:known}=await index();
    const rows=await db.getItemFields(seedIds,known?['sourceClass',...seedFields.filter(f=>available.has(f))]:['itemId']);
    return Object.freeze(rows.map(r=>r===null?null:Object.freeze({itemId:r.itemId,
      status:!known?'not_indexed' as const:r.values.sourceClass==='SeedItemData'?'indexed' as const:'not_seed' as const,
      definition:known&&r.values.sourceClass==='SeedItemData'?seed(r.itemId,r.values):null,currentAvailabilityVerified:false as const})));
  }
  async function getForItems(itemIds:readonly number[]):Promise<readonly (Readonly<ProductionItemEvidence>|null)[]>{
    input(itemIds);const {available,activity,seed:seeds}=await index();
    const activityStatus=activity?'indexed' as const:'not_indexed' as const;
    const seedStatus=seeds?'indexed' as const:'not_indexed' as const;
    if(!activity&&!seeds)return Object.freeze((await db.getItemFields(itemIds,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,activityStatus,seedStatus,sources:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    const incoming=await db.getNativeAcquisitionCandidates(itemIds);
    const groups=incoming.map(r=>r===null?null:[...new Set(r.filter(e=>activity&&e[1]==='activity_result'&&e[2]==='source.Result.ItemID'||
      seeds&&e[1]==='produced_item'&&e[2]==='source.ProducedItemID').map(e=>e[0]))].sort((a,b)=>a-b));
    const sourceIds=[...new Set(groups.flatMap(r=>r??[]))].sort((a,b)=>a-b);
    const fields=['sourceClass',...new Set([...(activity?activityFields:[]),...(seeds?seedFields:[])])].filter(f=>available.has(f));
    const definitions=new Map<number,Readonly<ProductionSourceDefinition>>();
    for(let i=0;i<sourceIds.length;i+=10000){
      for(const r of await db.getItemFields(sourceIds.slice(i,i+10000),fields)){
        if(!r)continue;
        const v=r.values;
        if(activity&&v.sourceClass==='MiningDataItemData')definitions.set(r.itemId,mining(r.itemId,v));
        if(activity&&v.sourceClass==='TimeBendingDataItemData')definitions.set(r.itemId,timebending(r.itemId,v));
        if(seeds&&v.sourceClass==='SeedItemData')definitions.set(r.itemId,seed(r.itemId,v));
      }
    }
    return Object.freeze(groups.map((g,i)=>g===null?null:Object.freeze({itemId:itemIds[i],activityStatus,seedStatus,
      sources:Object.freeze(g.flatMap(id=>{
        const def=definitions.get(id);if(!def)return [];
        check(def.resultItemId===itemIds[i],'RESULT_JOIN');
        return [def];
      })),currentAvailabilityVerified:false as const})));
  }
  return Object.freeze({release,getForItems,getForSeeds});
}
