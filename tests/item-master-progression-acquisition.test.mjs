import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('ordinary progression reward evidence matches every positive original reward and independently ordinary figurine',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const legacy=new Map(await db.getFieldRows('acquisition.categories'));
  const rewards=await db.getFieldRows('acquisition.individualFriendshipRewards');
  const friendIds=new Set(rewards.flatMap(([,links])=>links.filter(l=>l.amount!==null).map(l=>l.itemId)));
  const ordinary=id=>legacy.get(id)?.includes('ordinary_gameplay')||friendIds.has(id);
  const expected=[];
  const classes=new Map(await db.getFieldRows('sourceClass'));
  const key=(target,source,kind,path,amount,threshold)=>JSON.stringify([target,source,kind,path,amount,threshold]);
  const positive=v=>Number.isSafeInteger(v)&&v>0;
  const categories=new Map(await db.getFieldRows('nativeCategory'));
  for(const [source,r] of await db.getFieldRows('source.Reward')){
    if(classes.get(source)==='StoryItemData'&&![200000049,200000058].includes(source)&&positive(r?.ItemID)&&positive(r?.Amount)&&categories.has(r.ItemID)&&r.ItemID!==source)
      expected.push(key(r.ItemID,source,'story_progress_reward','source.Reward.ItemID',r.Amount,null));
  }
  for(const [source,ms] of await db.getFieldRows('source.Milestones')){
    if(classes.get(source)!=='AchievementItemData')continue;
    for(const [i,m] of ms.entries()){
      if(positive(m.Milestone)&&positive(m.RewardItem)&&positive(m.RewardAmount)&&categories.has(m.RewardItem)&&m.RewardItem!==source)
        expected.push(key(m.RewardItem,source,'achievement_milestone_reward','source.Milestones['+i+'].RewardItem',m.RewardAmount,m.Milestone));
    }
  }
  for(const [source,ids] of await db.getFieldRows('source.AdditionalRewardItemIDs')){
    if(classes.get(source)!=='FigurineItemData'||!ordinary(source))continue;
    for(const [i,id] of ids.entries())if(categories.get(id)==='Furniture'&&source!==id)
      expected.push(key(id,source,'figurine_additional_reward','source.AdditionalRewardItemIDs['+i+']',null,null));
  }
  assert(expected.length>0);
  const evidence=await db.getFieldRows('acquisition.ordinaryProgressionSources');
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const candidates=await db.getNativeAcquisitionCandidates(evidence.map(([id])=>id));
  const roles={story_progress_reward:'story_reward',achievement_milestone_reward:'duty_reward',figurine_additional_reward:'board_game_reward'};
  const actual=evidence.flatMap(([id,links],i)=>links.map(l=>{
    assert(effective.get(id).includes('ordinary_gameplay'));
    assert.equal(l.sourceGameVersion,db.release.target.gameVersion);
    assert.equal(l.sourceFileSha256,db.release.sourceFilesSha256[categories.get(l.sourceItemId)]);
    assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
    assert(candidates[i].some(e=>e[0]===l.sourceItemId&&e[1]===roles[l.kind]&&e[2]===l.sourcePath));
    return key(id,l.sourceItemId,l.kind,l.sourcePath,l.configuredAmount,l.configuredMilestone);
  }));
  assert.deepEqual(actual.sort(),expected.sort());
  assert.equal(actual.filter(x=>JSON.parse(x)[2]==='figurine_additional_reward').length,8);
});
