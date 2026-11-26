import test from 'node:test';
import assert from 'node:assert/strict';
import {roomFinishKind,roomFinishIdValid,roomFinishRecordValid,readRoomFinish} from '../src/lib/world/room-finish-design.ts';
import {roomDesignTemplates} from '../src/lib/world/room-design.ts';
import {makeDesignDraft,parseDesignDraft,designDraftLocation} from '../src/lib/world/design-draft.ts';
import {readFileSync} from 'node:fs';
const templates=roomDesignTemplates(JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/room-terrain.json',import.meta.url),'utf8')));
const floor=templates.find(t=>t.kind==='floor').grid,wall=templates.find(t=>t.kind==='wall').grid;
test('finish selection uses verified native classification and does not cross surfaces',()=>{
 assert.equal(roomFinishKind(floor),'floor');assert.equal(roomFinishKind(wall),'wall');
 assert.equal(roomFinishKind({...floor,gridDataPath:'GridData/Furniture/Table-GridData.json'}),null);
 assert.ok(roomFinishIdValid(160100001,'floor'));assert.ok(roomFinishIdValid(160000001,'wall'));
 assert.equal(roomFinishIdValid(160000001,'floor'),false);
 assert.ok(roomFinishRecordValid({itemId:160100001,itemType:{code:16,subtypeCode:1,subtypeNameVerified:true}},'floor'));
 assert.equal(roomFinishRecordValid({itemId:160100001,itemType:{code:16,subtypeCode:1,subtypeNameVerified:false}},'floor'),false);
 assert.throws(()=>readRoomFinish({roomFinish:160100001},'floor',new Set()));
 assert.throws(()=>readRoomFinish({roomFinish:160100001},'wall'));
 assert.equal(readRoomFinish({},'floor'),undefined);assert.equal(readRoomFinish({roomFinish:0},'wall'),0);
});
test('optional room finish round trips in the existing design draft without changing legacy drafts',()=>{
 const location=designDraftLocation(floor,null),timeline={snapshots:[[]],cursor:0,nextId:1},camera={zoom:1,x:.5,y:.5};
 const doc=makeDesignDraft(location,timeline,camera,[],160100001);assert.equal(parseDesignDraft(doc,location).roomFinish,160100001);
 assert.equal(parseDesignDraft(makeDesignDraft(location,timeline,camera,[]),location).roomFinish,undefined);
 assert.throws(()=>parseDesignDraft({...doc,roomFinish:160000001},location));
 assert.throws(()=>makeDesignDraft(designDraftLocation(wall,null),timeline,camera,[],160100001));
});
