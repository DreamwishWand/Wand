import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
export interface NativeEntityType {nativeType:string;code:number}
export const parentFields=['source.CharacterItemID','source.MountItemID','source.BaseItemID'] as const;
export function childEntityKind(type:NativeEntityType|undefined):'character'|'mount'|null{
  if(type?.nativeType==='Skin'&&type.code===0)return 'character';
  if(type?.nativeType==='Skin'&&type.code===4||type?.nativeType==='MountGear')return 'mount';
  return null;
}
export function baseEntityKind(type:NativeEntityType|undefined):'character'|'mount'|null{
  if(type?.nativeType==='Character')return 'character';
  if(type?.nativeType==='Companion'&&type.code===3)return 'mount';
  return null;
}
/** The same original-reference rule for catalog ordering and Item Page links. */
export function resolveNativeParent(child:NativeEntityType|undefined,values:Readonly<Record<string,ItemFieldValue>>,types:ReadonlyMap<number,NativeEntityType>):number|null{
  const kind=childEntityKind(child);if(!kind)return null;
  const ids=new Set<number>();
  for(const field of parentFields){
    const id=values[field];
    if(typeof id==='number'&&baseEntityKind(types.get(id))===kind)ids.add(id);
  }
  return ids.size===1?[...ids][0]:null;
}
const typeFields=['nativeCategory','itemType.subtypeCode'] as const;
export async function readNativeEntityRelations(db:PublicCompleteItemMaster,itemId:number,type:NativeEntityType|undefined){
  const child=childEntityKind(type),base=baseEntityKind(type);
  if(!child&&!base)return {parent:null,styles:[],gear:[]};
  const available=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const fields=parentFields.filter(f=>available.has(f));
  if(!fields.length)return {parent:null,styles:[],gear:[]};
  const ids=base?[...new Set((await db.getItemReferences(itemId,'incoming')??[])
    .filter(([,path])=>fields.some(f=>f===path)).map(([id])=>id))]:[itemId];
  const children=await db.getItemFields(ids,[...typeFields,...fields]);
  const types=new Map<number,NativeEntityType>();
  const targets=new Set<number>();
  if(type)types.set(itemId,type);
  for(const row of children){
    if(!row)continue;
    const v=row.values;
    if(typeof v.nativeCategory==='string'&&typeof v['itemType.subtypeCode']==='number')
      types.set(row.itemId,{nativeType:v.nativeCategory,code:v['itemType.subtypeCode']});
    if(!childEntityKind(types.get(row.itemId)))continue;
    for(const f of fields){const id=v[f];if(typeof id==='number'&&Number.isSafeInteger(id)&&id>0&&!types.has(id))targets.add(id);}
  }
  for(const row of await db.getItemFields([...targets],typeFields)){
    if(!row)continue;const v=row.values;
    if(typeof v.nativeCategory==='string'&&typeof v['itemType.subtypeCode']==='number')
      types.set(row.itemId,{nativeType:v.nativeCategory,code:v['itemType.subtypeCode']});
  }
  const parent=child?resolveNativeParent(type,children[0]?.values??{},types):null;
  const styles:number[]=[],gear:number[]=[];
  if(base)for(const row of children){
    if(!row||row.itemId===itemId||resolveNativeParent(types.get(row.itemId),row.values,types)!==itemId)continue;
    (types.get(row.itemId)?.nativeType==='MountGear'?gear:styles).push(row.itemId);
  }
  return {parent,styles,gear};
}
