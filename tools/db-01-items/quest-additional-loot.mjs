/** Build-only projection of explicit additional mission reward loot.
 * A positive original group and independently reviewed quest taxonomy
 * establish a configured route, never actual delivery or current availability.
 */
import {eligibleExplicitLootGroup} from './ordinary-loot-present.mjs';
const MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const IL2CPP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const id=n=>Number.isSafeInteger(n)&&n>0;
const families=new Set(['ActivityItem','Furniture','Clothing','Companion','Currency','MemoryShard','BoardGame','Skin','Trimming','Tool','Building','Upgrade','MountGear','AvatarFeature','Makeup']);
export function buildQuestAdditionalLoot(rows,source,questKinds){
  const result=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceFilesSha256?.Mission!==MISSION||source.sourceIl2cppDumpSha256!==IL2CPP)return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const counts={},classifiedCounts={};
  for(const row of rows){
    if(row.nativeCategory!=='Mission')continue;
    const category=questKinds.get(row.itemId);
    if(category!=='ordinary_gameplay'&&category!=='in_game_limited_event')continue;
    const props={...row.nativeProperties,...row.sourceAttributes};
    for(const [groupIndex,g] of (props.AdditionnalRewards?.SubLootTables??[]).entries()){
      if(!eligibleExplicitLootGroup(g)||!Object.keys(g).every(k=>['Items','Min','Max','Weight'].includes(k)))continue;
      for(const [itemIndex,v] of (g.Items??[]).entries()){
        if(!v||!id(v.ItemID)||!Object.keys(v).every(k=>['ItemID','State'].includes(k)))continue;
        counts[category]=(counts[category]??0)+1;
        if(!families.has(known.get(v.ItemID)?.nativeCategory))continue;
        const link={kind:'quest_additional_loot_candidate',category,sourceItemId:row.itemId,targetItemId:v.ItemID,
          sourcePath:'source.AdditionnalRewards.SubLootTables['+groupIndex+'].Items['+itemIndex+'].ItemID',
          groupIndex,itemIndex,minimumRolls:g.Min,maximumRolls:g.Max,configuredWeight:g.Weight??null,
          originalEntry:v,sourceGameVersion:source.target.gameVersion,sourceMissionSha256:MISSION,
          guaranteedGrantVerified:false,currentAvailabilityVerified:false};
        const list=result.get(v.ItemID)??[];list.push(link);result.set(v.ItemID,list);
        classifiedCounts[category]=(classifiedCounts[category]??0)+1;
      }
    }
  }
  console.log('DB01_QUEST_ADDITIONAL_LOOT '+JSON.stringify({counts,classifiedCounts,items:result.size}));
  return result;
}
