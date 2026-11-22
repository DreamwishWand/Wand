/**
 * Projection of native CollectionSet discovery booleans, NOT item ownership.
 *
 * Evidence: DDV native CollectionSetUtils.GetNewGroup and
 * CollectionSet.CheckItem/RefreshData (Switch v1.24.13 and v1.25.0)
 * establish GroupsCollectionItems[itemID] as save-backed discovery history
 * (including false entries for undiscovered candidates). Steam v1.26.2
 * schema 643 is accepted on the same strict boolean storage shape; native
 * cross-build method equivalence remains independently unverified.
 *
 * A duplicate Item ID with discordant values in different groups/categories
 * is ambiguous in a unique-ID Collection workspace and is NEVER projected.
 * Unknown/non-boolean values never become "missing", nor clear manual state.
 */
export const SAVE_COLLECTION_DISCOVERY_CONTRACT='wand.collection.saved-discovery-projection@1';
export const SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA='wand.collection.mapped-save-discovery@1';
const SUPPORTED_SAVE_SCHEMAS=new Set([624,643]);
const MAX_SETS=128, MAX_GROUPS=4096, MAX_REFERENCES=20000;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const exactKey=x=>/^[1-9][0-9]*$/.test(x)&&
  Number.isSafeInteger(Number(x))&&String(Number(x))===x;
const fail=()=>{throw new TypeError('SAVE_COLLECTION_DISCOVERY_PROJECTION_INVALID');};

export function projectSavedCollectionDiscovery(root) {
  const saveSchema=root?.GameInfo?.Version;
  const supportedSchema=SUPPORTED_SAVE_SCHEMAS.has(saveSchema);
  const sets=root?.Player?.CollectionSets;
  const hasCollection=record(root?.Player)&&has(root.Player,'CollectionSets');
  let partial=false,observed=0,groups=0,invalid=0;
  const values=new Map(),conflictedIds=new Set();
  if(supportedSchema&&Array.isArray(sets)) {
    if(sets.length>MAX_SETS)partial=true;
    outer: for(const set of sets.slice(0,MAX_SETS)) {
      if(!record(set)||!Array.isArray(set.GroupData)){invalid++;continue;}
      for(const group of set.GroupData) {
        if(groups>=MAX_GROUPS){partial=true;break outer;}
        groups++;
        if(!record(group)||!record(group.GroupsCollectionItems)){invalid++;continue;}
        for(const [key,value] of Object.entries(group.GroupsCollectionItems)) {
          if(observed+invalid>=MAX_REFERENCES){partial=true;break outer;}
          if(!exactKey(key)){invalid++;continue;}
          observed++;
          const id=Number(key);
          const previous=values.get(id);
          // Any non-boolean, including falsey undefined/null, poisons this
          // ID: no partial inference of its state from a different group.
          if(typeof value!=='boolean'){
            invalid++;
            values.set(id,null);
            continue;
          }
          if(previous===undefined)values.set(id,value);
          else if(previous!==null && previous!==value){
            values.set(id,null);
            conflictedIds.add(id);
          }
        }
      }
    }
  }
  const entries=[];
  for(const [id,val] of values) {
    if(val===null)continue;
    entries.push(Object.freeze({itemId:id,discovered:val}));
  }
  entries.sort((a,b)=>a.itemId-b.itemId);
  const status=!supportedSchema?'unsupported_schema':
    !hasCollection?'not_observed':
    !Array.isArray(sets)?'incompatible_structure':
    partial||invalid||conflictedIds.size?'partial_inconclusive':
    !entries.length?'observed_empty':'observed_boolean_discovery';
  return Object.freeze({
    contract:SAVE_COLLECTION_DISCOVERY_CONTRACT,
    importSchema:SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA,
    saveSchema:Number.isSafeInteger(saveSchema)?saveSchema:null,
    status,entries:Object.freeze(entries),observedReferences:observed,
    observedGroups:groups,invalidReferences:invalid,
    ambiguousItemIds:conflictedIds.size,sampled:partial,
    semantic:'collection_discovery_history_not_ownership',
    nativeEvidenceVersion:'switch-1.25.0',
    currentSteamNativeEquivalentProven:false,
    saveFileModified:false,ownershipVerified:false,publishable:false
  });
}

/** Main-thread boundary: rebuild whitelisted ID/boolean rows from Worker. */
export function sanitizeSavedCollectionDiscovery(input) {
  if(!record(input)||input.contract!==SAVE_COLLECTION_DISCOVERY_CONTRACT||
    input.importSchema!==SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA||
    !['unsupported_schema','not_observed','incompatible_structure',
      'partial_inconclusive','observed_empty','observed_boolean_discovery'].includes(input.status)||
    input.semantic!=='collection_discovery_history_not_ownership'||
    input.nativeEvidenceVersion!=='switch-1.25.0'||
    input.currentSteamNativeEquivalentProven!==false||
    input.saveFileModified!==false||input.ownershipVerified!==false||
    input.publishable!==false||typeof input.sampled!=='boolean'||
    !Array.isArray(input.entries)||input.entries.length>MAX_REFERENCES)fail();
  const count=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max?n:fail();
  const saveSchema=input.saveSchema===null?null:count(input.saveSchema,99999);
  const observedReferences=count(input.observedReferences,MAX_REFERENCES);
  const observedGroups=count(input.observedGroups,MAX_GROUPS);
  const invalidReferences=count(input.invalidReferences,MAX_REFERENCES+MAX_GROUPS+MAX_SETS);
  const ambiguousItemIds=count(input.ambiguousItemIds,MAX_REFERENCES);
  let prev=0;
  const entries=input.entries.map(row=>{
    if(!record(row)||Object.keys(row).length!==2||
      !has(row,'itemId')||!has(row,'discovered')||
      !Number.isSafeInteger(row.itemId)||row.itemId<=prev||
      row.itemId>Number.MAX_SAFE_INTEGER||
      typeof row.discovered!=='boolean')fail();
    prev=row.itemId;
    return Object.freeze({itemId:row.itemId,discovered:row.discovered});
  });
  if(entries.length>observedReferences||ambiguousItemIds>observedReferences||
    ((input.status==='unsupported_schema')&&
      (SUPPORTED_SAVE_SCHEMAS.has(saveSchema)||observedReferences||entries.length))||
    (input.status==='observed_boolean_discovery'&&
      (!entries.length||invalidReferences||ambiguousItemIds||input.sampled))||
    (input.status==='observed_empty'&&(entries.length||invalidReferences||input.sampled))||
    (input.status==='partial_inconclusive'&&
      !(invalidReferences||ambiguousItemIds||input.sampled))||
    ((input.status==='not_observed'||input.status==='incompatible_structure')&&
      (entries.length||observedReferences)))fail();
  return Object.freeze({
    contract:SAVE_COLLECTION_DISCOVERY_CONTRACT,
    importSchema:SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA,
    saveSchema,status:input.status,entries:Object.freeze(entries),
    observedReferences,observedGroups,invalidReferences,ambiguousItemIds,
    sampled:input.sampled,
    semantic:'collection_discovery_history_not_ownership',
    nativeEvidenceVersion:'switch-1.25.0',
    currentSteamNativeEquivalentProven:false,
    saveFileModified:false,ownershipVerified:false,publishable:false
  });
}
