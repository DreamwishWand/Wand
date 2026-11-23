import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_SYSTEM_CATEGORIES} from '../src/lib/guide/system-topics.ts';
import {GUIDE_LOCALES,guideTimelineCopy} from '../src/lib/guide/timeline-copy.ts';

const expected=[16,13,13,21,17,14,12];
test('approved Guide Systems taxonomy keeps seven categories and all 106 unique topics',()=>{
  assert.equal(GUIDE_SYSTEM_CATEGORIES.length,7);
  const flat=GUIDE_SYSTEM_CATEGORIES.flatMap(x=>x.groups.flatMap(g=>g.topics));
  assert.equal(flat.length,106);
  assert.equal(new Set(flat.map(x=>x.id)).size,106);
  assert.deepEqual(GUIDE_SYSTEM_CATEGORIES.map(x=>
    x.groups.reduce((sum,g)=>sum+g.topics.length,0)),expected);
  for(const category of GUIDE_SYSTEM_CATEGORIES){
    assert(category.ja&&category.en);
    for(const group of category.groups){
      assert(group.ja&&group.en);
      for(const topic of group.topics)assert(topic.ja&&topic.en&&topic.id);
    }
  }
  const topics=new Set(flat.map(x=>x.id));
  for(const id of ['star_paths','floating_islands','mounts','bee_house',
    'native_decoration_presets','dreamsnaps','real_time_sync'])assert(topics.has(id));
  assert.equal(GUIDE_SYSTEM_CATEGORIES[0].id,'basics-progression-settings');
  assert.equal(GUIDE_SYSTEM_CATEGORIES[6].id,'photography-social-activities');
});
test('calendar controls and localized date patterns cover all eight supported languages',()=>{
  assert.equal(Object.keys(GUIDE_LOCALES).length,8);
  for(const code of Object.keys(GUIDE_LOCALES)){
    const copy=guideTimelineCopy(code);
    for(const field of ['systems','starPaths','events','floating','valley','reset',
      'start','taskEnd','exchangeEnd','dateUnknown','guideLink','sourceNote']){
      assert(copy[field].trim(),code+'/'+field);
    }
  }
});

test('Star Path grace period is named independently of rewards exchange in every locale',()=>{
  const ja=guideTimelineCopy('ja');
  assert.equal(ja.exchange,'猶予期間');
  assert.equal(ja.exchangeEnd,'猶予期間終了');
  for(const code of Object.keys(GUIDE_LOCALES)){
    const copy=guideTimelineCopy(code);
    assert.notEqual(copy.exchange,copy.task);
    assert(copy.exchange.length>0&&copy.exchangeEnd.length>0);
  }
});
