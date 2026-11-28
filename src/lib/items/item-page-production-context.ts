import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemMasterLocale} from './public-item-master.ts';
import {createProductionSourceReader,type SeedSourceDefinition,type BeeHouseSourceDefinition} from './public-production-sources.ts';
import {createCurrentActivityEvidenceReader} from './public-activity-evidence.ts';
import {usableItemName} from './display-name.ts';
export interface ItemProductionContext {
  readonly growing:readonly {readonly seed:Readonly<SeedSourceDefinition>;readonly counterpartId:number|null;readonly counterpartName:string|null}[];
  readonly machines:readonly {readonly source:Readonly<BeeHouseSourceDefinition>;readonly name:string|null}[];
  readonly ingredientType:string|null;
}
export async function readItemProductionContext(db:PublicCompleteItemMaster,itemId:number,locale:ItemMasterLocale):Promise<ItemProductionContext>{
  const reader=createProductionSourceReader(db);
  const [[seed],[inverse],[ingredient]]=await Promise.all([
    reader.getForSeeds([itemId]),reader.getForItems([itemId]),
    createCurrentActivityEvidenceReader(db).getIngredientDefinitionEvidence([itemId],[])
  ]);
  const seeds=new Map<number,Readonly<SeedSourceDefinition>>();
  // A configured seed association is useful even when ProducesItem is absent,
  // but a false flag must not imply a harvestable product.
  if(seed?.definition)seeds.set(seed.definition.seedItemId,seed.definition);
  const machines:Readonly<BeeHouseSourceDefinition>[]=[];
  for(const source of inverse?.sources??[]){
    if(source.kind==='seed_production')seeds.set(source.seedItemId,source);
    if(source.kind==='bee_house_production')machines.push(source);
  }
  const counterpart=(s:Readonly<SeedSourceDefinition>)=>s.seedItemId===itemId?s.resultItemId:s.seedItemId;
  const ids=[...new Set([...Array.from(seeds.values(),counterpart),...machines.map(s=>s.machineItemId),ingredient?.cookingIngredientTypeId??null].filter((id):id is number=>id!==null&&id!==itemId))];
  const fields=[...new Set([locale,'en',...ITEM_MASTER_LOCALES])].map(l=>'names.'+l);
  const names=new Map<number,string>();
  if(ids.length)for(const row of await db.getItemFields(ids,fields)){
    if(!row)continue;const label=fields.map(field=>row.values[field]).find(usableItemName);
    if(label)names.set(row.itemId,label);
  }
  return {
    growing:[...seeds.values()].map(seed=>{const other=counterpart(seed);return {seed,counterpartId:other!==itemId?other:null,counterpartName:other!==null?names.get(other)??null:null};}),
    machines:machines.map(source=>({source,name:names.get(source.machineItemId)??null})),
    ingredientType:ingredient?.cookingIngredientTypeId!=null?names.get(ingredient.cookingIngredientTypeId)??null:null
  };
}
