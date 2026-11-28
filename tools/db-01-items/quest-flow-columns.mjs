/** Build-only original Mission item-flow projection into the current Item DB.
 * No owner-private Guide exports, raw game files or save data are published.
 * Intro projection is derived directly from the pinned Mission source; other
 * flows reuse the already published reviewed source attributes.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const INTRO='1378add47506b64f701a5b0507ffba89d02e4681c168c47951cda4974f0de016';
const check=(ok,why)=>{if(!ok)throw Error('DB01_QUEST_FLOW_'+why)};
const id=v=>Number.isSafeInteger(v)&&v>0;
export function loadQuestFlowColumns(project,source,rows){
  const byQuest=new Map(),byItem=new Map();
  if(source.target.platform!=='Steam'||source.sourceFilesSha256?.Mission!==MISSION)return {byQuest,byItem,ordinaryIntro:new Map(),metadata:null};
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const raw=readFileSync(join(project,'data/ddv/item-master/original-quest-intro-grants-steam-1.26.2.json'));
  check(raw.length===2153&&createHash('sha256').update(raw).digest('hex')===INTRO,'INTRO_SHA');
  const intro=JSON.parse(raw),introByQuest=new Map(),counts={intro_grant:0,substep_handoff:0,post_mission_cleanup:0,additional_reward_loot:0};
  for(const tuple of intro){
    check(Array.isArray(tuple)&&tuple.length===6,'INTRO_TUPLE');
    const [questId,index,itemId,amount,kind,category]=tuple;
    check(known.get(questId)?.nativeCategory==='Mission'&&known.has(itemId)&&id(amount)&&
      (kind===0||kind===1)&&Number.isInteger(category)&&category>=0&&category<=25,'INTRO_FIELDS');
    const list=introByQuest.get(questId)??[];
    check(index===list.length,'INTRO_ORDER');
    list.push({kind:'intro_grant',itemId,configuredAmount:amount,
      sourcePath:'source.ItemsToGive['+index+'].ItemToGive.ItemToGive.Item.'+(kind===0?'Item':'ItemIngredient')+'.Item',
      selectorKind:kind===0?'item':'item_ingredient',selectorCategoryCode:category,
      keepItems:null,guaranteedGrantVerified:false,currentAvailabilityVerified:false});
    introByQuest.set(questId,list);
  }
  check(intro.length===70&&introByQuest.size===50&&new Set(intro.map(r=>r[2])).size===69,'INTRO_CENSUS');
  const emit=(questId,flow)=>{
    check(id(flow.itemId)&&known.has(flow.itemId),'TARGET');
    const list=byQuest.get(questId)??[];
    const flowIndex=list.length;
    list.push(flow);byQuest.set(questId,list);
    const refs=byItem.get(flow.itemId)??[];
    refs.push([questId,flowIndex]);byItem.set(flow.itemId,refs);
    counts[flow.kind]++;
  };
  let missions=0,bringSteps=0,keepCount=0;
  const handoffItems=new Set(),handoffQuests=new Set();
  for(const row of rows){
    if(row.nativeCategory!=='Mission')continue;
    missions++;
    const questId=row.itemId,props={...row.nativeProperties,...row.sourceAttributes};
    for(const intro of introByQuest.get(questId)??[])emit(questId,intro);
    for(const [stepIndex,step] of (props.Steps??[]).entries()){
      for(const [subIndex,sub] of (step.SubSteps??[]).entries()){
        const b=sub.BringItem;
        if(!b)continue;
        bringSteps++;
        for(const [index,g] of (b.ItemsToGive??[]).entries()){
          check(id(g.ItemToGive)&&id(g.Amount)&&(b.KeepItems===undefined||typeof b.KeepItems==='boolean'),'HANDOFF');
          if(b.KeepItems===true)keepCount++;
          handoffItems.add(g.ItemToGive);handoffQuests.add(questId);
          emit(questId,{kind:'substep_handoff',itemId:g.ItemToGive,configuredAmount:g.Amount,
            sourcePath:'source.Steps['+stepIndex+'].SubSteps['+subIndex+'].BringItem.ItemsToGive['+index+'].ItemToGive',
            selectorKind:null,selectorCategoryCode:null,keepItems:b.KeepItems??false,
            keepItemsFieldPresent:Object.hasOwn(b,'KeepItems'),guaranteedGrantVerified:false,currentAvailabilityVerified:false});
        }
      }
    }
    for(const [index,itemId] of (props.ItemsToDeleteAfterMission??[]).entries()){
      emit(questId,{kind:'post_mission_cleanup',itemId,configuredAmount:null,
        sourcePath:'source.ItemsToDeleteAfterMission['+index+']',selectorKind:null,selectorCategoryCode:null,keepItems:null,
        guaranteedGrantVerified:false,currentAvailabilityVerified:false});
    }
    for(const [groupIndex,group] of (props.AdditionnalRewards?.SubLootTables??[]).entries()){
      check(!(group.ItemsConditional?.length),'UNREVIEWED_CONDITIONAL_LOOT');
      for(const [index,entry] of (group.Items??[]).entries()){
        emit(questId,{kind:'additional_reward_loot',itemId:entry.ItemID,configuredAmount:null,
          sourcePath:'source.AdditionnalRewards.SubLootTables['+groupIndex+'].Items['+index+'].ItemID',
          selectorKind:null,selectorCategoryCode:null,keepItems:null,
          guaranteedGrantVerified:false,currentAvailabilityVerified:false});
      }
    }
  }
  check(missions===1030&&bringSteps===989&&counts.intro_grant===70&&counts.substep_handoff===293&&
    counts.post_mission_cleanup===824&&counts.additional_reward_loot===330&&keepCount===8&&
    handoffItems.size===251&&handoffQuests.size===172,'ORIGINAL_CENSUS');
  // The public Guide's original native quest groups establish the same
  // story/friendship/realm taxonomy used by the product. Exclude known
  // mini-event quests independently, as well as premium/repeatable/other.
  const q=JSON.parse(readFileSync(join(project,'static/guide/public/quest-index.json'),'utf8'));
  const e=JSON.parse(readFileSync(join(project,'static/guide/public/event-quest-links-1.26.2.json'),'utf8'));
  check(q.schema==='wand.db03.public-guide-quests@1'&&q.target.platform==='Steam'&&
    q.target.gameVersion===source.target.gameVersion&&q.provenance.missionFullFileSha256===MISSION&&
    q.provenance.missionSourceIdenticalAcrossVersions===true&&q.quests.length===733,'GUIDE_INDEX');
  check(e.schema==='wand.db03.public-event-quest-links@1'&&e.target.platform==='Steam'&&
    e.target.gameVersion===source.target.gameVersion&&e.source.staticMiniEventSourceOnly===true&&
    e.source.originalEventLinksSha256==='4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c','EVENT_INDEX');
  const eventIds=new Set(Object.values(e.events).flat().map(Number));
  check(eventIds.size===49,'EVENT_CENSUS');
  const ordinaryIntro=new Map();
  const published=new Map(q.quests.map(r=>[Number(r.id),r]));
  for(const [questId,flows] of byQuest){
    const quest=published.get(questId);
    if(!quest||eventIds.has(questId))continue;
    const prefix=quest.internalName.split('!')[0];
    const group=q.groups[quest.groupId];
    if(!['Village','Story','Realm'].includes(prefix)||group?.rawName.split('!')[0]!==prefix)continue;
    for(const [flowIndex,flow] of flows.entries()){
      if(flow.kind!=='intro_grant'||!id(flow.configuredAmount))continue;
      const list=ordinaryIntro.get(flow.itemId)??[];
      list.push({questId,flowIndex,sourcePath:flow.sourcePath,configuredAmount:flow.configuredAmount,
        nativeQuestGroupId:Number(quest.groupId),nativeQuestGroup:prefix,
        sourceGameVersion:source.target.gameVersion,sourceMissionSha256:MISSION,
        guaranteedGrantVerified:false,currentAvailabilityVerified:false});
      ordinaryIntro.set(flow.itemId,list);
    }
  }
  return {byQuest,byItem,ordinaryIntro,metadata:{originalMissionSha256:MISSION,introProjectionSha256:INTRO,
    sourceGameVersion:source.target.gameVersion,counts,questCount:byQuest.size,itemCount:byItem.size,
    total:1517,guaranteedGrantVerified:false,currentAvailabilityVerified:false}};
}
