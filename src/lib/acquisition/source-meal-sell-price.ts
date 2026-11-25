/** Steam 1.26.2 native ordered ingredient-slot consumption.
 * The game adjusts matched occurrences, not all ingredients, and removes
 * one slot after each match. This source-snapshot estimate is NOT a sale quote.
 */
import type {PublicCompleteItemMaster,OriginalItemPriceFacts} from '../items/public-item-master.ts';

const PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const DUMP_SHA='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const PERCENT=Object.freeze([120,130,140,150,160]);
const CLASSES=new Set(['CropItemData','FishItemData','IngredientItemData']);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(ok:unknown,code:string):asserts ok {if(!ok)throw new TypeError('DB01_MEAL_PRICE_'+code);}
export type MealSlot = Readonly<{kind:'fixed';id:number}> | Readonly<{kind:'type';id:number}> |
  Readonly<{kind:'alternatives';ids:readonly number[]}> | Readonly<{kind:'all_tags';ids:readonly number[]}>;
export interface MealIngredientFacts {
  readonly itemId:number;
  readonly knownCookingClass:boolean;
  readonly cookingTypeId:number|null;
  readonly directTagIds:readonly number[]|null;
  /** Explicit source-snapshot assumption; generic callers default to unknown. */
  readonly assumeDirectTagMembershipComplete?:boolean;
}
export interface MealSlotMatch {
  readonly itemId:number;
  readonly recipeSlotIndex:number|null;
  readonly adjusted:boolean|null;
}
function parseSlot(v:unknown):MealSlot {
  check(object(v)&&Object.keys(v).length===1,'SLOT');
  if(id(v.ItemID))return {kind:'fixed',id:v.ItemID};
  if(id(v.Any))return {kind:'type',id:v.Any};
  for(const [key,kind] of [['ValidItemsList','alternatives'],['TagsList','all_tags']] as const){
    if(!Object.hasOwn(v,key))continue;
    const entry=v[key];
    check(object(entry)&&Array.isArray(entry.List)&&entry.List.length>0&&entry.List.every(id),'SLOT_LIST');
    return {kind,ids:Object.freeze([...entry.List])};
  }
  throw new TypeError('DB01_MEAL_PRICE_UNKNOWN_SLOT');
}
/** Negative tag membership is left unknown: native HasTag has a fallback
 * branch beyond direct Tags, so a missing direct tag is not a proof. */
function matches(slot:MealSlot,ingredient:MealIngredientFacts):boolean|null {
  if(!ingredient.knownCookingClass)return null;
  if(slot.kind==='fixed')return slot.id===ingredient.itemId;
  if(slot.kind==='type')return ingredient.cookingTypeId===null?null:slot.id===ingredient.cookingTypeId;
  if(slot.kind==='alternatives')return slot.ids.includes(ingredient.itemId);
  if(!ingredient.directTagIds)return null;
  if(slot.ids.every(v=>ingredient.directTagIds!.includes(v)))return true;
  return ingredient.assumeDirectTagMembershipComplete===true?false:null;
}
export function matchNativeMealSlots(slots:readonly MealSlot[],ingredients:readonly MealIngredientFacts[]):readonly MealSlotMatch[] {
  check(Array.isArray(slots)&&slots.length<=32&&Array.isArray(ingredients)&&ingredients.length<=32,'LIMIT');
  // Enumerable.OrderBy(false for ItemID, true otherwise), stable within each group.
  const remaining=slots.map((slot,index)=>({slot,index})).sort((a,b)=>Number(a.slot.kind!=='fixed')-Number(b.slot.kind!=='fixed'));
  let unresolved=false;
  return Object.freeze(ingredients.map(ingredient=>{
    check(id(ingredient.itemId),'INGREDIENT_ID');
    if(unresolved)return Object.freeze({itemId:ingredient.itemId,recipeSlotIndex:null,adjusted:null});
    for(let i=0;i<remaining.length;i++){
      const matched=matches(remaining[i].slot,ingredient);
      if(matched===null){
        // An earlier unknown predicate might consume a slot and alter every subsequent match.
        unresolved=true;return Object.freeze({itemId:ingredient.itemId,recipeSlotIndex:null,adjusted:null});
      }
      if(matched){const [slot]=remaining.splice(i,1);return Object.freeze({itemId:ingredient.itemId,recipeSlotIndex:slot.index,adjusted:true});}
    }
    return Object.freeze({itemId:ingredient.itemId,recipeSlotIndex:null,adjusted:false});
  }));
}
export interface MealPriceComponent extends MealSlotMatch {
  readonly sourceUnitSellAmount:number|null;
  readonly conditionalUnitSellAmount:number|null;
  readonly priceSource:'explicit_source_amount'|'native_default_if_lookup_fails'|'native_omitted_amount_if_provider_selected'|'unknown';
  readonly conditionalContribution:number|null;
}
export interface SourceMealPriceEstimate {
  readonly mealItemId:number;
  readonly recipeItemId:number;
  readonly starRating:number;
  readonly ingredientPercentage:number;
  readonly ingredients:readonly MealPriceComponent[];
  readonly sourceSnapshotEstimate:number|null;
  readonly actualSellPrice:null;
  readonly runtimePriceVerified:false;
  readonly runtimeProviderSelectionVerified:false;
  readonly nativeSlotMatchingSteam1262:true;
  readonly recipeSelectedByCaller:true;
  readonly allNativeTagFallbacksResolved:false;
  readonly tagMatchingBasis:'original_direct_tags_only';
}
function sourceUnit(known:boolean,price:Readonly<OriginalItemPriceFacts>|null){
  if(!known||!price||price.status==='not_indexed')return {amount:null,conditional:null,kind:'unknown' as const};
  const cost=price.sellCosts.find(c=>c.currencyItemId===80000000);
  if(cost?.amountFieldPresent)return {amount:cost.amount,conditional:cost.amount,kind:'explicit_source_amount' as const};
  if(cost)return {amount:null,conditional:0,kind:'native_omitted_amount_if_provider_selected' as const};
  // Conditional on original provider snapshot being unchanged and no
  // additional runtime provider/calculator/formula succeeding.
  return {amount:null,conditional:1,kind:'native_default_if_lookup_fails' as const};
}
export interface SourceLowestMealSlot {
  readonly recipeSlotIndex:number;
  readonly slot:MealSlot;
  readonly status:'fixed'|'source_minimum'|'no_source_candidate'|'unresolved_selector';
  readonly candidateCount:number;
  readonly minimumUnitAmount:number|null;
  /** Ties are preserved, not assigned the game's unverified enumeration order. */
  readonly tiedItemIds:readonly number[];
}
export interface SourceLowestMealEstimate {
  readonly mealItemId:number;
  readonly recipeItemId:number;
  readonly slots:readonly SourceLowestMealSlot[];
  readonly selectedIngredientIds:readonly number[]|null;
  readonly estimate:Readonly<SourceMealPriceEstimate>|null;
  readonly actualSellPrice:null;
  readonly liveCandidateEnumerationVerified:false;
  readonly nativeTieOrderVerified:false;
  readonly nativeEmptyCandidateResultVerified:false;
}
const ACTIVITY_ITEM_SHA='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const ACTIVITY_DATA_SHA='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296';
const QUEST_TYPE=2001400015;
function checkLowestSource(db:PublicCompleteItemMaster){
  const release=db.release;
  check(release.target.platform==='Steam'&&release.target.gameVersion==='1.26.2'&&
    release.sourceIl2cppDumpSha256===DUMP_SHA&&release.sourceFilesSha256?.ActivityItem===ACTIVITY_ITEM_SHA&&
    release.sourceFilesSha256?.ActivityData===ACTIVITY_DATA_SHA&&
    release.originalPriceProjection?.sourceProtoDbSha256===PROTO_SHA&&release.originalPriceProjection.dynamicCacheItems===8549,
    'LOWEST_SOURCE_VERSION');
}
/** Query only cooking recipes for a result. Multiple native definitions are
 * possible: leave selection to the caller instead of silently picking one. */
export async function getSourceMealRecipeIds(db:PublicCompleteItemMaster,mealItemId:number):Promise<readonly number[]>{
  check(id(mealItemId),'MEAL_ID');checkLowestSource(db);
  return db.findItemIdsByFields([
    {field:'sourceClass',anyOf:[{kind:'equals',value:'RecipeItemData'}]},
    {field:'source.ResultItemID',anyOf:[{kind:'equals',value:mealItemId}]}
  ]);
}
/** Source-only reconstruction for a meal without recorded ingredients.
 * Native iterator preserves repeated slots and caches the minimum tuple for
 * each Any selector. Its typed predicate excludes mission items except the
 * Quests type. Direct fixed IDs do not use this predicate.
 * TagsList uses all direct source tags. The original three cooking classes
 * do not implement IHasSet; native inherited-tag lookup is not asserted
 * for arbitrary types. Empty candidate sets remain unresolved.
 */
export async function estimateSourceLowestMealSellPrice(db:PublicCompleteItemMaster,mealItemId:number,recipeItemId:number):Promise<Readonly<SourceLowestMealEstimate>>{
  check(id(mealItemId)&&id(recipeItemId),'INPUT');checkLowestSource(db);
  const [meal,recipe]=await db.getItemFields([mealItemId,recipeItemId],
    ['sourceClass','source.StarRating','source.ResultItemID','source.Ingredients']);
  check(meal?.values.sourceClass==='MealItemData'&&recipe?.values.sourceClass==='RecipeItemData'&&recipe.values['source.ResultItemID']===mealItemId,'RECIPE_RESULT');
  const raw=recipe.values['source.Ingredients'];
  check(Array.isArray(raw)&&raw.length>0&&raw.length<=32,'RECIPE_SLOTS');
  const slots=raw.map(parseSlot);
  // Only the columns for eligible classes/type values are read. The source
  // snapshot has exactly 469 ICookingIngredient definitions (3 classes).
  const types=[...new Set(slots.flatMap(s=>s.kind==='type'?[s.id]:[]))];
  const fixed=slots.flatMap(s=>s.kind==='fixed'?[s.id]:s.kind==='alternatives'?[...s.ids]:[]);
  const hasTags=slots.some(s=>s.kind==='all_tags');
  const typeMembers=types.length?await db.findItemIdsByFields([
    {field:'sourceClass',anyOf:[...CLASSES].map(value=>({kind:'equals' as const,value}))},
    {field:'source.CookingIngredientType',anyOf:types.map(value=>({kind:'equals' as const,value}))}
  ]):[];
  const tagMembers=hasTags?await db.findItemIdsByField('sourceClass',{kind:'equals',value:'CropItemData'}):[];
  const allTagMembers=hasTags?await db.findItemIdsByFields([{field:'sourceClass',anyOf:[...CLASSES].map(value=>({kind:'equals' as const,value}))}]):[];
  if(hasTags)check(allTagMembers.length===469&&tagMembers.length===165,'TAG_CLASS_CENSUS');
  const ids=[...new Set([...fixed,...typeMembers,...allTagMembers])].sort((a,b)=>a-b);
  const [rows,prices]=await Promise.all([
    db.getItemFields(ids,hasTags?['sourceClass','source.CookingIngredientType','source.IsMissionItem','tags']:['sourceClass','source.CookingIngredientType','source.IsMissionItem']),
    db.getOriginalItemPrices(ids)
  ]);
  const byId=new Map(ids.map((itemId,i)=>{
    const row=rows[i],cls=row?.values.sourceClass,type=row?.values['source.CookingIngredientType'],mission=row?.values['source.IsMissionItem'];
    const known=typeof cls==='string'&&CLASSES.has(cls);
    // The original protobuf bool field defaults to false in these 3 classes.
    check(!known||mission===undefined||typeof mission==='boolean','MISSION_FIELD');
    const tags=row?.values.tags;
    if(hasTags&&known)check(Array.isArray(tags)&&tags.every(t=>object(t)&&id(t.id)),'TAG_FIELD');
    return [itemId,{known,type,mission:mission===true,unit:sourceUnit(known,prices[i]).conditional,
      directTags:Array.isArray(tags)?tags.filter(t=>object(t)&&id(t.id)).map(t=>(t as {id:number}).id):[]}] as const;
  }));
  const chosen:number[]=[];
  const facts:SourceLowestMealSlot[]=slots.map((slot,recipeSlotIndex)=>{
    const make=(status:SourceLowestMealSlot['status'],candidates:readonly number[],min:number|null,ties:readonly number[]):SourceLowestMealSlot=>
      Object.freeze({recipeSlotIndex,slot,status,candidateCount:candidates.length,minimumUnitAmount:min,tiedItemIds:Object.freeze([...ties])});
    const candidates=slot.kind==='fixed'?[slot.id]:slot.kind==='alternatives'?slot.ids.filter(i=>byId.get(i)?.known):
      slot.kind==='all_tags'?allTagMembers.filter(i=>{const r=byId.get(i);return r?.known&&slot.ids.every(t=>r.directTags.includes(t));}):
      typeMembers.filter(i=>{const r=byId.get(i);return r?.known&&r.type===slot.id&&(!r.mission||slot.id===QUEST_TYPE);});
    if(!candidates.length)return make('no_source_candidate',[],null,[]);
    const values=candidates.map(i=>({id:i,value:byId.get(i)?.unit??null}));
    if(values.some(v=>v.value===null))return make('unresolved_selector',candidates,null,[]);
    const min=Math.min(...values.map(v=>v.value!));
    const tied=values.filter(v=>v.value===min).map(v=>v.id).sort((a,b)=>a-b);
    // Deterministic representative for the calculation, not the native
    // tie order. For fixed/type-only recipes all selected slots are matched.
    chosen.push(tied[0]);
    return make(slot.kind==='fixed'?'fixed':'source_minimum',candidates,min,tied);
  });
  // There are no alternative-list slots in the authenticated source recipe
  // set. Preserve the existing boundary for hypothetical overlaps.
  const complete=chosen.length===slots.length&&slots.every(s=>s.kind!=='alternatives');
  const estimate=complete?await estimateSourceMealSellPrice(db,mealItemId,recipeItemId,chosen):null;
  return Object.freeze({mealItemId,recipeItemId,slots:Object.freeze(facts),
    selectedIngredientIds:complete?Object.freeze(chosen):null,estimate,actualSellPrice:null,
    liveCandidateEnumerationVerified:false,nativeTieOrderVerified:false,nativeEmptyCandidateResultVerified:false});
}
/** Only for recorded or user-supplied ordered ingredients and an explicitly
 * selected recipe. Does not guess GetLowestIngredients or live recipe selection. */
export async function estimateSourceMealSellPrice(db:PublicCompleteItemMaster,mealItemId:number,recipeItemId:number,ingredientIds:readonly number[]):Promise<Readonly<SourceMealPriceEstimate>>{
  check(id(mealItemId)&&id(recipeItemId)&&Array.isArray(ingredientIds)&&ingredientIds.length>0&&ingredientIds.length<=32&&ingredientIds.every(id),'INPUT');
  const release=db.release;
  check(release.target.platform==='Steam'&&release.target.gameVersion==='1.26.2'&&
    release.sourceIl2cppDumpSha256===DUMP_SHA&&release.sourceFilesSha256?.ActivityItem===ACTIVITY_ITEM_SHA&&release.sourceFilesSha256?.ActivityData===ACTIVITY_DATA_SHA&&release.originalPriceProjection?.sourceProtoDbSha256===PROTO_SHA&&
    release.originalPriceProjection.dynamicCacheItems===8549,'SOURCE_VERSION');
  const [meal,recipe]=await db.getItemFields([mealItemId,recipeItemId],
    ['sourceClass','source.StarRating','source.ResultItemID','source.Ingredients']);
  const star=meal?.values['source.StarRating'];
  check(meal?.values.sourceClass==='MealItemData'&&typeof star==='number'&&Number.isInteger(star)&&star>=1&&star<=5,'MEAL');
  check(recipe?.values.sourceClass==='RecipeItemData'&&recipe.values['source.ResultItemID']===mealItemId,'RECIPE_RESULT');
  const raw=recipe.values['source.Ingredients'];
  check(Array.isArray(raw)&&raw.length<=32,'RECIPE_SLOTS');
  const slots=raw.map(parseSlot);
  const [members,prices]=await Promise.all([
    db.getItemFields(ingredientIds,['sourceClass','source.CookingIngredientType','tags']),
    db.getOriginalItemPrices(ingredientIds)
  ]);
  const facts=members.map((row,i):MealIngredientFacts=>{
    const cls=row?.values.sourceClass,type=row?.values['source.CookingIngredientType'],tags=row?.values.tags;
    return {itemId:ingredientIds[i],knownCookingClass:typeof cls==='string'&&CLASSES.has(cls),
      cookingTypeId:id(type)?type:null,
      assumeDirectTagMembershipComplete:typeof cls==='string'&&CLASSES.has(cls),
      directTagIds:Array.isArray(tags)&&tags.every(t=>object(t)&&id(t.id))?tags.map(t=> (t as {id:number}).id):null};
  });
  const percentage=PERCENT[star-1],matches=matchNativeMealSlots(slots,facts);
  let total=0,complete=true;
  const ingredients=matches.map((match,i):MealPriceComponent=>{
    const price=sourceUnit(facts[i].knownCookingClass,prices[i]);
    const contribution=match.adjusted===null||price.conditional===null?null:
      match.adjusted?Math.trunc(Math.imul(price.conditional,percentage)/100):price.conditional;
    if(contribution===null)complete=false;else total=(total+contribution)|0;
    return Object.freeze({...match,sourceUnitSellAmount:price.amount,conditionalUnitSellAmount:price.conditional,
      priceSource:price.kind,conditionalContribution:contribution});
  });
  return Object.freeze({mealItemId,recipeItemId,starRating:star,ingredientPercentage:percentage,
    ingredients:Object.freeze(ingredients),sourceSnapshotEstimate:complete?total:null,actualSellPrice:null,
    runtimePriceVerified:false,runtimeProviderSelectionVerified:false,nativeSlotMatchingSteam1262:true,
    recipeSelectedByCaller:true,allNativeTagFallbacksResolved:false,tagMatchingBasis:'original_direct_tags_only'});
}
