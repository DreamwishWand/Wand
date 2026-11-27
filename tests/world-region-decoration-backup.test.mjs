import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePublicTerrainRelease} from '../src/lib/world/public-terrain-projection.ts';
import {bindMainland,mainlandExtent} from '../src/lib/world/mainland-world-coordinates.ts';
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
