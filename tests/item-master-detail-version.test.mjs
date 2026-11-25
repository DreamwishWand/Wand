import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {publishCurrentProjections} from '../tools/db-01-items/publish-current-projections.mjs';
import {
  openPublicItemDetails,
  openCurrentItemDetails,
  PUBLIC_ITEM_DETAILS_SOURCE_VERSION,
} from '../src/lib/items/public-item-details.ts';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';

const indexPath=join(process.cwd(),'static/ddv/item-master/steam-1.26.2/index.json');
const original=JSON.parse(await readFile(indexPath,'utf8'));
const catalog=JSON.parse(await readFile(
  join(process.cwd(),'static/ddv/item-master-releases.json'),'utf8'
));

const complete=JSON.parse(await readFile(
  join(process.cwd(),'static/ddv/item-master/current/index.json'),'utf8'
));
function fakeFetch(current='1.26.2') {
  const requests=[];
  const next={...original,version:'steam-1.26.3-item-id-master-v1',
    target:{...original.target,gameVersion:'1.26.3'}};
  const nextComplete={...complete,version:'steam-1.26.3-item-id-master-v3',
    target:{...complete.target,gameVersion:'1.26.3'}};
  delete nextComplete.acquisitionProjection;
  const nextCompletePins={...catalog.releases.find(r=>r.gameVersion==='1.26.2').complete,
    release:nextComplete.version};
  delete nextCompletePins.acquisitionProjection;
  const versions={...catalog,current,releases:[
    ...catalog.releases,
    {gameVersion:'1.26.3',release:next.version,count:next.count,
      archiveSha256:'a'.repeat(64),complete:nextCompletePins}
  ]};
  const fetcher=async url=>{
    requests.push(url);
    if(url==='/Wand/ddv/item-master-releases.json')
      return new Response(JSON.stringify(versions),{status:200});
    if(url==='/Wand/ddv/item-master/current/index.json'&&current==='1.26.3')
      return new Response(JSON.stringify(nextComplete),{status:200});
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
  assert.equal(db.acquisitionStatus,'current');
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

test('current details pin the complete manifest and never reopen mutable release pointers',async()=>{
  const {fetcher,requests}=fakeFetch();
  const pinned=async url=>{
    if(url.endsWith('/item-master-releases.json')||url.endsWith('/item-master/current/index.json')){
      assert(!requests.includes(url),'current pointer was reopened');
    }
    assert(!url.includes('/item-master/steam-1.26.2/'),'legacy Item snapshot was opened');
    return fetcher(url);
  };
  const db=await openCurrentItemDetails('/Wand',pinned);
  assert.equal(db.release.scope,'complete');
  assert.equal(db.release.count,complete.count);
  assert.equal(db.release.archiveSha256,complete.archiveSha256);
  const ids=[40005160,2130000001,99999999,40005160];
  const result=await db.getSelectedItems(ids,['nativeCategory','names.en'],{acquisition:true,sourceRelations:true});
  assert.equal(result[0].values['names.en'],'Glass Shoe');
  assert.equal(result[1].values.nativeCategory,'Condition');
  assert.equal(result[2],null);
  assert.deepEqual(result[0],result[3]);
  await db.getSelectedItems(ids,['nativeCategory']);
  assert.equal(requests.filter(url=>url.endsWith('/item-master-releases.json')).length,1);
  assert.equal(requests.filter(url=>url.endsWith('/item-master/current/index.json')).length,1);
  assert(!requests.some(url=>url.includes('/acquisition/public/')));
});

test('unpublished newer DB-02 handoff cannot silently join historical acquisition data',async()=>{
  const {fetcher,requests}=fakeFetch('1.26.3');
  const master=await openPublicItemMaster('/Wand',fetcher,{gameVersion:'current'});
  assert.equal(master.release.target.gameVersion,'1.26.3',
    'definition-only master remains available for newer verified releases');
  const current=await openCurrentItemDetails('/Wand',fetcher);
  assert.equal(current.release.target.gameVersion,'1.26.3');
  assert.equal(current.acquisitionStatus,'pending_update');
  await assert.rejects(current.getAcquisitionCoverage(),
    /DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED/);
  await assert.rejects(current.getSourceRelations(40005160),
    /DB01_PUBLIC_DETAILS_SOURCE_HANDOFF_VERSION_NOT_PUBLISHED/);
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


test('one current manifest reuses unchanged objects across source versions',()=>{
  const root=mkdtempSync(join(tmpdir(),'wand-current-db-'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  function fixture(gameVersion,changed){
    const release='steam-'+gameVersion+'-item-id-master-v3';
    const folder=join(root,'steam-'+gameVersion+'-complete');
    mkdirSync(join(folder,'id'),{recursive:true});
    mkdirSync(join(folder,'fields'),{recursive:true});
    function write(path,value,count){
      const bytes=Buffer.from(JSON.stringify(value)+'\n');
      writeFileSync(join(folder,path),bytes);
      return {sha256:hash(bytes),bytes:bytes.length,count};
    }
    const index={scope:'complete',version:release,target:{platform:'Steam',gameVersion},
      count:1,archiveSha256:'a'.repeat(64),shards:{
        'id/01.json':write('id/01.json',{schema:'wand.item-master.shard@1',bucket:'01',items:[{itemId:257}]},1)
      },assets:{
        'fields/name.json':write('fields/name.json',{release,items:[[257,'Same']]},1),
        'fields/value.json':write('fields/value.json',{release,items:[[257,changed]]},1)
      }};
    write('index.json',index,1);
    return {gameVersion,complete:{release,count:1,archiveSha256:index.archiveSha256}};
  }
  try{
    const first=fixture('1.26.2',1),second=fixture('1.26.3',2);
    const a=publishCurrentProjections(root,first);
    const old=JSON.parse(readFileSync(join(root,'current/index.json'),'utf8'));
    const b=publishCurrentProjections(root,second);
    const current=JSON.parse(readFileSync(join(root,'current/index.json'),'utf8'));
    assert.equal(a.added,3);
    assert.equal(b.added,1);assert.equal(b.reused,2);
    assert.equal(old.assets['fields/name.json'].sha256,current.assets['fields/name.json'].sha256);
    assert.notEqual(old.assets['fields/value.json'].sha256,current.assets['fields/value.json'].sha256);
    assert.equal(old.shards['id/01.json'].sha256,current.shards['id/01.json'].sha256);
    assert.equal(current.target.gameVersion,'1.26.3');
    assert.equal(readdirSync(join(root,'objects')).length,4);
    assert.equal(publishCurrentProjections(root,second).added,0);
    // A corrupt source cannot replace the usable current manifest.
    writeFileSync(join(root,'steam-1.26.3-complete/fields/value.json'),'bad');
    assert.throws(()=>publishCurrentProjections(root,second),/SOURCE_DIGEST/);
    assert.deepEqual(JSON.parse(readFileSync(join(root,'current/index.json'),'utf8')),current);
  }finally{rmSync(root,{recursive:true,force:true});}
});
