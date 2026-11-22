/**
 * Conservative read-only ListInventory ownership observation.
 *
 * Native evidence: DDV Switch v1.24.13 / v1.25.0 ListInventory.GetItemAmount
 * & HasItem use Data.Amount; map entry presence alone is NOT ownership.
 * For explicitly saved, positive Amount in a known compatible role, we can
 * safely project a positive-stock ownership candidate. A zero/missing record
 * NEVER implies a missing, locked or unowned Collection item (placed stock,
 * historical unlocks, and separate Backpack/Chest inventories exist).
 *
 * Current Steam v1.26.2 native-executable semantic parity remains unverified.
 * Roles use both save-resident type descriptors and historical key/ID identity
 * as a read-only conservative compatibility gate; no save writes are allowed.
 */
export const SAVED_LIST_OWNERSHIP_CONTRACT='wand.collection.positive-list-inventory@1';
const SUPPORTED_SCHEMAS=new Set([624,643]);
const MAX_ROLES=32,MAX_KEYS=20000,MAX_AMOUNT=2147483647;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const keyId=k=>/^[1-9][0-9]*$/.test(k)&&
  Number.isSafeInteger(Number(k))&&String(Number(k))===k;
const ROLE_SIGNATURES=Object.freeze({
  '0':Object.freeze({type:'Furniture',itemType:4}),
  '1':Object.freeze({type:'Clothing',itemType:5}),
  '2':Object.freeze({type:'ActivityItem',itemType:3}),
  '4':Object.freeze({type:'Trimming',itemType:16})
});
const validType=(actual,signature)=>actual===signature.itemType ||
  (typeof actual==='string' && actual.toLowerCase()===signature.type.toLowerCase());
const reject=()=>{throw new TypeError('SAVED_LIST_OWNERSHIP_INVALID_WORKER_REPLY');};

export function projectPositiveListInventoryOwnership(root){
  const schema=root?.GameInfo?.Version;
  const supported=SUPPORTED_SCHEMAS.has(schema);
  const inventoryMap=root?.Player?.ListInventories;
  const observedField=record(root?.Player)&&own(root.Player,'ListInventories');
  let inspectedRoles=0,matchedRoles=0,positiveReferences=0,zeroReferences=0,
    invalidReferences=0,unverifiedRoles=0,sampled=false;
  const positive=new Map(),ambiguousIds=new Set();
  if(supported&&record(inventoryMap)){
    const keys=Object.keys(inventoryMap);
    if(keys.length>MAX_ROLES)sampled=true;
    for(const key of keys.slice(0,MAX_ROLES)){
      const sig=ROLE_SIGNATURES[key];
      if(!sig)continue; // unrelated roles cannot imply unowned state
      inspectedRoles++;
      const inv=inventoryMap[key];
      if(!record(inv)||!record(inv.Inventory) ||
        !validType(inv.CompatibleItemType,sig) ||
        (own(inv,'ID')&&inv.ID!==Number(key))){
        unverifiedRoles++;continue;
      }
      matchedRoles++;
      const entries=Object.entries(inv.Inventory);
      for(const [itemKey,value] of entries){
        if(positiveReferences+zeroReferences+invalidReferences>=MAX_KEYS){
          sampled=true;break;
        }
        if(!keyId(itemKey)||
          Math.trunc(Number(itemKey)/10000000)!==sig.itemType ||
          !record(value)||!Number.isSafeInteger(value.Amount)||
          value.Amount<0||value.Amount>MAX_AMOUNT){
          invalidReferences++;continue;
        }
        if(value.Amount===0){zeroReferences++;continue;}
        positiveReferences++;
        const id=Number(itemKey);
        if(positive.has(id)){ambiguousIds.add(id);continue;}
        positive.set(id,sig.type);
      }
    }
  }
  const entries=Object.freeze([...positive].filter(([id])=>!ambiguousIds.has(id))
    .sort((a,b)=>a[0]-b[0])
    .map(([itemId,role])=>Object.freeze({itemId,role})));
  const status=!supported?'unsupported_schema':
    !observedField?'not_observed':
    !record(inventoryMap)?'incompatible_structure':
    sampled||invalidReferences||unverifiedRoles||ambiguousIds.size?
      'partial_inconclusive':
    positiveReferences?'positive_stock_observed':'observed_no_positive_stock';
  return Object.freeze({
    contract:SAVED_LIST_OWNERSHIP_CONTRACT,status,
    saveSchema:Number.isSafeInteger(schema)?schema:null,
    inspectedRoles,matchedRoles,positiveReferences,zeroReferences,
    invalidReferences,unverifiedRoles,ambiguousItemIds:ambiguousIds.size,
    sampled,entries,
    semantic:'explicit_positive_list_amount_only',
    missingStatusInferred:false,zeroAmountMeansMissing:false,
    inventoryTypeVerifiedByRole:true,
    currentSteamNativeEquivalentProven:false,
    gameSaveModified:false,personalDataPublished:false
  });
}

/** Whitelist only schema, fixed summary counts and positive item IDs/roles. */
export function sanitizePositiveListInventoryOwnership(reply){
  if(!record(reply)||reply.contract!==SAVED_LIST_OWNERSHIP_CONTRACT||
    !['unsupported_schema','not_observed','incompatible_structure',
      'partial_inconclusive','positive_stock_observed','observed_no_positive_stock'].includes(reply.status)||
    reply.semantic!=='explicit_positive_list_amount_only' ||
    reply.missingStatusInferred!==false||reply.zeroAmountMeansMissing!==false||
    reply.inventoryTypeVerifiedByRole!==true||
    reply.currentSteamNativeEquivalentProven!==false||
    reply.gameSaveModified!==false||reply.personalDataPublished!==false||
    typeof reply.sampled!=='boolean'||!Array.isArray(reply.entries)||
    reply.entries.length>MAX_KEYS)reject();
  const count=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max?n:reject();
  const schema=reply.saveSchema===null?null:count(reply.saveSchema,99999);
  const inspectedRoles=count(reply.inspectedRoles,Object.keys(ROLE_SIGNATURES).length);
  const matchedRoles=count(reply.matchedRoles,inspectedRoles);
  const positiveReferences=count(reply.positiveReferences,MAX_KEYS);
  const zeroReferences=count(reply.zeroReferences,MAX_KEYS);
  const invalidReferences=count(reply.invalidReferences,MAX_KEYS);
  const unverifiedRoles=count(reply.unverifiedRoles,inspectedRoles);
  const ambiguousItemIds=count(reply.ambiguousItemIds,MAX_KEYS);
  if(positiveReferences+zeroReferences+invalidReferences>MAX_KEYS||
    matchedRoles+unverifiedRoles!==inspectedRoles||ambiguousItemIds>positiveReferences ||
    ((reply.status==='unsupported_schema')&&SUPPORTED_SCHEMAS.has(schema))||
    (reply.status!=='unsupported_schema'&&!SUPPORTED_SCHEMAS.has(schema)))reject();
  let last=0;
  const entries=Object.freeze(reply.entries.map(row=>{
    if(!record(row)||Object.keys(row).length!==2||!own(row,'itemId')||
      !own(row,'role')||!Number.isSafeInteger(row.itemId)||
      row.itemId<=last||row.itemId>Number.MAX_SAFE_INTEGER)reject();
    const signature=Object.values(ROLE_SIGNATURES).find(x=>x.type===row.role);
    if(!signature||Math.trunc(row.itemId/10000000)!==signature.itemType)reject();
    last=row.itemId;
    return Object.freeze({itemId:row.itemId,role:row.role});
  }));
  if(entries.length>positiveReferences ||
    (reply.status==='positive_stock_observed'&&
       (!positiveReferences||reply.sampled||invalidReferences||unverifiedRoles||ambiguousItemIds))||
    (reply.status==='observed_no_positive_stock'&&
       (positiveReferences||reply.sampled||invalidReferences||unverifiedRoles||ambiguousItemIds))||
    (reply.status==='partial_inconclusive'&&
      !(reply.sampled||invalidReferences||unverifiedRoles||ambiguousItemIds))||
    (['unsupported_schema','not_observed','incompatible_structure'].includes(reply.status)&&
      (entries.length||positiveReferences||zeroReferences||invalidReferences||inspectedRoles)))reject();
  return Object.freeze({
    contract:SAVED_LIST_OWNERSHIP_CONTRACT,status:reply.status,saveSchema:schema,
    inspectedRoles,matchedRoles,positiveReferences,zeroReferences,
    invalidReferences,unverifiedRoles,ambiguousItemIds,
    sampled:reply.sampled,entries,
    semantic:'explicit_positive_list_amount_only',
    missingStatusInferred:false,zeroAmountMeansMissing:false,
    inventoryTypeVerifiedByRole:true,currentSteamNativeEquivalentProven:false,
    gameSaveModified:false,personalDataPublished:false
  });
}
