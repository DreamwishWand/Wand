import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {createGuideRewardIndex} from '../src/lib/guide/reward-relations.ts';
import {resolveStarpathRewardLink,starpathRewardHref}
  from '../src/lib/guide/starpath-reward-link.ts';

async function index(){
  const data=verifyPublicStarpath(JSON.parse(await readFile(new URL(
    '../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8')));
  return createGuideRewardIndex(data);
}

test('every original reward slot has a unique round-trip permalink, including Vault and bonus',async()=>{
  const guide=await index();
  assert.equal(guide.occurrences.length,67);
  assert.equal(guide.seasons.length,2);
  const urls=new Set();
  for(const row of guide.occurrences){
    for(const base of ['/Wand','']){
      const url=starpathRewardHref(base,row);
      const resolved=resolveStarpathRewardLink(new URL(url,'https://example.com').search,guide);
      assert.strictEqual(resolved?.occurrence,row,'must preserve the exact original slot');
      assert.equal(resolved?.seasonId,row.seasonId);
      assert(Object.isFrozen(resolved));
      if(base==='/Wand'){
        assert(!urls.has(url),'two configured slots must never share a URL');
        urls.add(url);
      }
    }
  }
  assert.equal(urls.size,67);
  assert(guide.occurrences.some(r=>r.section==='bonus'));
  assert(guide.occurrences.some(r=>r.section==='vault'));
  // Equal Item IDs in two slots must remain separately addressable.
  const duplicate=guide.occurrences.find(r=>guide.occurrences.some(
    next=>next!==r&&next.itemId===r.itemId));
  assert(duplicate,'expected repeated Item IDs in the source-defined slots');
  const other=guide.occurrences.find(r=>r!==duplicate&&r.itemId===duplicate.itemId);
  assert.notEqual(starpathRewardHref('/Wand',duplicate),starpathRewardHref('/Wand',other));
});

test('invented slots, cross-season links, duplicate params, Item IDs and unsafe bases are rejected',async()=>{
  const guide=await index(),sample=guide.occurrences[0];
  const valid=starpathRewardHref('/Wand',sample),search=new URL(valid,'https://example.com').search;
  const invalid=[
    '',
    '?season='+sample.seasonId,
    '?reward='+encodeURIComponent(sample.occurrenceId),
    '?season='+sample.seasonId+'&reward='+sample.itemId,
    '?season='+sample.seasonId+'&reward='+encodeURIComponent(sample.seasonId+'/vault/999'),
    '?season=Unknown2026&reward='+encodeURIComponent(sample.occurrenceId),
    search+'&reward='+encodeURIComponent(sample.occurrenceId),
    search+'&season='+sample.seasonId,
    search+'&task=Task01',
    search+'&unknown=1',
    search+'&bad='+('x'.repeat(2049)),
    '?season='+sample.seasonId+'&reward=__proto__'
  ];
  for(const query of invalid)assert.equal(resolveStarpathRewardLink(query,guide),null,query);
  assert.equal(resolveStarpathRewardLink(search,null),null);
  assert.equal(resolveStarpathRewardLink(search,{contract:'other'}),null);
  const duplicated={...guide,getSeasonRewards:id=>[
    ...guide.getSeasonRewards(id),sample
  ]};
  assert.equal(resolveStarpathRewardLink(search,duplicated),null,'ambiguous slot must not be navigated');
  assert.throws(()=>starpathRewardHref('//evil.example',sample),/invalid link/);
  assert.throws(()=>starpathRewardHref('/Wand?x=1',sample),/invalid link/);
  assert.throws(()=>starpathRewardHref('/Wand',{...sample,occurrenceId:sample.itemId}),/invalid link/);
  assert.throws(()=>starpathRewardHref('/Wand',{...sample,itemId:'__proto__'}),/invalid link/);
});

test('Guide reward links are rendered as per-slot navigation without save edits',async()=>{
  const page=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/resolveStarpathRewardLink\(window\.location\.search,sharedRewardIndex\)/);
  assert.match(page,/starpathRewardHref\(base,r\)/);
  assert.match(page,/\(r\.occurrenceId\)/);
  assert.match(page,/rewardQuery=link\.occurrence\.itemId/);
  assert.match(page,/window\.history\.pushState/);
  assert.doesNotMatch(page,/localStorage|sessionStorage|saveMutation/i);
});
