import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {guideHelpProvider,guideHelpPostsFor,GUIDE_HELP_KINDS} from '../src/lib/guide/community-help.ts';
import {guideHelpCopy} from '../src/lib/guide/community-help-copy.ts';
test('Help Center starts disconnected and only projects exact ranked subject posts',()=>{
  assert.equal(get(guideHelpProvider),null);
  const subject={kind:'quest',id:'2070000620'};
  const posts=[
    {id:'wrong-kind',subject:{kind:'character',id:subject.id},kind:'issue',title:'wrong'},
    {id:'wrong-id',subject:{kind:'quest',id:'2070000621'},kind:'issue',title:'wrong'},
    {id:'tip',subject,kind:'tip',title:'tip'},
    ...[1,2,3,4].map(n=>({id:String(n),subject,kind:'issue',title:String(n)}))
  ];
  assert.deepEqual(guideHelpPostsFor(posts,subject,'issue').map(p=>p.id),['1','2','3']);
  assert.deepEqual(guideHelpPostsFor(posts,subject,'tip').map(p=>p.id),['tip']);
  assert.deepEqual(guideHelpPostsFor(posts,subject,'question'),[]);
});
test('all eight supported languages provide all Help Center controls',()=>{
  for(const locale of ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']){
    const copy=guideHelpCopy(locale);
    assert(copy.heading&&copy.unavailable&&copy.loading&&copy.empty&&copy.error&&copy.retry);
    for(const kind of GUIDE_HELP_KINDS)assert(copy.sections[kind]&&copy.actions[kind]);
  }
});
