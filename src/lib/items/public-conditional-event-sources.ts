/** Current canonical ConditionalEvent -> item actions and original conditions.
 * No predicate evaluation, reward guarantee, or player state access. */
import type {PublicCompleteItemMaster,ItemFieldValue,NativeAcquisitionRole} from './public-item-master.ts';
const EVENT='693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47';
const CONDITION='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_EVENT_SOURCE_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
function list(v:unknown):readonly ItemFieldValue[]{if(v===undefined)return [];check(Array.isArray(v),'LIST');return v;}
const roles=['conditional_grant','conditional_mail_attachment','conditional_swap_grant'] as const;
type GrantRole=typeof roles[number];
function grantRole(v:NativeAcquisitionRole):v is GrantRole{return roles.some(r=>r===v);}
export interface ConditionalItemAction {
  readonly itemId:number;
  readonly sourcePath:string;
  readonly kind:'give'|'mail_attachment'|'swap_give'|'swap_remove';
  readonly configuredAmount:number|null;
  readonly grantRole:GrantRole|null;
  readonly original:Obj;
}
export interface ConditionalEventSource {
  readonly eventItemId:number;
  readonly status:'indexed'|'not_indexed'|'not_conditional_event';
  /** Undefined source fields are distinguished from explicit empty messages. */
  readonly conditions:ItemFieldValue|null;
  readonly conditionsFieldPresent:boolean;
  readonly actions:readonly Readonly<ConditionalItemAction>[];
  readonly currentAvailabilityVerified:false;
  readonly executionVerified:false;
}
export interface ConditionalItemSourceEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly grants:readonly Readonly<{event:Readonly<ConditionalEventSource>;action:Readonly<ConditionalItemAction>}>[];
  readonly currentAvailabilityVerified:false;
}
function actions(v:Readonly<Record<string,ItemFieldValue>>){
  const result:ConditionalItemAction[]=[];
  const emit=(raw:ItemFieldValue,kind:ConditionalItemAction['kind'],path:string)=>{
    check(obj(raw),'ACTION');
    const item=kind==='mail_attachment'&&obj(raw.Attachment)?raw.Attachment.ItemID:raw.ItemID;
    check(id(item),'ITEM');
    const amount=typeof raw.Amount==='number'&&Number.isSafeInteger(raw.Amount)?raw.Amount:null;
    const role:GrantRole|null=amount!==null&&amount>0?
      kind==='give'?'conditional_grant':kind==='mail_attachment'?'conditional_mail_attachment':
      kind==='swap_give'?'conditional_swap_grant':null:null;
    result.push(Object.freeze({itemId:item,sourcePath:path,kind,configuredAmount:amount,grantRole:role,original:raw}));
  };
  const give=v['source.GiveItem'],mail=v['source.SendMailbox'],swap=v['source.SwapItem'];
  if(obj(give))list(give.Items).forEach((r,i)=>emit(r,'give','source.GiveItem.Items['+i+'].ItemID'));
  if(obj(mail))list(mail.Attachments).forEach((r,i)=>emit(r,'mail_attachment','source.SendMailbox.Attachments['+i+'].Attachment.ItemID'));
  if(obj(swap)){
    list(swap.ItemsToGive).forEach((r,i)=>emit(r,'swap_give','source.SwapItem.ItemsToGive['+i+'].ItemID'));
    list(swap.ItemsToRemove).forEach((r,i)=>emit(r,'swap_remove','source.SwapItem.ItemsToRemove['+i+'].ItemID'));
  }
  return Object.freeze(result);
}
export function createConditionalEventSourceReader(db:PublicCompleteItemMaster){
  const release=db.release;
  const pinned=release.target.platform==='Steam'&&release.sourceFilesSha256?.ConditionalEvent===EVENT&&
    release.sourceFilesSha256?.Condition===CONDITION&&release.sourceIl2cppDumpSha256===DUMP;
  const fields=['nativeCategory','source.Conditions','source.GiveItem','source.SendMailbox','source.SwapItem'];
  let task:Promise<boolean>|undefined;
  function indexed(){
    if(!task){
      const p=(async()=>{const c=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return pinned&&[...fields,'acquisition.nativeCandidates'].every(f=>c.has(f));})();
      task=p;void p.catch(()=>{if(task===p)task=undefined;});
    }
    return task;
  }
  async function getForEvents(eventIds:readonly number[]):Promise<readonly (Readonly<ConditionalEventSource>|null)[]>{
    input(eventIds);const available=await indexed();
    const rows=await db.getItemFields(eventIds,available?fields:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const status:ConditionalEventSource['status']=!available?'not_indexed':r.values.nativeCategory==='ConditionalEvent'?'indexed':'not_conditional_event';
      const present=status==='indexed'&&Object.hasOwn(r.values,'source.Conditions');
      return Object.freeze({eventItemId:r.itemId,status,conditions:present?r.values['source.Conditions']:null,
        conditionsFieldPresent:present,actions:status==='indexed'?actions(r.values):Object.freeze([]),
        currentAvailabilityVerified:false as const,executionVerified:false as const});
    }));
  }
  async function getForItems(itemIds:readonly number[]):Promise<readonly (Readonly<ConditionalItemSourceEvidence>|null)[]>{
    input(itemIds);const available=await indexed();
    if(!available)return Object.freeze((await db.getItemFields(itemIds,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,grants:Object.freeze([]),currentAvailabilityVerified:false as const}):null));
    const incoming=await db.getNativeAcquisitionCandidates(itemIds);
    const links=incoming.map(r=>r===null?null:r.filter(e=>grantRole(e[1])));
    const sourceIds=[...new Set(links.flatMap(r=>(r??[]).map(e=>e[0])))].sort((a,b)=>a-b);
    const events=new Map<number,Readonly<ConditionalEventSource>>();
    for(let start=0;start<sourceIds.length;start+=10000){
      for(const event of await getForEvents(sourceIds.slice(start,start+10000))){
        check(event?.status==='indexed','EVENT_JOIN');events.set(event.eventItemId,event);
      }
    }
    return Object.freeze(links.map((r,i)=>r===null?null:Object.freeze({itemId:itemIds[i],status:'indexed' as const,
      grants:Object.freeze(r.map(([eventId,role,path])=>{
        const event=events.get(eventId);check(event,'EVENT_MISSING');
        const action=event.actions.find(a=>a.itemId===itemIds[i]&&a.sourcePath===path&&a.grantRole===role);
        check(action,'ACTION_JOIN');return Object.freeze({event,action});
      })),currentAvailabilityVerified:false as const})));
  }
  return Object.freeze({release,getForEvents,getForItems});
}
