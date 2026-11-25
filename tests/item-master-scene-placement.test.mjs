import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createScenePlacementReader,evaluateStaticSceneGate} from '../src/lib/items/public-scene-placement.ts';

test('native scene gate preserves exact ID, type, tag and custom conditions; ordinary source hints are not legal placement',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createScenePlacementReader(db);
  const ids=[40000047,40000048,40000052,40200001,40003445,40003272,20100000,40200626,40005052,99999999,40000047];
  const valley=await reader.getForScene(ids,1540000000,4);
  assert.equal(valley[0].status,'indexed');assert.equal(valley[0].scene.sceneTypeName,'Village');
  assert.equal(valley[0].gate.gate,'passes_static_scene_gate');assert.equal(valley[0].floorMaskOverlap,true);
  assert.equal(valley[2].floorMaskOverlap,false);
  assert.equal(valley[5].gate.gate,'fails_static_scene_gate');assert.equal(valley[5].gate.selectorValue,0);
  assert.equal(valley[6].gate.selector,'Scene');assert.equal(valley[6].gate.sceneMatch,true);
  assert.equal(valley[7].gate.selector,'SceneWithTag');assert.equal(valley[7].gate.sceneMatch,false);
  assert.equal(valley[8].gate.gate,'custom_conditions_required');
  assert.equal(valley[9],null);assert.deepEqual(valley[10],valley[0]);
  const [main]=await reader.getForScene([40003272],1540000061);
  assert.equal(main.scene.sceneTypeCode,0);assert.equal(main.scene.sceneTypeFieldPresent,false);
  assert.equal(main.gate.gate,'passes_static_scene_gate');
  const [underwater]=await reader.getForScene([40200626],1540000225);
  assert.deepEqual(underwater.scene.directTagIds,[2001200082]);assert.equal(underwater.gate.sceneMatch,true);
  assert.equal(evaluateStaticSceneGate({CanPlace:{SceneWithoutTag:2001200082}},underwater.scene).sceneMatch,false);
  assert.equal(evaluateStaticSceneGate({CanPlace:{Scene:1540000225,SceneType:14}},underwater.scene).gate,'unresolved');
  const scopes=await reader.getForOrdinaryDecorationModes(ids);
  assert.deepEqual(scopes.slice(0,5).map(r=>r.scopeHint),['both','both','indoor','outdoor','unknown']);
  assert.equal(scopes[5].scopeHint,'unknown');
  assert.equal(scopes[6].scopeHint,'outdoor');
  assert.equal(scopes[7].scopeHint,'unknown');
  assert.equal(scopes[8].scopeHint,'unknown');
  assert.equal(scopes[9],null);assert.deepEqual(scopes[10],scopes[0]);
  assert.deepEqual(scopes[0].ordinaryPlayerHouseSceneIds,[1540000054,1540000258]);
  assert.equal(scopes[0].ordinaryOutdoorSceneIds.length,20);
  assert(scopes.filter(Boolean).every(s=>s.placementLegalityVerified===false));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});

test('all serialized CanPlace definitions are counted separately from custom restriction state',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const ids=await db.findItemIdsByFields([{field:'nativeCategory',anyOf:[
    {kind:'equals',value:'Furniture'},{kind:'equals',value:'Building'}]}]);
  const rows=await db.getItemFields(ids,['nativeCategory','source.GridEditRestriction']);
  const count={Furniture:{place:0,custom:0},Building:{place:0,custom:0}};
  for(const r of rows){
    const place=r.values['source.GridEditRestriction']?.CanPlace;
    if(place===undefined)continue;
    const c=count[r.values.nativeCategory];c.place++;
    if(place.CustomRestrictions?.length)c.custom++;
  }
  assert.deepEqual(count,{Furniture:{place:290,custom:7},Building:{place:164,custom:40}});
});
