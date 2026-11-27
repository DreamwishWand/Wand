import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {inflateSync} from 'node:zlib';
const manifest=JSON.parse(readFileSync('src/lib/world/player-house-source.json','utf8'));
const source=JSON.parse(readFileSync('data/ddv/item-master/reviewed-root-scalars-steam-1.26.2.part1.json','utf8'));
test('state-free local original template bindings exactly match reviewed item DB',()=>{
 assert.equal(manifest.sourceItemsSha256,source.sourceItemsSha256);
 const rows=JSON.parse(inflateSync(Buffer.from(source.fields[manifest.sourceField].packed,'base64')).toString('utf8'));
 let item=0;const expected=new Map();
 for(const [delta,path] of rows){item+=delta;if(Math.floor(item/100000)===205&&manifest.templates.some(t=>t.layoutPath===path))expected.set(item,path);}
 const actual=new Map();
 for(const t of manifest.templates){assert.match(t.sha256,/^[0-9a-f]{64}$/);for(const item of t.itemIds){assert.ok(!actual.has(item));actual.set(item,t.layoutPath);}}
 assert.equal(actual.size,137);assert.deepEqual(actual,expected);
});
