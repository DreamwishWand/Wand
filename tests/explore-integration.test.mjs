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
