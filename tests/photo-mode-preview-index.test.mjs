import assert from 'node:assert/strict';
import test from 'node:test';
import {relatedPoseItems} from '../src/lib/photo-mode/pages-preview.ts';
import {poseCopy} from '../src/lib/photo-mode/preview-copy.ts';

test('related pose lookup requires exact source identity in both body types',()=>{
  const opt=sourceSha256=>({kind:'pair',sourceSha256});
  const pair=(a,b)=>({male:opt(a),female:opt(b)});
  const index={items:{'1':pair('a','b'),'2':pair('a','b'),'3':pair('a','c'),'4':{male:opt('a')},'5':pair('x','b'),'6':pair('a','b')}};
  assert.deepEqual(relatedPoseItems(index,1),[2,6]);
  assert.deepEqual(relatedPoseItems(index,4),[]);
  assert.deepEqual(relatedPoseItems(index,99),[]);
});
test('preview controls have the complete eight-locale vocabulary',()=>{
  const locales=['en','ja','de','it','fr','es-ES','zh-CN','pt-BR'];
  const keys=Object.keys(poseCopy('en')).sort();
  for(const locale of locales){
    const copy=poseCopy(locale);
    assert.deepEqual(Object.keys(copy).sort(),keys);
    assert.ok(Object.values(copy).every(s=>typeof s==='string'&&s.length>0));
  }
  assert.equal(new Set(locales.map(l=>poseCopy(l).title)).size,locales.length);
});
