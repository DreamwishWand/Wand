import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPresetShareCatalog,validateShareablePreset} from '../src/lib/presets/preset-public.ts';
import {serializeDesign,emptyDesign} from '../src/lib/world/design-layout.ts';
import {serializeWholeArea} from '../src/lib/world/whole-area-preset.ts';
import {roomDesignTemplates} from '../src/lib/world/room-design.ts';
import {serializeRoomProject,newRoomSurface} from '../src/lib/world/room-project-design.ts';
import {bindMainland,bindFloatingIslandGrid} from '../src/lib/world/mainland-world-coordinates.ts';
import {captureIslandDecoration} from '../src/lib/world/island-decoration-preset.ts';
import {captureRegionDecoration} from '../src/lib/world/region-decoration-backup.ts';
const get=n=>JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/'+n,import.meta.url),'utf8'));
const catalog=createPresetShareCatalog(get('index.json'),get('room-terrain.json'),get('support-terrain.json'));
const valid=raw=>assert.deepEqual(JSON.parse(validateShareablePreset(raw,catalog)),JSON.parse(raw));
const reject=v=>assert.throws(()=>validateShareablePreset(JSON.stringify(v),catalog));
test('public scene payload does not accept private metadata or native backup',()=>{
 const scene={schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor:1,anchor:'corner',items:[{itemId:40000001,dx:0,dy:0,orientation:2}]};
 valid(JSON.stringify(scene));reject({...scene,accountId:'private'});reject({...scene,items:[{...scene.items[0],nativeId:1}]});
 reject({schema:'wand.preset.game-code@1',purpose:'shop',code:'sample',status:'unverified'});
 reject({schema:'wand.preset.native-backup@1',gameSchema:643,kind:'tom-furniture',storage:'furniture',baseItemId:40000001,payload:{Id:2,Item:40000001}});
});
test('public area requires exact source grid, refuses unknown nested fields',()=>{
 const g=catalog.release.entries.find(e=>e.scope==='Village04').grids.find(g=>g.key==='Meadow');
 const d=serializeDesign(emptyDesign(),g);valid(d);valid(serializeWholeArea(emptyDesign(),g,'biome'));
 const changed=JSON.parse(d);changed.grid.gridIdNative=5;reject(changed);
 const bad=JSON.parse(d);bad.placements.push({id:1,itemId:40000001,x:0,y:0,orientation:2,secret:'private'});reject(bad);
});
test('whole world and selected region retain original source scope',()=>{
 const grids=bindMainland(catalog.release.entries.find(e=>e.scope==='Village04').grids);
 const objects=new Map(grids.map(g=>[g.key,[]])),networks=new Map(grids.map(g=>[g.key,[]])),snap={objects,summaries:[],text:''};
 const world=captureIslandDecoration(grids,snap,networks,new Map(),true);assert.ok(world);valid(world.text);
 const v=JSON.parse(world.text);v.areas.pop();reject(v);
 const g=grids[0],region={x:g.bounds.x,y:g.bounds.y,w:1,h:1};const selected=captureRegionDecoration(region,grids,snap,networks,new Map());assert.ok(selected);valid(selected);
});
test('room project permits only source room geometry and known finishes',()=>{
 const templates=roomDesignTemplates(get('room-terrain.json')),floor=templates.find(t=>t.kind==='floor'),wall=templates.find(t=>t.kind==='wall');
 const raw=serializeRoomProject([newRoomSurface(1,floor),newRoomSurface(2,wall)],1);valid(raw);
 const bad=JSON.parse(raw);bad.surfaces[0].design.roomFinish=42;reject(bad);
 const backup={schema:'wand.preset.indoor-decoration@1',gameVersion:'1.26.2',scope:'room',rooms:[{floor:1,room:1,wallPositions:[null,0],design:JSON.parse(raw)}]};valid(JSON.stringify(backup));reject({...backup,rooms:[{...backup.rooms[0],houseId:42}]});
});

test('publication receipt binds the exact compact file and its semantic metadata',async()=>{
 const {preparePublicPreset,verifyPublicPreset}=await import('../src/lib/presets/preset-publication.ts');
 const scene={schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor:1,anchor:'corner',items:[{itemId:40000001,dx:0,dy:0,orientation:2},{itemId:40000001,dx:2,dy:0,orientation:2}]};
 const source=new Blob([JSON.stringify(scene)]),out=await preparePublicPreset(source,'scene',catalog);
 assert.equal(out.receipt.kind,'scene');assert.equal(out.receipt.distinctObjectTypes,1);assert.equal(out.receipt.totalObjects,2);
 assert.equal(out.receipt.byteSize,out.file.size);assert.equal(out.receipt.schemaVersion,2);
 assert.deepEqual(JSON.parse(await verifyPublicPreset(out.file,out.receipt,catalog)),scene);
 await assert.rejects(verifyPublicPreset(out.file,{...out.receipt,totalObjects:99},catalog));
 await assert.rejects(verifyPublicPreset(out.file,{...out.receipt,kind:'world'},catalog));
 const changed=new Uint8Array(await out.file.arrayBuffer());changed[changed.length-1]^=1;
 await assert.rejects(verifyPublicPreset(new Blob([changed]),out.receipt,catalog),/CHECKSUM/);
 await assert.rejects(preparePublicPreset(source,'scene',catalog,1),/PUBLIC_SIZE/);
});

test('island selected region shares only one trusted surface and retains region metadata',async()=>{
 const grids=catalog.release.entries.flatMap(e=>e.grids).map(bindFloatingIslandGrid).filter(Boolean);
 const g=grids[0],scope=[g],region={x:g.bounds.x,y:g.bounds.y,w:1,h:1};
 const sn={objects:new Map([[g.key,[]]]),summaries:[],text:''},net=new Map([[g.key,[]]]);
 const raw=captureRegionDecoration(region,scope,sn,net,new Map(),false);assert.ok(raw);valid(raw);
 const {presetHeader}=await import('../src/lib/presets/preset-session-format.ts');
 const {presetItems}=await import('../src/lib/presets/preset-items.ts');
 assert.equal(presetHeader(raw).version,'1.26.2');assert.equal(presetHeader(raw).kind,'region');assert.equal(presetItems(raw).size,0);
 const bad=JSON.parse(raw);bad.island.areas.push(bad.island.areas[0]);reject(bad);
 const dual=JSON.parse(raw);dual.world=dual.island;reject(dual);
 const wrong=JSON.parse(raw);wrong.island.areas[0].furniture.design.grid.gridIdNative+=1;reject(wrong);
});
