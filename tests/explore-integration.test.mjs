import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const entry=readFileSync(new URL('../src/routes/decorate/+page.svelte',import.meta.url),'utf8');
const explore=readFileSync(new URL('../src/routes/decorate/explore/+page.svelte',import.meta.url),'utf8');
test('Decorate keeps two surfaces; moodboard management is inside Explore',()=>{
  assert.match(entry,/\/decorate\/explore\//);
  assert.doesNotMatch(entry,/Moodboards/);
  assert.match(explore,/class="catalog"/);
  assert.match(explore,/class="boards"/);
  assert.match(explore,/class:withBoards=\{boardsOpen\}/);
  assert.doesNotMatch(explore,/mode===|mode='boards'/);
});

test('Explore uses one wrapping catalog grid; universes and series are never horizontally paginated',()=>{
  assert.match(explore,/\{#each shelves as \[key,list\] \(key\)\}/);
  assert.match(explore,/\{#each list as item \(item.itemId\)\}/);
  assert.match(explore,/\{#each groups as group \(group.key\)\}/);
  assert.match(explore,/\{#each designs as design \(design.key\)\}/);
  assert.match(explore,/\{#each gridDesigns as design \(design.key\)\}/);
  assert.match(explore,/\.catalog \.tiles\{grid-template-columns:repeat\(auto-fill,/);
  assert.doesNotMatch(explore,/scrollShelf|stepShelf|shelfLimits|seriesLimits|groupLimit|grid-auto-flow:column|overflow-x:auto|use:more/);
});
