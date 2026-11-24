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

test('all catalog views use one viewport-windowed wrapping grid without independent scrolling',()=>{
  assert.match(explore,/\{#each shelves as \[key,list\] \(key\)\}/);
  assert.match(explore,/\{#each groups as group \(group.key\)\}/);
  assert.equal((explore.match(/<VirtualCatalogGrid /g)??[]).length,3);
  assert.doesNotMatch(explore,/scrollShelf|stepShelf|shelfLimits|seriesLimits|groupLimit|grid-auto-flow:column|overflow-x:auto|use:more/);
  const grid=readFileSync(new URL('../src/lib/explore/VirtualCatalogGrid.svelte',import.meta.url),'utf8');
  const chunk=readFileSync(new URL('../src/lib/explore/CatalogWindowChunk.svelte',import.meta.url),'utf8');
  assert.match(grid,/layout.chunks as chunk/);
  assert.match(chunk,/\{#if visible\|\|focusWithin\}/);
  assert.match(chunk,/items.slice\(chunk.start,chunk.end\)/);
});
