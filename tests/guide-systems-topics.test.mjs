import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicEventFriendshipRewards} from '../src/lib/guide/public-event-friendship-rewards.ts';
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
    for(const field of ['systems','starPaths','events','floating','other','reset',
      'start','taskEnd','exchangeEnd','dateUnknown','guideLink','sourceNote']){
      assert(copy[field].trim(),code+'/'+field);
    }
  }
});

test('native Floating Festival category names match source-localized game terminology',()=>{
  const expected={
    ja:'フローティングフェスティバル',en:'Floating Festival',
    fr:'Festival volant',it:'Festival volante',de:'Schwebendes Fest',
    'es-ES':'Festival Flotante','zh-CN':'浮空节','pt-BR':'Festival Flutuante'
  };
  for(const [locale,label] of Object.entries(expected)){
    const text=guideTimelineCopy(locale);
    assert.equal(text.floating,label,locale);
    assert(text.other.length>0,'non-Floating events need an exclusive neutral category');
  }
  assert.equal(guideTimelineCopy('ja').other,'その他のイベント');
  assert.equal(guideTimelineCopy('en').other,'Other Events');
});

test('Star Path keeps its own name; stripes mean rewards-only after tasks finish',()=>{
  const ja=guideTimelineCopy('ja');
  assert.equal(ja.exchange,'報酬交換のみ');
  assert.equal(ja.exchangeEnd,'報酬交換終了');
  const en=guideTimelineCopy('en');
  assert.equal(en.exchange,'Rewards only');
  assert.equal(en.exchangeEnd,'Reward redemption ends');
  for(const code of Object.keys(GUIDE_LOCALES)){
    const copy=guideTimelineCopy(code);
    assert.notEqual(copy.exchange,copy.task);
    assert(copy.exchange.length>0&&copy.exchangeEnd.length>0);
    assert(!/grace period|猶予期間/i.test(copy.exchange+' '+copy.exchangeEnd));
  }
});

test('Haunted Floating Festival names come from native v1.26.2 localized definitions',async()=>{
  const file=new URL('../static/guide/public/event-friendship-rewards-1.26.2.json',import.meta.url);
  const source=verifyPublicEventFriendshipRewards(JSON.parse(await readFile(file,'utf8')));
  const native=source.getEvent('floating_festival','HauntedFloatingFestival2026');
  assert(native,'2026 Haunted Floating Festival must be source-authenticated');
  const expected={
    ja:'ホーンテッドフローティングフェスティバル',
    en:'The Haunted Floating Festival',
    fr:'Le Festival volant hanté',
    it:'Festival volante stregato',
    de:'Das schwebende Spukfest',
    'es-ES':'El Festival Flotante hechizado',
    'zh-CN':'幽灵浮空节',
    'pt-BR':'O Festival Flutuante Assombrado'
  };
  assert.deepEqual(Object.keys(native.names).sort(),Object.keys(expected).sort());
  for(const [locale,title] of Object.entries(expected))assert.equal(native.names[locale],title);
});
