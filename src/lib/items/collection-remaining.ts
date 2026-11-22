/** Steam 1.26.2 original CollectionActivity and CollectionCrafting predicates.
 * Source-exact positive candidates and NEGATIVE exclusions remain separate.
 * No runtime Collection visibility, world acquisition, or DLC rights implied.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';

export const DB01_REMAINING_SCHEMA='wand.db01.collection-activity-crafting@1' as const;
export const DB01_REMAINING_EVIDENCE=
  'current_original_activity_or_crafting_predicate' as const;

export interface Db01RemainingPositive {
  readonly collectionSetId:number;
  readonly groupIndex:number;
  readonly selectorIndex:number;
  readonly activityCase:number|null;
  readonly sourceField:string;
  readonly criterion:number;
  readonly criterionName:string|null;
  readonly sourceRecipeItemId:number|null;
  readonly sourceRule:string;
  readonly evidence:typeof DB01_REMAINING_EVIDENCE;
  readonly sourcePredicateMatched:true;
  readonly gameUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01RemainingNegative {
  readonly collectionSetId:number;
  readonly groupIndex:number;
  readonly selectorIndex:number;
  readonly criterion:number;
  readonly criterionName:string;
  readonly sourceRecipeItemId:number;
  readonly sourceRule:'source_crafting_recipe_type_and_result_item_id';
  readonly evidence:typeof DB01_REMAINING_EVIDENCE;
  readonly negative:true;
  readonly gameUiMembershipVerified:false;
}
export interface Db01RemainingSelector {
  readonly collectionSetId:number;
  readonly submenuCode:number;
  readonly groupIndex:number;
  readonly selectorIndex:number;
  readonly sourceKind:'activity'|'crafting';
  readonly activityCase:number|null;
  readonly sourceField:string;
  readonly criterion:number;
  readonly criterionName:string|null;
  readonly negative:boolean;
  readonly matchedSourceRecordCount:number;
  readonly selectedItemIdCount:number;
  readonly explicitlyExcludedCount:number;
  readonly sourceRule:string;
  readonly gameUiMembershipVerified:false;
}
export interface Db01RemainingResult {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly sourceSha256:string;
  readonly positive:readonly Readonly<Db01RemainingPositive>[];
  readonly negative:readonly Readonly<Db01RemainingNegative>[];
}
export interface Db01RemainingManifest {
  readonly schema:typeof DB01_REMAINING_SCHEMA;
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly platform:'Steam';
  readonly gameVersion:string;
  readonly sourceSqliteSha256:string;
  readonly sourceItemsSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly originalCategorySha256:Readonly<Record<string,string>>;
  readonly definitionCount:number;
  readonly sourceSelectorCount:number;
  readonly resolvedActivitySelectors:number;
  readonly resolvedCraftingSelectors:number;
  readonly unresolvedActivityCraftingSelectors:0;
  readonly sourceMatchedPositiveItemIds:number;
  readonly sourceMatchedNegativeItemIds:number;
  readonly sourceMatchedCombinedItemIds:number;
  readonly positiveAssociations:number;
  readonly negativeAssociations:number;
  readonly sameGroupActivityPositiveSuppressed:number;
  readonly gameRuntimeMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
  readonly bucketCount:256;
  readonly files:Readonly<Record<string,
    Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01RemainingClient {
  readonly source:Readonly<Pick<Db01RemainingManifest,
    'gameVersion'|'sourceSqliteSha256'|'sourceItemsSha256'|
    'sourceIl2cppDumpSha256'|'definitionCount'|'sourceSelectorCount'|
    'resolvedActivitySelectors'|'resolvedCraftingSelectors'|
    'sourceMatchedPositiveItemIds'|'sourceMatchedNegativeItemIds'>>;
  getItem(id:number):Promise<Readonly<Db01RemainingResult>|null>;
  getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01RemainingResult>|null)[]>;
  getSelectors():Promise<readonly Readonly<Db01RemainingSelector>[]>;
}
const SHA=/^[a-f0-9]{64}$/;
const CATEGORIES=['CollectionSet','Tag','ActivityItem','ActivityData'] as const;
const paths=['selectors.json',
  ...Array.from({length:256},(_,i)=>'id/'+i.toString(16).padStart(2,'0')+'.json')];
const obj=(x:unknown):x is Record<string,unknown>=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const nonneg=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const id=(x:unknown):x is number=>nonneg(x)&&x>0;
const word=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256&&x.trim()===x&&
  !/[\x00-\x1f]/.test(x);
const bucket=(x:number)=>'id/'+(x%256).toString(16).padStart(2,'0')+'.json';
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_REMAINING_'+reason);
}
export function validateDb01RemainingManifest(value:unknown):
  asserts value is Db01RemainingManifest {
  check(obj(value)&&value.schema===DB01_REMAINING_SCHEMA&&
    value.platform==='Steam'&&typeof value.gameVersion==='string'&&
    /^\d+\.\d+\.\d+$/.test(value.gameVersion)&&
    value.privateOnly===true&&value.publicationAuthorized===false&&
    value.bucketCount===256&&value.unresolvedActivityCraftingSelectors===0&&
    value.gameRuntimeMembershipVerified===false&&
    value.worldAvailabilityVerified===false&&
    value.dlcOwnershipVerified===false,'SOURCE_CONTRACT');
  check([value.sourceSqliteSha256,value.sourceItemsSha256,
    value.sourceIl2cppDumpSha256].every(x=>typeof x==='string'&&SHA.test(x)),
    'SHA_PROVENANCE');
  const orig=obj(value.originalCategorySha256)?value.originalCategorySha256:{};
  check(Object.keys(orig).length===CATEGORIES.length&&
    CATEGORIES.every(cat=>typeof orig[cat]==='string'&&SHA.test(orig[cat] as string)),
    'ORIGINAL_SOURCE_LEDGER');
  check([value.definitionCount,value.sourceSelectorCount,
    value.resolvedActivitySelectors,value.resolvedCraftingSelectors,
    value.sourceMatchedPositiveItemIds,value.sourceMatchedNegativeItemIds,
    value.sourceMatchedCombinedItemIds,value.positiveAssociations,
    value.negativeAssociations,value.sameGroupActivityPositiveSuppressed]
    .every(nonneg)&&value.definitionCount>0&&
    value.sourceSelectorCount===
      value.resolvedActivitySelectors+value.resolvedCraftingSelectors&&
    value.sourceMatchedCombinedItemIds>=
      Math.max(value.sourceMatchedPositiveItemIds,value.sourceMatchedNegativeItemIds)&&
    value.sourceMatchedCombinedItemIds<=
      value.sourceMatchedPositiveItemIds+value.sourceMatchedNegativeItemIds&&
    value.sourceMatchedCombinedItemIds<=value.definitionCount&&
    value.sourceMatchedPositiveItemIds<=value.positiveAssociations&&
    value.sourceMatchedNegativeItemIds<=value.negativeAssociations,
    'COUNT_LEDGER');
  check(obj(value.files)&&Object.keys(value.files).length===paths.length&&
    paths.every(path=>Object.prototype.hasOwnProperty.call(value.files,path)),
    'FILE_SET');
  const files=value.files as Record<string,unknown>;
  let itemTotal=0;
  for(const path of paths){
    const f=files[path];
    check(obj(f)&&typeof f.sha256==='string'&&SHA.test(f.sha256)&&
      nonneg(f.bytes)&&f.bytes>=3&&f.bytes<24_000_000&&nonneg(f.count),
      'FILE_METADATA');
    if(path==='selectors.json')
      check(f.count===value.sourceSelectorCount,'SELECTORS_COUNT');
    else itemTotal+=f.count;
  }
  check(itemTotal===value.sourceMatchedCombinedItemIds,'ITEM_BUCKET_TOTAL');
}
function assertPositive(x:unknown):asserts x is Db01RemainingPositive{
  check(obj(x)&&id(x.collectionSetId)&&nonneg(x.groupIndex)&&
    nonneg(x.selectorIndex)&&
    (x.activityCase===null||(nonneg(x.activityCase)&&x.activityCase>0))&&
    word(x.sourceField)&&nonneg(x.criterion)&&
    (x.criterionName===null||word(x.criterionName))&&
    (x.sourceRecipeItemId===null||id(x.sourceRecipeItemId))&&
    word(x.sourceRule)&&x.evidence===DB01_REMAINING_EVIDENCE&&
    x.sourcePredicateMatched===true&&x.gameUiMembershipVerified===false&&
    x.worldAvailabilityVerified===false&&x.dlcOwnershipVerified===false,
    'POSITIVE_LINK');
  check((x.activityCase===null)===(x.sourceRecipeItemId!==null),
    'RECIPE_VS_ACTIVITY');
}
function assertNegative(x:unknown):asserts x is Db01RemainingNegative{
  check(obj(x)&&id(x.collectionSetId)&&nonneg(x.groupIndex)&&
    nonneg(x.selectorIndex)&&nonneg(x.criterion)&&
    word(x.criterionName)&&id(x.sourceRecipeItemId)&&
    x.sourceRule==='source_crafting_recipe_type_and_result_item_id'&&
    x.evidence===DB01_REMAINING_EVIDENCE&&
    x.negative===true&&x.gameUiMembershipVerified===false,
    'NEGATIVE_LINK');
}
function assertSelector(x:unknown):asserts x is Db01RemainingSelector{
  check(obj(x)&&id(x.collectionSetId)&&nonneg(x.submenuCode)&&
    nonneg(x.groupIndex)&&nonneg(x.selectorIndex)&&
    (x.sourceKind==='activity'||x.sourceKind==='crafting')&&
    (x.activityCase===null||nonneg(x.activityCase))&&
    word(x.sourceField)&&nonneg(x.criterion)&&
    (x.criterionName===null||word(x.criterionName))&&
    typeof x.negative==='boolean'&&nonneg(x.matchedSourceRecordCount)&&
    nonneg(x.selectedItemIdCount)&&nonneg(x.explicitlyExcludedCount)&&
    word(x.sourceRule)&&x.gameUiMembershipVerified===false,
    'SELECTOR_LINK');
  check(!x.negative||x.sourceKind==='crafting','NEGATIVE_ACTIVITY_NOT_ALLOWED');
}

export function createDb01RemainingClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient
):Db01RemainingClient{
  validateDb01RemainingManifest(raw);
  check(typeof loadBytes==='function'&&catalog?.source?.privateOnly===true&&
    catalog.source.platform===raw.platform&&
    catalog.source.gameVersion===raw.gameVersion&&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256&&
    catalog.source.definitions===raw.definitionCount&&
    typeof catalog.getItem==='function'&&typeof catalog.getItems==='function',
    'CATALOG_IDENTITY');
  const m:Db01RemainingManifest=Object.freeze({...raw,
    originalCategorySha256:Object.freeze({...raw.originalCategorySha256}),
    files:Object.freeze(Object.fromEntries(Object.entries(raw.files).map(
      ([path,info])=>[path,Object.freeze({...info})]))),
  });
  const cache=new Map<string,Promise<readonly unknown[]>>();
  async function read(path:string):Promise<readonly unknown[]>{
    const prior=cache.get(path);if(prior)return prior;
    const task=(async()=>{
      const info=m.files[path];check(info,'UNKNOWN_PATH');
      const payload=await loadBytes(path);
      const data=payload instanceof ArrayBuffer?new Uint8Array(payload):payload;
      check(data instanceof Uint8Array&&data.byteLength===info.bytes,'SIZE_MISMATCH');
      const copy=new Uint8Array(data);
      check(globalThis.crypto?.subtle,'WEBCRYPTO_REQUIRED');
      const digest=await crypto.subtle.digest('SHA-256',copy);
      const hex=Array.from(new Uint8Array(digest),v=>
        v.toString(16).padStart(2,'0')).join('');
      check(hex===info.sha256,'SHA_MISMATCH');
      const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));
      check(Array.isArray(parsed)&&parsed.length===info.count,'RECORD_COUNT');
      const seen=new Set<number>();
      for(const record of parsed){
        if(path==='selectors.json'){
          assertSelector(record);
        }else{
          check(obj(record)&&id(record.itemId)&&bucket(record.itemId)===path&&
            !seen.has(record.itemId)&&word(record.nativeCategory)&&
            typeof record.sourceSha256==='string'&&SHA.test(record.sourceSha256)&&
            Array.isArray(record.positive)&&Array.isArray(record.negative)&&
            record.positive.length+record.negative.length>0,
            'ITEM_IDENTITY');
          seen.add(record.itemId);
          for(const link of record.positive){assertPositive(link);Object.freeze(link);}
          for(const link of record.negative){assertNegative(link);Object.freeze(link);}
          const negativeSet=new Set(record.negative.map((l:Db01RemainingNegative)=>
            l.collectionSetId+':'+l.groupIndex));
          check(record.positive.every((l:Db01RemainingPositive)=>
            !negativeSet.has(l.collectionSetId+':'+l.groupIndex)),
            'SAME_GROUP_EXCLUSION_CONFLICT');
          Object.freeze(record.positive);Object.freeze(record.negative);
        }
        Object.freeze(record);
      }
      return Object.freeze(parsed);
    })();
    cache.set(path,task);
    try{return await task;}catch(error){cache.delete(path);throw error;}
  }
  async function getItems(ids:readonly number[]):Promise<
    readonly (Readonly<Db01RemainingResult>|null)[]
  >{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(id),'INVALID_BATCH');
    if(!ids.length)return Object.freeze([]);
    const buckets=[...new Set(ids.map(bucket))];
    const found=new Map<number,Db01RemainingResult>();
    let next=0;
    await Promise.all(Array.from({length:Math.min(8,buckets.length)},async()=>{
      while(next<buckets.length){
        for(const row of await read(buckets[next++])) {
          const entry=row as Db01RemainingResult;
          found.set(entry.itemId,entry);
        }
      }
    }));
    const canon=await catalog.getItems(ids);
    check(canon.length===ids.length,'BASE_BATCH_SIZE');
    return Object.freeze(ids.map((itemId,index)=>{
      const candidate=found.get(itemId);
      if(!candidate)return null;
      const base=canon[index];
      check(base?.itemId===candidate.itemId&&
        base.nativeCategory===candidate.nativeCategory&&
        base.sourceSha256===candidate.sourceSha256,'CANONICAL_ITEM_MISMATCH');
      return candidate;
    }));
  }
  async function getItem(itemId:number){
    check(id(itemId),'ITEM_ID');
    return (await getItems([itemId]))[0];
  }
  async function getSelectors(){
    return await read('selectors.json') as readonly Readonly<Db01RemainingSelector>[];
  }
  return Object.freeze({
    source:Object.freeze({
      gameVersion:m.gameVersion,
      sourceSqliteSha256:m.sourceSqliteSha256,
      sourceItemsSha256:m.sourceItemsSha256,
      sourceIl2cppDumpSha256:m.sourceIl2cppDumpSha256,
      definitionCount:m.definitionCount,
      sourceSelectorCount:m.sourceSelectorCount,
      resolvedActivitySelectors:m.resolvedActivitySelectors,
      resolvedCraftingSelectors:m.resolvedCraftingSelectors,
      sourceMatchedPositiveItemIds:m.sourceMatchedPositiveItemIds,
      sourceMatchedNegativeItemIds:m.sourceMatchedNegativeItemIds,
    }),
    getItem,getItems,getSelectors,
  });
}
