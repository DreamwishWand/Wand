/**
 * DB-02 / DB-01 private catalog membership evidence.
 *
 * This is a read-only, typed projection of a *separately SHA-authenticated*
 * offline audit. A supplementary game definition is NOT an acquisition route,
 * collection entry, entitlement, live stock record or player-owned item.
 */
import {canonicalId} from '../game-db/model.ts';

export const CATALOG_EVIDENCE_SCHEMA='wand.db02.db01-evidence@1' as const;

const SHA=/^[a-f0-9]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const NATIVE_SOURCE=/^ddv_Data\/StreamingAssets\/itemlist\/[A-Za-z0-9_-]+\.json$/;
const CATEGORY=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;

export interface SupplementalCatalogDefinition {
  readonly id:string;
  readonly itemId:string;
  readonly classification:'native_definition_only_unclassified'|
    'unresolved_in_partial_native_index';
  readonly nativeCategory:string|null;
  readonly sourceFile:string|null;
  readonly sourceSha256:string|null;
  readonly acquirableVerified:false;
}

export interface AcquisitionCatalogEvidence {
  readonly contract:typeof CATALOG_EVIDENCE_SCHEMA;
  readonly target:Readonly<{platform:string;gameVersion:string}>;
  readonly counts:Readonly<{
    nativeDb01Definitions:number;
    src02RelatedItemIds:number;
    originalSrc01Items:number;
    additionalNativeDefinitions:number;
    unresolvedReferences:number;
  }>;
  readonly crossVersionGuideBlocked:boolean;
  readonly privateSource:true;
  readonly publishable:false;
  readonly inventoryVerified:false;
  readonly eligibilityVerified:false;
  readonly collectibilityVerified:false;
  lookupUnindexedItem(value:string|number):SupplementalCatalogDefinition|null;
}
export interface TrustedCatalogManifestPins {
  /** Must come from independently trusted manifests, never from audit input. */
  readonly src02ManifestSha256:string;
  readonly db01ManifestSha256:string;
}

function record(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function validCount(x:unknown):x is number{
  return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
}
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('SRC02_DB01_'+code);
}
/**
 * Accept only evidence whose source manifest hashes match independent expected
 * SHA-256 values. This function does not re-hash source files: the private
 * offline audit must authenticate them before passing the evidence here.
 */
export function createAcquisitionCatalogEvidence(
  raw:unknown,pins?:TrustedCatalogManifestPins
):AcquisitionCatalogEvidence{
  const source=record(raw)&&record(raw.source)?raw.source:null;
  assert(record(raw)&&record(pins)&&
    typeof pins.src02ManifestSha256==='string'&&
    typeof pins.db01ManifestSha256==='string'&&
    SHA.test(pins.src02ManifestSha256)&&SHA.test(pins.db01ManifestSha256)&&
    raw.schema===CATALOG_EVIDENCE_SCHEMA&&
    raw.status==='partial_source_evidence_not_live_availability'&&
    source!==null&&
    source.src02ManifestSha256===pins.src02ManifestSha256&&
    source.db01ManifestSha256===pins.db01ManifestSha256,
    'VERIFIED_AUDIT_REQUIRED');
  const target=raw.target;
  const limits=raw.limits;
  const guide=raw.guideIntegration;
  assert(record(target)&&target.platform==='Steam'&&
    typeof target.gameVersion==='string'&&VERSION.test(target.gameVersion)&&
    record(limits)&&limits.catalogMembershipOnly===true&&
    limits.liveStockVerified===false&&limits.ownershipVerified===false&&
    limits.questRewardVerified===false&&
    limits.collectibilityOfDefinitionsVerified===false&&
    record(guide)&&guide.rewardRelationVerified===false&&
    Array.isArray(raw.supplementalDefinitions),
    'UNSAFE_AUDIT');
  const counts=raw.counts;
  assert(record(counts)&&validCount(counts.nativeDb01Definitions)&&
    validCount(counts.src02RelatedItemIds)&&
    validCount(counts.originalSrc01Items)&&
    validCount(counts.additionalNativeDefinitions)&&
    validCount(counts.unresolvedReferences)&&
    counts.nativeDb01Definitions>=counts.additionalNativeDefinitions&&
    counts.src02RelatedItemIds===counts.originalSrc01Items+
      counts.additionalNativeDefinitions+counts.unresolvedReferences&&
    raw.supplementalDefinitions.length===
      counts.additionalNativeDefinitions+counts.unresolvedReferences,
    'INVALID_COUNTS');

  const byId=new Map<string,SupplementalCatalogDefinition>();
  let defined=0,unresolved=0;
  for(const rawRow of raw.supplementalDefinitions){
    assert(record(rawRow)&&rawRow.acquirableVerified===false,
      'INVALID_EVIDENCE_ROW');
    const itemId=canonicalId(rawRow.id);
    assert(!byId.has(itemId),'INVALID_EVIDENCE_ROW');
    let row:SupplementalCatalogDefinition;
    if(rawRow.classification==='native_definition_only_unclassified'){
      assert(typeof rawRow.nativeCategory==='string'&&
        CATEGORY.test(rawRow.nativeCategory)&&
        typeof rawRow.sourceFile==='string'&&
        NATIVE_SOURCE.test(rawRow.sourceFile)&&
        typeof rawRow.sourceSha256==='string'&&SHA.test(rawRow.sourceSha256),
        'INVALID_SOURCE');
      row=Object.freeze({
        id:itemId,itemId,
        classification:'native_definition_only_unclassified',
        nativeCategory:rawRow.nativeCategory,
        sourceFile:rawRow.sourceFile,
        sourceSha256:rawRow.sourceSha256,
        acquirableVerified:false
      });
      defined++;
    }else if(rawRow.classification==='unresolved_in_partial_native_index'){
      assert(rawRow.nativeCategory===null&&rawRow.sourceFile===null&&
        rawRow.sourceSha256===null,'UNSAFE_UNRESOLVED');
      row=Object.freeze({
        id:itemId,itemId,
        classification:'unresolved_in_partial_native_index',
        nativeCategory:null,sourceFile:null,sourceSha256:null,
        acquirableVerified:false
      });
      unresolved++;
    }else{
      throw new TypeError('SRC02_DB01_UNKNOWN_CLASSIFICATION');
    }
    byId.set(itemId,row);
  }
  assert(defined===counts.additionalNativeDefinitions&&
    unresolved===counts.unresolvedReferences,'COUNT_MISMATCH');
  const safeTarget=Object.freeze({
    platform:target.platform,gameVersion:target.gameVersion
  });
  const safeCounts=Object.freeze({
    nativeDb01Definitions:counts.nativeDb01Definitions,
    src02RelatedItemIds:counts.src02RelatedItemIds,
    originalSrc01Items:counts.originalSrc01Items,
    additionalNativeDefinitions:counts.additionalNativeDefinitions,
    unresolvedReferences:counts.unresolvedReferences
  });
  return Object.freeze({
    contract:CATALOG_EVIDENCE_SCHEMA,
    target:safeTarget,counts:safeCounts,
    crossVersionGuideBlocked:guide.status==='blocked_cross_version',
    privateSource:true as const,publishable:false as const,
    inventoryVerified:false as const,eligibilityVerified:false as const,
    collectibilityVerified:false as const,
    lookupUnindexedItem(value:string|number){
      return byId.get(canonicalId(value))??null;
    }
  });
}
