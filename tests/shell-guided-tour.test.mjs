import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contextualTour,TOUR_NAVIGATION} from '../src/lib/ui/contextual-tour.ts';
import {SHELL_COPY} from '../src/lib/ui/shell-copy.ts';
import {UI_LANGUAGES} from '../src/lib/ui/preferences.ts';

const pages=[
  ['/',3,'.portal-card-collection'],
  ['/collection/',4,'.collection-workspace .search-box'],
  ['/guide/',3,'.guide-app .timeline-panel'],
  ['/guide/quests/',2,'.quests-public .searchbar'],
  ['/guide/characters/',2,'.character-guide .controls'],
  ['/guide/star-path/',2,'.starpath .seasons'],
  ['/guide/events/',3,'.event-guide .search'],
  ['/guide/source/',3,'.guide-page .guide-import'],
  ['/world/preview/',2,'.world-preview .world-toolbar'],
  ['/save/preview/',3,'.shell-save-button'],
  ['/save/diagnostics/',3,'.shell-save-button']
];

test('guided tours target the actual controls of each route, including Guide subpages',()=>{
  for(const [path,count,selector] of pages){
    const deck=contextualTour(path,SHELL_COPY.ja,'ja');
    assert.equal(deck.steps.length,count,path);
    assert.equal(deck.steps[0].selectors[0],selector,path);
    for(const step of deck.steps){
      assert.ok(step.description?.trim(),path);
      assert.ok(step.selectors.length>0,path);
    }
    assert.deepEqual(contextualTour(path.replace(/\/+$/,'')+'/',SHELL_COPY.ja,'ja'),deck);
  }
});

test('tour navigation and route-specific Guide guidance cover all eight locales',()=>{
  assert.equal(Object.keys(TOUR_NAVIGATION).length,8);
  for(const {code} of UI_LANGUAGES){
    const nav=TOUR_NAVIGATION[code];
    for(const label of [nav.previous,nav.next,nav.done,nav.progress])assert.ok(label.trim(),code);
    for(const [path] of pages){
      const deck=contextualTour(path,SHELL_COPY[code],code);
      assert.ok(deck.title.trim(),path+' '+code);
      assert.ok(deck.steps.every(step=>step.description.trim()),path+' '+code);
    }
  }
});

test('shell launches walkthrough only from Help and stops on route change',()=>{
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  const widget=readFileSync(new URL('../src/lib/ui/GuidedTour.svelte',import.meta.url),'utf8');
  assert.match(layout,/let tutorialOpen=false;/);
  assert.match(layout,/function startTutorial\(\)\{closeMenus\(\);tutorialOpen=true;\}/);
  assert.match(layout,/afterNavigate\(\(\)=>\{closeMenus\(\);closeTutorial\(\);\}\)/);
  assert.equal((layout.match(/on:click=\{startTutorial\}/g)??[]).length,2);
  assert.match(layout,/<GuidedTour title=\{tutorial.title\}/);
  assert.doesNotMatch(layout,/<ol class="tutorial-steps">/);
  assert.match(widget,/scrollIntoView/);
  assert.match(widget,/addEventListener\('scroll',refresh,true\)/);
  assert.match(widget,/wand-tour-spotlight/);
  assert.match(widget,/role="dialog" aria-modal="true"/);
  assert.match(widget,/use:dialogFocus/);
});
