/** Source-condition evidence for character preference pools.
 * A predicate match is NOT pool membership or a daily favorite prediction.
 * Uses selected columns from the existing immutable canonical Item DB.
 */
import type {PublicCompleteItemMaster,ItemFieldValue,ItemFieldProjection} from './public-item-master.ts';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function check(v:unknown,code:string):asserts v{if(!v)throw new TypeError('DB01_PREFERENCE_EVIDENCE_'+code);}
const groups=['FavoriteFlowers','FavoriteMeals','FavoriteIngredients','FavoriteMinerals','FavoriteCraftingMaterials'] as const;
export type PreferenceRuleGroup=typeof groups[number];
const PREF='07690a024240d6040de3d9bf087f0c05d4c1dc5dcf0dd5bec59db6ee2004d948';
const ITEMS='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const TAGS='bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
export interface PreferencePredicateEvidence {
  readonly polarity:'include'|'exclude';
  readonly field:string;
  readonly configured:ItemFieldValue;
  readonly evidenceKind:'explicit_item'|'direct_tag'|'source_scalar'|'recorded_meal_state_required'|'unresolved';
  /** Presence/overlap of the configured value, never native filter membership. */
  readonly match:boolean|null;
  readonly observed:ItemFieldValue|null;
}
export interface PreferenceRuleEvidence {
  readonly group:PreferenceRuleGroup;
  readonly inclusionMode:'all'|'custom'|'unset'|'unresolved';
  readonly predicates:readonly Readonly<PreferencePredicateEvidence>[];
  readonly original:Obj;
  readonly nativeMembershipVerified:false;
  readonly dailySelectionVerified:false;
}
function list(v:unknown):readonly number[]|null{
  return Array.isArray(v)&&v.every(int)?v:null;
}
function overlap(configured:ItemFieldValue,observed:readonly number[]|null):boolean|null{
  const wanted=list(configured);
  return wanted&&observed?wanted.some(v=>observed.includes(v)):null;
}
const candidateFields=['sourceClass','tags','source.MealType','source.CookingIngredientType','source.Rarity','source.IsShiny'];
const ingredientClasses=new Set(['CropItemData','FishItemData','IngredientItemData']);
export function readPreferenceRuleEvidence(group:PreferenceRuleGroup,raw:unknown,item:Readonly<ItemFieldProjection>):Readonly<PreferenceRuleEvidence>{
  check(groups.includes(group)&&obj(raw)&&obj(raw.Inclusions)&&obj(raw.Exclusions),'RULE');
  const inc=raw.Inclusions,exc=raw.Exclusions,keys=Object.keys(inc);
  const inclusionMode:PreferenceRuleEvidence['inclusionMode']=keys.length===0?'unset':
    keys.length===1&&obj(inc.All)?'all':keys.length===1&&obj(inc.Custom)?'custom':'unresolved';
  const v=item.values,cls=v.sourceClass;
  const tagValues=v.tags;
  const tags=Array.isArray(tagValues)&&tagValues.every(t=>obj(t)&&id(t.id))?
    tagValues.map(t=>(t as Obj).id as number):null;
  function evidence(polarity:PreferencePredicateEvidence['polarity'],field:string,configured:ItemFieldValue):Readonly<PreferencePredicateEvidence>{
    let evidenceKind:PreferencePredicateEvidence['evidenceKind']='unresolved',match:boolean|null=null,observed:ItemFieldValue|null=null;
    if(field==='SpecificItems'){
      evidenceKind='explicit_item';observed=item.itemId;match=overlap(configured,[item.itemId]);
    }else if(field==='DominantColor'||field==='IngredientTags'){
      evidenceKind='direct_tag';observed=tags;match=overlap(configured,tags);
    }else if(field==='ContainsIngredients'&&group==='FavoriteMeals'){
      // Recipe definitions cannot establish an actual meal instance's ingredients.
      evidenceKind='recorded_meal_state_required';
    }else if(field==='MealType'&&group==='FavoriteMeals'){
      evidenceKind='source_scalar';const x=v['source.MealType'];
      if(cls==='MealItemData'&&id(x)){observed=x;match=overlap(configured,[x]);}
    }else if(field==='IngredientType'&&group==='FavoriteIngredients'){
      evidenceKind='source_scalar';const x=v['source.CookingIngredientType'];
      if(typeof cls==='string'&&ingredientClasses.has(cls)&&id(x)){observed=x;match=overlap(configured,[x]);}
    }else if(field==='Rarity'&&group==='FavoriteFlowers'){
      evidenceKind='source_scalar';const x=v['source.Rarity'];
      if(cls==='FlowerItemData'&&int(x)){observed=x;match=overlap(configured,[x]);}
    }else if(field==='Shiny'&&group==='FavoriteMinerals'){
      evidenceKind='source_scalar';const x=v['source.IsShiny'];
      if(cls==='MineralItemData'&&typeof x==='boolean'&&typeof configured==='boolean'){observed=x;match=x===configured;}
    }
    return Object.freeze({polarity,field,configured,evidenceKind,match,observed});
  }
  const predicates:Readonly<PreferencePredicateEvidence>[]=[];
  if(inclusionMode==='custom'&&obj(inc.Custom))for(const [field,value] of Object.entries(inc.Custom))predicates.push(evidence('include',field,value));
  else if(inclusionMode==='unresolved')for(const [field,value] of Object.entries(inc))predicates.push(Object.freeze({polarity:'include',field,configured:value,evidenceKind:'unresolved',match:null,observed:null}));
  for(const [field,value] of Object.entries(exc))predicates.push(evidence('exclude',field,value));
  return Object.freeze({group,inclusionMode,predicates:Object.freeze(predicates),original:raw,nativeMembershipVerified:false,dailySelectionVerified:false});
}
export interface PreferencePoolEvidenceResult {
  readonly poolItemId:number;
  readonly status:'indexed'|'not_indexed'|'not_pool';
  readonly items:readonly (Readonly<{itemId:number;rules:readonly Readonly<PreferenceRuleEvidence>[]}>|null)[];
}
/** Ordered pool/item matrix for a bounded selection; no whole item catalog,
 * no duplicate database, no inferred rule combination or random weighting. */
export function createPreferenceRuleEvidenceReader(db:PublicCompleteItemMaster){
  const release=db.release,s=release.sourceFilesSha256;
  const pinned=release.target.platform==='Steam'&&release.sourceIl2cppDumpSha256===DUMP&&s?.Preference===PREF&&s?.ActivityItem===ITEMS&&s?.Tag===TAGS;
  async function getForPools(poolIds:readonly number[],itemIds:readonly number[]):Promise<readonly (Readonly<PreferencePoolEvidenceResult>|null)[]>{
    check(Array.isArray(poolIds)&&Array.isArray(itemIds)&&poolIds.length<=10000&&itemIds.length<=10000&&poolIds.every(id)&&itemIds.every(id)&&poolIds.length*itemIds.length<=10000,'IDS');
    const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
    const ruleFields=groups.map(g=>'source.'+g);
    const indexed=pinned&&['sourceClass',...ruleFields,...candidateFields].every(f=>fields.has(f));
    const [pools,items]=await Promise.all([
      db.getItemFields(poolIds,indexed?['sourceClass',...ruleFields]:['itemId']),
      db.getItemFields(itemIds,indexed?candidateFields:['itemId'])
    ]);
    return Object.freeze(pools.map(pool=>{
      if(!pool)return null;
      const status:PreferencePoolEvidenceResult['status']=!indexed?'not_indexed':pool.values.sourceClass==='PreferencePoolItemData'?'indexed':'not_pool';
      return Object.freeze({poolItemId:pool.itemId,status,items:Object.freeze(items.map(item=>item?Object.freeze({
        itemId:item.itemId,rules:Object.freeze(status==='indexed'?groups.map(g=>readPreferenceRuleEvidence(g,pool.values['source.'+g],item)):[])
      }):null))});
    }));
  }
  return Object.freeze({release,getForPools});
}
