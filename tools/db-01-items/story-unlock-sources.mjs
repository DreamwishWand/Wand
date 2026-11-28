/** Original StoryItemData visibility + unlock gates + payment, not a
 * reward grant to inventory. Native UnlockStory.ApplyThis checks visibility,
 * validates UnlockCost, records unlock and removes materials. Free stories
 * use UnlockConditions via ProfilePlayer.IsStoryUnlocked.
 * Permanent Guide missions and explicitly audited floating festival puzzles.
 */
const PIN={Story:'4436e1afaf3ff09dd372324cf9f93e85ba0306368b331a20d3483fe277157ed7',
 Mission:'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24',
 Condition:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c',
 ActivityItem:'4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2'};
const id=n=>Number.isSafeInteger(n)&&n>0;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,k)=>obj(v)&&Object.keys(v).every(n=>k.includes(n));
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
const fail=(ok,why)=>{if(!ok)throw Error('DB01_STORY_UNLOCK_'+why)};
const empty=t=>keys(t,['Operator','Conditions'])&&[undefined,0].includes(t.Operator)&&
 (t.Conditions===undefined||Array.isArray(t.Conditions)&&!t.Conditions.length);
// Authenticated protoDb.bin records 1945/1946: the corresponding
// FloatingFestivalData.Puzzles[index].CompletedConditions explicitly test
// the same furniture reward, also listed in FloatingFestivalData.Rewards.
// These narrow facts come from the reviewed 1.26.2 raw records; no current dates.
const FESTIVALS=new Map([
 [200000049,{eventName:'ParksFloatingFestival',conditionItemId:2130005538,puzzleIndex:2,rewardItemId:40005836,
  sourceRecordIndex:1945,sourceRecordSha256:'019328ea9fcabf56c2d19f4794cdf2e69c6e4247e6dc0f7eec4f34b7ef785aff',
  puzzleRecordSha256:'4641cc28e78bcd3bed62e54cdfea5ac7ae6e75e4e97f76e94b8bd764ffedf316'}],
 [200000058,{eventName:'HauntedFloatingFestival2026',conditionItemId:2130006412,puzzleIndex:6,rewardItemId:40006319,
  sourceRecordIndex:1946,sourceRecordSha256:'59a4abef20c123a6e1a1b57506dfc32ccfcbccb287ce8e1af7b3968d0805d0c5',
  puzzleRecordSha256:'5560ae86924420002b47eaf41d79ffa8258350987ed058564ab94c1cc670711e'}]
]);
const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
function festivalGate(row,known){
 const f=FESTIVALS.get(row.itemId),p=props(row);
 if(!f||p.IsMissionItem!==true||(p.UnlockCost??[]).length!==0||
    p.Reward?.ItemID!==f.rewardItemId||p.Reward?.Amount!==1||known.get(f.rewardItemId)?.nativeCategory!=='Furniture')return null;
 for(const tree of [p.VisibilityConditions,p.UnlockConditions]){
  const leaf=tree?.Conditions?.[0],c=leaf?.CommonConditions;
  if(!keys(tree,['Operator','Conditions'])||![undefined,0].includes(tree.Operator)||tree.Conditions?.length!==1||
    !keys(leaf,['CommonConditions'])||!keys(c,['Condition','Inversed'])||c.Condition!==f.conditionItemId||
    ![undefined,false].includes(c.Inversed))return null;
 }
 const original=props(known.get(f.conditionItemId)).Conditions;
 if(!keys(original,['Operator','Conditions'])||![undefined,0].includes(original.Operator)||original.Conditions?.length!==2)return null;
 const [a,b]=original.Conditions,done=a?.StoryCompleted;
 if(!keys(a,['StoryCompleted'])||!keys(done,['Story','Inversed'])||done.Story!==row.itemId||done.Inversed!==true)return null;
 const conditionItemIds=[f.conditionItemId],resolvedConditions=[{conditionItemId:f.conditionItemId,original}];
 if(row.itemId===200000049){
  const t=b?.FloatingFestivalPuzzleTime;
  if(!keys(b,['FloatingFestivalPuzzleTime'])||!keys(t,['Event','Puzzle','Inversed','Status'])||
    t.Event!==f.eventName||t.Puzzle!==f.puzzleIndex||t.Status!==2||![undefined,false].includes(t.Inversed))return null;
 }else{
  const c=b?.CommonConditions;
  if(!keys(b,['CommonConditions'])||!keys(c,['Condition','Inversed'])||c.Condition!==2130006411||![undefined,false].includes(c.Inversed))return null;
  const original=props(known.get(c.Condition)).Conditions;
  const ids=['571d0eb2-1c34-414f-aa5e-1dee0f094d3d','37643e88-9c13-406a-882c-cc95d6c16d36','b4256548-e965-40d5-a467-e51449dc5341','dcfa7c7d-7005-467b-b3c9-b3540b6ad44f'];
  if(!keys(original,['Operator','Conditions'])||![undefined,0].includes(original.Operator)||original.Conditions?.length!==4||
    !original.Conditions.every((x,i)=>keys(x,['KeyholeStatus'])&&keys(x.KeyholeStatus,['Keyhole','Level','Status'])&&
      x.KeyholeStatus.Keyhole===ids[i]&&(x.KeyholeStatus.Level??0)===0&&x.KeyholeStatus.Status===4))return null;
  conditionItemIds.push(c.Condition);resolvedConditions.push({conditionItemId:c.Condition,original});
 }
 return {...f,conditionItemIds,resolvedConditions,sourceProtoDbSha256:PROTO};
}
export function buildStoryUnlockSources(rows,source,questKinds,secretKinds){
 const result=new Map(),sha=source.sourceFilesSha256;
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
  source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
  !Object.entries(PIN).every(([k,v])=>sha[k]===v))return result;
 const known=new Map(rows.map(r=>[r.itemId,r]));
 const missionEligible=n=>known.get(n)?.nativeCategory==='Mission'&&
   (questKinds.get(n)==='ordinary_gameplay'||[2070001461,2070001668].includes(n)&&secretKinds.get(n)==='ordinary_gameplay');
 const gate=(tree,stack=[])=>{
  if(empty(tree))return {missionItemIds:[],conditionItemIds:[],predicates:[]};
  if(!keys(tree,['Operator','Conditions'])||![undefined,0].includes(tree.Operator)||
    !Array.isArray(tree.Conditions)||!tree.Conditions.length||stack.length>4)return null;
  const missionItemIds=[],conditionItemIds=[],predicates=[];
  for(const leaf of tree.Conditions){
   if(!obj(leaf)||Object.keys(leaf).length!==1)return null;
   const [k]=Object.keys(leaf),v=leaf[k];
   if(k==='CommonConditions'){
    if(!keys(v,['Condition','Inversed'])||![undefined,false].includes(v.Inversed)||stack.includes(v.Condition)||
      known.get(v.Condition)?.nativeCategory!=='Condition')return null;
    const original=props(known.get(v.Condition)).Conditions,child=gate(original,[...stack,v.Condition]);
    if(!child)return null;
    missionItemIds.push(...child.missionItemIds);conditionItemIds.push(v.Condition,...child.conditionItemIds);
    predicates.push(...child.predicates);
   }else if(k==='MissionStepStatus'){
    if(!keys(v,['Mission','StepID','Status'])||!missionEligible(v.Mission)||![1,2,4,5].includes(v.Status)||
      !Number.isSafeInteger(v.StepID??0)||(v.StepID??0)<0||
      props(known.get(v.Mission)).Steps?.filter(st=>(st.StepID??0)===(v.StepID??0)).length!==1)return null;
    missionItemIds.push(v.Mission);predicates.push({kind:k,mission:v.Mission,status:v.Status});
   }else if(k==='MissionStatus'){
    if(!keys(v,['Mission','State','Operator'])||!missionEligible(v.Mission)||v.State!==4||
       ![undefined,0].includes(v.Operator))return null;
    missionItemIds.push(v.Mission);predicates.push({kind:k,mission:v.Mission,status:v.State});
   }else return null;
  }
  // NotCompleted is a window bound, not an acquisition route in isolation.
  if(predicates.some(p=>p.kind==='MissionStepStatus'&&p.status===5&&!predicates.some(q=>q.mission===p.mission&&
    (q.kind==='MissionStatus'||q.kind==='MissionStepStatus'&&[1,2,4].includes(q.status)))))return null;
  return {missionItemIds:[...new Set(missionItemIds)],conditionItemIds:[...new Set(conditionItemIds)],predicates};
 };
 const counts={};let definitions=0,classifiedEvents=0;
 const add=(id,l)=>{const a=result.get(id)??[];a.push(l);result.set(id,a);};
 for(const row of rows){
  if(row.nativeCategory!=='Story'||row.sourceClass!=='StoryItemData')continue;
  definitions++;
  const p=props(row),name=row.nativeKey;
  if(typeof name!=='string')fail(false,'KEY');
  if(name.startsWith('Event!')){
   const f=festivalGate(row,known);
   fail(f,'EVENT_GATE_'+row.itemId);
   const base={kind:'story_puzzle_unlock',category:'in_game_limited_event',routeKind:'festival_puzzle',
     sourceItemId:row.itemId,targetItemId:row.itemId,sourcePath:'source.UnlockConditions',
     visibilityConditions:p.VisibilityConditions,unlockConditions:p.UnlockConditions,unlockCosts:[],isMissionItem:true,missionItemIds:[],
     ...f,sourceStorySha256:sha.Story,sourceMissionSha256:sha.Mission,sourceConditionSha256:sha.Condition,sourceActivityItemSha256:sha.ActivityItem,
     sourceGameVersion:source.target.gameVersion,nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
     guaranteedGrantVerified:false,currentAvailabilityVerified:false};
   add(row.itemId,base);
   add(f.rewardItemId,{...base,kind:'story_event_completion_reward',targetItemId:f.rewardItemId,sourcePath:'source.Reward.ItemID',
     configuredAmount:p.Reward.Amount,originalReward:p.Reward});
   classifiedEvents++;continue;
  }
  const vis=gate(p.VisibilityConditions),unlock=gate(p.UnlockConditions);
  if(!vis||!unlock)continue;
  const missionItemIds=[...new Set([...vis.missionItemIds,...unlock.missionItemIds])],
   conditionItemIds=[...new Set([...vis.conditionItemIds,...unlock.conditionItemIds])];
  const cost=p.UnlockCost??[];
  if(!Array.isArray(cost)||!cost.every(c=>keys(c,['Id','Amount'])&&id(c.Id)&&id(c.Amount)&&
    known.get(c.Id)?.nativeCategory==='ActivityItem')||typeof p.PuzzleTemplateAddress!=='string'||!p.PuzzleTemplateAddress)continue;
  const ordinary=name.startsWith('Default!')&&cost.length>0&&!(p.IsMissionItem??false)&&
   missionItemIds.length===0&&empty(p.VisibilityConditions)&&empty(p.UnlockConditions);
  const quest=(name.startsWith('Quest!')||name.startsWith('MainGameStory!'))&&missionItemIds.length>0;
  if(!ordinary&&!quest)continue;
  const routeKind=ordinary?'snippet_cost':'quest_conditions';
  result.set(row.itemId,[{kind:'story_puzzle_unlock',category:'ordinary_gameplay',routeKind,sourceItemId:row.itemId,targetItemId:row.itemId,
    sourcePath:'source.UnlockConditions',visibilityConditions:p.VisibilityConditions,unlockConditions:p.UnlockConditions,
    unlockCosts:cost,isMissionItem:p.IsMissionItem??false,missionItemIds,conditionItemIds,
    sourceStorySha256:sha.Story,sourceMissionSha256:sha.Mission,sourceConditionSha256:sha.Condition,sourceActivityItemSha256:sha.ActivityItem,
    sourceGameVersion:source.target.gameVersion,nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
    guaranteedGrantVerified:false,currentAvailabilityVerified:false}]);
  counts[routeKind]=(counts[routeKind]??0)+1;
 }
 fail(definitions===54&&classifiedEvents===2&&counts.snippet_cost===33&&counts.quest_conditions===19&&result.size===56,'CENSUS '+JSON.stringify({definitions,classifiedEvents,counts}));
 console.log('DB01_STORY_UNLOCK '+JSON.stringify({definitions,classifiedEvents,classifiedPuzzles:54,eventRewardItems:2,counts}));
 return result;
}
