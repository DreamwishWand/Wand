import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createProjectionWriter,installProjectionStage} from '../tools/db-01-items/reuse-public-projections.mjs';
import {join} from 'node:path';
import {
  openPublicItemMaster, ITEM_MASTER_DEFAULT_GAME_VERSION
} from '../src/lib/items/public-item-master.ts';

const OLD='1.26.2';
const NEW='1.26.3';
const existingId=40005160;
const insertedId=900000000;
const itemRoot=join(process.cwd(),'static','ddv','item-master');

const shardPath=id=>'id/'+(id&255).toString(16).padStart(2,'0')+'.json';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

async function syntheticRelease() {
  const manifest=JSON.parse(await readFile(join(itemRoot,'steam-'+OLD,'index.json'),'utf8'));
  const newIndex=structuredClone(manifest);
  newIndex.version='steam-'+NEW+'-item-id-master-v1';
  newIndex.target={...manifest.target,gameVersion:NEW};
  newIndex.count=manifest.count+1;
  const modified=new Map();
  const getShard=async path=>{
    if(modified.has(path))return modified.get(path);
    const original=JSON.parse(await readFile(join(itemRoot,'steam-'+OLD,path),'utf8'));
    modified.set(path,original);
    return original;
  };
  const originalShard=await getShard(shardPath(existingId));
  const source=originalShard.items.find(item=>item.itemId===existingId);
  assert(source);
  originalShard.items=originalShard.items.map(item=>
    item.itemId===existingId ? {
      ...item,names:{...item.names,en:'Changed in '+NEW}
    }:item
  );
  const targetShard=await getShard(shardPath(insertedId));
  targetShard.items.push({
    ...structuredClone(source),
    itemId:insertedId,
    nativeKey:'SyntheticNewItem'+NEW,
    names:{...source.names,en:'New in '+NEW},
    iconGuid:'a'.repeat(32),
    tags:[],
    collectionSourceCandidates:[],
  });
  newIndex.coverage={
    ...newIndex.coverage,itemIconGuid:newIndex.coverage.itemIconGuid+1,
    itemNamesVerified:newIndex.coverage.itemNamesVerified+1,
  };
  const files=new Map();
  for(const [path,shard] of modified){
    const bytes=Buffer.from(JSON.stringify(shard)+'\n');
    files.set(path,bytes);
    newIndex.shards[path]={
      ...newIndex.shards[path],
      count:shard.items.length,
      bytes:bytes.byteLength,
      sha256:digest(bytes),
    };
  }
  const catalog={
    schema:'wand.item-master.versions@1',
    current:NEW,
    releases:[
      {gameVersion:OLD,release:manifest.version,count:manifest.count,
        archiveSha256:'3c80a42139014211100eb556665636088af45d1d0b54ebd2933a4aeab2a405c6'},
      {gameVersion:NEW,release:newIndex.version,count:newIndex.count,
        archiveSha256:'0'.repeat(64)}
    ],
  };
  return {newIndex,files,catalog};
}

function versionedFetcher(release,{peakTracker,catalogOverride}={}) {
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    let bytes;
    if(url==='/Wand/ddv/item-master-releases.json'){
      bytes=Buffer.from(JSON.stringify(catalogOverride??release.catalog));
    } else {
      const path=url.slice('/Wand/ddv/item-master/'.length);
      if(path.startsWith('steam-'+NEW+'/')){
        const relative=path.slice(('steam-'+NEW+'/').length);
        bytes=relative==='index.json'
          ? Buffer.from(JSON.stringify(release.newIndex))
          : release.files.get(relative) ??
            await readFile(join(itemRoot,'steam-'+OLD,relative));
      } else if(path.startsWith('steam-'+OLD+'/')) {
        bytes=await readFile(join(itemRoot,path));
      } else {
        throw new Error('Unexpected asset URL '+url);
      }
    }
    if(peakTracker && url.includes('/id/')){
      peakTracker.active++;
      peakTracker.peak=Math.max(peakTracker.peak,peakTracker.active);
      await new Promise(resolve=>setImmediate(resolve));
      peakTracker.active--;
    }
    return new Response(new Uint8Array(bytes),{status:200});
  };
  return {fetcher,requests};
}

test('current catalog promotes synthetic newer release without dropping unchanged Item IDs',async()=>{
  const release=await syntheticRelease();
  const {fetcher,requests}=versionedFetcher(release);
  const newest=await openPublicItemMaster('/Wand',fetcher,{gameVersion:'current'});
  assert.equal(newest.release.target.gameVersion,NEW);
  assert.equal(newest.release.count,13203);
  assert.equal(requests.length,2,'only catalog and release index load initially');
  const newer=await newest.getItems([existingId,insertedId,40006110,existingId]);
  assert.equal(newer[0].names.en,'Changed in '+NEW);
  assert.equal(newer[1].names.en,'New in '+NEW);
  assert.equal(newer[2].names.en,'Decorative Picnic Basket');
  assert.equal(newer[3],newer[0]);
  assert.equal(newer[1].iconGuid,'a'.repeat(32));
  assert.equal(requests.every(x=>!x.includes('steam-'+OLD+'/')),
    true,'new release never falls back to old paths at runtime');
  const older=await openPublicItemMaster('/Wand',fetcher);
  assert.equal(ITEM_MASTER_DEFAULT_GAME_VERSION,OLD);
  assert.equal(older.release.count,13202);
  assert.equal((await older.getItem(existingId)).names.en,'Glass Shoe');
  assert.equal(await older.getItem(insertedId),null);
});

test('explicit newer version works without changing any runtime Item count constants',async()=>{
  const release=await syntheticRelease();
  const {fetcher,requests}=versionedFetcher(release);
  const newer=await openPublicItemMaster('Wand',fetcher,{gameVersion:NEW});
  assert.equal(newer.release.count,13203);
  assert.equal(requests.length,1);
  assert.equal(requests[0],'/Wand/ddv/item-master/steam-'+NEW+'/index.json');
  assert.equal((await newer.getItem(insertedId))?.names.en,'New in '+NEW);
  assert.equal((await newer.getItem(existingId))?.names.en,'Changed in '+NEW);
});

test('version metadata and selected release must be exact; malformed versions fail closed',async()=>{
  const release=await syntheticRelease();
  const {fetcher}=versionedFetcher(release);
  for(const invalid of ['../1.26.2','1.26.2/../1.26.3','1.26','1.26.3?x=1']){
    await assert.rejects(
      openPublicItemMaster('/Wand',fetcher,{gameVersion:invalid}),
      /ITEM_MASTER_INVALID_GAME_VERSION/
    );
  }
  const {fetcher: forged}=versionedFetcher(release,{
    catalogOverride:{...release.catalog,current:'1.26.4'}
  });
  await assert.rejects(
    openPublicItemMaster('/Wand',forged,{gameVersion:'current'}),
    /ITEM_MASTER_CURRENT_RELEASE_MISSING/
  );
  const wrong={...release.newIndex,target:{platform:'Steam',gameVersion:OLD}};
  const wrongFetch=async url=>new Response(new Uint8Array(
    Buffer.from(JSON.stringify(
      url.endsWith('/index.json')?wrong:release.catalog
    ))),{status:200});
  await assert.rejects(
    openPublicItemMaster('/Wand',wrongFetch,{gameVersion:NEW}),
    /ITEM_MASTER_INVALID_RELEASE/
  );
});

test('batch Item reads cap shard requests at eight and maintain caller order',async()=>{
  const release=await syntheticRelease();
  const peakTracker={active:0,peak:0};
  const {fetcher}=versionedFetcher(release,{peakTracker});
  const old=await openPublicItemMaster('/Wand',fetcher);
  const ids=Array.from({length:256},(_,i)=>insertedId+i);
  const rows=await old.getItems(ids);
  assert.equal(rows.length,256);
  assert(rows.every(item=>item===null));
  assert(peakTracker.peak>1,'batch performs parallel reads');
  assert(peakTracker.peak<=8,'bulk lookups cannot issue 256 simultaneous shard requests');
  assert.equal(peakTracker.active,0);
});


test('complete projection rebuild reuses exact bytes, repairs changes and keeps independent prior releases',()=>{
  const root=mkdtempSync(join(tmpdir(),'wand-db01-reuse-'));
  try{
    const previous=join(root,'steam-1.26.2-complete'),destination=join(root,'steam-1.26.3-complete');
    const stage=join(root,'.stage');
    mkdirSync(previous);mkdirSync(destination);mkdirSync(stage);
    const same={items:[1,2]},changed={items:[2,3]};
    const bytes=value=>Buffer.from(JSON.stringify(value)+'\n');
    writeFileSync(join(destination,'same.json'),bytes(same));
    writeFileSync(join(destination,'changed.json'),bytes(same));
    writeFileSync(join(destination,'obsolete.json'),bytes(same));
    writeFileSync(join(previous,'historical.json'),bytes(same));
    const writer=createProjectionWriter(root,stage,destination);
    const m=writer.write('same.json',same,2);
    assert.equal(m.sha256,digest(bytes(same)));
    assert.equal(writer.stats.reusedSameRelease+writer.stats.written,1);
    writer.write('changed.json',changed,2);
    writer.write('historical.json',same,2);
    assert.equal(writer.stats.written+writer.stats.reusedSameRelease+writer.stats.reusedOtherRelease,3);
    assert.throws(()=>writer.write('../unsafe.json',same,2),/PROJECTION_PATH/);
    installProjectionStage(stage,destination);
    assert.deepEqual(readFileSync(join(destination,'same.json')),bytes(same));
    assert.deepEqual(readFileSync(join(destination,'changed.json')),bytes(changed));
    assert(!existsSync(join(destination,'obsolete.json')));
    assert.deepEqual(readFileSync(join(previous,'historical.json')),bytes(same));
    // Retained versions are not hardlinked to one another.
    writeFileSync(join(destination,'historical.json'),bytes(changed));
    assert.deepEqual(readFileSync(join(previous,'historical.json')),bytes(same));
    // A missing stage must not destroy the already usable release.
    assert.throws(()=>installProjectionStage(join(root,'.missing'),destination));
    assert.deepEqual(readFileSync(join(destination,'changed.json')),bytes(changed));
  }finally{rmSync(root,{recursive:true,force:true});}
});
