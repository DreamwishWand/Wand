import {ITEM_MASTER_LOCALES,type CompleteItemMasterRecord,type PublicCompleteItemMaster,type ItemMasterLocale} from './public-item-master.ts';
import {createCanonicalRecipeReader} from '../acquisition/canonical-recipes.ts';
import {usableItemName} from './display-name.ts';
import {readNativeEntityRelations} from './native-entity-parent.ts';
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function itemPageNativeFacts(record:Pick<CompleteItemMasterRecord,'nativeCategory'|'sourceAttributes'>){
  const grid=record.sourceAttributes?.GridAreaData;
  const x=grid?.SizeX,y=grid?.SizeY;
  // Source dimensions only; never establish occupancy or permission.
  const footprint=(record.nativeCategory==='Furniture'||record.nativeCategory==='Building')&&positive(x)&&positive(y)?{x,y}:null;
  const mana=record.sourceAttributes?.ManaRecovered;
  return {footprint,energy:record.nativeCategory==='ActivityItem'&&nonnegative(mana)?mana:null};
}
export interface RelatedItemTile {readonly itemId:number;readonly name:string}
export interface ItemPageRelations {
  readonly series:readonly RelatedItemTile[];
  readonly recipeResults:readonly RelatedItemTile[];
  readonly parent:readonly RelatedItemTile[];
  readonly styles:readonly RelatedItemTile[];
  readonly gear:readonly RelatedItemTile[];
  readonly partial:boolean;
}
export async function readItemPageRelations(db:PublicCompleteItemMaster,record:Pick<CompleteItemMasterRecord,'itemId'|'sourceSetItemId'|'nativeCategory'>&Partial<Pick<CompleteItemMasterRecord,'itemType'>>,locale:ItemMasterLocale):Promise<ItemPageRelations>{
  const id=record.itemId;
  const sets=async()=>{
    if(!positive(record.sourceSetItemId))return [];
    const refs=await db.getItemReferences(record.sourceSetItemId,'incoming');
    return [...new Set((refs??[]).filter(([other,path])=>other!==id&&path==='sourceSetItemId').map(([other])=>other))];
  };
  const uses=async()=>{
    if(record.nativeCategory!=='ActivityItem')return [];
    const [rows]=await createCanonicalRecipeReader(db).getIngredientUses([id]);
    return [...new Set((rows??[]).map(r=>r.resultItemId).filter(other=>other!==id))];
  };
  const [series,recipes,entities]=await Promise.allSettled([sets(),uses(),readNativeEntityRelations(db,id,record.itemType?{nativeType:record.nativeCategory,code:record.itemType.subtypeCode}:undefined)]);
  const seriesIds=series.status==='fulfilled'?series.value:[];
  const recipeIds=recipes.status==='fulfilled'?recipes.value:[];
  const entity=entities.status==='fulfilled'?entities.value:{parent:null,styles:[],gear:[]};
  const parentIds=entity.parent===null?[]:[entity.parent];
  const ids=[...new Set([...seriesIds,...recipeIds,...parentIds,...entity.styles,...entity.gear])].sort((a,b)=>a-b);
  const names=new Map<number,RelatedItemTile>();
  const labelFields=[...new Set([locale,'en',...ITEM_MASTER_LOCALES])].map(l=>'names.'+l);
  for(let start=0;start<ids.length;start+=500){
    for(const row of await db.getItemFields(ids.slice(start,start+500),['definitionScope',...labelFields])){
      if(!row||row.values.definitionScope==='other_definition')continue;
      const label=labelFields.map(field=>row.values[field]).find(usableItemName);
      if(label)names.set(row.itemId,{itemId:row.itemId,name:label});
    }
  }
  const tiles=(input:number[])=>input.flatMap(other=>{const tile=names.get(other);return tile?[tile]:[];})
    .sort((a,b)=>a.name.localeCompare(b.name,locale)||a.itemId-b.itemId);
  return {series:tiles(seriesIds),recipeResults:tiles(recipeIds),parent:tiles(parentIds),styles:tiles(entity.styles),gear:tiles(entity.gear),partial:series.status==='rejected'||recipes.status==='rejected'||entities.status==='rejected'};
}
