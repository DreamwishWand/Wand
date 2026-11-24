import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
function site(){
  const requests=[];
  return {requests,fetcher:async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  }};
}
test('original item text is available by ItemID in each of eight official languages',async()=>{
  const {fetcher,requests}=site();
  const m=await openPublicItemMaster('',fetcher,{scope:'complete',gameVersion:'current'});
  const c=m.release.localizationCoverage;
  assert.equal(c.itemCount,4769);
  assert.equal(c.keyCount,4751);
  assert.equal(c.allLocalesKeyCount,4489);
  assert.equal(c.fieldCounts.Description,4504);
  assert.equal(c.fieldCounts.DescriptionText,237);
  assert(!requests.some(x=>x.includes('/text/')));
  const en=await m.getLocalizedItemText(30000031,'en');
  assert.deepEqual(en.Description,{key:'ActivityItem.RefinedNightShard_Small_Description',text:'A rare gift for a friend.'});
  assert(Object.isFrozen(en.Description));
  const missing=await m.getLocalizedItemText(30200105,'en');
  assert.equal(missing.Description.text,null);
  assert.equal(await m.getLocalizedItemText(99999999,'en'),null);
  assert.equal(requests.filter(x=>x.endsWith('/text/en.json')).length,1);
  assert(!requests.some(x=>x.endsWith('/text/ja.json')));
  const ja=await m.getLocalizedItemText(30000031,'ja');
  assert.equal(ja.Description.text,'<nobr>友達に贈りたい</nobr>\u200b<nobr>貴重なギフト。</nobr>');
  const rows=await m.getLocalizedItemsText([80000000,130000076,50800150,80000000],'en');
  assert.equal(rows[0].PluralDisplayName.text,'Star Coins');
  assert(rows[1].DescriptionText.text);
  assert(rows[2].EvolvingDescription.text);
  assert.deepEqual(rows[0],rows[3]);
  for(const locale of ['fr','it','de','es-ES','zh-CN','pt-BR']){
    assert((await m.getLocalizedItemText(30000031,locale)).Description.text);
  }
  assert.equal(requests.filter(x=>x.includes('/text/')).length,8);
  await assert.rejects(m.getLocalizedItemText(30000031,'../en'),/INVALID_LOCALE/);
});
test('localized asset corruption fails closed',async()=>{
  const {fetcher}=site();
  const corrupt=async url=>{
    const res=await fetcher(url);
    if(!url.endsWith('/text/en.json'))return res;
    const bytes=new Uint8Array(await res.arrayBuffer());bytes[0]^=1;
    return new Response(bytes);
  };
  const m=await openPublicItemMaster('',corrupt,{scope:'complete'});
  await assert.rejects(m.getLocalizedItemText(30000031,'en'),/SHA_MISMATCH/);
});