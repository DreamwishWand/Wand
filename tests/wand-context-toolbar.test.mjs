import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const route=path=>new URL('../src/routes/'+path,import.meta.url);
test('shared Wand header renders truthful account/save/help and contextual action surfaces',async()=>{
  const html=await readFile(route('+layout.svelte'),'utf8');
  for(const label of ['ログイン・アカウント','ログイン機能は準備中','セーブファイルを読み込む','このページのチュートリアル','Collectionツールバー','Guideツールバー','Worldツールバー','Saveツールバー'])assert.ok(html.includes(label),label);
  assert.ok(html.includes('switchLanguage'));
  assert.ok(html.includes('switchTheme'));
});
test('context toolbar is connected to page actions',async()=>{
  const collection=await readFile(route('collection/+page.svelte'),'utf8');
  const save=await readFile(route('save/diagnostics/+page.svelte'),'utf8');
  assert.match(collection,/wand:collection-filters/);
  assert.match(save,/wand:save-clear/);
  const layout=await readFile(route('+layout.svelte'),'utf8');
  assert.match(layout,/wand:collection-backup/);
  assert.match(layout,/openWorldSource/);
  assert.match(layout,/focusContextSearch/);
});
