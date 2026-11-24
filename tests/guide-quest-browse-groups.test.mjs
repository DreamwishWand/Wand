import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.ts';
import {questBrowseGroups,questBrowseGroupId} from '../src/lib/guide/quest-browse-groups.ts';
const catalog=verifyPublicQuestIndex(JSON.parse(readFileSync(new URL('../static/guide/public/quest-index.json',import.meta.url),'utf8')));
test('grouped browse covers all native quest categories without a flat All group',()=>{
 for(const [section,count,groups] of [['realm',61,14],['friendship',341,77],['event',66,10],['premium',19,7]]){
  const result=questBrowseGroups(catalog,section,'ja');
  assert.equal(result.length,groups);
  assert.equal(result.flatMap(x=>x.rows).length,count);
  assert.equal(new Set(result.flatMap(x=>x.rows.map(r=>r.id))).size,count);
  for(const group of result)assert(group.rows.every(row=>questBrowseGroupId(row)===group.id));
 }
});
test('revisited realms are grouped and original sequence retained',()=>{
 const groups=questBrowseGroups(catalog,'realm','ja');
 const lion=groups.find(g=>g.id==='LionKing');
 assert.equal(lion.rows.length,6);
 assert.equal(lion.name,'ライオン・キング');
 assert.deepEqual(lion.rows.map(r=>Number(r.id)),lion.rows.map(r=>Number(r.id)).sort((a,b)=>a-b));
});
