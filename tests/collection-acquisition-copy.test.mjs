import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionAcquisitionCopy
} from '../src/lib/collection/acquisition-copy.ts';
import {UI_LANGUAGES} from '../src/lib/ui/preferences.ts';

const kinds=[
  'crafting','cooking','fishing','mining','timebending','farming',
  'foraging','game_shop','quest_reward','event_reward','friendship_reward',
  'starpath','twitch_drop','redeem_code','premium_shop',
  'official_campaign','purchase_bonus','gift'
];
const candidates=['loot_table','stall_slot'];

test('all eight supported languages cover every verified source and unverified candidate type',()=>{
  assert.equal(UI_LANGUAGES.length,8);
  for(const language of UI_LANGUAGES){
    const copy=collectionAcquisitionCopy(language.code);
    assert.deepEqual(Object.keys(copy.kinds).sort(),kinds.slice().sort());
    assert.deepEqual(Object.keys(copy.candidates).sort(),candidates.slice().sort());
    for(const label of [
      copy.title,copy.loading,copy.error,copy.retry,
      copy.sourcesLabel,copy.candidatesTitle,copy.candidatesLabel,
      copy.caveat,copy.empty,...Object.values(copy.kinds),
      ...Object.values(copy.candidates)
    ]){
      assert(typeof label==='string'&&label.trim().length>0,
        language.code+': missing or empty UI label');
    }
    assert.notEqual(copy.caveat,copy.empty,
      'source coverage unknown must remain distinct from missing results');
    assert.notEqual(copy.candidatesTitle,copy.title,
      'candidate-only origins must be distinguished from confirmed methods');
  }
});

test('unknown locale falls back to Japanese without changing game or player source evidence',()=>{
  assert.equal(collectionAcquisitionCopy('ja').title,'入手元');
  assert.equal(collectionAcquisitionCopy('en').title,'How to obtain');
  assert.equal(collectionAcquisitionCopy('es').title,collectionAcquisitionCopy('ja').title);
  assert.equal(collectionAcquisitionCopy('__proto__'),collectionAcquisitionCopy('ja'));
  assert.equal(collectionAcquisitionCopy('en').candidates.stall_slot,
    'Stall stock candidate');
});
