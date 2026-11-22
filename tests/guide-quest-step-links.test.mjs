import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex,findPublicQuestByLink} from '../src/lib/guide/public-guide.mjs';
import {publicQuestStepIndex,publicQuestStepQuery} from '../src/lib/guide/public-quest-steps.mjs';

const indexPath=new URL('../static/guide/public/quest-index.json',import.meta.url);

test('step permalink is scoped to a verified public quest ID, not player state',async()=>{
  const data=verifyPublicQuestIndex(JSON.parse(await readFile(indexPath,'utf8')));
  const row=findPublicQuestByLink(data,'?quest=2070000620&step=3');
  assert.equal(row.id,'2070000620');
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=3',row.id,5),2);
  assert.equal(publicQuestStepQuery(row.id,2,5),'?quest=2070000620&step=3');
  assert.equal(publicQuestStepIndex('?quest=2070000620',row.id,5),0);
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=5',row.id,5),4);
});

test('malformed, duplicated, out-of-range and foreign step selectors fail closed',()=>{
  const id='2070000620';
  for(const query of [
    '?quest=2070000620&step=0','?quest=2070000620&step=-1',
    '?quest=2070000620&step=0002','?quest=2070000620&step=6',
    '?quest=2070000620&step=2&step=3','?quest=2070000620&step=nan',
    '?quest=2070000620&step=1e2','?quest=2070000620&step=%2f',
    '?quest=2070000688&step=2','?quest=2070000620&quest=2070000688&step=2',
    '?step=2','?quest=2070000620&step=999999',
    '?quest=2070000620&step=2&x='+('a'.repeat(2050))
  ])assert.equal(publicQuestStepIndex(query,id,5),0,query);
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=2','nope',5),0);
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=2',id,0),0);
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=2',id,10001),0);
  assert.equal(publicQuestStepIndex('?quest=2070000620&step=2',id,5.5),0);
  for(const [quest,step,count] of [
    ['2070000620',5,5],['2070000620',-1,5],['2070000620',1,0],
    ['2070000620',1,10001],['nope',1,5],['2070000620',1.4,5]
  ])assert.throws(()=>publicQuestStepQuery(quest,step,count),/invalid selection/);
});

test('step navigation is a compact opt-in view, preserving the full verified source record',async()=>{
  const doc=JSON.parse(await readFile(new URL('../static/guide/public/quest-details-05.json',import.meta.url),'utf8'));
  const quest=doc.quests.find(row=>row.id==='2070000620');
  assert.equal(quest.steps.length,5);
  assert.deepEqual(quest.steps.map(step=>step.index),[0,1,2,3,4]);
  const page=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/publicQuestStepIndex/);
  assert.match(page,/showAllSteps\?selected\.steps:selected\.steps\.slice\(activeStep,activeStep\+1\)/);
  assert.match(page,/window\.history\.pushState/);
  assert.doesNotMatch(page,/localStorage|sessionStorage/);
});
