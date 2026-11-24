import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyPublicQuestIndex,publicQuestNativeOrder} from '../src/lib/guide/public-guide.ts';
import {questStoryFlow,requiredStoryCompletionIds} from '../src/lib/guide/quest-story-flow.ts';
const catalog=verifyPublicQuestIndex(JSON.parse(readFileSync(new URL('../static/guide/public/quest-index.json',import.meta.url),'utf8')));
test('all six complete story lists preserve source sequence and separate unnumbered missions',()=>{
 const expected={valley:[31,12],rift:[29,1],storybook:[29,0],ranch:[19,1],honeyglow:[19,0],keepsake:[24,1]};
 for(const [arc,counts] of Object.entries(expected)){
  const flow=questStoryFlow(catalog,arc,'ja');
  assert.deepEqual([flow.main.length,flow.related.length],counts);
  assert.deepEqual(flow.main.map(publicQuestNativeOrder),flow.main.map(publicQuestNativeOrder).sort((a,b)=>a-b));
  assert(flow.related.every(row=>publicQuestNativeOrder(row)===null));
 }
});
test('static mandatory completion references respect AND OR NOT',()=>{
 const completed=id=>({type:'predicate',kind:'MissionCompleted',sourceFields:{missionId:id}});
 const nested=(operator,clauses)=>({type:'nested',tree:{operator,clauses}});
 const branch={operator:'AND',clauses:[completed('11'),nested('OR',[completed('22'),completed('33')]),nested('NOT',[completed('44')]),nested('OR',[nested('AND',[completed('55'),completed('66')]),completed('55')])]};
 assert.deepEqual([...requiredStoryCompletionIds(branch)],['11','55']);
 assert.equal(requiredStoryCompletionIds(null).size,0);
});
