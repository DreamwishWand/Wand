import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {inflateSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parsePublicTerrainBundle,publicShapeDefinitions,publicShapeSource} from '../src/lib/world/public-terrain-projection.ts';
import {buildSavedShapeMap} from '../src/lib/world/saved-shape-map.ts';
const path=new URL('../static/ddv/world/steam-1.26.2/village04.json',import.meta.url);
test('all 8 actual mainland rasters match decoded SHA and palette counts',()=>{
 const bundle=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8')));
 assert.equal(bundle.grids.length,8);let total=0;
 for(const g of bundle.grids){const b=inflateSync(Buffer.from(g.data,'base64'));assert.equal(b.length,g.sizeX*g.sizeY);
  assert.equal(createHash('sha256').update(b).digest('hex'),g.sha256);const c=g.palette.map(()=>0);
  for(const i of b){assert.ok(i<c.length);c[i]++;}assert.deepEqual(c,g.counts);total+=b.length;}
 assert.equal(total,412868);
});
test('public DB01 geometry uses canonical fields and no fallback shape for missing fields',()=>{
 const objects=publicShapeDefinitions([[40000001,{SizeX:2,SizeY:1,Layers:[0,16],AcceptedFloorTypesFlag:4}],[40000002,{SizeX:2,SizeY:1,Layers:[16]}]],[[40000001,'Furniture'],[40000002,'Furniture']],[[40000001,'Table']]);
 const grid=parsePublicTerrainBundle(JSON.parse(fs.readFileSync(path,'utf8'))).grids[0];
 const map=buildSavedShapeMap(publicShapeSource(grid,objects),grid.layoutId,grid.gridIdNative,[{localOrdinal:1,localGridOrdinal:1,itemId:'40000001',x:0,y:1,orientation:'GridOrientation_Down'},{localOrdinal:2,localGridOrdinal:1,itemId:'40000002',x:3,y:1,orientation:'GridOrientation_Down'}]);
 assert.equal(map.shapes['40000001:8'].cellCount,2);assert.equal(map.objects[0].name,'Table');assert.equal(map.objects[1].shapeKey,null);
 assert.equal(map.savedSourceCoordinateEquivalenceVerified,false);
});
