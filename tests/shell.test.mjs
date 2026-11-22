import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {launcherServices} from '../src/lib/ui/services.ts';

test('shell launcher exposes seven unique, non-placeholder destinations',()=>{
  assert.equal(launcherServices.length,7);
  assert.equal(new Set(launcherServices.map(service=>service.key)).size,7);
  assert.equal(launcherServices.find(service=>service.key==='community')?.name,'Community Help Center');
  assert.deepEqual(launcherServices.filter(service=>service.href).map(service=>service.key),['collection','guide']);
  for(const service of launcherServices){
    assert.ok(service.name&&service.icon);
    if(service.href) assert.match(service.href,/^\/[a-z]+\/$/);
    else assert.equal(service.href,null);
  }
});


test('the supplied Large SVG is the favicon and the normal SVG is decorative, not Home navigation',()=>{
  const template=readFileSync(new URL('../src/app.html',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  const large=readFileSync(new URL('../static/DreamwishWand_Large.svg',import.meta.url),'utf8');
  const normal=readFileSync(new URL('../static/DreamwishWand.svg',import.meta.url),'utf8');
  assert.match(template,/<link rel="icon" href="%sveltekit.assets%\/DreamwishWand_Large\.svg"/);
  assert.match(layout,/<span class="shell-brand-mark" aria-hidden="true"><img src="\{base\}\/DreamwishWand\.svg" alt=""/);
  assert.match(layout,/<a class="header-home-button" href="\{base\}\/" aria-label="ホームへ戻る"/);
  assert.ok(layout.indexOf('class="shell-brand-mark"')<layout.indexOf('class="header-home-button"'));
  for(const svg of [large,normal]){
    assert.match(svg,/fill="#011A60"/);
    assert.match(svg,/fill="#F2F9FE"/);
    assert.match(svg,/<svg[^>]+viewBox="0 0 512 512"/);
  }
  assert.match(large,/scale\(0\.423025036\)/);
  assert.match(normal,/scale\(0\.389390322\)/);
});
