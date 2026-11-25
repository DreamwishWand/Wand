/** Shared source-definition evidence for ingredient selectors and fishing.
 * Uses only requested rows of the current pinned Item DB. No recipe is
 * treated as the recorded ingredients of an actual meal instance.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';

type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const classes=new Set(['CropItemData','FishItemData','IngredientItemData']);
function check(v:unknown,why:string):asserts v{if(!v)throw new TypeError('DB01_ACTIVITY_EVIDENCE_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
const ACTIVITY='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296';
const ITEMS='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const TAGS='bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
export type IngredientReferenceKind='ingredient_item'|'cooking_type'|'unresolved';
export interface CookingIngredientReference {
  readonly referenceId:number;
  readonly kind:IngredientReferenceKind;
}
export interface IngredientDefinitionEvidence {
  readonly itemId:number;
  readonly status:'source_definition'|'recorded_meal_ingredients_required'|'not_cooking_ingredient'|'not_indexed';
  readonly cookingIngredientTypeId:number|null;
  readonly referenceMatches:readonly Readonly<{reference:CookingIngredientReference;matches:boolean|null}>[];
  readonly nativeFilterVerified:false;
}
export interface FishingDefinitionEvidence {
  readonly activityItemId:number;
  readonly resultItemId:number;
  /** Native enum default Trash is zero; retain original presence. */
  readonly rarityCode:number;
  readonly rarityFieldPresent:boolean;
  readonly villageAreaCodes:readonly number[];
  readonly locationsFieldPresent:boolean;
  readonly hiddenField:boolean|null;
  readonly fishingTypeCode:number|null;
  readonly weightPercentage:number|null;
  readonly conditions:ItemFieldValue|null;
  readonly specificTimeOfDay:boolean|null;
  readonly timeOfDays:ItemFieldValue|null;
  readonly specificWeather:boolean|null;
  readonly weathers:ItemFieldValue|null;
}
export interface FishingItemEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly sources:readonly Readonly<FishingDefinitionEvidence>[];
  readonly currentAvailabilityVerified:false;
}
type OptionalSelector=Readonly<{status:'inactive'|'explicit'|'unresolved';codes:readonly number[]}>;
function optional(raw:unknown,kind:'location'|'rarity'):OptionalSelector{
  if(raw===undefined)return Object.freeze({status:'inactive',codes:Object.freeze([])});
  check(obj(raw)&&(raw.UseField===undefined||typeof raw.UseField==='boolean'),'OPTIONAL');
  if(raw.UseField!==true)return Object.freeze({status:'inactive',codes:Object.freeze([])});
  const single=kind==='location'?'VillageArea':'FishRarity';
  const plural=kind==='location'?'VillageAreas':'FishRarities';
  const key=kind==='location'?'AreaList':'FishRarities';
  const list=raw[plural],value=raw[single];
  const codes=raw.Random===true?null:nonnegative(value)&&list===undefined?[value]:
    value===undefined&&obj(list)&&Array.isArray(list[key])&&list[key].length>0&&list[key].every(nonnegative)?[...list[key]] as number[]:null;
  return Object.freeze({status:codes?'explicit':'unresolved',codes:Object.freeze(codes??[])});
}
export function readFishingFilterFacts(raw:unknown){
  check(obj(raw),'FILTER');
  return Object.freeze({location:optional(raw.FishLocation,'location'),rarity:optional(raw.FishRarity,'rarity')});
}
export function createCurrentActivityEvidenceReader(db:PublicCompleteItemMaster){
  const release=db.release,source=release.sourceFilesSha256;
  const verified=release.target.platform==='Steam'&&release.sourceIl2cppDumpSha256===DUMP;
  const fishingVerified=verified&&source?.ActivityData===ACTIVITY;
  const ingredientVerified=verified&&source?.ActivityItem===ITEMS&&source?.Tag===TAGS;
  const catalog=()=>db.getFieldCatalog().then(rows=>new Set(rows.map(r=>r.field)));
  async function getIngredientDefinitionEvidence(itemIds:readonly number[],referenceIds:readonly number[]){
    input(itemIds);input(referenceIds);
    const available=await catalog();
    const indexed=ingredientVerified&&['sourceClass','nativeCategory','itemType.subtypeCode','source.CookingIngredientType'].every(f=>available.has(f));
    const refs=indexed?await db.getItemFields(referenceIds,['sourceClass','nativeCategory','itemType.subtypeCode']):[];
    const references=Object.freeze(referenceIds.map((referenceId,i):Readonly<CookingIngredientReference>=>{
      const r=refs[i]?.values,kind:IngredientReferenceKind=typeof r?.sourceClass==='string'&&classes.has(r.sourceClass)?'ingredient_item':
        r?.nativeCategory==='Tag'&&r['itemType.subtypeCode']===14?'cooking_type':'unresolved';
      return Object.freeze({referenceId,kind});
    }));
    const rows=await db.getItemFields(itemIds,indexed?['sourceClass','source.CookingIngredientType']:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const cls=r.values.sourceClass,rawType=r.values['source.CookingIngredientType'];
      const ingredient=typeof cls==='string'&&classes.has(cls);
      const status:IngredientDefinitionEvidence['status']=!indexed?'not_indexed':
        cls==='MealItemData'?'recorded_meal_ingredients_required':ingredient?'source_definition':'not_cooking_ingredient';
      const cookingIngredientTypeId=ingredient&&id(rawType)?rawType:null;
      const referenceMatches=references.map(reference=>Object.freeze({reference,
        matches:status!=='source_definition'||reference.kind==='unresolved'?null:
          reference.kind==='ingredient_item'?reference.referenceId===r.itemId:
          cookingIngredientTypeId===null?null:cookingIngredientTypeId===reference.referenceId}));
      return Object.freeze({itemId:r.itemId,status,cookingIngredientTypeId,referenceMatches:Object.freeze(referenceMatches),
        nativeFilterVerified:false as const});
    }));
  }
  async function getFishingSources(itemIds:readonly number[]):Promise<readonly (Readonly<FishingItemEvidence>|null)[]>{
    input(itemIds);
    const fields=['sourceClass','source.Result.ItemID','source.Rarity','source.Locations','source.IsHidden',
      'source.FishingType','source.WeightPercentage','source.Conditions','source.SpecificTimeOfDay',
      'source.TimeOfDays','source.SpecificWeather','source.Weathers'];
    const available=await catalog();
    const indexed=fishingVerified&&['acquisition.nativeCandidates','sourceClass','source.Result.ItemID',
      'source.Rarity','source.Locations'].every(f=>available.has(f));
    if(!indexed){
      return Object.freeze((await db.getItemFields(itemIds,['itemId'])).map(r=>r?Object.freeze({itemId:r.itemId,
        status:'not_indexed' as const,sources:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    }
    const incoming=await db.getNativeAcquisitionCandidates(itemIds);
    const groups=incoming.map(r=>r===null?null:[...new Set(r.filter(e=>e[1]==='activity_result'&&e[2]==='source.Result.ItemID').map(e=>e[0]))].sort((a,b)=>a-b));
    const sourceIds=[...new Set(groups.flatMap(r=>r??[]))].sort((a,b)=>a-b);
    const definitions=new Map<number,Readonly<FishingDefinitionEvidence>>();
    for(let start=0;start<sourceIds.length;start+=10000){
      const rows=await db.getItemFields(sourceIds.slice(start,start+10000),fields.filter(f=>available.has(f)));
      for(const r of rows){
        if(!r||r.values.sourceClass!=='FishingDataItemData')continue;
        const v=r.values,result=v['source.Result.ItemID'],rarity=v['source.Rarity'],locations=v['source.Locations'];
        check(id(result)&&(rarity===undefined||nonnegative(rarity)&&rarity<=4)&&
          (locations===undefined||Array.isArray(locations)&&locations.every(nonnegative)),'FISHING_DEFINITION');
        const num=(key:string)=>nonnegative(v[key])?v[key] as number:null;
        const bool=(key:string)=>typeof v[key]==='boolean'?v[key] as boolean:null;
        definitions.set(r.itemId,Object.freeze({activityItemId:r.itemId,resultItemId:result,
          rarityCode:rarity??0,rarityFieldPresent:rarity!==undefined,
          villageAreaCodes:Object.freeze([...(locations as readonly number[]|undefined??[])]),
          locationsFieldPresent:locations!==undefined,hiddenField:bool('source.IsHidden'),
          fishingTypeCode:num('source.FishingType'),weightPercentage:num('source.WeightPercentage'),
          conditions:v['source.Conditions']??null,specificTimeOfDay:bool('source.SpecificTimeOfDay'),
          timeOfDays:v['source.TimeOfDays']??null,specificWeather:bool('source.SpecificWeather'),
          weathers:v['source.Weathers']??null}));
      }
    }
    return Object.freeze(groups.map((g,i)=>g===null?null:Object.freeze({itemId:itemIds[i],status:'indexed' as const,
      sources:Object.freeze(g.flatMap(sourceId=>{
        const r=definitions.get(sourceId);if(!r)return [];check(r.resultItemId===itemIds[i],'FISH_RESULT_JOIN');return [r];
      })),currentAvailabilityVerified:false as const})));
  }
  /** Match location AND rarity on the SAME source definition. A match is not
   * a verified catch, and a missing location is not a negative location proof. */
  async function getFishingFilterEvidence(itemIds:readonly number[],rawFilter:unknown){
    const facts=readFishingFilterFacts(rawFilter),rows=await getFishingSources(itemIds);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const matches=r.sources.map(source=>{
        const locationMatch=facts.location.status==='inactive'?true:facts.location.status==='unresolved'||
          !source.villageAreaCodes.length?null:source.villageAreaCodes.some(x=>facts.location.codes.includes(x));
        const rarityMatch=facts.rarity.status==='inactive'?true:facts.rarity.status==='unresolved'?null:
          facts.rarity.codes.includes(source.rarityCode);
        const both=locationMatch===false||rarityMatch===false?false:locationMatch===true&&rarityMatch===true?true:null;
        return Object.freeze({source,locationMatch,rarityMatch,reviewedSourceMatch:both});
      });
      return Object.freeze({itemId:r.itemId,status:r.status,facts,matches:Object.freeze(matches),
        matchingSourceIds:Object.freeze(matches.filter(m=>m.reviewedSourceMatch===true).map(m=>m.source.activityItemId)),
        nativeFilterVerified:false as const,currentAvailabilityVerified:false as const});
    }));
  }
  return Object.freeze({release,getIngredientDefinitionEvidence,getFishingSources,getFishingFilterEvidence});
}
