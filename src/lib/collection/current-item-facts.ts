import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemMasterLocale} from '../items/public-item-master.ts';
import {usableItemName} from '../items/display-name.ts';
import {readItemPriceDetails,type ItemPriceDetails} from '../items/public-item-price-details.ts';
import {readItemAcquisitionSourceDetails,type ItemAcquisitionSourceDetails} from '../items/public-item-acquisition-details.ts';
import {readItemTaxonomyDetails,type ItemTaxonomyDetails} from '../items/public-item-taxonomy-details.ts';
import {createCanonicalRecipeReader,type CanonicalRecipe} from '../acquisition/canonical-recipes.ts';

export interface CollectionItemFacts {
  readonly taxonomy:Readonly<ItemTaxonomyDetails>|null;
  readonly prices:Readonly<ItemPriceDetails>|null;
  readonly sources:Readonly<ItemAcquisitionSourceDetails>|null;
  readonly recipes:readonly Readonly<CanonicalRecipe>[];
  readonly names:ReadonlyMap<number,string>;
  readonly partial:boolean;
}
/** On-demand exact Item ID detail; optional facts may lag independently. */
export async function readCollectionItemFacts(db:PublicCompleteItemMaster,id:number,locale:ItemMasterLocale):Promise<CollectionItemFacts>{
  const [taxonomy,prices,sources,recipes]=await Promise.allSettled([
    readItemTaxonomyDetails(db,[id],locale),
    readItemPriceDetails(db,[id],locale),
    readItemAcquisitionSourceDetails(db,[id],locale),
    createCanonicalRecipeReader(db).getResultRecipes([id])
  ]);
  const result=recipes.status==='fulfilled'?recipes.value[0]??[]:[];
  const related=new Set<number>();
  for(const recipe of result)for(const part of recipe.ingredients){
    if(part.kind==='item')related.add(part.itemId);
    else if(part.kind==='ingredient_type')related.add(part.tagId);
    else for(const target of part.kind==='item_alternatives'?part.itemIds:part.tagIds)related.add(target);
  }
  const names=new Map<number,string>();
  let nameFailed=false;
  if(related.size){
    try{
      const fields=[...new Set([locale,'en',...ITEM_MASTER_LOCALES])].map(l=>'names.'+l);
      for(const row of await db.getItemFields([...related],fields)){
        if(!row)continue;
        const label=fields.map(field=>row.values[field]).find(usableItemName);
        if(label)names.set(row.itemId,label);
      }
    }catch{nameFailed=true;}
  }
  return {taxonomy:taxonomy.status==='fulfilled'?taxonomy.value[0]??null:null,
    prices:prices.status==='fulfilled'?prices.value[0]??null:null,
    sources:sources.status==='fulfilled'?sources.value[0]??null:null,
    recipes:result,names,partial:nameFailed||[taxonomy,prices,sources,recipes].some(r=>r.status==='rejected')};
}
