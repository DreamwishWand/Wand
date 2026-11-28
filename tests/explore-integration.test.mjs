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

test('all universes reserve full geometry but render only intersecting chunks',()=>{
  assert.match(explore,/\{#each sections as \[key,designs\] \(key\)\}/);
  assert.doesNotMatch(explore,/catalogPrefix|observeCatalogFrontier|data-explore-frontier|data-explore-revealed/);
  assert.match(explore,/width=\{catalogWidth\}/);
  assert.match(explore,/captureCatalogAnchor\(node\)/);
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

test('Quick View preserves the browse workspace and uses shared media and entity link contract',()=>{
  const view=readFileSync(new URL('../src/lib/explore/ExploreQuickView.svelte',import.meta.url),'utf8');
  assert.match(explore,/<ExploreQuickView /);
  assert.match(explore,/export const snapshot=/);
  assert.match(explore,/loadExploreCatalog\(base\)/);
  assert.match(view,/itemEntityHref/);
  assert.match(view,/ItemArtwork/);
  assert.doesNotMatch(view,/<details|<summary/);
  assert.match(explore,/class="tile-controls"/);
});

test('Quick View uses selective configured prices and separates cached and live transaction values',()=>{
  const view=readFileSync(new URL('../src/lib/explore/ExploreQuickView.svelte',import.meta.url),'utf8');
  assert.match(view,/currentItemViewMaster\(base\)/);
  assert.match(view,/readItemPriceDetails\(db,\[id\],language\)/);
  assert.match(view,/row\.amountFieldPresent&&row\.amount!==null&&row\.currency\?\.name/);
  assert.match(view,/row\.source==='dynamic_cache'/);
  assert.match(view,/label\('notLivePrice'\)/);
  assert.match(view,/if\(live\)\{price=result/);
  assert.doesNotMatch(view,/loadCompleteCollection|premiumBundleCatalog/);
});
