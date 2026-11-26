import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {launcherServices} from '../src/lib/ui/services.ts';
import {UI_LANGUAGES,UI_THEMES} from '../src/lib/ui/preferences.ts';
import {SHELL_COPY} from '../src/lib/ui/shell-copy.ts';

test('shell launcher exposes seven unique, non-placeholder destinations',()=>{
  assert.equal(launcherServices.length,7);
  assert.equal(new Set(launcherServices.map(service=>service.key)).size,7);
  assert.equal(launcherServices.find(service=>service.key==='community')?.name,'Community Help Center');
  assert.deepEqual(launcherServices.filter(service=>service.href).map(service=>service.key),['decorate','collection','guide','presets']);
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
  assert.match(layout,/<a class="header-home-button" href="\{base\}\/" aria-label=\{copy\.home\}/);
  assert.ok(layout.indexOf('class="shell-brand-mark"')<layout.indexOf('class="header-home-button"'));
  assert.match(large,/<rect id="background" width="512" height="512" rx="112" ry="112" fill="#011A60"\/>/);
  assert.doesNotMatch(normal,/<rect\b|fill="#011A60"/);
  assert.deepEqual([...large.matchAll(/<path\b[^>]*>/gs)].map(m=>m[0]),
    [...normal.matchAll(/<path\b[^>]*>/gs)].map(m=>m[0]));
  for(const svg of [large,normal]){
    assert.match(svg,/fill="#F2F9FE"/);
    assert.match(svg,/<svg[^>]+viewBox="0 0 512 512"/);
  }
  assert.match(large,/scale\(0\.423025036\)/);
  assert.match(normal,/scale\(0\.389390322\)/);
});

test('all eight verified DDV interface locales have complete shell controls and tutorials',()=>{
  assert.deepEqual(UI_LANGUAGES.map(x=>x.code),
    ['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']);
  assert.equal(new Set(UI_LANGUAGES.map(x=>x.code)).size,8);
  assert.equal(Object.keys(SHELL_COPY).length,8);
  for(const {code} of UI_LANGUAGES){
    const translation=SHELL_COPY[code];
    for(const [key,value] of Object.entries(translation)){
      if(key==='themes'||key==='tutorials')continue;
      assert.equal(typeof value,'string',code+' '+key);
      assert.ok(value.trim(),code+' '+key);
    }
    for(const {code:theme} of UI_THEMES){
      assert.ok(translation.themes[theme]?.trim(),code+' '+theme);
    }
    for(const key of ['home','collection','guide','characters','starpath','world','save']){
      assert.ok(translation.tutorials[key]?.title,code+' '+key);
      assert.ok(translation.tutorials[key]?.steps.length>=2,code+' '+key);
    }
  }
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  assert.match(layout,/class="shell-theme-options"/);
  assert.match(layout,/aria-pressed=\{uiTheme===item.code\}/);
  assert.doesNotMatch(layout,/themeOpen|shell-theme-menu/);
});

test('language selector uses the shared globe artwork and retains the current locale code',()=>{
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  const icons=readFileSync(new URL('../src/lib/ui/WandIcon.svelte',import.meta.url),'utf8');
  assert.match(layout,/<WandIcon name="globe" size=\{19\}\/><span class="header-locale-code">\{LANGUAGE_SHORT\[uiLocale\]\}<\/span>/);
  assert.match(icons,/globe:globePath/);
  assert.match(icons,/world:globePath/);
});
