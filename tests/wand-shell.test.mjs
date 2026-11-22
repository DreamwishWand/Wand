import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WAND_LOCALES, validWandLocale, readWandLocale, changeWandLocale, onWandLocaleChange} from '../src/lib/ui/wand-locale.ts';

test('Wand shell offers exactly the eight game UI languages',()=>{
  assert.deepEqual(WAND_LOCALES.map(x=>x.id),['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']);
  assert.equal(validWandLocale('ja'),true);
  assert.equal(validWandLocale('invalid'),false);
});

test('language choice persists and notifies active service views',()=>{
  const previousWindow=globalThis.window;
  const previousDocument=globalThis.document;
  const storage=new Map();
  const target=new EventTarget();
  const doc={documentElement:{lang:'ja'}};
  globalThis.window=Object.assign(target,{localStorage:{
    getItem(key){return storage.get(key)??null;},
    setItem(key,value){storage.set(key,value);}
  }});
  globalThis.document=doc;
  try{
    const observed=[];
    const unsubscribe=onWandLocaleChange(value=>observed.push(value));
    assert.equal(readWandLocale(),'ja');
    changeWandLocale('fr');
    assert.equal(readWandLocale(),'fr');
    assert.equal(doc.documentElement.lang,'fr');
    assert.deepEqual(observed,['fr']);
    changeWandLocale('unsupported');
    assert.deepEqual(observed,['fr']);
    unsubscribe();
    changeWandLocale('ja');
    assert.deepEqual(observed,['fr']);
  }finally{
    globalThis.window=previousWindow;
    globalThis.document=previousDocument;
  }
});

test('toolbar has global actions and all service-language consumers',async()=>{
  const root=fileURLToPath(new URL('../src/routes/',import.meta.url));
  const load=path=>readFile(new URL(path,import.meta.url),'utf8');
  const layout=await readFile(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  for(const text of ['ログイン・アカウント','セーブファイルを読み込む','このページのチュートリアル','表示言語を切り替える','switchTheme','wand:collection-filters','wand:save-clear']){
    assert.ok(layout.includes(text),text);
  }
  for(const path of ['collection/+page.svelte','guide/quests/+page.svelte','guide/star-path/+page.svelte','guide/characters/+page.svelte']){
    const page=await readFile(new URL('../src/routes/'+path,import.meta.url),'utf8');
    assert.match(page,/onWandLocaleChange/);
    assert.match(page,/readWandLocale/);
  }
});
