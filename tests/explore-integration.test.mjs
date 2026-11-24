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

test('all universes use one shared incremental frontier and identical wrapping grids',()=>{
  assert.match(explore,/\{#each visibleSections as \[key,designs\] \(key\)\}/);
  assert.match(explore,/catalogPrefix\(sections,frontier\)/);
  assert.match(explore,/use:observeCatalogFrontier=\{advanceFrontier\}/);
  assert.equal((explore.match(/<VirtualCatalogGrid /g)??[]).length,1);
  assert.match(explore,/orderedSeriesDesigns\(visibleSeries.get\(key\)/);
  assert.doesNotMatch(explore,/SeriesBlockGrid|seriesRow|seriesList|scrollShelf|stepShelf|grid-auto-flow:column|overflow-x:auto/);
  const grid=readFileSync(new URL('../src/lib/explore/VirtualCatalogGrid.svelte',import.meta.url),'utf8');
  const chunk=readFileSync(new URL('../src/lib/explore/CatalogWindowChunk.svelte',import.meta.url),'utf8');
  assert.match(grid,/layout.chunks as chunk/);
  assert.match(chunk,/\{#if visible\|\|focusWithin\}/);
  assert.match(chunk,/items.slice\(chunk.start,chunk.end\)/);
});

test('Explore uses the shared toolbar, flat filters, and noninteractive headings',()=>{
 assert.match(explore,/registerServiceToolbar\(exploreToolbar\)/);
 assert.match(explore,/readSelectedOwnership/);
 assert.match(explore,/matchesScope\(i,scope\)/);
 assert.match(explore,/<h2 class="universe-heading">/);
 assert.doesNotMatch(explore,/<details|showUniverse|searchOpen|allGrid/);
});
