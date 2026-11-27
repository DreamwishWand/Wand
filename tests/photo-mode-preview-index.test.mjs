import assert from 'node:assert/strict';
import test from 'node:test';
import {relatedPoseItems,relatedPoseMatches,poseSourceIdentity,collectionPoseHref,collectionPoseFromSearch} from '../src/lib/photo-mode/pages-preview.ts';
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

test('related links open the exact shared alternate pose, independent of variant ordering',()=>{
  const opt=sourceSha256=>({kind:'pair',sourceSha256:sourceSha256.repeat(64)});
  const pair=(a,b)=>({male:opt(a),female:opt(b)});
  const shared=pair('a','b'),other=pair('c','d'),third=pair('e','f');
  const index={items:{'1':shared,'2':other,'3':pair('a','c'),'4':{male:opt('a')}},variants:{'2':[third,shared]}};
  const identity=poseSourceIdentity(shared);
  assert.deepEqual(relatedPoseMatches(index,1),[{itemId:2,poseIndex:2,identity}]);
  const href=collectionPoseHref('/Wand',2,identity),search=href.slice(href.indexOf('?'));
  assert.equal(collectionPoseFromSearch(index,2,search),2);
  assert.equal(collectionPoseFromSearch({...index,variants:{'2':[shared,third]}},2,search),1);
  assert.equal(collectionPoseFromSearch(index,1,search),null);
  assert.equal(collectionPoseFromSearch(index,2,search+'&pose='+identity),null);
  assert.equal(collectionPoseFromSearch(index,2,'?item=2&pose=invalid'),null);
  assert.equal(collectionPoseFromSearch(index,2,'?item=2&pose='+poseSourceIdentity(pair('1','2'))),null);
  assert.throws(()=>collectionPoseHref('/Wand',2,'invalid'));
});

import {validLimboMaterial,limboViewDirection} from '../src/lib/photo-mode/limbo-material.ts';
test('source limbo material accepts HDR parameters, rejects invalid inputs and tracks orthographic orbit',()=>{
 const m={material:'source',sourceSha256:'a'.repeat(64),primitiveSlots:[[0,0]],main:[0,.4,.6],secondary:[.5,1.7,2.8],edge:[1,.7,.9],brightness:-.15,radial:1,threshold:-1,edgeRatio:.57};
 assert.equal(validLimboMaterial(m),true);for(const bad of [{...m,radial:0},{...m,main:[0,NaN,0]},{...m,edgeRatio:2},{...m,sourceSha256:'bad'},{...m,extra:true}])assert.equal(validLimboMaterial(bad),false);
 assert.deepEqual(limboViewDirection(0,0),[0,0,1]);const a=limboViewDirection(Math.PI/2,0);assert.ok(Math.abs(a[0]-1)<1e-12&&Math.abs(a[2])<1e-12);
 assert.ok(Math.abs(Math.hypot(...limboViewDirection(.8,.4))-1)<1e-12);
});
