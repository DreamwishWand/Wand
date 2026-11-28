/** Offline character acquisition from verified original scalar/message fields.
 * Native MissionItemData.GetUnlockingCharacters filters field 280,
 * NextState=Unlocked; CustomStepUnlockCharacter.GetTargetCharacter
 * falls back to MissionItemData.OwnerCharacter when Character is Invalid.
 * Do not interpret generic Unlock objectives as grant operations.
 */
const CHARACTER='da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f';
const MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const NATIVE='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653';
const names=['Purchase','Automatic','StoryReward','Event','Secret'];
const id=v=>Number.isSafeInteger(v)&&v>0;
const props=r=>({...r.nativeProperties,...r.sourceAttributes});
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(v,why)=>{if(!v)throw Error('DB01_CHARACTER_UNLOCK_'+why)};
export function buildCharacterUnlockSources(rows,source,questKinds){
 const modes=new Map(),byItem=new Map();
 const result={modes,byItem};
 if(!questKinds||source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
  source.sourceIl2cppDumpSha256!==DUMP||source.sourceFilesSha256.Character!==CHARACTER||source.sourceFilesSha256.Mission!==MISSION)return result;
 const known=new Map(rows.map(r=>[r.itemId,r]));
 const declarations={UnlockCondition:16,IsDebug:11,IsSidekick:15,IsSyncOnlineItem:81,OnlineCategory:82,IsUnavailableForGenerator:80,House:13,Village:14};
 for(const [key,n] of Object.entries(declarations))check(source.sourceFieldDeclarations.CharacterItemData[key]===n,'FIELD_'+key);
 const emit=(target,link)=>{const a=byItem.get(target)??[];a.push({...link,targetItemId:target,
  sourceGameVersion:source.target.gameVersion,sourceCharacterSha256:CHARACTER,guaranteedGrantVerified:false,currentAvailabilityVerified:false});byItem.set(target,a);};
 const counts={};
 for(const row of rows){
  if(row.nativeCategory!=='Character'||row.sourceClass!=='CharacterItemData')continue;
  const p=props(row);
  const scalar=(key,def)=>{
   if(Object.hasOwn(p,key))return p[key];
   check(!row.observedFields.some(([n])=>n===declarations[key]),'MISSING_'+key);
   return def;
  };
  const code=scalar('UnlockCondition',0),debug=scalar('IsDebug',false),sidekick=scalar('IsSidekick',false),
    syncOnline=scalar('IsSyncOnlineItem',false),onlineCategory=scalar('OnlineCategory',0),generatorExcluded=scalar('IsUnavailableForGenerator',false);
  check(Number.isSafeInteger(code)&&names[code]!==undefined&&[debug,sidekick,syncOnline,generatorExcluded].every(v=>typeof v==='boolean'),'MODE');
  const eligible=!debug&&!sidekick&&!syncOnline&&onlineCategory===0&&!generatorExcluded;
  const mode={unlockConditionCode:code,unlockCondition:names[code],sourcePath:'source.UnlockCondition',
    sourceFieldPresent:row.observedFields.some(([n])=>n===16),debug,sidekick,syncOnline,onlineCategory,generatorExcluded,
    residentRouteEligible:eligible,houseItemId:scalar('House',0)||null,villageSceneItemId:scalar('Village',0)||null,
    sourceGameVersion:source.target.gameVersion,sourceCharacterSha256:CHARACTER,currentAvailabilityVerified:false};
  modes.set(row.itemId,mode);
  if(eligible){
    counts[names[code]]=(counts[names[code]]??0)+1;
    if(code===1)emit(row.itemId,{kind:'character_automatic_unlock',category:'ordinary_gameplay',sourceItemId:row.itemId,
      sourcePath:'source.UnlockCondition',unlockConditionCode:code});
  }
 }
 check(modes.size===142&&counts.Automatic===4&&counts.StoryReward===34&&counts.Secret===41&&Object.keys(counts).length===3,'CHARACTER_CENSUS');
 let steps=0,ownerFallback=0,classified=0;
 const targets=new Set();
 for(const row of rows){
  if(row.nativeCategory!=='Mission')continue;
  const p=props(row);
  for(const [si,step] of (p.Steps??[]).entries())for(const [ui,sub] of (step.SubSteps??[]).entries())
   for(const [oi,o] of (sub.Objectives??[]).entries()){
    if(!Object.hasOwn(o,'UnlockCharacter'))continue;
    const v=o.UnlockCharacter;
    check(obj(v)&&Object.keys(v).every(k=>['Character','NextState','SkipCinematic'].includes(k)),'OBJECTIVE');
    steps++;
    const explicit=v.Character??0,nextState=v.NextState??0;
    check(Number.isSafeInteger(explicit)&&explicit>=0&&nextState===0&&(v.SkipCinematic===undefined||typeof v.SkipCinematic==='boolean'),'STATE');
    const target=explicit||p.OwnerCharacter,mode=modes.get(target);
    if(!explicit)ownerFallback++;
    check(known.get(target)?.nativeCategory==='Character'&&mode?.residentRouteEligible&&[2,4].includes(mode.unlockConditionCode),'TARGET');
    targets.add(target);
    const category=questKinds.get(row.itemId)??null;
    emit(target,{kind:'character_quest_unlock',category,sourceItemId:row.itemId,sourcePath:'source.Steps['+si+'].SubSteps['+ui+'].Objectives['+oi+'].UnlockCharacter',
      stepIndex:si,subStepIndex:ui,objectiveIndex:oi,original:v,targetResolution:explicit?'explicit_character':'mission_owner',
      originalOwnerCharacterId:id(p.OwnerCharacter)?p.OwnerCharacter:null,nextStateCode:nextState,unlockConditionCode:mode.unlockConditionCode,
      sourceMissionSha256:MISSION,nativeAssemblySha256:NATIVE});
    if(category!==null)classified++;
   }
 }
 check(steps===61&&ownerFallback===26&&targets.size===61,'MISSION_CENSUS');
 console.log('DB01_CHARACTER_UNLOCK '+JSON.stringify({definitions:modes.size,residentModes:counts,questSteps:steps,ownerFallback,distinctQuestTargets:targets.size,classifiedQuestTargets:classified,automatic:counts.Automatic}));
 return result;
}
