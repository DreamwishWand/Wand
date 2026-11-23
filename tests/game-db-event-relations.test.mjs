import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';

const root=new URL('../static/',import.meta.url);
function sourceFetcher(corrupt=''){
  const calls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    calls.push(url);
    let raw;
    try{raw=readFileSync(new URL(url.slice(6),root));}
    catch{return new Response('not found',{status:404});}
    if(url.endsWith(corrupt)&&corrupt){
      raw=Buffer.from(raw);raw[100]^=1;
    }
    return new Response(raw,{status:200});
  };
  return {fetcher,calls};
}
let pending;
const open=()=>pending??=openPublicSharedGameSources('/Wand',sourceFetcher().fetcher);

test('DB-00 loads source-verified 23 user-facing Events with 62 Quest, 79 Duty and 23 Scene references once',async()=>{
  const {fetcher,calls}=sourceFetcher();
  const shared=await openPublicSharedGameSources('/Wand',fetcher);
  const graph=shared.guideEvents;
  assert.equal(graph.schema,'wand.game-db.event-source-join@1');
  assert.equal(graph.gameVersion,'1.26.2');
  assert.deepEqual(graph.counts,{
    publicEvents:23,eventQuestReferences:62,eventDutyReferences:79,
    festivalSceneReferences:17,expansionVillageSceneReferences:6
  });
  assert.equal(graph.events.length,23);
  assert.equal(graph.events.filter(x=>x.family==='mini_event').length,18);
  assert.equal(graph.events.filter(x=>x.family==='floating_festival').length,5);
  assert(!graph.events.some(x=>x.eventId==='TestEv'));
  assert.equal(graph.getEvent('mini_event','TestEv'),null);
  assert.equal(graph.currentAvailabilityVerified,false);
  assert.equal(graph.playerProgressVerified,false);
  assert.equal(graph.sourceConfigurationOnly,true);
  assert.equal(calls.length,30,'three new pinned reference assets, no duplicate base or event bytes');
  assert.equal(new Set(calls).size,30);
  assert.equal(calls.filter(x=>x.endsWith('/quest-index.json')).length,1);
  assert.equal(calls.filter(x=>x.endsWith('/event-friendship-rewards-1.26.2.json')).length,1);
  for(const file of [
    'event-quest-links-1.26.2.json',
    'event-duty-links-1.26.2.json',
    'event-scene-links-1.26.2.json'
  ])assert.equal(calls.filter(x=>x.endsWith('/'+file)).length,1);
  assert(Object.isFrozen(graph));
  assert(Object.isFrozen(graph.events));
  assert(Object.isFrozen(graph.events[0]));
});

test('one event view provides exact original Quest and Duty reverse references without unlocking',async()=>{
  const graph=(await open()).guideEvents;
  let quests=0,duties=0;
  for(const entry of graph.events){
    assert.equal(graph.getEvent(entry.family,entry.eventId),entry);
    assert.equal(entry.currentAvailabilityVerified,false);
    assert.equal(entry.playerProgressVerified,false);
    assert.equal(entry.questPrerequisitesVerified,false);
    assert.equal(entry.dutyUnlockConditionsVerified,false);
    assert.equal(entry.sceneAccessVerified,false);
    assert.equal(entry.sceneWorldMembershipVerified,false);
    assert(Object.isFrozen(entry.questLinks));
    assert(Object.isFrozen(entry.dutyLinks));
    assert(Object.isFrozen(entry.sceneLinks));
    for(const q of entry.questLinks){
      quests++;
      assert.equal(q.eventId,entry.eventId);
      assert.equal(q.nativeStaticReference,true);
      assert.equal(q.prerequisiteVerified,false);
      assert.equal(q.playerCompletionVerified,false);
      assert(graph.getQuestEvents(q.questId).includes(entry));
      assert(graph.getQuestEvents(Number(q.questId)).includes(entry));
    }
    for(const d of entry.dutyLinks){
      duties++;
      assert.equal(d.eventId,entry.eventId);
      assert.equal(d.sourceConfigurationOnly,true);
      assert.equal(d.playerProgressVerified,false);
      assert.equal(d.dutyUnlockConditionVerified,false);
      assert(graph.getDutyEvents(d.dutyId).includes(entry));
      assert(graph.getDutyEvents(Number(d.dutyId)).includes(entry));
    }
  }
  assert.equal(quests,62);
  assert.equal(duties,79);
  assert.deepEqual(graph.getQuestEvents('99999999'),[]);
  assert.deepEqual(graph.getDutyEvents('99999999'),[]);
  assert.deepEqual(graph.getQuestEvents('00001'),[]);
  assert.deepEqual(graph.getDutyEvents(-5),[]);
  assert.equal(graph.getEvent('mini_event','Nonexistent'),null);
});

test('Festival/Expansion scene lookups preserve source type, without World membership or DLC ownership',async()=>{
  const graph=(await open()).guideEvents;
  let festivalLinks=0;
  for(const festival of graph.events.filter(x=>x.family==='floating_festival')){
    assert.equal(festival.questLinks.length,0);
    assert.equal(festival.dutyLinks.length,0);
    assert(festival.sceneLinks.length>0);
    for(const link of festival.sceneLinks){
      festivalLinks++;
      const view=graph.getSceneReferences(link.sceneId);
      assert(view?.festivals.includes(festival));
      assert.equal(view.sceneWorldMembershipVerified,false);
      assert.equal(view.sceneAccessVerified,false);
      assert.equal(view.expansionEntitlementVerified,false);
      assert.equal(link.sourceDefinitionOnly,true);
      assert.equal(link.liveAvailabilityVerified,false);
      assert.equal(link.playerLocationVerified,false);
    }
  }
  assert.equal(festivalLinks,17);
  for(const id of [
    'BaseGame','Expansion01','Expansion02','Expansion03','Expansion04','WinnieDLC'
  ]){
    const scene=graph.getExpansionScene(id);
    assert(scene);
    assert.equal(scene.kind,'village_scene');
    assert.equal(scene.expansionEntitlementVerified,false);
    assert.equal(scene.sceneWorldMembershipVerified,false);
    assert(graph.getSceneReferences(scene.sceneId).expansions.some(ref=>
      ref.expansionId===id));
  }
  assert.equal(graph.getExpansionScene('Nonexistent'),null);
  assert.equal(graph.getSceneReferences('99999999'),null);
  assert.equal(graph.getSceneReferences('not-an-id'),null);
});

test('DB-00 event source joining fails closed when any independently pinned DB-03 event association changes',async()=>{
  for(const asset of [
    'event-quest-links-1.26.2.json',
    'event-duty-links-1.26.2.json',
    'event-scene-links-1.26.2.json',
    'event-friendship-rewards-1.26.2.json'
  ]){
    await assert.rejects(
      openPublicSharedGameSources('/Wand',sourceFetcher(asset).fetcher),
      /(?:DB03_EVENT_(?:QUEST|DUTY|SCENE)_SHA|DB03_EVENT_FRIENDSHIP_REWARDS_PUBLIC_SHA)/
    );
  }
});
