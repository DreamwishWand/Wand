import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GUIDE_AUTOLOAD_ROOT_MARGIN,observeGuideListEnd} from '../src/lib/guide/auto-load.mjs';

test('Guide incremental observer advances only for the observed intersecting node and disconnects',()=>{
  const saved=globalThis.IntersectionObserver;
  const node={id:'list-end'},different={id:'unrelated'};
  const events=[];
  let instance;
  class FakeObserver{
    constructor(callback,options){this.callback=callback;this.options=options;instance=this;}
    observe(target){this.observed=target;}
    disconnect(){this.disconnected=true;}
    fire(entries){this.callback(entries);}
  }
  try{
    globalThis.IntersectionObserver=FakeObserver;
    const control=observeGuideListEnd(node,all=>events.push(all));
    assert.equal(instance.observed,node);
    assert.equal(instance.options.root,null);
    assert.equal(instance.options.rootMargin,GUIDE_AUTOLOAD_ROOT_MARGIN);
    assert.equal(instance.options.threshold,0);
    instance.fire([{target:different,isIntersecting:true}]);
    instance.fire([{target:node,isIntersecting:false}]);
    assert.deepEqual(events,[]);
    instance.fire([{target:node,isIntersecting:true}]);
    assert.deepEqual(events,[false]);
    control.destroy();
    assert.equal(instance.disconnected,true);
  }finally{
    if(saved===undefined)delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver=saved;
  }
});

test('Guide incremental observer exposes all indexed rows when IntersectionObserver is unavailable',()=>{
  const saved=globalThis.IntersectionObserver;
  const called=[];
  try{
    delete globalThis.IntersectionObserver;
    const control=observeGuideListEnd({},all=>called.push(all));
    control.destroy();
    assert.deepEqual(called,[true]);
    assert.throws(()=>observeGuideListEnd(null,()=>{}),/requires a node/);
    assert.throws(()=>observeGuideListEnd({},null),/requires a node/);
  }finally{
    if(saved===undefined)delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver=saved;
  }
});

test('Quest, Character and Star Path indexes grow on scroll without manual pagination controls',async()=>{
  const pages=[
    'src/routes/guide/quests/+page.svelte',
    'src/routes/guide/characters/+page.svelte',
    'src/routes/guide/star-path/+page.svelte'
  ];
  for(const name of pages){
    const source=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.match(source,/observeGuideListEnd/);
    assert.match(source,/use:observeMore/);
    assert.match(source,/pagingRevision/);
    assert.match(source,/\{#key/);
    assert.doesNotMatch(source,/さらに表示|class="load-more"/);
    assert.match(source,/aria-hidden="true"><\/div>/);
  }
});
