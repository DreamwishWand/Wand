/**
 * DB-05 clean-reference regression matrix over already strictly decoded saves.
 *
 * A save produced by a different player or later in a normal playthrough is
 * NOT a time-sequenced modification of the clean reference. Changed counts
 * are not proof of cheats, illegal object moves, save corruption or writer
 * compatibility. Names/IDs/save values are never copied into results.
 */
import { createCleanSaveBaseline } from './clean-baseline.mjs';
import { inspectEditorReadset } from './editor-readset.mjs';
import { probeSaveReferences } from './references.mjs';

export const SAVE_CLEAN_REGRESSION_CONTRACT='wand.db05.clean-save-regression@1';
const LIMIT=14;
const ROOT_FIELDS=60;
const positive=x=>Number.isSafeInteger(x)&&x>=0;
const safeFixed=x=>typeof x==='string'&&x.length<=96&&/^[a-z0-9_]+$/.test(x);
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))freeze(v);
    Object.freeze(x);
  }
  return x;
};

/** Never keep decoded clean save in the returned report. Only count snapshots. */
export function createCleanSaveRegression(cleanDecoded, ownerDeclaration){
  const cleanBaseline=createCleanSaveBaseline(cleanDecoded,ownerDeclaration);
  const originalReadset=inspectEditorReadset(cleanDecoded);
  const originalRefs=probeSaveReferences(cleanDecoded);
  if(originalReadset.fields.length!==ROOT_FIELDS ||
    !originalRefs.rootValid||originalRefs.rules.length!==LIMIT)
    throw new TypeError('DB05_CLEAN_REGRESSION_REFERENCE_WITNESS_INVALID');

  // These projections contain only immutable static IDs and aggregate counts.
  const baselineReadset=originalReadset.fields.map(r=>Object.freeze({
    id:r.id,domain:r.domain,observed:r.observed,children:r.children,
    mismatched:r.mismatched,branchTypeIssues:r.branchTypeIssues,
    sampled:r.sampled
  }));
  const baselineRef=originalRefs.rules.map(r=>Object.freeze({
    id:r.id,status:r.status,observed:r.observed,resolved:r.resolved,
    unresolved:r.unresolved,missing:r.missing,malformed:r.malformed,
    typeIssues:r.typeIssues,sampled:r.sampled
  }));
  if(baselineReadset.some(r=>!safeFixed(r.id)||!safeFixed(r.domain)) ||
     baselineRef.some(r=>!safeFixed(r.id)))
    throw new TypeError('DB05_CLEAN_REGRESSION_PUBLIC_LABEL_INVALID');

  const reference=freeze({
    contract:SAVE_CLEAN_REGRESSION_CONTRACT,
    cleanClaim:cleanBaseline.reference.status,
    ownerDeclarationTechnicallyVerified:false,
    knownStructureTemplates:cleanBaseline.reference.fieldCount,
    editorReadsetTemplates:baselineReadset.length,
    referenceRelationRules:baselineRef.length,
    baselineReadset:originalReadset.domains.map(r=>({
      domain:r.domain,registered:r.registered,
      observed:r.observed,notObserved:r.notObserved,
      observedKindDifference:r.observedKindDifference,sampled:r.sampled
    })),
    baselineReferenceStatus:originalRefs.status,
    platformOrVersionGated:false,
    actualSaveBuildVerified:false,
    sameAccountHistoryVerified:false,
    actualSourceValuesCaptured:false,
    writerAuthorized:false,
    exportAuthorized:false
  });
  return Object.freeze({
    contract:SAVE_CLEAN_REGRESSION_CONTRACT,
    reference,
    compare(candidateDecoded){
      const structure=cleanBaseline.compare(candidateDecoded);
      const readset=inspectEditorReadset(candidateDecoded);
      const refs=probeSaveReferences(candidateDecoded);
      if(readset.fields.length!==baselineReadset.length ||
         !refs.rootValid||refs.rules.length!==baselineRef.length)
        throw new TypeError('DB05_CLEAN_REGRESSION_CANDIDATE_WITNESS_INVALID');

      let changedCounts=0,missingReadset=0,newTypeDifferences=0;
      const changedFieldIds=[],missingFieldIds=[],typeCandidateIds=[],sampledFieldIds=[];
      const domains=new Map();
      for(let i=0;i<baselineReadset.length;i++){
        const a=baselineReadset[i],b=readset.fields[i];
        if(a.id!==b.id||a.domain!==b.domain)
          throw new TypeError('DB05_CLEAN_REGRESSION_READSET_ORDER_CHANGED');
        const countDrift=a.observed!==b.observed||a.children!==b.children;
        const missing=a.observed>0&&b.observed===0;
        const typeDifference=b.mismatched>a.mismatched||
          b.branchTypeIssues>a.branchTypeIssues;
        const sampled=a.sampled||b.sampled;
        if(countDrift){changedCounts++;changedFieldIds.push(a.id);}
        if(missing){missingReadset++;missingFieldIds.push(a.id);}
        if(typeDifference){newTypeDifferences++;typeCandidateIds.push(a.id);}
        if(sampled)sampledFieldIds.push(a.id);
        const d=domains.get(a.domain)??{
          domain:a.domain,fieldTemplates:0,cardinalityDrift:0,
          newlyUnobserved:0,newKindDifferenceCandidates:0,sampled:0
        };
        d.fieldTemplates++;
        if(countDrift)d.cardinalityDrift++;
        if(missing)d.newlyUnobserved++;
        if(typeDifference)d.newKindDifferenceCandidates++;
        if(sampled)d.sampled++;
        domains.set(a.domain,d);
      }

      const changedReferenceIds=[],sampledReferences=[];
      for(let i=0;i<baselineRef.length;i++){
        const a=baselineRef[i],b=refs.rules[i];
        if(a.id!==b.id)throw new TypeError('DB05_CLEAN_REGRESSION_REFERENCE_RULE_CHANGED');
        const changed=a.status!==b.status||a.observed!==b.observed||
          a.resolved!==b.resolved||a.unresolved!==b.unresolved||
          a.missing!==b.missing||a.malformed!==b.malformed||
          a.typeIssues!==b.typeIssues||a.sampled!==b.sampled;
        if(changed)changedReferenceIds.push(a.id);
        if(a.sampled||b.sampled)sampledReferences.push(a.id);
      }
      const inconclusive=structure.sampledFields.length>0||
        sampledFieldIds.length>0||sampledReferences.length>0;
      const status=inconclusive?'sampled_inconclusive':
        newTypeDifferences>0||structure.typeDifferenceCandidates.length>0
          ?'observed_kind_difference':
        missingReadset>0||structure.optionalFieldsNotObserved.length>0
          ?'optional_fields_not_observed':
        changedCounts>0||structure.cardinalityDifferentFields.length>0||
        changedReferenceIds.length>0
          ?'observed_count_or_relation_drift':'same_observed_structural_counts';
      const result={
        contract:SAVE_CLEAN_REGRESSION_CONTRACT,
        status,
        observedSaveSchema:positive(candidateDecoded?.GameInfo?.Version)?
          candidateDecoded.GameInfo.Version:null,
        baseline:structure,
        editorReadset:{
          fixedTemplates:baselineReadset.length,
          changedCardinalityFields:changedCounts,
          newlyUnobservedFields:missingReadset,
          newKindDifferenceCandidates:newTypeDifferences,
          changedFieldIds,
          missingFieldIds,
          typeCandidateIds,
          sampledFieldIds,
          domains:[...domains.values()]
        },
        referenceGraph:{
          fixedRelations:baselineRef.length,
          baselineStatus:originalRefs.status,
          candidateStatus:refs.status,
          changedRuleIds:changedReferenceIds,
          sampledRuleIds:sampledReferences
        },
        comparisonBasis:'fixed_structural_counts_not_record_identity',
        twoSavesMayBelongToDifferentPlayers:true,
        noContinuousSaveHistoryEstablished:true,
        unchangedCountsDoNotImplyIdenticalSaves:true,
        absenceDoesNotProveCorruption:true,
        driftDoesNotProveCheatsOrIllegalObjectEdits:true,
        observedKindDifferenceIsOnlyDiagnostic:true,
        sourceVersionIsNotCompatibilityGate:true,
        onlySourceNativeIdCandidatesKnown:true,
        unknownFieldsNotReconstructed:true,
        writerAuthorized:false,
        exportAuthorized:false
      };
      return freeze(result);
    }
  });
}
