/**
 * Read-only UI projection for owned Inventory/Chest slots.
 * The Save's exact storage identity stays separate from public DB item labels:
 * two Chests may contain the same Item ID at different slot indices.
 * No displayed category, name or pending amount authorizes a native edit.
 */
import type {Db00ItemContext} from './common-db-context';

export type OwnedSlot =
  | {readonly kind:'inventory';readonly inventoryId:string;
     readonly itemId:string;readonly amount:number}
  | {readonly kind:'chest';readonly containerId:string;
     readonly slotIndex:number;readonly itemId:number;
     readonly amount:number};

export type OwnedTarget =
  | {readonly kind:'inventory';readonly inventoryId:string;readonly itemId:string}
  | {readonly kind:'chest';readonly containerId:string;
     readonly slotIndex:number;readonly itemId:number};

export interface PendingOwnedAmount {
  readonly target:OwnedTarget;
  readonly expected:number;
  readonly replacement:number;
}
export interface OwnedSlotFilters {
  readonly location:'all'|'inventory'|'chest';
  readonly category:string;
  readonly query:string;
}
export interface OwnedCategoryOption {
  readonly value:string;
  readonly label:string;
  readonly count:number;
}

const UNKNOWN_CATEGORY='unclassified';
const CATEGORY_PREFIX='category:';

function categoryOf(itemId:string,meta:ReadonlyMap<string,Db00ItemContext>):string|null{
  const row=meta.get(itemId);
  return row?.category||row?.nativeCategory||null;
}
function categoryToken(itemId:string,meta:ReadonlyMap<string,Db00ItemContext>):string{
  const value=categoryOf(itemId,meta);
  return value===null?UNKNOWN_CATEGORY:CATEGORY_PREFIX+value;
}
export function ownedCategoryOptions(
  slots:readonly OwnedSlot[],meta:ReadonlyMap<string,Db00ItemContext>
):OwnedCategoryOption[]{
  const counts=new Map<string,number>();
  for(const slot of slots){
    const token=categoryToken(String(slot.itemId),meta);
    counts.set(token,(counts.get(token)??0)+1);
  }
  return [...counts].map(([value,count])=>({
    value,label:value===UNKNOWN_CATEGORY?'分類未確認':value.slice(CATEGORY_PREFIX.length),
    count
  })).sort((a,b)=>a.value===UNKNOWN_CATEGORY?1:
    b.value===UNKNOWN_CATEGORY?-1:
    a.label.localeCompare(b.label,'ja'));
}
export function filterOwnedSlots(
  slots:readonly OwnedSlot[],meta:ReadonlyMap<string,Db00ItemContext>,
  filters:OwnedSlotFilters
):OwnedSlot[]{
  const query=filters.query.trim().toLocaleLowerCase();
  return slots.filter(slot=>{
    if(filters.location!=='all'&&slot.kind!==filters.location)return false;
    const id=String(slot.itemId);
    if(filters.category!=='all'&&categoryToken(id,meta)!==filters.category)
      return false;
    if(!query)return true;
    const item=meta.get(id);
    const text=[
      id,item?.name??'',item?.category??'',item?.nativeCategory??'',
      ownedSlotLocation(slot)
    ].join(' ').toLocaleLowerCase();
    return text.includes(query);
  });
}
export function ownedSlotLocation(slot:OwnedSlot):string{
  return slot.kind==='inventory'
    ?'Inventory '+slot.inventoryId
    :'Chest '+slot.containerId+' / Slot '+slot.slotIndex;
}
/** Resolve the staged quantity by the complete native Save address, never Item ID alone. */
export function pendingOwnedAmount(
  slot:OwnedSlot,edits:readonly PendingOwnedAmount[]
):number|null{
  const matched=edits.find(edit=>{
    if(edit.expected!==slot.amount||edit.target.kind!==slot.kind)return false;
    if(edit.target.kind==='inventory'&&slot.kind==='inventory')
      return edit.target.inventoryId===slot.inventoryId&&
        edit.target.itemId===slot.itemId;
    if(edit.target.kind==='chest'&&slot.kind==='chest')
      return edit.target.containerId===slot.containerId&&
        edit.target.slotIndex===slot.slotIndex&&
        edit.target.itemId===slot.itemId;
    return false;
  });
  return matched?.replacement??null;
}
