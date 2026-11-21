/**
 * DB-05 fixed editor readset: verified *observations* from an owner-declared
 * fresh, unmodified schema-643 save; NOT a mutation/entitlement/validity schema.
 *
 * Scans only fixed public paths. Raw values, IDs, names, map keys, source
 * bytes, and player-specific fields are never emitted or stored.
 */
import readset from '../../../data/ddv/save/editor-readset.v1.json' with {type:'json'};
import {inspectDecodedSave} from './registry.mjs';

export const SAVE_EDITOR_READSET_CONTRACT='wand.db05.editor-readset-observation@1';
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const isInteger=x=>typeof x==='number'&&Number.isSafeInteger(x);
const kind=x=>x===null?'null':Array.isArray(x)?'array':
  isRecord(x)?'object':isInteger(x)?'integer':
  typeof x==='number'?'number':typeof x;
const MAP=/^\{[A-Za-z][A-Za-z0-9]*\}$/;
const MAX_BRANCH=readset.traversal.maxBranchEntries;
const MAX_VISITS=readset.traversal.maxVisitsPerField;
function freeze(value){
  if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const x of Object.values(value))freeze(x);
    Object.freeze(value);
  }
  return value;
}
freeze(readset);
export function getEditorReadset(){return readset;}

function inspectPath(root,path,allowed){
  let frontier=[root],visits=0,sampled=false,branchTypeIssues=0;
  const tokens=path.slice(1).split('/');
  for(const token of tokens){
    const next=[];
    for(const value of frontier){
      if(visits>=MAX_VISITS||next.length>=MAX_BRANCH){sampled=true;break;}
      if(MAP.test(token)){
        if(!isRecord(value)){branchTypeIssues++;continue;}
        const keys=Object.keys(value);
        if(keys.length>MAX_BRANCH||keys.length+visits>MAX_VISITS)sampled=true;
        for(const key of keys){
          if(next.length>=MAX_BRANCH||visits>=MAX_VISITS){sampled=true;break;}
          next.push(value[key]);visits++;
        }
      }else if(token.endsWith('[]')){
        if(!isRecord(value)){branchTypeIssues++;continue;}
        const key=token.slice(0,-2);
        if(!has(value,key))continue;
        const values=value[key];
        if(!Array.isArray(values)){branchTypeIssues++;continue;}
        if(values.length>MAX_BRANCH||values.length+visits>MAX_VISITS)sampled=true;
        for(const child of values){
          if(next.length>=MAX_BRANCH||visits>=MAX_VISITS){sampled=true;break;}
          next.push(child);visits++;
        }
      }else{
        if(!isRecord(value)){branchTypeIssues++;continue;}
        if(has(value,token)){next.push(value[token]);visits++;}
      }
    }
    frontier=next;
    if(frontier.length===0)break;
  }
  let mismatched=0,observed=0,children=0;
  for(const value of frontier){
    observed++;
    const type=kind(value);
    if(!allowed.includes(type))mismatched++;
    else if(type==='array'||type==='object'){
      children+=Array.isArray(value)?value.length:Object.keys(value).length;
    }
  }
  return Object.freeze({observed,mismatched,branchTypeIssues,children,
    sampled,notObserved:observed===0});
}

/** Bounded, anonymous evidence for a decoded save, independent of version labels. */
export function inspectEditorReadset(decoded){
  if(!inspectDecodedSave(decoded,null).rootShapeValid)
    throw new TypeError('DB05_EDITOR_READSET_DECODED_ROOT_INVALID');
  const fields=Object.freeze(readset.fields.map(rule=>{
    const result=inspectPath(decoded,rule.path,rule.allowedJsonKinds);
    return Object.freeze({id:rule.id,domain:rule.domain,...result});
  }));
  const domains=Object.freeze(readset.domains.map(domain=>{
    const rows=fields.filter(x=>x.domain===domain);
    return Object.freeze({
      domain,registered:rows.length,
      observed:rows.filter(x=>x.observed>0).length,
      notObserved:rows.filter(x=>x.notObserved).length,
      observedKindDifference:rows.filter(x=>x.mismatched>0||x.branchTypeIssues>0).length,
      sampled:rows.some(x=>x.sampled)
    });
  }));
  const status=fields.some(x=>x.sampled)?'sampled_inconclusive':
    fields.some(x=>x.mismatched>0||x.branchTypeIssues>0)
      ?'observed_kind_difference':
    fields.every(x=>x.notObserved)?'not_observed':'observed_field_kinds_only';
  return Object.freeze({
    contract:SAVE_EDITOR_READSET_CONTRACT,status,
    fields,domains,
    knownFieldTemplateCount:readset.fields.length,
    unknownFieldsNotInterpreted:true,
    ownerDeclaredCleanHistoryNotTechnicallyVerified:true,
    ownerModificationsNotInferred:true,
    absentObjectsAreNotCorruption:true,
    initialDiffGridModificationsAreNotUserEdits:true,
    nullableContainerParentIsExpected:true,
    gameVersionIsNotShapeGate:true,
    mapKeysAndSaveIdsNotExposed:true,
    sourceBuildIndependentlyVerified:false,
    strictCodecRoundtripVerified:false,
    editorWriterAuthorized:false,
    exportAuthorized:false
  });
}
