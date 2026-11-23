/** Read-only TypeScript validation of the Rust/WASM CollectionSet projection.
 * The actual Save traversal and discovery logic live in ddv-save-schema.
 * Worker output may be untrusted; never use a reported Item as an owned Item.
 */
export const SAVE_COLLECTION_DISCOVERY_CONTRACT=
  'wand.collection.saved-discovery-projection@1' as const;
export const SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA=
  'wand.collection.mapped-save-discovery@1' as const;

export type SavedCollectionDiscoveryStatus=
  'unsupported_schema'|'not_observed'|'incompatible_structure'|
  'partial_inconclusive'|'observed_empty'|'observed_boolean_discovery';
export interface SavedCollectionDiscoveryProjection{
  readonly contract:typeof SAVE_COLLECTION_DISCOVERY_CONTRACT;
  readonly importSchema:typeof SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA;
  readonly saveSchema:number|null;
  readonly status:SavedCollectionDiscoveryStatus;
  readonly entries:readonly Readonly<{itemId:number;discovered:boolean}>[];
  readonly observedReferences:number;
  readonly observedGroups:number;
  readonly invalidReferences:number;
  readonly ambiguousItemIds:number;
  readonly sampled:boolean;
  readonly semantic:'collection_discovery_history_not_ownership';
  readonly nativeEvidenceVersion:'switch-1.25.0';
  readonly currentSteamNativeEquivalentProven:false;
  readonly saveFileModified:false;
  readonly ownershipVerified:false;
  readonly publishable:false;
}

const STATUSES=new Set<SavedCollectionDiscoveryStatus>([
  'unsupported_schema','not_observed','incompatible_structure',
  'partial_inconclusive','observed_empty','observed_boolean_discovery'
]);
const SUPPORTED_SCHEMAS=new Set([624,643]);
const MAX_SETS=512,MAX_GROUPS=8192,MAX_REFERENCES=65_536;
function obj(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function check(condition:unknown):asserts condition{
  if(!condition)throw new TypeError('SAVE_COLLECTION_DISCOVERY_PROJECTION_INVALID');
}
function count(value:unknown,max:number):number{
  check(typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=0&&value<=max);
  return value;
}
function canonicalId(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}

/** Main-thread/Worker trust boundary: rebuild only whitelisted ID/boolean data. */
export function sanitizeSavedCollectionDiscovery(input:unknown):
  SavedCollectionDiscoveryProjection{
  check(obj(input)&&
    input.contract===SAVE_COLLECTION_DISCOVERY_CONTRACT&&
    input.importSchema===SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA&&
    typeof input.status==='string'&&
    STATUSES.has(input.status as SavedCollectionDiscoveryStatus)&&
    input.semantic==='collection_discovery_history_not_ownership'&&
    input.nativeEvidenceVersion==='switch-1.25.0'&&
    input.currentSteamNativeEquivalentProven===false&&
    input.saveFileModified===false&&
    input.ownershipVerified===false&&
    input.publishable===false&&
    typeof input.sampled==='boolean'&&
    Array.isArray(input.entries)&&input.entries.length<=MAX_REFERENCES);
  const status=input.status as SavedCollectionDiscoveryStatus;
  const saveSchema=input.saveSchema===null?null:
    Number.isSafeInteger(input.saveSchema)&&
    typeof input.saveSchema==='number'&&
    Math.abs(input.saveSchema)<=Number.MAX_SAFE_INTEGER
      ?input.saveSchema:null;
  check(input.saveSchema===null||saveSchema!==null);
  const observedReferences=count(input.observedReferences,MAX_REFERENCES);
  const observedGroups=count(input.observedGroups,MAX_GROUPS);
  const invalidReferences=count(input.invalidReferences,
    MAX_REFERENCES+MAX_GROUPS+MAX_SETS);
  const ambiguousItemIds=count(input.ambiguousItemIds,MAX_REFERENCES);
  let lastId=0;
  const entries=input.entries.map((raw:unknown)=>{
    check(obj(raw)&&Object.keys(raw).length===2&&
      Object.prototype.hasOwnProperty.call(raw,'itemId')&&
      Object.prototype.hasOwnProperty.call(raw,'discovered')&&
      canonicalId(raw.itemId)&&raw.itemId>lastId&&
      typeof raw.discovered==='boolean');
    lastId=raw.itemId as number;
    return Object.freeze({itemId:lastId,discovered:raw.discovered as boolean});
  });
  check(entries.length<=observedReferences&&
    entries.length+ambiguousItemIds<=observedReferences);
  const supported=saveSchema!==null&&SUPPORTED_SCHEMAS.has(saveSchema);
  if(status==='unsupported_schema'){
    check(!supported&&entries.length===0&&observedReferences===0&&
      observedGroups===0&&invalidReferences===0&&ambiguousItemIds===0&&
      input.sampled===false);
  }else{
    check(supported);
    if(status==='not_observed'||status==='incompatible_structure')
      check(entries.length===0&&observedReferences===0&&
        observedGroups===0&&invalidReferences===0&&ambiguousItemIds===0&&
        input.sampled===false);
    if(status==='observed_empty')
      check(entries.length===0&&observedReferences===0&&
        invalidReferences===0&&ambiguousItemIds===0&&input.sampled===false);
    if(status==='observed_boolean_discovery')
      check(entries.length>0&&invalidReferences===0&&
        ambiguousItemIds===0&&input.sampled===false);
    if(status==='partial_inconclusive')
      check(invalidReferences>0||ambiguousItemIds>0||input.sampled);
  }
  return Object.freeze({
    contract:SAVE_COLLECTION_DISCOVERY_CONTRACT,
    importSchema:SAVE_COLLECTION_DISCOVERY_IMPORT_SCHEMA,
    saveSchema,status,entries:Object.freeze(entries),
    observedReferences,observedGroups,invalidReferences,ambiguousItemIds,
    sampled:input.sampled as boolean,
    semantic:'collection_discovery_history_not_ownership' as const,
    nativeEvidenceVersion:'switch-1.25.0' as const,
    currentSteamNativeEquivalentProven:false as const,
    saveFileModified:false as const,
    ownershipVerified:false as const,publishable:false as const
  });
}
