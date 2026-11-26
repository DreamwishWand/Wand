import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePublicTerrainRelease} from '../src/lib/world/public-terrain-projection.ts';
import {bindMainland} from '../src/lib/world/mainland-world-coordinates.ts';
import {worldDecorationScope} from '../src/lib/world/island-save-preset.ts';
import {captureIslandDecoration,parseIslandDecoration} from '../src/lib/world/island-decoration-preset.ts';
const catalog=parsePublicTerrainRelease(JSON.parse(readFileSync(new URL('../static/ddv/world/steam-1.26.2/index.json',import.meta.url),'utf8')));
for(const scope of ['Village04','VillageExpansion01','VillageExpansion02','VillageExpansion03','VillageExpansion04','VillageWinnieDLC']){
 test('whole world backup contains every verified grid: '+scope,()=>{
  const grids=bindMainland(catalog.entries.find(e=>e.scope===scope).grids);
  assert.equal(worldDecorationScope(grids),scope);
  const objects=new Map(grids.map(g=>[g.key,[]])),networks=new Map(grids.map(g=>[g.key,[]]));
  const capture=captureIslandDecoration(grids,{objects,summaries:[],text:''},networks,new Map(),true);
  assert.ok(capture);const parsed=parseIslandDecoration(capture.text,grids,true);
  assert.equal(parsed.size,grids.length);assert.ok([...parsed.values()].every(a=>a.supports.size===0));
  assert.throws(()=>parseIslandDecoration(capture.text,grids.slice(1),true));
  assert.equal(captureIslandDecoration(grids.slice(1),{objects,summaries:[],text:''},networks,new Map(),true),null);
  const invalid=JSON.parse(capture.text);invalid.areas[1]=invalid.areas[0];assert.throws(()=>parseIslandDecoration(JSON.stringify(invalid),grids,true));
 });
}
