/** Current canonical quest-flow lookup; not quest progress or inventory edits. */
import type {PublicCompleteItemMaster,ItemFieldValue,QuestFlowProjection} from './public-item-master.ts';

export type QuestItemFlowKind='intro_grant'|'substep_handoff'|'post_mission_cleanup'|'additional_reward_loot';
export interface QuestItemFlow {
  readonly kind:QuestItemFlowKind;
  readonly itemId:number;
  readonly configuredAmount:number|null;
  readonly sourcePath:string;
  readonly selectorKind:'item'|'item_ingredient'|null;
  readonly selectorCategoryCode:number|null;
  readonly keepItems:boolean|null;
  readonly keepItemsFieldPresent?:boolean;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface QuestItemFlowOccurrence extends QuestItemFlow {
  readonly questId:number;
  readonly flowIndex:number;
}
export interface QuestFlowResult {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly occurrences:readonly Readonly<QuestItemFlowOccurrence>[];
  readonly currentAvailabilityVerified:false;
}
const id=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const object=(x:unknown):x is Readonly<Record<string,ItemFieldValue>>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function check(ok:unknown,reason:string):asserts ok{if(!ok)throw new TypeError('DB01_QUEST_FLOW_'+reason);}
function decode(v:unknown):QuestItemFlow{
  check(object(v)&&id(v.itemId)&&
    (v.configuredAmount===null||id(v.configuredAmount))&&
    typeof v.sourcePath==='string'&&v.guaranteedGrantVerified===false&&v.currentAvailabilityVerified===false,
    'INVALID_FLOW');
  switch(v.kind){
    case 'intro_grant':
      check(/^source\.ItemsToGive\[\d+\]\.ItemToGive\.ItemToGive\.Item\.(?:Item|ItemIngredient)\.Item$/.test(v.sourcePath)&&
        (v.selectorKind==='item'||v.selectorKind==='item_ingredient')&&typeof v.selectorCategoryCode==='number'&&
        Number.isInteger(v.selectorCategoryCode)&&v.selectorCategoryCode>=0&&v.selectorCategoryCode<=25&&id(v.configuredAmount)&&v.keepItems===null,'INTRO');
      break;
    case 'substep_handoff':
      check(/^source\.Steps\[\d+\]\.SubSteps\[\d+\]\.BringItem\.ItemsToGive\[\d+\]\.ItemToGive$/.test(v.sourcePath)&&
        v.selectorKind===null&&v.selectorCategoryCode===null&&id(v.configuredAmount)&&typeof v.keepItems==='boolean'&&
        typeof v.keepItemsFieldPresent==='boolean'&&(!v.keepItems||v.keepItemsFieldPresent),'HANDOFF');
      break;
    case 'post_mission_cleanup':
    case 'additional_reward_loot':
      check((v.kind==='post_mission_cleanup'?/^source\.ItemsToDeleteAfterMission\[\d+\]$/:
        /^source\.AdditionnalRewards\.SubLootTables\[\d+\]\.Items\[\d+\]\.ItemID$/).test(v.sourcePath)&&
        v.selectorKind===null&&v.selectorCategoryCode===null&&v.configuredAmount===null&&v.keepItems===null,'REFERENCE');
      break;
    default:throw new TypeError('DB01_QUEST_FLOW_KIND');
  }
  return Object.freeze(v as unknown as QuestItemFlow);
}
function assertIds(ids:readonly number[]){
  check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
}
export function createCurrentQuestItemFlowReader(db:PublicCompleteItemMaster){
  const forward='quest.itemFlows',reverse='quest.itemFlowUses';
  let metadataTask:Promise<Readonly<QuestFlowProjection>|null>|null=null;
  function metadata(){
    if(metadataTask)return metadataTask;
    const task=(async()=>{
      const m=db.release.questFlowProjection;
      if(!m||m.sourceGameVersion!==db.release.target.gameVersion||
        m.originalMissionSha256!==db.release.sourceFilesSha256?.Mission||
        m.guaranteedGrantVerified!==false||m.currentAvailabilityVerified!==false)return null;
      const catalog=await db.getFieldCatalog();
      check(catalog.some(c=>c.field===forward&&c.count===m.questCount)&&
        catalog.some(c=>c.field===reverse&&c.count===m.itemCount),'MANIFEST');
      return m;
    })();
    metadataTask=task;
    void task.catch(()=>{if(metadataTask===task)metadataTask=null;});
    return task;
  }
  function occurrence(questId:number,index:number,value:unknown):Readonly<QuestItemFlowOccurrence>{
    return Object.freeze({...decode(value),questId,flowIndex:index});
  }
  async function getForQuests(ids:readonly number[]):Promise<readonly (Readonly<QuestFlowResult>|null)[]>{
    assertIds(ids);
    const indexed=Boolean(await metadata());
    const rows=await db.getItemFields(ids,indexed?[forward]:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const flows=r.values[forward]??[];
      check(Array.isArray(flows),'FORWARD');
      return Object.freeze({itemId:r.itemId,status:indexed?'indexed' as const:'not_indexed' as const,
        occurrences:Object.freeze(flows.map((flow,i)=>occurrence(r.itemId,i,flow))),currentAvailabilityVerified:false as const});
    }));
  }
  async function getForItems(ids:readonly number[]):Promise<readonly (Readonly<QuestFlowResult>|null)[]>{
    assertIds(ids);
    const indexed=Boolean(await metadata());
    const rows=await db.getItemFields(ids,indexed?[reverse]:['itemId']);
    const refs=rows.map(r=>{
      if(!r)return null;
      const values=r.values[reverse]??[];
      check(Array.isArray(values)&&values.every(e=>Array.isArray(e)&&e.length===2&&id(e[0])&&
        typeof e[1]==='number'&&Number.isSafeInteger(e[1])&&e[1]>=0),'REVERSE');
      return values as readonly (readonly [number,number])[];
    });
    const questIds=[...new Set(refs.flatMap(group=>(group??[]).map(e=>e[0])))].sort((a,b)=>a-b);
    const byQuest=new Map<number,Readonly<QuestFlowResult>>();
    for(let i=0;i<questIds.length;i+=10000){
      for(const row of await getForQuests(questIds.slice(i,i+10000)))if(row)byQuest.set(row.itemId,row);
    }
    return Object.freeze(rows.map((r,i)=>{
      if(!r)return null;
      const occurrences=(refs[i]??[]).map(([questId,index])=>{
        const flow=byQuest.get(questId)?.occurrences[index];
        check(flow&&flow.itemId===r.itemId&&flow.flowIndex===index,'REVERSE_JOIN');
        return flow;
      });
      return Object.freeze({itemId:r.itemId,status:indexed?'indexed' as const:'not_indexed' as const,
        occurrences:Object.freeze(occurrences),currentAvailabilityVerified:false as const});
    }));
  }
  return Object.freeze({release:db.release,getMetadata:metadata,getForQuests,getForItems});
}
