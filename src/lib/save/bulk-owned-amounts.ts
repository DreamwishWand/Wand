/**
 * Stage a deterministic, complete filtered owned-slot batch. Native Rust/WASM
 * validates every exact Save address and original quantity before any export.
 * The client never edits raw Save bytes or chooses an implicit partial batch.
 */
import type {OwnedSlot,OwnedTarget,PendingOwnedAmount} from './owned-slot-view';

export const MAX_OWNED_AMOUNT_BATCH=16;
export type BulkOwnedAmountPlan=
  |{status:'ready';added:PendingOwnedAmount[];alreadyQueued:number;unchanged:number}
  |{status:'invalid-quantity'|'too-many'|'no-changes'|'stale'|'duplicate';
     eligible:number;remaining:number};

function sameTarget(a:OwnedTarget,b:OwnedTarget):boolean{
  if(a.kind!==b.kind)return false;
  if(a.kind==='inventory'&&b.kind==='inventory')
    return a.inventoryId===b.inventoryId&&a.itemId===b.itemId;
  return a.kind==='chest'&&b.kind==='chest'&&
    a.containerId===b.containerId&&a.slotIndex===b.slotIndex&&
    a.itemId===b.itemId;
}
function ownedTarget(slot:OwnedSlot):OwnedTarget{
  return slot.kind==='inventory'
    ?{kind:'inventory',inventoryId:slot.inventoryId,itemId:slot.itemId}
    :{kind:'chest',containerId:slot.containerId,slotIndex:slot.slotIndex,
      itemId:slot.itemId};
}

/** Quantity is save-structural uint32, not the game's normal stack limit. */
export function planFilteredOwnedAmounts(
  matched:readonly OwnedSlot[],queued:readonly PendingOwnedAmount[],
  rawQuantity:string
):BulkOwnedAmountPlan{
  if(!/^[1-9][0-9]*$/.test(rawQuantity))return {
    status:'invalid-quantity',eligible:0,
    remaining:Math.max(0,MAX_OWNED_AMOUNT_BATCH-queued.length)
  };
  const replacement=Number(rawQuantity);
  if(!Number.isSafeInteger(replacement)||replacement>0xffffffff)return {
    status:'invalid-quantity',eligible:0,
    remaining:Math.max(0,MAX_OWNED_AMOUNT_BATCH-queued.length)
  };
  const remaining=MAX_OWNED_AMOUNT_BATCH-queued.length;
  const added:PendingOwnedAmount[]=[];
  let alreadyQueued=0,unchanged=0;
  const observed:OwnedTarget[]=[];
  for(const slot of matched){
    const target=ownedTarget(slot);
    if(observed.some(prior=>sameTarget(prior,target)))return {
      status:'duplicate',eligible:0,remaining:Math.max(0,remaining)
    };
    observed.push(target);
    const existing=queued.find(edit=>sameTarget(edit.target,target));
    if(existing){
      if(existing.expected!==slot.amount)return {
        status:'stale',eligible:0,remaining:Math.max(0,remaining)
      };
      alreadyQueued++;
      continue;
    }
    if(slot.amount===replacement){unchanged++;continue;}
    added.push({target,expected:slot.amount,replacement});
  }
  if(added.length===0)return {
    status:'no-changes',eligible:0,remaining:Math.max(0,remaining)
  };
  if(added.length>remaining||remaining<0)return {
    status:'too-many',eligible:added.length,remaining:Math.max(0,remaining)
  };
  return {status:'ready',added,alreadyQueued,unchanged};
}
