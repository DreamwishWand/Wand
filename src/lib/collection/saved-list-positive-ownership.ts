/** Typed trust boundary for the Rust/WASM positive ListInventory witness.
 * This module never traverses a decoded Save. A positive Amount is the only
 * supported owned-status candidate; missing/zero are not negative evidence.
 */
export const SAVED_LIST_OWNERSHIP_CONTRACT='wand.collection.positive-list-inventory@1' as const;
export type PositiveOwnershipRole=
  'Furniture'|'Clothing'|'ActivityItem'|'Makeup'|'Trimming'|'Building'|
  'Skin'|'BoardGame'|'AvatarFeature'|'PhotoMode'|'MountGear'|'Environment';
export type PositiveOwnershipStatus=
  'unsupported_schema'|'not_observed'|'incompatible_structure'|
  'partial_inconclusive'|'positive_stock_observed'|'observed_no_positive_stock';
export interface PositiveListInventoryProjection{
  readonly contract:typeof SAVED_LIST_OWNERSHIP_CONTRACT;
  readonly status:PositiveOwnershipStatus;
  readonly saveSchema:number|null;
  readonly inspectedRoles:number;
  readonly matchedRoles:number;
  readonly positiveReferences:number;
  readonly zeroReferences:number;
  readonly invalidReferences:number;
  readonly unverifiedRoles:number;
  readonly ambiguousItemIds:number;
  readonly sampled:boolean;
  readonly entries:readonly Readonly<{itemId:number;role:PositiveOwnershipRole}>[];
  readonly semantic:'explicit_positive_list_amount_only';
  readonly missingStatusInferred:false;
  readonly zeroAmountMeansMissing:false;
  readonly inventoryTypeVerifiedByRole:true;
  readonly currentSteamNativeEquivalentProven:false;
  readonly gameSaveModified:false;
  readonly personalDataPublished:false;
}
const SUPPORTED=new Set([624,643]);
const MAX_KEYS=20_000,MAX_ROLES=32;
const STATUS=new Set<PositiveOwnershipStatus>([
  'unsupported_schema','not_observed','incompatible_structure',
  'partial_inconclusive','positive_stock_observed','observed_no_positive_stock'
]);
const ROLE_ITEM_TYPE:Readonly<Record<PositiveOwnershipRole,number>>={
  Furniture:4,Clothing:5,ActivityItem:3,Makeup:14,Trimming:16,
  Building:2,Skin:17,BoardGame:18,AvatarFeature:7,
  PhotoMode:19,MountGear:21,Environment:6
};
const fail=():never=>{throw new TypeError('SAVED_LIST_OWNERSHIP_INVALID_WORKER_REPLY')};
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function count(value:unknown,max:number):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||
     value<0||value>max)fail();
  return value as number;
}
export function sanitizePositiveListInventoryOwnership(input:unknown):
  PositiveListInventoryProjection{
  if(!record(input))fail();
  if(input.contract!==SAVED_LIST_OWNERSHIP_CONTRACT||
    !STATUS.has(input.status as PositiveOwnershipStatus)||
    input.semantic!=='explicit_positive_list_amount_only'||
    input.missingStatusInferred!==false||
    input.zeroAmountMeansMissing!==false||
    input.inventoryTypeVerifiedByRole!==true||
    input.currentSteamNativeEquivalentProven!==false||
    input.gameSaveModified!==false||input.personalDataPublished!==false||
    typeof input.sampled!=='boolean'||!Array.isArray(input.entries)||
    input.entries.length>MAX_KEYS)fail();
  const schema=input.saveSchema===null?null:count(input.saveSchema,99_999);
  const inspectedRoles=count(input.inspectedRoles,Object.keys(ROLE_ITEM_TYPE).length);
  const matchedRoles=count(input.matchedRoles,inspectedRoles);
  const positiveReferences=count(input.positiveReferences,MAX_KEYS);
  const zeroReferences=count(input.zeroReferences,MAX_KEYS);
  const invalidReferences=count(input.invalidReferences,MAX_KEYS);
  const unverifiedRoles=count(input.unverifiedRoles,inspectedRoles);
  const ambiguousItemIds=count(input.ambiguousItemIds,MAX_KEYS);
  if(positiveReferences+zeroReferences+invalidReferences>MAX_KEYS||
    matchedRoles+unverifiedRoles!==inspectedRoles||
    ambiguousItemIds>positiveReferences||
    (input.status==='unsupported_schema'&&SUPPORTED.has(schema as number))||
    (input.status!=='unsupported_schema'&&!SUPPORTED.has(schema as number)))fail();
  let last=0;
  const entries=Object.freeze((input.entries as unknown[]).map(row=>{
    if(!record(row))fail();
    if(Object.keys(row).length!==2||
      typeof row.itemId!=='number'||!Number.isSafeInteger(row.itemId)||
      row.itemId<=last||!Object.hasOwn(ROLE_ITEM_TYPE,String(row.role)))fail();
    const role=row.role as PositiveOwnershipRole;
    if(Math.trunc(row.itemId/10_000_000)!==ROLE_ITEM_TYPE[role])fail();
    last=row.itemId;
    return Object.freeze({itemId:last,role});
  }));
  if(entries.length>positiveReferences||
    (input.status==='positive_stock_observed'&&
      (!positiveReferences||input.sampled||invalidReferences||
       unverifiedRoles||ambiguousItemIds))||
    (input.status==='observed_no_positive_stock'&&
      (positiveReferences||input.sampled||invalidReferences||
       unverifiedRoles||ambiguousItemIds))||
    (input.status==='partial_inconclusive'&&
      !(input.sampled||invalidReferences||unverifiedRoles||ambiguousItemIds))||
    (['unsupported_schema','not_observed','incompatible_structure']
      .includes(input.status as string)&&
      (entries.length||positiveReferences||zeroReferences||
       invalidReferences||inspectedRoles)))fail();
  return Object.freeze({
    contract:SAVED_LIST_OWNERSHIP_CONTRACT,
    status:input.status as PositiveOwnershipStatus,saveSchema:schema,
    inspectedRoles,matchedRoles,positiveReferences,zeroReferences,
    invalidReferences,unverifiedRoles,ambiguousItemIds,
    sampled:input.sampled as boolean,entries,
    semantic:'explicit_positive_list_amount_only' as const,
    missingStatusInferred:false as const,
    zeroAmountMeansMissing:false as const,
    inventoryTypeVerifiedByRole:true as const,
    currentSteamNativeEquivalentProven:false as const,
    gameSaveModified:false as const,personalDataPublished:false as const
  });
}
