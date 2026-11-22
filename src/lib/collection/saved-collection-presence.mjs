/**
 * Read-only observation of exact map keys at the DB-05 public path
 * /Player/CollectionSets[]/GroupData[]/GroupsCollectionItems/{id}.
 *
 * Presence of a key is NOT evidence of ownership, completion, DLC entitlement,
 * an eligible Collection entry, or save/game-source version equivalence.
 * Never retain or forward map values, group identifiers, arbitrary save fields
 * or player-specific metadata. Handles modified saves with missing branches.
 */
export const SAVED_COLLECTION_PRESENCE_CONTRACT = 'wand.collection.saved-id-presence@1';
const LIMITS = Object.freeze({sets:128,groups:4096,keys:20000});
const record = v=>v!==null && typeof v==='object' && !Array.isArray(v);
const own = (v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const keyId = key=>/^[1-9][0-9]*$/.test(key) &&
  Number.isSafeInteger(Number(key)) && String(Number(key))===key;
const broken = ()=>{throw new TypeError('SAVED_COLLECTION_PRESENCE_INVALID_WORKER_REPLY');};

export function createSavedCollectionPresence(root) {
  const rows=new Map();
  let fieldObserved=false, observedSets=0, observedGroups=0,
    observedMaps=0, invalidEntries=0, referenceCount=0, partial=false;
  if(record(root?.Player) && own(root.Player,'CollectionSets')) {
    const sets=root.Player.CollectionSets;
    if(!Array.isArray(sets)) invalidEntries++;
    else {
      fieldObserved=true;
      if(sets.length>LIMITS.sets) partial=true;
      outer: for(const set of sets.slice(0,LIMITS.sets)) {
        observedSets++;
        if(!record(set) || !Array.isArray(set.GroupData)) {
          invalidEntries++;continue;
        }
        for(const group of set.GroupData) {
          if(observedGroups>=LIMITS.groups){partial=true;break outer;}
          observedGroups++;
          if(!record(group) || !record(group.GroupsCollectionItems)) {
            invalidEntries++;continue;
          }
          observedMaps++;
          const keys=Object.keys(group.GroupsCollectionItems);
          if(keys.length>LIMITS.keys)partial=true;
          for(const key of keys) {
            if(referenceCount+invalidEntries>=LIMITS.keys){partial=true;break outer;}
            if(!keyId(key)){invalidEntries++;continue;}
            const id=Number(key);
            rows.set(id,(rows.get(id)??0)+1);
            referenceCount++;
          }
        }
      }
    }
  }
  const items=Object.freeze([...rows].sort((a,b)=>a[0]-b[0])
    .map(([itemId,count])=>Object.freeze({itemId,referenceCount:count})));
  const status=partial||invalidEntries?'partial_inconclusive':
    !fieldObserved?'not_observed':
    referenceCount?'observed_ids':'observed_empty';
  return Object.freeze({
    contract:SAVED_COLLECTION_PRESENCE_CONTRACT,status,fieldObserved,
    observedSets,observedGroups,observedMaps,
    invalidEntries,referenceCount,distinctItemCount:items.length,
    sampled:partial,privateOnly:true,ownershipVerified:false,
    completionVerified:false,sourceVersionEquivalenceVerified:false,
    writerAuthorized:false,publishable:false,items
  });
}

/** Reconstruct only whitelisted fields from the untrusted Worker reply. */
export function sanitizeSavedCollectionPresence(input) {
  if(!record(input) || input.contract!==SAVED_COLLECTION_PRESENCE_CONTRACT ||
      !['not_observed','observed_ids','observed_empty','partial_inconclusive'].includes(input.status) ||
      typeof input.fieldObserved!=='boolean' || typeof input.sampled!=='boolean' ||
      input.privateOnly!==true || input.ownershipVerified!==false ||
      input.completionVerified!==false || input.sourceVersionEquivalenceVerified!==false ||
      input.writerAuthorized!==false || input.publishable!==false ||
      !Array.isArray(input.items) || input.items.length>LIMITS.keys) broken();
  const number=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max?n:broken();
  const observedSets=number(input.observedSets,LIMITS.sets);
  const observedGroups=number(input.observedGroups,LIMITS.groups);
  const observedMaps=number(input.observedMaps,LIMITS.groups);
  const invalidEntries=number(input.invalidEntries,LIMITS.keys+LIMITS.groups+LIMITS.sets);
  const referenceCount=number(input.referenceCount,LIMITS.keys);
  const distinctItemCount=number(input.distinctItemCount,LIMITS.keys);
  if(observedMaps>observedGroups || observedGroups===0&&observedMaps!==0 ||
    distinctItemCount!==input.items.length || distinctItemCount>referenceCount ||
    (input.status==='not_observed' && (input.fieldObserved||referenceCount||input.sampled||invalidEntries)) ||
    (input.status==='observed_ids' && (!input.fieldObserved||!referenceCount||input.sampled||invalidEntries)) ||
    (input.status==='observed_empty' && (!input.fieldObserved||referenceCount||input.sampled||invalidEntries)) ||
    (input.status==='partial_inconclusive' && !input.sampled && !invalidEntries))broken();
  let previous=0, sum=0;
  const items=input.items.map(row=>{
    if(!record(row)||!Number.isSafeInteger(row.itemId)||row.itemId<=previous ||
      row.itemId>Number.MAX_SAFE_INTEGER)broken();
    const n=number(row.referenceCount,LIMITS.keys);
    if(n<1||n>observedMaps)broken();
    previous=row.itemId;sum+=n;
    return Object.freeze({itemId:row.itemId,referenceCount:n});
  });
  if(sum!==referenceCount)broken();
  return Object.freeze({
    contract:SAVED_COLLECTION_PRESENCE_CONTRACT,status:input.status,
    fieldObserved:input.fieldObserved,observedSets,observedGroups,
    observedMaps,invalidEntries,referenceCount,distinctItemCount,
    sampled:input.sampled,privateOnly:true,ownershipVerified:false,
    completionVerified:false,sourceVersionEquivalenceVerified:false,
    writerAuthorized:false,publishable:false,items:Object.freeze(items)
  });
}
