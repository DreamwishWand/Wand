import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {characterHouseExterior} from '../src/lib/world/character-house-exteriors.ts';
const source=JSON.parse(readFileSync('data/ddv/item-master/reviewed-root-scalars-steam-1.26.2.part1.json','utf8'));
const projection=JSON.parse(readFileSync('src/lib/world/character-house-exteriors.json','utf8'));
test('character house exterior projection matches the complete reviewed native Character.House reverse index',()=>{
 const field=source.fields[projection.sourceField];
 const rows=JSON.parse(inflateSync(Buffer.from(field.packed,'base64')).toString('utf8'));
 const ids=[...new Set(rows.map(r=>r[1]))];
 assert.equal(source.sourceItemsSha256,projection.sourceItemsSha256);
 assert.equal(rows.length,projection.sourceCount);
 assert.equal(ids.length,projection.distinctBuildingCount);
 assert.deepEqual(ids.filter(id=>Math.floor(id/100000)===200).sort((a,b)=>a-b),projection.itemIds);
 assert.equal(characterHouseExterior(20000016),true);
 assert.equal(characterHouseExterior(20400023),false);
 assert.equal(characterHouseExterior(20500001),false);
});
