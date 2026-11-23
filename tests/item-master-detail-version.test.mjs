import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  openPublicItemDetails,
  PUBLIC_ITEM_DETAILS_SOURCE_VERSION,
} from '../src/lib/items/public-item-details.ts';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';

const indexPath=join(process.cwd(),'static/ddv/item-master/steam-1.26.2/index.json');
const original=JSON.parse(await readFile(indexPath,'utf8'));
const catalog=JSON.parse(await readFile(
  join(process.cwd(),'static/ddv/item-master-releases.json'),'utf8'
));

function fakeFetch(current='1.26.2') {
  const requests=[];
  const next={...original,version:'steam-1.26.3-item-id-master-v1',
    target:{...original.target,gameVersion:'1.26.3'}};
  const versions={...catalog,current,releases:[
    ...catalog.releases,
    {gameVersion:'1.26.3',release:next.version,count:next.count,
      archiveSha256:'a'.repeat(64)}
  ]};
  const fetcher=async url=>{
    requests.push(url);
    if(url==='/Wand/ddv/item-master-releases.json')
      return new Response(JSON.stringify(versions),{status:200});
    if(url==='/Wand/ddv/item-master/steam-1.26.3/index.json')
      return new Response(JSON.stringify(next),{status:200});
    assert(url.startsWith('/Wand/'));
    const bytes=await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes),{status:200});
  };
  return {fetcher,requests};
}

test('joined Item details can select the compatible version and remain lazy',async()=>{
  assert.equal(PUBLIC_ITEM_DETAILS_SOURCE_VERSION,'1.26.2');
  const {fetcher,requests}=fakeFetch();
  const db=await openPublicItemDetails('/Wand',fetcher,{gameVersion:'current'});
  assert.equal(db.release.target.gameVersion,'1.26.2');
  assert.equal(requests.length,2,'current resolves the release registry and Item index');
  assert(!requests.some(url=>url.includes('/acquisition/')));
  const item=await db.getItem(40005160);
  assert.equal(item.definition.names.en,'Glass Shoe');
  assert.equal(item.acquisition.itemId,'40005160');
  const detailed=await db.getItemWithSources(40005160);
  assert.equal(detailed.sourceRelations.itemId,'40005160');
  assert.equal(detailed.itemId,item.itemId);
  assert.equal(requests.filter(url=>url.includes('db01-item-acquisition')).length,1);
  assert.equal(requests.filter(url=>url.includes('db01-item-source-relations')).length,1);
});

test('unpublished newer DB-02 handoff cannot silently join historical acquisition data',async()=>{
  const {fetcher,requests}=fakeFetch('1.26.3');
  const master=await openPublicItemMaster('/Wand',fetcher,{gameVersion:'current'});
  assert.equal(master.release.target.gameVersion,'1.26.3',
    'definition-only master remains available for newer verified releases');
  await assert.rejects(
    openPublicItemDetails('/Wand',fetcher,{gameVersion:'current'}),
    /DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED/
  );
  await assert.rejects(
    openPublicItemDetails('/Wand',fetcher,{gameVersion:'1.26.3'}),
    /DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED/
  );
  assert(!requests.some(url=>url.includes('/acquisition/')),
    'no v1.26.2 sidecar may be fetched for a newer item definition');
});

test('invalid requested versions fail in the master, before loading old source sidecars',async()=>{
  const {fetcher,requests}=fakeFetch();
  await assert.rejects(
    openPublicItemDetails('/Wand',fetcher,{gameVersion:'../../1.26.2'}),
    /ITEM_MASTER_INVALID_GAME_VERSION/
  );
  assert.deepEqual(requests,[]);
});
