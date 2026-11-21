/** Source-gated evidence for IDs outside SRC-02's original partial SRC-01 catalog. */
import { canonicalId } from '../game-db/model.mjs';

export const CATALOG_EVIDENCE_SCHEMA = 'wand.db02.db01-evidence@1';
const SHA = /^[a-f0-9]{64}$/;

/**
 * An audit is produced by the private, SHA-verifying audit_catalog.mjs tool.
 * Both expected hashes MUST come from the trusted provider's signed/verified
 * manifest ledger; accepting a hash computed from attacker-supplied data is
 * not meaningful verification. Nothing here authorizes stock or entitlement.
 */
export function createAcquisitionCatalogEvidence(audit, {src02ManifestSha256, db01ManifestSha256} = {}) {
  if (!SHA.test(src02ManifestSha256 ?? '') || !SHA.test(db01ManifestSha256 ?? '') ||
      audit?.schema !== CATALOG_EVIDENCE_SCHEMA ||
      audit.status !== 'partial_source_evidence_not_live_availability' ||
      audit.source?.src02ManifestSha256 !== src02ManifestSha256 ||
      audit.source?.db01ManifestSha256 !== db01ManifestSha256) {
    throw new TypeError('SRC02_DB01_VERIFIED_AUDIT_REQUIRED');
  }
  if (!audit.target?.platform || !audit.target?.gameVersion ||
      audit.limits?.catalogMembershipOnly !== true ||
      audit.limits?.liveStockVerified !== false ||
      audit.limits?.collectibilityOfDefinitionsVerified !== false ||
      audit.guideIntegration?.rewardRelationVerified !== false ||
      !Array.isArray(audit.supplementalDefinitions)) {
    throw new TypeError('SRC02_DB01_UNSAFE_AUDIT');
  }
  const counts=audit.counts;
  if (!counts || !Number.isSafeInteger(counts.src02RelatedItemIds) ||
      !Number.isSafeInteger(counts.originalSrc01Items) ||
      !Number.isSafeInteger(counts.additionalNativeDefinitions) ||
      !Number.isSafeInteger(counts.unresolvedReferences) ||
      counts.src02RelatedItemIds !== counts.originalSrc01Items +
         counts.additionalNativeDefinitions + counts.unresolvedReferences ||
      audit.supplementalDefinitions.length !== counts.additionalNativeDefinitions + counts.unresolvedReferences) {
    throw new TypeError('SRC02_DB01_INVALID_COUNTS');
  }
  const byId=new Map();
  let defined=0, unresolved=0;
  for(const row of audit.supplementalDefinitions){
    const id=canonicalId(row.id);
    if(byId.has(id) || row.acquirableVerified !== false) throw new TypeError('SRC02_DB01_INVALID_EVIDENCE_ROW');
    if(row.classification==='native_definition_only_unclassified'){
      if(!row.nativeCategory || !row.sourceFile || !SHA.test(row.sourceSha256??'')) throw new TypeError('SRC02_DB01_INVALID_SOURCE');
      defined++;
    }else if(row.classification==='unresolved_in_partial_native_index'){
      if(row.nativeCategory !== null || row.sourceFile !== null || row.sourceSha256 !== null) throw new TypeError('SRC02_DB01_UNSAFE_UNRESOLVED');
      unresolved++;
    }else throw new TypeError('SRC02_DB01_UNKNOWN_CLASSIFICATION');
    byId.set(id,Object.freeze({...row, itemId:id}));
  }
  if(defined!==counts.additionalNativeDefinitions || unresolved!==counts.unresolvedReferences) throw new TypeError('SRC02_DB01_COUNT_MISMATCH');
  return Object.freeze({
    contract:CATALOG_EVIDENCE_SCHEMA,
    target:Object.freeze({...audit.target}),
    counts:Object.freeze({...counts}),
    crossVersionGuideBlocked:audit.guideIntegration?.status==='blocked_cross_version',
    privateSource:true, publishable:false, inventoryVerified:false,
    eligibilityVerified:false, collectibilityVerified:false,
    lookupUnindexedItem(value) {return byId.get(canonicalId(value))??null;},
  });
}