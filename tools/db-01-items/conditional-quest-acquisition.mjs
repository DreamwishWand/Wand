/** Build-only classification of explicit item grants gated by a fully
 * resolved, positive AND-only quest condition tree. The source family
 * taxonomy is supplied by the existing verified Guide projection. */
const id=v=>Number.isSafeInteger(v)&&v>0;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>obj(v)&&Object.keys(v).every(k=>allowed.includes(k));
const positive=v=>v===undefined||v===false;
export function questGate(tree,common,questKinds,stack=[],depth=0,path='source.Conditions'){
  if(depth>16||!keys(tree,['Operator','Conditions'])||!(tree.Operator===undefined||tree.Operator===0)||
    !Array.isArray(tree.Conditions)||!tree.Conditions.length)return null;
  const result=[];
  for(const [i,leaf] of tree.Conditions.entries()){
    if(!obj(leaf)||Object.keys(leaf).length!==1)return null;
    const [kind]=Object.keys(leaf),v=leaf[kind],p=path+'.Conditions['+i+'].'+kind;
    if(kind==='SubConditions'||kind==='CommonConditions'){
      let nested=null;
      if(kind==='SubConditions')nested=questGate(v,common,questKinds,stack,depth+1,p);
      else if(keys(v,['Condition','Inversed'])&&id(v.Condition)&&positive(v.Inversed)&&!stack.includes(v.Condition)){
        nested=questGate(common.get(v.Condition),common,questKinds,[...stack,v.Condition],depth+1,'source.Conditions');
        if(nested)nested=nested.map(e=>({...e,commonChain:[{conditionItemId:v.Condition,sourcePath:p},...e.commonChain]}));
      }
      if(!nested)return null;
      result.push(...nested);continue;
    }
    const questId=v?.Mission,category=questKinds.get(questId);
    if(!category||!id(questId))return null;
    const isSimple=['MissionCompleted','MissionOngoing','MissionAvailable'].includes(kind)&&
      keys(v,['Mission','Inversed'])&&positive(v.Inversed);
    // Explicit completion of a step. Numeric states are reviewed separately.
    const isStep=kind==='MissionStepCompleted'&&keys(v,['Mission','StepID','Inversed'])&&
      Number.isSafeInteger(v.StepID)&&v.StepID>=0&&positive(v.Inversed);
    // Original ConditionMissionStatus uses IntOperator.Equal (0) and
    // MissionState.Available/OnGoing/Completed (2/4/8). ConditionMissionStepStatus
    // completion (4) is already verified in catalog-acquisition-facts.
    // Do not admit negative comparisons, unavailable states or unknown flags.
    const isMissionState=kind==='MissionStatus'&&keys(v,['Mission','State','Operator'])&&
      (v.Operator===undefined||v.Operator===0)&&[2,4,8].includes(v.State);
    const isCompletedStep=kind==='MissionStepStatus'&&keys(v,['Mission','StepID','Status'])&&
      Number.isSafeInteger(v.StepID)&&v.StepID>=0&&v.Status===4;
    if(!isSimple&&!isStep&&!isMissionState&&!isCompletedStep)return null;
    result.push({questId,category,kind,sourcePath:p,original:v,commonChain:[]});
  }
  return result;
}
export function conditionalQuestGrants(rows,source,questKinds){
  const byItem=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceFilesSha256?.ConditionalEvent!=='693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47'||
    source.sourceFilesSha256?.Condition!=='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c')return byItem;
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const props=r=>({...r.nativeProperties,...r.sourceAttributes});
  const common=new Map(rows.filter(r=>r.nativeCategory==='Condition').map(r=>[r.itemId,props(r).Conditions]));
  let matchedEvents=0;
  const stateItems=new Set(),stateEvents=new Set();
  for(const row of rows){
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const p=props(row),gate=questGate(p.Conditions,common,questKinds);
    if(!gate?.length)continue;
    const categories=new Set(gate.map(g=>g.category));
    // Do not collapse mixed event and permanent quest requirements.
    if(categories.size!==1)continue;
    const category=gate[0].category;
    const entries=[
      ...(p.GiveItem?.Items??[]).map((v,i)=>[v.ItemID,v.Amount,'conditional_grant','source.GiveItem.Items['+i+'].ItemID']),
      ...(p.SendMailbox?.Attachments??[]).map((v,i)=>[v.Attachment?.ItemID,v.Amount,'conditional_mail_attachment','source.SendMailbox.Attachments['+i+'].Attachment.ItemID']),
      ...(p.SwapItem?.ItemsToGive??[]).map((v,i)=>[v.ItemID,v.Amount,'conditional_swap_grant','source.SwapItem.ItemsToGive['+i+'].ItemID'])
    ];
    let matched=false;
    for(const [itemId,amount,role,sourcePath] of entries){
      if(!id(itemId)||!byId.has(itemId)||!id(amount))continue;
      const list=byItem.get(itemId)??[];
      list.push({sourceItemId:row.itemId,category,role,sourcePath,configuredAmount:amount,questGates:gate,
        sourceGameVersion:source.target.gameVersion,sourceEventSha256:source.sourceFilesSha256.ConditionalEvent,
        sourceConditionSha256:source.sourceFilesSha256.Condition,
        guaranteedGrantVerified:false,currentAvailabilityVerified:false});
      byItem.set(itemId,list);matched=true;
      if(gate.some(g=>g.kind==='MissionStatus'||g.kind==='MissionStepStatus')){stateItems.add(itemId);stateEvents.add(row.itemId);}
    }
    if(matched)matchedEvents++;
  }
  console.log('DB01_CONDITIONAL_QUEST '+JSON.stringify({matchedEvents,items:byItem.size,
    occurrences:[...byItem.values()].reduce((n,a)=>n+a.length,0),stateItems:stateItems.size,stateEvents:stateEvents.size}));
  return byItem;
}
