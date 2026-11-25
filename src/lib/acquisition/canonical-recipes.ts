/** Recipe projection over the current canonical Item database, not the legacy
 * standalone recipe sidecar. All quantities, ordered slots and result state
 * are original configuration; no unlock or runtime eligibility is inferred.
 */
import type {PublicCompleteItemMaster,ItemFieldValue,ItemFieldProjection} from '../items/public-item-master.ts';

export type CanonicalRecipeKind='cooking'|'crafting';
export type CanonicalRecipeIngredient=
  Readonly<{kind:'item';itemId:number;quantity:number}>|
  Readonly<{kind:'ingredient_type';tagId:number;quantity:1}>|
  Readonly<{kind:'item_alternatives';itemIds:readonly number[];quantity:1}>|
  Readonly<{kind:'all_tags';tagIds:readonly number[];quantity:1}>;
export interface CanonicalRecipe {
  readonly recipeId:number;
  readonly kind:CanonicalRecipeKind;
  readonly resultItemId:number;
  readonly resultQuantity:number|null;
  readonly resultState:ItemFieldValue|null;
  readonly ingredients:readonly CanonicalRecipeIngredient[];
  readonly recipeTypeTagId:number|null;
  readonly maxIngredients:number|null;
  readonly appearWhen:ItemFieldValue|null;
  readonly sourceGameVersion:string;
  readonly unlockVerified:false;
  readonly availabilityVerified:false;
}
const cooking='RecipeItemData',crafting='CraftingRecipeItemData';
const id=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const object=(x:unknown):x is Readonly<Record<string,ItemFieldValue>>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function check(v:unknown,code:string):asserts v{if(!v)throw new TypeError('DB01_CANONICAL_RECIPE_'+code);}
const sourceFields=['sourceClass','source.ResultItemID','source.Result','source.Ingredients','source.RecipeType','source.MaxIngredients','source.AppearWhen'] as const;
function ingredient(v:ItemFieldValue,kind:CanonicalRecipeKind):CanonicalRecipeIngredient {
  check(object(v),'INGREDIENT');
  if(kind==='crafting'){
    check(id(v.ItemID)&&id(v.Amount)&&Object.keys(v).every(k=>k==='ItemID'||k==='Amount'),'CRAFT_INGREDIENT');
    return Object.freeze({kind:'item',itemId:v.ItemID,quantity:v.Amount});
  }
  check(Object.keys(v).length===1,'COOKING_SELECTOR');
  if(id(v.ItemID))return Object.freeze({kind:'item',itemId:v.ItemID,quantity:1});
  if(id(v.Any))return Object.freeze({kind:'ingredient_type',tagId:v.Any,quantity:1});
  const list=v.ValidItemsList??v.TagsList;
  check(object(list)&&Array.isArray(list.List)&&list.List.length>0&&list.List.every(id),'COOKING_LIST');
  const ids=Object.freeze([...list.List] as number[]);
  return v.ValidItemsList!==undefined?Object.freeze({kind:'item_alternatives',itemIds:ids,quantity:1}):
    Object.freeze({kind:'all_tags',tagIds:ids,quantity:1});
}
function decode(row:Readonly<ItemFieldProjection>|null,version:string):Readonly<CanonicalRecipe>|null{
  if(!row)return null;
  const v=row.values,cls=v.sourceClass;
  if(cls!==cooking&&cls!==crafting)return null;
  const kind=cls===cooking?'cooking':'crafting';
  const result=v['source.Result'];
  const resultId=kind==='cooking'?v['source.ResultItemID']:object(result)?result.ItemID:undefined;
  const resultQuantity=kind==='crafting'&&object(result)?result.Amount:null;
  check(id(resultId)&&(kind==='cooking'||id(resultQuantity)),'RESULT');
  const raw=v['source.Ingredients'];
  check(Array.isArray(raw)&&raw.length>0&&raw.length<=64,'INGREDIENTS');
  const type=v['source.RecipeType'],max=v['source.MaxIngredients'];
  check(kind!=='crafting'||id(type),'CRAFT_TYPE');
  check(max===undefined||typeof max==='number'&&Number.isSafeInteger(max)&&max>=0,'MAX_INGREDIENTS');
  return Object.freeze({recipeId:row.itemId,kind,resultItemId:resultId,
    resultQuantity:kind==='crafting'?resultQuantity as number:null,
    resultState:kind==='crafting'&&object(result)?result.State??null:null,
    ingredients:Object.freeze(raw.map(x=>ingredient(x,kind))),
    recipeTypeTagId:kind==='crafting'&&id(type)?type:null,
    maxIngredients:kind==='cooking'&&typeof max==='number'?max:null,
    appearWhen:kind==='crafting'?v['source.AppearWhen']??null:null,
    sourceGameVersion:version,unlockVerified:false as const,availabilityVerified:false as const});
}
export function createCanonicalRecipeReader(db:PublicCompleteItemMaster){
  async function getRecipes(ids:readonly number[]){
    check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
    const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
    check(['sourceClass','source.ResultItemID','source.Result','source.Ingredients'].every(f=>catalog.has(f)),'NOT_INDEXED');
    const rows=await db.getItemFields(ids,sourceFields.filter(f=>catalog.has(f)));
    return Object.freeze(rows.map(r=>decode(r,db.release.target.gameVersion)));
  }
  async function listRecipeIds(kind?:CanonicalRecipeKind){
    check(kind===undefined||kind==='cooking'||kind==='crafting','KIND');
    return db.findItemIdsByFields([{field:'sourceClass',anyOf:(kind==='cooking'?[cooking]:kind==='crafting'?[crafting]:[cooking,crafting]).map(value=>({kind:'equals' as const,value}))}]);
  }
  async function getResultRecipes(resultIds:readonly number[]){
    check(Array.isArray(resultIds)&&resultIds.length<=10000&&resultIds.every(id),'RESULT_IDS');
    const refs=await db.getItemsReferences(resultIds,'incoming');
    const candidates=refs.map(list=>[...new Set((list??[]).filter(([,path])=>path==='source.ResultItemID'||path==='source.Result.ItemID').map(([source])=>source))].sort((a,b)=>a-b));
    const ids=[...new Set(candidates.flat())].sort((a,b)=>a-b);
    const recipes=await getRecipes(ids);
    const byId=new Map(recipes.flatMap(r=>r?[[r.recipeId,r] as const]:[]));
    return Object.freeze(candidates.map((group,i)=>refs[i]===null?null:Object.freeze(group.flatMap(recipeId=>{
      const r=byId.get(recipeId);return r?.resultItemId===resultIds[i]?[r]:[];
    }))));
  }
  /** Reverse lookup for explicit items or selectors. A tag reference is not
   * a statement that every tagged item is eligible in a live cooking session. */
  async function getIngredientUses(itemIds:readonly number[],role:'item'|'ingredient_type'|'tag'='item'){
    check(Array.isArray(itemIds)&&itemIds.length<=10000&&itemIds.every(id),'INGREDIENT_IDS');
    check(role==='item'||role==='ingredient_type'||role==='tag','INGREDIENT_ROLE');
    const pattern=role==='item'?/^source\.Ingredients\[(\d+)\]\.(?:ItemID|ValidItemsList\.List\[\d+\])$/:
      role==='ingredient_type'?/^source\.Ingredients\[(\d+)\]\.Any$/:
      /^source\.Ingredients\[(\d+)\]\.TagsList\.List\[\d+\]$/;
    const refs=await db.getItemsReferences(itemIds,'incoming');
    const candidates=refs.map(list=>{
      const unique=new Map<string,{recipeId:number;index:number}>();
      for(const [recipeId,path] of list??[]){
        const match=pattern.exec(path);
        if(match){const index=Number(match[1]);unique.set(recipeId+':'+index,{recipeId,index});}
      }
      return [...unique.values()].sort((a,b)=>a.recipeId-b.recipeId||a.index-b.index);
    });
    const ids=[...new Set(candidates.flat().map(x=>x.recipeId))].sort((a,b)=>a-b);
    const recipes=await getRecipes(ids);
    const byId=new Map(recipes.flatMap(r=>r?[[r.recipeId,r] as const]:[]));
    return Object.freeze(candidates.map((group,i)=>refs[i]===null?null:Object.freeze(group.flatMap(({recipeId,index})=>{
      const r=byId.get(recipeId),ing=r?.ingredients[index],itemId=itemIds[i];
      if(!r||!ing)return [];
      const matched=role==='item'?(ing.kind==='item'&&ing.itemId===itemId||ing.kind==='item_alternatives'&&ing.itemIds.includes(itemId)):
        role==='ingredient_type'?ing.kind==='ingredient_type'&&ing.tagId===itemId:
        ing.kind==='all_tags'&&ing.tagIds.includes(itemId);
      return matched?[Object.freeze({recipeId,resultItemId:r.resultItemId,recipeKind:r.kind,ingredientIndex:index,
        selectorKind:ing.kind,quantity:ing.quantity})]:[];
    }))));
  }
  return Object.freeze({release:db.release,getRecipes,listRecipeIds,getResultRecipes,getIngredientUses});
}
