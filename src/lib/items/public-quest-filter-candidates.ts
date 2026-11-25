/** Source-configured filter facts over the pinned canonical item master.
 * The direct-tag/definition tests are explicitly not the native runtime filter:
 * inherited tags, state, randomized selectors and unlock conditions can change it.
 */
import type {PublicCompleteItemMaster,ItemFieldValue,ItemFieldFilter} from './public-item-master.ts';
import {createCurrentActivityEvidenceReader,readFishingFilterFacts,type IngredientDefinitionEvidence} from './public-activity-evidence.ts';
import type {QuestObjectiveItemSelector} from './public-quest-objective-items.ts';
type FishingFilterEvidence=NonNullable<Awaited<ReturnType<ReturnType<typeof createCurrentActivityEvidenceReader>['getFishingFilterEvidence']>>[number]>;

type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const DUMP_SHA='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
function check(v:unknown,why:string):asserts v{if(!v)throw new TypeError('DB01_QUEST_FILTER_'+why);}
export interface QuestFilterFacts {
  readonly itemTypeCode:number;
  readonly activitySubtypeCode:number|null;
  readonly minimumMealStars:number|null;
  readonly tagCondition:'all'|'any'|'any_by_type';
  readonly directTagGroups:readonly Readonly<{tagTypeCode:number;tagIds:readonly number[];random:boolean}>[];
  readonly ingredientTypeReferences:readonly number[];
  readonly otherConfiguredFields:readonly string[];
  readonly originalFilter:Obj;
}
export interface QuestFilterCandidate {
  readonly itemId:number;
  readonly directTagMatch:boolean|null;
  readonly starRatingMatch:boolean|null;
  /** Match of only the reviewed source-definition predicates, never a live requirement. */
  readonly reviewedDefinitionMatch:boolean|null;
  /** Additional source evidence, not folded into native eligibility. */
  readonly ingredientEvidence:Readonly<IngredientDefinitionEvidence>|null;
  readonly fishingEvidence:Readonly<FishingFilterEvidence>|null;
}
export interface QuestFilterCandidateResult {
  readonly facts:Readonly<QuestFilterFacts>;
  readonly status:'source_definition_candidates'|'not_indexed';
  readonly candidates:readonly Readonly<QuestFilterCandidate>[];
  readonly directTagFallbackVerified:false;
  readonly nativeFilterVerified:false;
  readonly runtimeRequirementVerified:false;
}
export function readQuestFilterFacts(raw:unknown):Readonly<QuestFilterFacts>{
  check(obj(raw)&&int(raw.Type),'TYPE');
  check(raw.ActivityItemType===undefined||int(raw.ActivityItemType),'ACTIVITY_TYPE');
  const groups=raw.Tags??[];
  check(Array.isArray(groups),'TAG_GROUPS');
  const directTagGroups=groups.map(g=>{
    check(obj(g)&&(g.TagType===undefined||int(g.TagType))&&(g.UseRandom===undefined||typeof g.UseRandom==='boolean'),'TAG_GROUP');
    const tags=g.Tags??[];
    check(Array.isArray(tags)&&tags.every(id),'TAG_IDS');
    return Object.freeze({tagTypeCode:g.TagType as number|undefined??0,tagIds:Object.freeze([...tags] as number[]),random:g.UseRandom===true});
  });
  const tagCode=raw.TagCondition??0;
  check(tagCode===0||tagCode===1||tagCode===2,'TAG_CONDITION');
  const ingredientTypes=raw.IngredientsType??[];
  check(Array.isArray(ingredientTypes)&&ingredientTypes.every(id),'INGREDIENT_TYPE_REFERENCES');
  const other=new Set<string>();
  const star=raw.MinMealStarRating;
  let minimumMealStars:number|null=null;
  if(star!==undefined){
    if(obj(star)&&Object.keys(star).length===1&&obj(star.Value)&&Object.keys(star.Value).every(k=>k==='Value')&&
      (star.Value.Value===undefined||int(star.Value.Value))){
      const n=star.Value.Value??0;
      if(typeof n==='number'&&n>0)minimumMealStars=n;
    }else if(!obj(star)||Object.keys(star).length)other.add('MinMealStarRating');
  }
  const simple=new Set(['Type','ActivityItemType','Tags','TagCondition','MinMealStarRating']);
  const optional=new Set(['Complexity','Mood','Sturdiness','Normality','FishLocation','FishRarity']);
  for(const [key,value] of Object.entries(raw)){
    if(simple.has(key))continue;
    if(optional.has(key)&&obj(value)&&(value.UseField===undefined||value.UseField===false))continue;
    if((key==='Item'||key==='ItemIngredient'||key==='MinUnlockLevel'||key==='MaxUnlockLevel')&&obj(value)&&!Object.keys(value).length)continue;
    if((key==='MinRarity'||key==='MaxRarity')&&obj(value)&&obj(value.Value)&&!Object.keys(value.Value).length&&Object.keys(value).length===1)continue;
    if(key==='IngredientsType'&&Array.isArray(value)&&!value.length)continue;
    if(value===false||value===0||value===''||Array.isArray(value)&&!value.length)continue;
    other.add(key);
  }
  if(directTagGroups.some(g=>g.random))other.add('Tags.UseRandom');
  return Object.freeze({itemTypeCode:raw.Type,activitySubtypeCode:raw.Type===3?(raw.ActivityItemType as number|undefined??0):null,
    minimumMealStars,tagCondition:tagCode===0?'all':tagCode===1?'any':'any_by_type',
    directTagGroups:Object.freeze(directTagGroups),ingredientTypeReferences:Object.freeze([...ingredientTypes] as number[]),
    otherConfiguredFields:Object.freeze([...other].sort()),originalFilter:raw});
}
function matchDirectTags(facts:QuestFilterFacts,tags:readonly number[]|null):boolean|null{
  const groups=facts.directTagGroups.filter(g=>g.tagIds.length);
  if(!groups.length)return true;
  if(!tags||groups.some(g=>g.random))return null;
  const set=new Set(tags);
  if(facts.tagCondition==='all')return groups.every(g=>g.tagIds.every(t=>set.has(t)));
  if(facts.tagCondition==='any')return groups.some(g=>g.tagIds.some(t=>set.has(t)));
  const byType=new Map<number,number[]>();
  for(const g of groups){const t=byType.get(g.tagTypeCode)??[];t.push(...g.tagIds);byType.set(g.tagTypeCode,t);}
  return [...byType.values()].every(g=>g.some(t=>set.has(t)));
}
export function createQuestFilterCandidateReader(db:PublicCompleteItemMaster){
  const verified=db.release.target.platform==='Steam'&&db.release.sourceFilesSha256?.Mission===MISSION_SHA&&
    db.release.sourceIl2cppDumpSha256===DUMP_SHA;
  const activity=createCurrentActivityEvidenceReader(db);
  type PoolRow={itemId:number;tagIds:readonly number[]|null;stars:number|null};
  const pools=new Map<string,Promise<readonly PoolRow[]>>();
  function pool(type:number,subtype:number|null){
    const key=type+':'+subtype;
    const cached=pools.get(key);if(cached)return cached;
    const task=(async()=>{
      const filters:ItemFieldFilter[]=[{field:'itemType.code',anyOf:[{kind:'equals',value:type}]}];
      if(subtype!==null)filters.push({field:'itemType.subtypeCode',anyOf:[{kind:'equals',value:subtype}]});
      const ids=await db.findItemIdsByFields(filters);
      const rows:PoolRow[]=[];
      for(let i=0;i<ids.length;i+=10000){
        for(const r of await db.getItemFields(ids.slice(i,i+10000),['tags','source.StarRating'])){
          if(!r)continue;
          const raw=r.values.tags;
          const tags=Array.isArray(raw)&&raw.every(t=>obj(t)&&id(t.id))?raw.map(t=>(t as Obj).id as number):null;
          const stars=r.values['source.StarRating'];
          rows.push({itemId:r.itemId,tagIds:tags,stars:int(stars)?stars:null});
        }
      }
      return Object.freeze(rows);
    })();
    pools.set(key,task);void task.catch(()=>{if(pools.get(key)===task)pools.delete(key);});
    return task;
  }
  async function resolve(raw:unknown):Promise<Readonly<QuestFilterCandidateResult>>{
    const facts=readQuestFilterFacts(raw);
    const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
    const indexed=verified&&['itemType.code','itemType.subtypeCode','tags','source.StarRating'].every(f=>catalog.has(f));
    const rows=indexed?await pool(facts.itemTypeCode,facts.activitySubtypeCode):[];
    const fishingFacts=readFishingFilterFacts(raw);
    const useFishing=fishingFacts.location.status!=='inactive'||fishingFacts.rarity.status!=='inactive';
    const useIngredients=facts.ingredientTypeReferences.length>0;
    const ingredientRows=new Map<number,Readonly<IngredientDefinitionEvidence>>();
    const fishingRows=new Map<number,Readonly<FishingFilterEvidence>>();
    for(let start=0;start<rows.length&&(useIngredients||useFishing);start+=10000){
      const ids=rows.slice(start,start+10000).map(r=>r.itemId);
      const [ingredients,fishing]=await Promise.all([
        useIngredients?activity.getIngredientDefinitionEvidence(ids,facts.ingredientTypeReferences):[],
        useFishing?activity.getFishingFilterEvidence(ids,raw):[]
      ]);
      for(const row of ingredients)if(row)ingredientRows.set(row.itemId,row);
      for(const row of fishing)if(row)fishingRows.set(row.itemId,row);
    }
    const candidates=rows.map(r=>{
      const directTagMatch=matchDirectTags(facts,r.tagIds);
      const starRatingMatch=facts.minimumMealStars===null?true:r.stars===null?null:r.stars>=facts.minimumMealStars;
      // A direct-tag non-match is NOT proof of native exclusion. Do not
      // discard any type-matched item from the source pool on that basis.
      const reviewedDefinitionMatch=directTagMatch===false||starRatingMatch===false?false:
        directTagMatch===true&&starRatingMatch===true?true:null;
      return Object.freeze({itemId:r.itemId,directTagMatch,starRatingMatch,reviewedDefinitionMatch,
        ingredientEvidence:ingredientRows.get(r.itemId)??null,fishingEvidence:fishingRows.get(r.itemId)??null});
    });
    return Object.freeze({facts,status:indexed?'source_definition_candidates' as const:'not_indexed' as const,
      candidates:Object.freeze(candidates),directTagFallbackVerified:false as const,nativeFilterVerified:false as const,
      runtimeRequirementVerified:false as const});
  }
  async function resolveObjectiveSelector(selector:Readonly<QuestObjectiveItemSelector>){
    check(selector.selectorMode==='FilterGenerator','OBJECTIVE_FILTER_REQUIRED');
    const raw=selector.originalSelector;
    const inner=raw.ItemToGive;
    const filter=raw.FilterGenerator??(obj(inner)?inner.FilterGenerator:undefined);
    check(obj(filter),'OBJECTIVE_FILTER');
    return resolve(filter);
  }
  return Object.freeze({release:db.release,resolve,resolveObjectiveSelector});
}
