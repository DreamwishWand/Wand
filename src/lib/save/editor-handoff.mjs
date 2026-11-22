/**
 * DB-05 formal, source-consistent, read-only handoff for the Save Editor.
 *
 * Cross-domain links are CANDIDATES backed by independent read-only DB-01,
 * DB-03 and DB-04 manifests. This module does not load private catalogs,
 * validate a game runtime, authorize writes, reconstruct unknown JSON, or
 * return player IDs, account values, map keys, item names, or saved values.
 */
import handoff from '../../../data/ddv/save/editor-handoff.v1.json' with {type:'json'};
import {getEditorReadset,inspectEditorReadset} from './editor-readset.mjs';
import {getSaveReferenceRelations,probeSaveReferences} from './references.mjs';
import {getSaveCatalogLinkRules} from './catalog-links.mjs';
import {getSaveGuideLinkRules} from './guide-links.mjs';
import {getSaveAchievementLinkRules} from './achievement-links.mjs';
import {inspectDecodedSave} from './registry.mjs';

export const SAVE_EDITOR_HANDOFF_CONTRACT='wand.db05.editor-readonly-handoff@1';
const expected={'DB-01':5,'DB-03':2,'DB-04':1};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function freeze(x){
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))freeze(v);
    Object.freeze(x);
  }
  return x;
}
function normalized(path){
  return path.replace(/\/\{[A-Za-z][A-Za-z0-9]*\}/g,'/{id}');
}
function validate(){
  const r=getEditorReadset(),g=getSaveReferenceRelations(),
    catalog=getSaveCatalogLinkRules(),
    quests=getSaveGuideLinkRules(),
    achievements=getSaveAchievementLinkRules();
  if(handoff.schema!==SAVE_EDITOR_HANDOFF_CONTRACT||
     r.schema!==handoff.sourceContracts.editorReadset||
     g.schema!==handoff.sourceContracts.referenceGraph||
     catalog.schema!==handoff.sourceContracts.catalogLinks||
     quests.schema!==handoff.sourceContracts.questLinks||
     achievements.schema!==handoff.sourceContracts.achievementLinks||
     r.fields.length!==handoff.handoffScope.expectedReadsetTemplates||
     g.rules.length!==handoff.handoffScope.expectedReferenceRules||
     handoff.links.length!==
       handoff.handoffScope.expectedExistingCandidateLinks+
       handoff.handoffScope.expectedUnverifiedReadsetOnlyCandidates||
     handoff.safety.editorWriterAuthorized!==false||
     handoff.safety.exportAuthorized!==false)
    throw new TypeError('DB05_EDITOR_HANDOFF_MANIFEST_CONFLICT');

  const fields=new Map(r.fields.map(x=>[x.id,x]));
  const families=[
    ...catalog.families.map(x=>({...x,origin:'catalog'})),
    ...quests.families.map(x=>({...x,origin:'quest'})),
    ...achievements.families.map(x=>({...x,origin:'achievement'}))
  ];
  const sources=new Map(families.map(x=>[x.id,x]));
  const seen=new Set(),catalogCounts={'DB-01':0,'DB-03':0,'DB-04':0};
  let verifiedCandidateRules=0,readsetOnly=0;
  for(const link of handoff.links){
    if(!plain(link)||seen.has(link.id)||link.id.length>96||
       !/^[a-z0-9_]+$/.test(link.id)||link.writable!==false||
       link.joinStrength!=='candidate_only'||
       !Object.hasOwn(expected,link.catalog))throw new TypeError('DB05_EDITOR_HANDOFF_LINK_INVALID');
    seen.add(link.id);
    const field=fields.get(link.fieldId);
    if(!field||field.writable!==false||
       !field.referenceCandidate?.startsWith(link.catalog.replace('-','')+':'))
      throw new TypeError('DB05_EDITOR_HANDOFF_READSET_LINK_INVALID');
    if(link.sourceFamily===null){
      if(link.id!=='container_parent_item'||
         link.evidence!=='readset_candidate_only_no_proven_catalog_join'||
         normalized(field.path)!==
           '/Player/ContainerInventories/{id}/ParentItemID'||
         field.allowedJsonKinds.join('|')!=='integer|null')
        throw new TypeError('DB05_EDITOR_HANDOFF_UNVERIFIED_LINK_INVALID');
      readsetOnly++;
      continue;
    }
    const source=sources.get(link.sourceFamily);
    const category=link.catalog==='DB-01'?'item':
      link.catalog==='DB-04'?'grid_source':'db03';
    if(!source||source.id!==link.id||link.evidence!==
       (link.catalog==='DB-03'?
         (source.origin==='quest'?'existing_db05_quest_link_rule':
          'existing_db05_achievement_link_rule'):
        'existing_db05_catalog_link_rule'))
      throw new TypeError('DB05_EDITOR_HANDOFF_SOURCE_LINK_INVALID');
    if(source.origin==='catalog'){
      if(source.catalog!==(category==='db03'?'item':category))
        throw new TypeError('DB05_EDITOR_HANDOFF_NAMESPACE_INVALID');
    }else if(link.catalog!=='DB-03')
      throw new TypeError('DB05_EDITOR_HANDOFF_NAMESPACE_INVALID');
    const a=normalized(source.path),b=normalized(field.path);
    if(a!==b && !(source.extraction==='canonical_map_key'&&
      a===b+'/{id}'))
      throw new TypeError('DB05_EDITOR_HANDOFF_PATH_MISMATCH');
    verifiedCandidateRules++;
    catalogCounts[link.catalog]++;
  }
  for(const [k,v] of Object.entries(expected))
    if(catalogCounts[k]!==v)throw new TypeError('DB05_EDITOR_HANDOFF_CATALOG_COVERAGE_MISMATCH');
  if(verifiedCandidateRules!==handoff.handoffScope.expectedExistingCandidateLinks||
     readsetOnly!==handoff.handoffScope.expectedUnverifiedReadsetOnlyCandidates)
    throw new TypeError('DB05_EDITOR_HANDOFF_RULE_COVERAGE_MISMATCH');
  const deferred=handoff.handoffScope.deferredCatalogFamilies;
  if(deferred.length!==2||!deferred.includes('mount_item')||
     !deferred.includes('village_scene')||
     !deferred.every(id=>sources.has(id)&&!seen.has(id)))
    throw new TypeError('DB05_EDITOR_HANDOFF_DEFERRED_SOURCE_RULE_MISMATCH');
}
freeze(handoff);
// Validate on first handoff use. Other DB-05 readers must not fail merely
// because the optional editor handoff's source catalogs drifted in parallel.
let validated=false;
function checkedHandoff(){
  if(!validated){validate();validated=true;}
  return handoff;
}

/** Source-backed, recursively immutable public contract; never a Writer API. */
export function getSaveEditorHandoff(){return checkedHandoff();}

/** Consume strictly decoded profile in memory; return anonymous evidence only. */
export function inspectSaveEditorHandoff(decoded){
  checkedHandoff();
  if(!inspectDecodedSave(decoded,null).rootShapeValid)
    throw new TypeError('DB05_EDITOR_HANDOFF_STRICT_ROOT_REQUIRED');
  const readset=inspectEditorReadset(decoded);
  const refs=probeSaveReferences(decoded);
  const fields=new Map(readset.fields.map(row=>[row.id,row]));
  const links=Object.freeze(handoff.links.map(link=>{
    const row=fields.get(link.fieldId);
    if(!row)throw new TypeError('DB05_EDITOR_HANDOFF_MISSING_FIELD');
    const status=row.sampled?'sampled_inconclusive':
      row.mismatched>0||row.branchTypeIssues>0?'observed_kind_difference':
      row.observed>0?'candidate_field_observed':'not_observed';
    return Object.freeze({
      id:link.id,catalog:link.catalog,
      evidence:link.evidence,
      status,
      observed:row.observed,
      sourceIdMatchVerified:false,
      writerAuthorized:false
    });
  }));
  const sampledRuleIds=Object.freeze(refs.rules.filter(x=>x.sampled).map(x=>x.id));
  const diagnosticRuleIds=Object.freeze(refs.rules.filter(x=>
    x.status==='observed_anomaly').map(x=>x.id));
  return Object.freeze({
    contract:SAVE_EDITOR_HANDOFF_CONTRACT,
    status:readset.status==='sampled_inconclusive'||sampledRuleIds.length>0
      ?'sampled_inconclusive':
      readset.status==='observed_kind_difference'
        ?'observed_kind_difference':'read_only_evidence',
    registeredEditorFields:readset.knownFieldTemplateCount,
    readsetDomains:readset.domains,
    catalogCandidates:links,
    referenceGraph:Object.freeze({
      fixedRules:refs.rules.length,status:refs.status,
      sampledRuleIds,diagnosticRuleIds,
      completeReferenceClosureVerified:false
    }),
    strictCodecProvenanceExternallyRequired:true,
    candidateCatalogSourceVerificationExternallyRequired:true,
    ownerSaveWasCleanNotProven:true,
    missingObjectsAreNotCorruption:true,
    defaultDiffGridsAreNotPlayerEdits:true,
    gameVersionIsNotCompatibilityGate:true,
    sourceIdMatchVerified:false,
    itemOwnershipOrEntitlementVerified:false,
    unknownFieldsMustRemainUnmodified:true,
    losslessUnknownFieldPreservationVerified:false,
    originalP1gRoundtripVerified:false,
    saveWriterAuthorized:false,
    exportAuthorized:false
  });
}
