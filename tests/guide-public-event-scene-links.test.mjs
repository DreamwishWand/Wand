import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyPublicEventFriendshipRewards}
  from '../src/lib/guide/public-event-friendship-rewards.ts';
import {
  DB03_EVENT_SCENE_SCHEMA,DB03_EVENT_SCENE_FILE,
  DB03_EVENT_SCENE_BYTES,DB03_EVENT_SCENE_SHA,
  verifyPublicEventSceneLinks,loadPublicEventSceneLinks
} from '../src/lib/guide/public-event-scene-links.ts';

const folder=new URL('../static/guide/public/',import.meta.url);
async function inputs(){
  const [eventBytes,bytes]=await Promise.all([
    readFile(new URL('event-friendship-rewards-1.26.2.json',folder)),
    readFile(new URL(DB03_EVENT_SCENE_FILE,folder))
  ]);
  return {
    events:verifyPublicEventFriendshipRewards(JSON.parse(eventBytes.toString('utf8'))),
    raw:JSON.parse(bytes.toString('utf8')),bytes
  };
}
test('published scene graph pins 23 original scene links across 5 Festivals and 6 expansions',async()=>{
  const {events,raw,bytes}=await inputs();
  assert.equal(bytes.byteLength,DB03_EVENT_SCENE_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_EVENT_SCENE_SHA);
  const graph=verifyPublicEventSceneLinks(raw,events);
  assert.equal(graph.schema,DB03_EVENT_SCENE_SCHEMA);
  assert.equal(graph.gameVersion,'1.26.2');
  assert.deepEqual(graph.coverage,{
    floatingFestivals:5,expansions:6,
    festivalTargetScenes:5,festivalTargetSubscenes:12,
    expansionVillageScenes:6,distinctScenes:20,
    staticOnly:true,liveAvailabilityVerified:false,
    playerLocationVerified:false,sceneNameVerified:false,
    sceneWorldMembershipVerified:false,expansionEntitlementVerified:false
  });
  const year=graph.getFestivalScenes('HauntedFloatingFestival2026');
  assert.equal(year.length,7);
  assert.deepEqual(year.map(r=>r.sceneId),[
    '1540000195','1540000197','1540000196','1540000252',
    '1540000255','1540000253','1540000254']);
  assert.equal(year[0].kind,'target_scene');
  assert.equal(year[1].kind,'target_subscene');
  assert.equal(year[1].sourcePosition,0);
  assert.equal(year[6].sourcePosition,5);
  assert.deepEqual(graph.getSceneFestivals('1540000195').map(r=>r.festivalId),
    ['HauntedFloatingFestival','HauntedFloatingFestival2026']);
  assert.deepEqual(graph.getSceneFestivals(1540000197).map(r=>r.festivalId),
    ['HauntedFloatingFestival','HauntedFloatingFestival2026']);
  assert.equal(graph.getExpansionScene('WinnieDLC')?.sceneId,'1540000210');
  assert.deepEqual(graph.getSceneExpansions('1540000210').map(r=>r.expansionId),
    ['WinnieDLC']);
  assert.equal(graph.getExpansionScene('TestEv'),null);
  assert.equal(graph.getExpansionScene('__proto__'),null);
  assert.deepEqual(graph.getFestivalScenes('TestEv'),[]);
  assert.deepEqual(graph.getFestivalScenes('__proto__'),[]);
  assert.deepEqual(graph.getSceneFestivals('999999999'),[]);
  assert.deepEqual(graph.getSceneFestivals('1540000195x'),[]);
  assert.deepEqual(graph.getSceneFestivals(0),[]);
  assert.deepEqual(graph.getSceneExpansions('1540000195'),[]);
  assert(Object.isFrozen(graph));
  assert(Object.isFrozen(graph.coverage));
  assert(Object.isFrozen(year));
  assert(Object.isFrozen(year[0]));
  assert(Object.isFrozen(graph.getSceneFestivals('1540000195')));
});
test('all native festival/subscene and expansion scene IDs reverse-join without claiming access or event status',async()=>{
  const {events,raw}=await inputs();
  const graph=verifyPublicEventSceneLinks(raw,events);
  const distinct=new Set();
  let n=0;
  for(const [id,row] of Object.entries(raw.festivals)){
    assert(events.getEvent('floating_festival',id));
    assert.deepEqual(graph.getFestivalScenes(id).map(x=>x.sceneId),
      [row.targetScene,...row.subscenes]);
    for(const link of graph.getFestivalScenes(id)){
      assert.equal(link.sourceDefinitionOnly,true);
      assert.equal(link.nativeSourceIndexMembershipVerified,true);
      assert.equal(link.sceneWorldMembershipVerified,false);
      assert.equal(link.liveAvailabilityVerified,false);
      assert.equal(link.playerLocationVerified,false);
      assert.equal(link.sceneNameVerified,false);
      assert(graph.getSceneFestivals(link.sceneId).includes(link));
      distinct.add(link.sceneId);n++;
    }
  }
  for(const [id,scene] of Object.entries(raw.expansions)){
    const link=graph.getExpansionScene(id);
    assert.equal(link?.sceneId,scene);
    assert.equal(link?.kind,'village_scene');
    assert.equal(link?.sourceDefinitionOnly,true);
    assert.equal(link?.expansionEntitlementVerified,false);
    assert.equal(link?.sceneWorldMembershipVerified,false);
    assert.equal(link?.sceneNameVerified,false);
    assert(graph.getSceneExpansions(scene).includes(link));
    distinct.add(scene);n++;
  }
  assert.equal(n,23);
  assert.equal(distinct.size,20);
});
test('SHA-pinned public loader rejects modified bytes, truncation and missing source',async()=>{
  const {events,bytes}=await inputs();
  const fetcher=buffer=>async()=>new Response(buffer,{status:200});
  assert.equal((await loadPublicEventSceneLinks(events,'/Wand/guide/public/'+
    DB03_EVENT_SCENE_FILE,fetcher(bytes))).coverage.distinctScenes,20);
  const edited=Buffer.from(bytes);edited[45]^=1;
  await assert.rejects(loadPublicEventSceneLinks(events,'/',fetcher(edited)),
    /DB03_EVENT_SCENE_SHA/);
  await assert.rejects(loadPublicEventSceneLinks(events,'/',fetcher('bad')),
    /DB03_EVENT_SCENE_BYTES/);
  await assert.rejects(loadPublicEventSceneLinks(events,'/',async()=>
    new Response('missing',{status:404})),/DB03_EVENT_SCENE_DOWNLOAD_FAILED/);
});
test('source flags, false scene IDs, duplicate and internal event entries fail closed',async()=>{
  const {events,raw}=await inputs();
  for(const [field,value] of [
    ['liveEventVerified',true],
    ['sceneJsonIdenticalSteam1261And1262',false],
    ['sceneNameVerified',true],
    ['expansionOwnershipVerified',true]
  ]){
    const edited=structuredClone(raw);
    edited.source[field]=value;
    assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/SOURCE/);
  }
  let edited=structuredClone(raw);edited.target.gameVersion='1.26.3';
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/TARGET/);
  edited=structuredClone(raw);edited.festivals.TestEv=edited.festivals.HauntedFloatingFestival;
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/FAMILIES/);
  edited=structuredClone(raw);edited.festivals.HauntedFloatingFestival2026.targetScene='0';
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/FESTIVAL/);
  edited=structuredClone(raw);edited.festivals.HauntedFloatingFestival2026.subscenes[0]='1540000195';
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/DUPLICATE_SCENE/);
  edited=structuredClone(raw);edited.expansions.WinnieDLC='1540000000';
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/RECOMPUTED_CENSUS/);
  edited=structuredClone(raw);edited.expansions.WinnieDLC='1000000000000000000';
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/EXPANSION_SCENE_ID/);
  edited=structuredClone(raw);edited.festivals.HauntedFloatingFestival.subscenes=[];
  assert.throws(()=>verifyPublicEventSceneLinks(edited,events),/FESTIVAL/);
});
