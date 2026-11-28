/** Canonical condition references shared across acquisition, Guide and other
 * services. Original trees and operators stay intact; links are navigation,
 * not an evaluation, prerequisite ordering or proof of availability. */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
const CONDITION='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_CONDITION_GRAPH_'+why);}
export interface CommonConditionPointer {
  readonly conditionItemId:number|null;
  readonly sourcePath:string;
  /** Raw operator codes; null means omitted or not decoded, not inferred AND. */
  readonly operatorPath:readonly (number|null)[];
  readonly inversed:boolean|null;
  readonly original:Obj;
}
export interface ConditionRoot {
  readonly sourceItemId:number;
  readonly sourceField:string;
  readonly status:'indexed'|'not_indexed'|'field_absent';
  readonly tree:ItemFieldValue|null;
  readonly pointers:readonly Readonly<CommonConditionPointer>[];
}
export interface CommonConditionNode {
  readonly conditionItemId:number;
  readonly status:'indexed'|'missing_definition'|'not_condition'|'field_absent';
  readonly tree:ItemFieldValue|null;
  readonly pointers:readonly Readonly<CommonConditionPointer>[];
}
export interface ConditionReferenceGraph {
  readonly status:'indexed'|'not_indexed';
  /** Each node is stored once; repeated edges and cycles are not flattened. */
  readonly nodes:readonly Readonly<CommonConditionNode>[];
  readonly runtimeTruthVerified:false;
  readonly mandatoryPrerequisitesVerified:false;
}
/** Only typed CommonConditions leaves, not arbitrary numeric IDs. */
export function readCommonConditionPointers(tree:ItemFieldValue|null):readonly Readonly<CommonConditionPointer>[]{
  const result:CommonConditionPointer[]=[];
  let visited=0;
  function walk(raw:ItemFieldValue,path:string,operators:readonly (number|null)[],depth:number){
    check(depth<=24&&++visited<=10000,'TREE_LIMIT');
    if(!obj(raw)||!Array.isArray(raw.Conditions))return;
    const op=typeof raw.Operator==='number'&&Number.isSafeInteger(raw.Operator)?raw.Operator:null;
    const next=Object.freeze([...operators,op]);
    raw.Conditions.forEach((leaf,i)=>{
      if(!obj(leaf))return;
      const p=path+'.Conditions['+i+']';
      if(obj(leaf.CommonConditions)){
        const common=leaf.CommonConditions;
        result.push(Object.freeze({conditionItemId:id(common.Condition)?common.Condition:null,
          sourcePath:p+'.CommonConditions',operatorPath:next,
          inversed:typeof common.Inversed==='boolean'?common.Inversed:null,original:common}));
      }
      if(obj(leaf.SubConditions))walk(leaf.SubConditions,p+'.SubConditions',next,depth+1);
    });
  }
  if(tree!==null)walk(tree,'root',[],0);
  return Object.freeze(result);
}
export function createConditionSourceReader(db:PublicCompleteItemMaster){
  const release=db.release;
  const pinned=release.target.platform==='Steam'&&release.sourceFilesSha256?.Condition===CONDITION&&release.sourceIl2cppDumpSha256===DUMP;
  let task:Promise<boolean>|undefined;
  function indexed(){
    if(!task){
      const p=(async()=>{const c=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return pinned&&c.has('source.Conditions')&&c.has('nativeCategory');})();
      task=p;void p.catch(()=>{if(task===p)task=undefined;});
    }
    return task;
  }
  /** Accepts raw trees already read from the canonical master (including
   * nested LootTable or catalog conditions). The caller's roots themselves
   * are not independently attested; referenced nodes use the pinned master. */
  async function resolveTrees(trees:readonly (ItemFieldValue|null)[]):Promise<Readonly<ConditionReferenceGraph>>{
    check(Array.isArray(trees)&&trees.length<=20000,'ROOTS');
    const available=await indexed();
    const nodes=new Map<number,Readonly<CommonConditionNode>>();
    const seen=new Set<number>();
    let pending:number[]=[];
    function enqueue(pointers:readonly CommonConditionPointer[]){
      for(const p of pointers){
        const i=p.conditionItemId;if(i===null||seen.has(i))continue;
        seen.add(i);check(seen.size<=10000,'GRAPH_LIMIT');pending.push(i);
      }
    }
    if(available){
      for(const t of trees)enqueue(readCommonConditionPointers(t));
      while(pending.length){
        const batch=pending.sort((a,b)=>a-b);pending=[];
        const rows=await db.getItemFields(batch,['nativeCategory','source.Conditions']);
        for(const [i,row] of rows.entries()){
          const conditionItemId=batch[i];
          const status:CommonConditionNode['status']=!row?'missing_definition':
            row.values.nativeCategory!=='Condition'?'not_condition':
            !Object.hasOwn(row.values,'source.Conditions')?'field_absent':'indexed';
          const tree=status==='indexed'&&row?row.values['source.Conditions']:null;
          const pointers=readCommonConditionPointers(tree);
          const node=Object.freeze({conditionItemId,status,tree,pointers});
          nodes.set(conditionItemId,node);enqueue(pointers);
        }
      }
    }
    return Object.freeze({status:available?'indexed' as const:'not_indexed' as const,
      nodes:Object.freeze([...nodes.values()].sort((a,b)=>a.conditionItemId-b.conditionItemId)),
      runtimeTruthVerified:false as const,mandatoryPrerequisitesVerified:false as const});
  }
  /** Root ConditionsList field only; nested trees use resolveTrees instead.
   * Source categories and field coverage come from the current release ledger. */
  async function getForDefinitions(ids:readonly number[],field:string){
    check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
    check(typeof field==='string'&&/^source\.[A-Za-z][A-Za-z0-9_]*$/.test(field),'FIELD');
    const groups=Object.entries(release.reviewedMessageGroupCoverage?.fields??{})
      .filter(([key,v])=>v.declaredType==='ConditionsList'&&key.split('.')[1]===field.slice(7));
    const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
    const available=await indexed()&&groups.length>0&&catalog.has(field);
    const categories=new Set(groups.map(([key])=>key.split('.')[0]));
    const rows=await db.getItemFields(ids,available?['nativeCategory',field]:['itemId']);
    const roots:readonly (Readonly<ConditionRoot>|null)[]=Object.freeze(rows.map(row=>{
      if(!row)return null;
      const status:ConditionRoot['status']=!available?'not_indexed':
        typeof row.values.nativeCategory==='string'&&categories.has(row.values.nativeCategory)&&Object.hasOwn(row.values,field)?'indexed':'field_absent';
      const tree=status==='indexed'?row.values[field]:null;
      return Object.freeze({sourceItemId:row.itemId,sourceField:field,status,tree,pointers:readCommonConditionPointers(tree)});
    }));
    const graph=await resolveTrees(roots.flatMap(r=>r?.status==='indexed'?[r.tree]:[]));
    return Object.freeze({roots,graph});
  }
  return Object.freeze({release,getForDefinitions,resolveTrees});
}
