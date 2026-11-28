import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePublicTerrainRelease} from '../src/lib/world/public-terrain-projection.ts';
import {bindMainland,bindFloatingIslandGrid,mainlandExtent} from '../src/lib/world/mainland-world-coordinates.ts';
import {biomeFurnitureSnapshot,biomeFurnitureReplacement} from '../src/lib/world/biome-furniture-preset.ts';
import {captureIslandDecoration,parseIslandDecoration} from '../src/lib/world/island-decoration-preset.ts';
import {captureRegionDecoration,parseRegionDecoration,mergeRegionDecoration,reviewRegionCapture,regionNetworkContactIndex} from '../src/lib/world/region-decoration-backup.ts';
const catalog=parsePublicTerrainRelease(JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/index.json',import.meta.url),'utf8'))),grids=bindMainland(catalog.entries.find(e=>e.scope==='Village04').grids);
const objects=new Map(grids.map(g=>[g.key,[]])),networks=new Map(grids.map(g=>[g.key,[]])),snapshot={objects,summaries:[],text:''},supports=new Map(),defs=new Map(grids.map(g=>[g.key,new Map()]));
const extent=mainlandExtent(grids),region={x:extent.x,y:extent.y,w:2,h:2};
test('empty rectangle is a valid backup and exact selected scope round trips',()=>{
 const raw=captureRegionDecoration(region,grids,snapshot,networks,supports);assert.ok(raw);
 const doc=parseRegionDecoration(raw,grids);assert.deepEqual(doc.region,region);assert.equal(doc.incoming.size,8);
 const current=parseIslandDecoration(captureIslandDecoration(grids,snapshot,networks,supports,true).text,grids,true);
 assert.ok(mergeRegionDecoration(region,grids,snapshot,networks,supports,current,doc.incoming,defs));
 const bad=JSON.parse(raw);bad.region.x=extent.x-1;assert.throws(()=>parseRegionDecoration(JSON.stringify(bad),grids));
 const g=grids[0],next=doc.incoming.get(g.key);next.furniture.push({id:1,itemId:40000001,x:0,y:0,orientation:2});
 assert.equal(mergeRegionDecoration(region,grids,snapshot,networks,supports,current,doc.incoming,defs),null);
});

test('capture review counts the selected region, including empty backups',()=>{
 const result=reviewRegionCapture(region,grids,snapshot,networks,supports);
 assert.ok(result);assert.equal(result.text,captureRegionDecoration(region,grids,snapshot,networks,supports));
 assert.equal(result.summaries.reduce((n,r)=>n+r.furnitureCount+r.networkCount+r.protectedCount,0),0);
});
test('spatial boundary contact agrees with conservative cross-grid comparison',()=>{
 const outside=[];
 for(let i=0;i<500;i++)outside.push({x:(i*17%97)-48.5,y:(i*31%83)-41,area:'other',itemId:40100000+i%3,kind:i%4?'road':'fence'});
 const contact=regionNetworkContactIndex(outside);
 for(let i=0;i<800;i++){
  const p={x:(i*23%113)-56.5,y:(i*41%101)-50,area:'selected',itemId:40100000+i%3,kind:i%4?'road':'fence'};
  const limit=p.kind==='road'?2:8;
  assert.equal(contact(p),outside.some(o=>o.kind===p.kind&&(p.kind==='fence'||o.itemId===p.itemId)&&Math.abs(o.x-p.x)<=limit&&Math.abs(o.y-p.y)<=limit));
 }
 const road={area:'A',x:-2,y:-2,itemId:40100001,kind:'road'};
 assert.equal(regionNetworkContactIndex([road])({...road,area:'B',x:0,y:0}),true);
 assert.equal(regionNetworkContactIndex([road])({...road,x:.5}),false);
 assert.equal(regionNetworkContactIndex([road])({...road,itemId:40100002}),false);
});

test('floating island region identifies a single exact native coordinate surface',()=>{
 const islands=catalog.entries.flatMap(e=>e.grids).map(bindFloatingIslandGrid).filter(Boolean);
 assert.ok(islands.length>1);
 const g=islands[0],other=islands.find(x=>x.key!==g.key);
 const scope=[g],r={x:g.bounds.x,y:g.bounds.y,w:1,h:1};
 const sn={objects:new Map([[g.key,[]]]),summaries:[],text:''},net=new Map([[g.key,[]]]),geometry=new Map([[g.key,new Map()]]);
 const raw=captureRegionDecoration(r,scope,sn,net,supports,false);assert.ok(raw);
 assert.ok(JSON.parse(raw).island);assert.equal(JSON.parse(raw).world,undefined);
 const doc=parseRegionDecoration(raw,scope,false);assert.deepEqual(doc.region,r);
 assert.throws(()=>parseRegionDecoration(raw,[other],false));
 assert.throws(()=>parseRegionDecoration(raw,[g,other],false));
 assert.throws(()=>parseRegionDecoration(raw,scope));
 const current=parseIslandDecoration(captureIslandDecoration(scope,sn,net,supports,false).text,scope,false);
 assert.ok(mergeRegionDecoration(r,scope,sn,net,supports,current,doc.incoming,geometry,false));
 assert.equal(captureRegionDecoration(r,[g,other],sn,net,supports,false),null);
});

test('area preset returns reconstructible empty storage, but never removes nonempty or unknown storage',()=>{
 const g=grids[0],base={area:g.key,factor:g.factor,x:0,y:0,shape:{width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:''}};
 const row=(ordinal,flags)=>({...base,object:{localOrdinal:ordinal,itemId:'40001680',x:ordinal,y:1,orientation:'GridOrientation_Down',layer:'furniture',surfaceCapable:false,...flags}});
 const empty=row(1,{storage:true,storageKnown:true,storageEmpty:true,storageRestorable:true}),full=row(2,{storage:true,storageKnown:true}),unknown=row(3,{storageKnown:true}),noncanonical=row(4,{storage:true,storageKnown:true,storageEmpty:true});
 const rows=[empty,full,unknown,noncanonical];
 const capture=biomeFurnitureSnapshot(g,rows,0,false,undefined,true);
 assert.ok(capture);assert.deepEqual(capture.editable,[empty]);assert.deepEqual(capture.protectedObjects,[full,unknown,noncanonical]);
 const review=biomeFurnitureReplacement(g,[g],new Map(),rows,0,[],new Map(),new Map([[40001680,0]]),false,undefined,true);
 assert.ok(review);assert.deepEqual(review.removed,[empty]);assert.equal(review.plan.remove[0].includeStorage,true);assert.equal(review.returned.get(40001680),1);assert.equal(review.protectedObjects.length,3);
});

test('private region restore resolves exact poses only inside selected footprint',async()=>{
 const {privateRegionPoses,privateRegionRestoreScope,regionStorageWitnesses}=await import('../src/lib/world/region-decoration-backup.ts');
 const g=catalog.entries.flatMap(e=>e.grids).map(bindFloatingIslandGrid).filter(Boolean)[0],scope=[g],r={x:0,y:-2/g.factor,w:1/g.factor,h:2/g.factor};
 const pose={item:40001680,x:0,y:0,orientation:'GridOrientation_Down'};
 const root={path:g.gridDataPath,pose},doc={schema:'wand.private.storage-contents@2',skipped:0,rows:[{roots:[root]}]};
 const areas=privateRegionPoses(JSON.stringify(doc),r,scope);assert.ok(areas);
 const shape={width:1,height:1,cellCount:1,runs:[{x:0,y:0,width:1}],path:''};
 const geometry=new Map([[g.key,new Map([[40001680,{shapes:{'40001680:8':shape}}]])]]);
 const plan=JSON.parse(privateRegionRestoreScope(r,areas,geometry));assert.equal(plan.kind,'region-poses');assert.deepEqual(plan.areas[0].poses,[pose]);
 assert.equal(privateRegionRestoreScope({...r,x:1},areas,geometry),null);
 assert.equal(privateRegionRestoreScope(r,areas,new Map([[g.key,new Map()]])),null);
 const duplicate={...doc,rows:[{roots:[root,root]}]};assert.equal(privateRegionPoses(JSON.stringify(duplicate),r,scope),null);
 const p={area:g.key,factor:g.factor,x:0,y:0,shape,object:{storageKnown:true,storage:true,localOrdinal:1,itemId:'40001680',x:0,y:0,orientation:'GridOrientation_Down'}};
 assert.equal(regionStorageWitnesses(r,scope,new Map([[g.key,[p]]])).length,1);
 assert.equal(regionStorageWitnesses(r,scope,new Map([[g.key,[{...p,object:{...p.object,storage:false}}]]])),null);
});
