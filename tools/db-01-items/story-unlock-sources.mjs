/** Original StoryItemData visibility + unlock gates + payment, not a
 * reward grant to inventory. Native UnlockStory.ApplyThis checks visibility,
 * validates UnlockCost, records unlock and removes materials. Free stories
 * use UnlockConditions via ProfilePlayer.IsStoryUnlocked.
 * Explicit permanent Guide missions only; seasonal puzzle gates excluded.
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
 const counts={};let definitions=0,excludedEvents=0;
 for(const row of rows){
  if(row.nativeCategory!=='Story'||row.sourceClass!=='StoryItemData')continue;
  definitions++;
  const p=props(row),name=row.nativeKey;
  if(typeof name!=='string')fail(false,'KEY');
  if(name.startsWith('Event!')){excludedEvents++;continue;}
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
 fail(definitions===54&&excludedEvents===2&&counts.snippet_cost===33&&counts.quest_conditions===19,'CENSUS '+JSON.stringify({definitions,excludedEvents,counts}));
 console.log('DB01_STORY_UNLOCK '+JSON.stringify({definitions,excludedEvents,classified:result.size,counts}));
 return result;
}
