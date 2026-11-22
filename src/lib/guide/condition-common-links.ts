/**
 * Steam 1.26.2's source-explicit Condition -> CommonConditions references.
 *
 * This is a local-only graph extracted from the owner's SHA-pinned v2 Condition
 * projection, NOT a game progression graph. AND/OR/NOT and native source paths
 * remain attached to each occurrence. The v2 projection omits the leaf's
 * optional inversion field: this API deliberately makes no assertion about it.
 * No proprietary Condition definitions or user data are published or uploaded.
 */
import {
  GUIDE_CONDITION_V2_SCHEMA,GUIDE_CONDITION_INDEX_V2_SHA,
  GUIDE_CONDITION_INDEX_V2_BYTES,GUIDE_CONDITION_SOURCE_SHA,
  GUIDE_CONDITION_NATIVE_COUNT
} from './current-conditions.mjs';
import {
  DB03_CONDITION_RELATION_SCHEMA,
  type GuideConditionRelationIndex,type GuideConditionMention,
  type NativeConditionBooleanOperator
} from './condition-relations.ts';

export const DB03_COMMON_CONDITION_GRAPH_SCHEMA='wand.db03.current-common-condition-graph@1' as const;
export type CommonConditionEvidence='structure_only'|'pinned_owner_original_sha256';
export interface NativeCommonConditionEdge{
  readonly fromConditionId:string;
  readonly toConditionId:string;
  readonly sourcePath:string;
  readonly sourceWireSha256:string;
  readonly booleanPath:readonly NativeConditionBooleanOperator[];
  readonly leafInversion:'not_projected';
}
export interface NativeCommonConditionPath{
  readonly conditionId:string;
  readonly via:readonly NativeCommonConditionEdge[];
}
export interface NativeIndirectMissionMention{
  readonly sourceConditionId:string;
  readonly mention:GuideConditionMention;
  readonly via:readonly NativeCommonConditionEdge[];
}
export interface NativeCommonConditionGraph{
  readonly schema:typeof DB03_COMMON_CONDITION_GRAPH_SCHEMA;
  readonly version:'1.26.2';
  readonly evidence:CommonConditionEvidence;
  readonly coverage:Readonly<{
    definitions:number;totalLeaves:number;commonConditionPointers:number;
    distinctPointerSources:number;distinctPointerTargets:number;
    pointerTargetsResolved:number;pointerTargetsUnresolved:number;
    conditionsWithNestedPointers:number;
    allNativeConditionDefinitionsVerified:boolean;
    originalFileSha256:string|null;
    runtimeConditionTruthVerified:false;mandatoryPrerequisitesVerified:false;
    sourceLeafInversionDecoded:false;
  }>;
  getDirect(conditionId:string|number):readonly NativeCommonConditionEdge[];
  getIncoming(conditionId:string|number):readonly NativeCommonConditionEdge[];
  /** Include the starting Condition as the root only, not in returned paths. */
  getReachable(conditionId:string|number,maxDepth?:number):readonly NativeCommonConditionPath[];
  /** Every result includes its exact original source-path chain. */
  getIndirectMissionMentions(
    conditionId:string|number,conditions:GuideConditionRelationIndex,maxDepth?:number
  ):readonly NativeIndirectMissionMention[];
}
export interface RawNativeConditionTree{
  readonly operator:string;
  readonly sourceTreeWireSha256:string;
  readonly children:readonly RawNativeConditionLeaf[];
}
export interface RawNativeConditionLeaf{
  readonly kind:string;
  readonly ordinal:number;
  readonly sourceTag:number;
  readonly payloadSha256:string;
  readonly commonConditionId?:string;
  readonly nested?:RawNativeConditionTree;
}
export interface RawNativeConditionRecord{
  readonly id:string;readonly nativeWireSha256:string;
  readonly conditions:RawNativeConditionTree;
}
export interface OwnerLocalConditionIndexFile{
  readonly name:string;
  readonly size:number;
  arrayBuffer():Promise<ArrayBuffer>;
}
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly NativeCommonConditionEdge[];
const EMPTY_PATHS=Object.freeze([]) as readonly NativeCommonConditionPath[];
const MAX_WALK=32;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB03_COMMON_CONDITION_'+reason);
}
function id(raw:string|number):string{
  const key=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof key==='string'&&ID.test(key)&&Number.isSafeInteger(Number(key)),
    'INVALID_CONDITION_ID');
  return key;
}
function obj(value:unknown):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value);
}
function walkIndex(
  records:readonly RawNativeConditionRecord[],evidence:CommonConditionEvidence
):NativeCommonConditionGraph{
  check(Array.isArray(records)&&records.length>0&&records.length<=10000,'INVALID_RECORDS');
  const native=new Set<string>();
  for(const record of records){
    check(obj(record)&&id(record.id)&&SHA.test(record.nativeWireSha256)&&
      !native.has(record.id),'INVALID_NATIVE_RECORD');
    native.add(record.id);
  }
  const outgoing=new Map<string,NativeCommonConditionEdge[]>();
  const incoming=new Map<string,NativeCommonConditionEdge[]>();
  let leaves=0,pointers=0;
  const toIds=new Set<string>();
  for(const record of records){
    const visit=(tree:RawNativeConditionTree,path:string,operators:readonly NativeConditionBooleanOperator[],depth:number):void=>{
      check(depth<=24&&obj(tree)&&
        ['AND','OR','NOT'].includes(tree.operator)&&
        SHA.test(tree.sourceTreeWireSha256)&&
        Array.isArray(tree.children)&&tree.children.length<=256,'INVALID_AST');
      const nested=Object.freeze([...operators,tree.operator as NativeConditionBooleanOperator]);
      for(const [i,leaf] of tree.children.entries()){
        leaves++;check(leaves<=20000,'TOO_MANY_LEAVES');
        check(obj(leaf)&&leaf.ordinal===i&&Number.isSafeInteger(leaf.sourceTag)&&
          leaf.sourceTag>0&&SHA.test(leaf.payloadSha256)&&
          typeof leaf.kind==='string'&&leaf.kind.length>0,'INVALID_LEAF');
        const nodePath=path+'.children['+i+']';
        if(leaf.kind==='SubConditions'){
          check(leaf.sourceTag===10&&leaf.nested!==undefined,'INVALID_SUBCONDITION');
          visit(leaf.nested,nodePath+'.nested',nested,depth+1);
        }else{
          check(leaf.nested===undefined,'FOREIGN_NESTED_LEAF');
        }
        if(leaf.kind!=='CommonConditions')continue;
        check(leaf.sourceTag===5&&id(leaf.commonConditionId??''),'INVALID_COMMON_POINTER');
        pointers++;
        const edge=Object.freeze({
          fromConditionId:record.id,toConditionId:leaf.commonConditionId!,
          sourcePath:nodePath,sourceWireSha256:record.nativeWireSha256,
          booleanPath:nested,leafInversion:'not_projected' as const
        });
        const out=outgoing.get(record.id)??[];
        out.push(edge);outgoing.set(record.id,out);
        const into=incoming.get(leaf.commonConditionId!)??[];
        into.push(edge);incoming.set(leaf.commonConditionId!,into);
        toIds.add(leaf.commonConditionId!);
      }
    };
    visit(record.conditions,'conditions',[],0);
  }
  const unresolved=[...toIds].filter(k=>!native.has(k)).length;
  for(const entries of outgoing.values())Object.freeze(entries);
  for(const entries of incoming.values())Object.freeze(entries);
  const chained=[...outgoing.values()].filter(edges=>edges.some(e=>outgoing.has(e.toConditionId))).length;
  if(evidence==='pinned_owner_original_sha256'){
    check(records.length===GUIDE_CONDITION_NATIVE_COUNT&&leaves===9861&&
      pointers===275&&outgoing.size===196&&toIds.size===186&&
      unresolved===0&&chained===35,'V1262_SOURCE_CENSUS');
  }
  const coverage=Object.freeze({
    definitions:records.length,totalLeaves:leaves,
    commonConditionPointers:pointers,distinctPointerSources:outgoing.size,
    distinctPointerTargets:toIds.size,pointerTargetsResolved:toIds.size-unresolved,
    pointerTargetsUnresolved:unresolved,conditionsWithNestedPointers:chained,
    allNativeConditionDefinitionsVerified:evidence==='pinned_owner_original_sha256',
    originalFileSha256:evidence==='pinned_owner_original_sha256'
      ?GUIDE_CONDITION_SOURCE_SHA:null,
    runtimeConditionTruthVerified:false as const,mandatoryPrerequisitesVerified:false as const,
    sourceLeafInversionDecoded:false as const
  });
  const reachable=(root:string,maxDepth:number):readonly NativeCommonConditionPath[]=>{
    check(Number.isSafeInteger(maxDepth)&&maxDepth>=1&&maxDepth<=MAX_WALK,
      'INVALID_TRAVERSAL_DEPTH');
    const todo:[string,readonly NativeCommonConditionEdge[],readonly string[]][]=[
      [root,Object.freeze([]),Object.freeze([root])]
    ];
    const found:NativeCommonConditionPath[]=[];
    for(let pos=0;pos<todo.length;pos++){
      const [here,chain,ids]=todo[pos];
      if(chain.length>=maxDepth)continue;
      for(const edge of outgoing.get(here)??EMPTY){
        check(!ids.includes(edge.toConditionId),'CYCLIC_SOURCE_CONDITIONS');
        const via=Object.freeze([...chain,edge]);
        found.push(Object.freeze({conditionId:edge.toConditionId,via}));
        check(found.length<=512,'SOURCE_TRAVERSAL_LIMIT');
        todo.push([edge.toConditionId,via,Object.freeze([...ids,edge.toConditionId])]);
      }
    }
    return Object.freeze(found);
  };
  return Object.freeze({
    schema:DB03_COMMON_CONDITION_GRAPH_SCHEMA,version:'1.26.2' as const,evidence,
    coverage,
    getDirect:(raw:string|number)=>outgoing.get(id(raw))??EMPTY,
    getIncoming:(raw:string|number)=>incoming.get(id(raw))??EMPTY,
    getReachable:(raw:string|number,maxDepth=MAX_WALK)=>{
      const root=id(raw);return outgoing.has(root)?reachable(root,maxDepth):EMPTY_PATHS;
    },
    getIndirectMissionMentions:(raw:string|number,
      conditions:GuideConditionRelationIndex,maxDepth=MAX_WALK)=>{
      const root=id(raw);
      check(conditions?.schema===DB03_CONDITION_RELATION_SCHEMA&&
        conditions.coverage?.gameVersion==='1.26.2'&&
        conditions.coverage.sourceOriginalSha256===GUIDE_CONDITION_SOURCE_SHA&&
        conditions.coverage.indexedProjectionSha256===GUIDE_CONDITION_INDEX_V2_SHA&&
        conditions.coverage.conditionTruthEvaluated===false&&
        typeof conditions.getConditionReferences==='function',
        'CURRENT_MISSION_INDEX_REQUIRED');
      const mentions:NativeIndirectMissionMention[]=[];
      for(const path of reachable(root,maxDepth)){
        for(const mention of conditions.getConditionReferences(path.conditionId)){
          check(mention.conditionId===path.conditionId,'MIXED_NATIVE_REFERENCE');
          mentions.push(Object.freeze({
            sourceConditionId:path.conditionId,mention,via:path.via
          }));
          check(mentions.length<=20000,'INDIRECT_MISSION_LIMIT');
        }
      }
      return Object.freeze(mentions);
    }
  });
}

/** Structural fixtures never inherit owner-private SHA-256 attestation. */
export function createStructuralCommonConditionGraph(
  records:readonly RawNativeConditionRecord[]
):NativeCommonConditionGraph{
  return walkIndex(records,'structure_only');
}

/** The owner-private source index is never copied to public assets or storage. */
export async function loadPinnedCommonConditionGraph(
  file:OwnerLocalConditionIndexFile
):Promise<NativeCommonConditionGraph>{
  check(file?.name==='condition-native-index-v2.json'&&
    file.size===GUIDE_CONDITION_INDEX_V2_BYTES&&
    typeof file.arrayBuffer==='function','OWNER_INDEX_REQUIRED');
  const bytes=await file.arrayBuffer();
  check(bytes instanceof ArrayBuffer&&bytes.byteLength===file.size,'SOURCE_CHANGED');
  check(!!globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  const sha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  check(sha===GUIDE_CONDITION_INDEX_V2_SHA,'UNVERIFIED_OWNER_ORIGINAL');
  const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,unknown>;
  check(obj(doc)&&doc.schema===GUIDE_CONDITION_V2_SCHEMA&&
    obj(doc.target)&&doc.target.platform==='Steam'&&doc.target.gameVersion==='1.26.2'&&
    obj(doc.source)&&doc.source.sha256===GUIDE_CONDITION_SOURCE_SHA&&
    Array.isArray(doc.records),'OWNER_SOURCE_STRUCTURE');
  return walkIndex(doc.records as RawNativeConditionRecord[],
    'pinned_owner_original_sha256');
}
