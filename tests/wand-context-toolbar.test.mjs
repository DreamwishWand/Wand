import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHELL_COPY} from '../src/lib/ui/shell-copy.ts';
const route=path=>new URL('../src/routes/'+path,import.meta.url);
test('shared Wand header renders truthful account/save/help and contextual action surfaces',async()=>{
  const html=await readFile(route('+layout.svelte'),'utf8');
  const required=[
    ['accountOpen','ログイン・アカウント'],
    ['accountInfo','ログイン機能は準備中'],
    ['readSave','セーブファイルを読み込む'],
    ['tutorialHelp','このページのチュートリアル'],
    ['worldTools','Worldツールバー'],
    ['saveTools','Saveツールバー']
  ];
  for(const [key,label] of required){
    assert.ok(SHELL_COPY.ja[key].includes(label),label);
    assert.ok(html.includes('copy.'+key),'Layout must render '+key+' from locale dictionary');
  }
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
