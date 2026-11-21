/** CI-only exact JS/Rust parity over six existing DB-05 public field catalogs.
 * Only synthetic documents are passed to the Rust CLI. No private files.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { probeUnifiedSaveStructure, getUnifiedSaveShapeCatalog } from '../../src/lib/save/registry.mjs';

const root = version => ({GameInfo:{Version:version},Player:{},World:{}});
const sample = root(643);
sample.Player.ContainerInventories = {'31': {Inventory:[{
  ItemID:1001, Amount:1, State:{MealData:{IngredientsUsed:[]}}
}]}};
sample.Player.AchievementsData = [{AchievementID:11,CurAmount:0}];
sample.World.GridCollection = {Grids:{'0':{ID:0,Objects:{}}},DiffGrids:{}};

const invalidTypes = root(626);
invalidTypes.Player.AchievementsData = {malformed:'not-a-list'};
invalidTypes.Player.ContainerInventories = {'13':{Inventory:'bad-array'}};
invalidTypes.World.GridCollection = {Grids:[],DiffGrids:42};

const sampled = root(643);
sampled.Player.ContainerInventories = {};
for (let i=1; i<=48; i++) {
  sampled.Player.ContainerInventories[String(i)] = {Inventory:[]};
}

const cases = [
  {name:'empty626',data:root(626)},
  {name:'empty643',data:root(643)},
  {name:'deep-observed',data:sample},
  {name:'conflicting-types',data:invalidTypes},
  {name:'bounded-wildcards',data:sampled},
  {name:'unregistered-version',data:root(999)},
  {name:'invalid-root',data:{GameInfo:{Version:626},Player:[],World:null}},
];
const expected = getUnifiedSaveShapeCatalog();
assert.equal(expected.publicTemplateCount,440);
const input = cases.map(c=>JSON.stringify(c.data)).join('\n')+'\n';
const rust = spawnSync('cargo', [
  'run','--quiet','--manifest-path','crates/ddv-save-schema/Cargo.toml',
  '--example','unified_shape_probe'
], {input, encoding:'utf8', maxBuffer:16*1024*1024, timeout:180000});
assert.equal(rust.error, undefined, 'Rust synthetic probe failed to launch');
assert.equal(rust.status, 0, 'Rust synthetic probe returned failure');
const lines = rust.stdout.trimEnd().split('\n');
assert.equal(lines.length,cases.length);
for(let i=0;i<cases.length;i++){
  const actual = JSON.parse(lines[i]);
  const reference = probeUnifiedSaveStructure(cases[i].data);
  assert.deepEqual(actual,reference,'JS/Rust 440-path divergence: '+cases[i].name);
  assert.equal(actual.writerAuthorized,false);
  assert.equal(actual.nativeBuildAttested,false);
  assert.equal(actual.exhaustive,false);
  assert.equal(actual.strictDecoderVerified,false);
  assert.equal(actual.publicTemplateCount,440);
  assert.equal(lines[i].includes('malformed'),false);
  assert.equal(lines[i].includes('1001'),false);
}
process.stdout.write('DB-05 JS/Rust 440-field shape parity PASS: '+cases.length+' synthetic profiles\n');
