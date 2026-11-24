import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createItemMediaClient} from '../src/lib/media/item-media.ts';
import {publicImageKey,parsePublicImageKey,publicImageUrl} from '../src/lib/media/public-image-key.ts';
const sha='a'.repeat(64);
const origin='https://media.dreamwishwand.com';
const packed=doc=>{const data=Buffer.from(JSON.stringify(doc));return {data,pin:{sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length}}};
function fixture(state='published'){
  const files={},payloads=new Map();
  for(let n=0;n<256;n++){
    const bucket=n.toString(16).padStart(2,'0');
    const items=n===1?[{id:257,thumbnail:{key:publicImageKey('thumbnail',sha),width:128,height:64},original:{key:publicImageKey('original',sha),width:128,height:64}}]:[];
    const p=packed({schema:'wand.media.distribution-shard@1',bucket,items});
    files['id/'+bucket+'.json']={...p.pin,count:items.length};
    payloads.set('id/'+bucket+'.json',p.data);
  }
  const p=packed({schema:'wand.media.distribution@1',gameVersion:'steam-1.26.2',releaseState:state,bucketCount:256,totalItems:1,files,cachePolicy:'immutable_content_addressed_media'});
  payloads.set('manifest.json',p.data);
  const config={state:'published',publicationAuthorized:true,publicReadbackVerified:true,origin,gameVersion:'steam-1.26.2',manifest:p.pin};
  const root=origin+'/index/items/'+config.gameVersion+'/'+p.pin.sha256+'/';
  const calls=[];
  return {config,calls,fetcher:async url=>{calls.push(url);assert.ok(url.startsWith(root));return new Response(payloads.get(url.slice(root.length)));}};
}
test('common image keys have no version, service or language',()=>{
  assert.equal(publicImageUrl(origin,'original',sha),origin+'/images/'+sha+'.webp');
  assert.deepEqual(parsePublicImageKey(publicImageKey('thumbnail',sha)),{sha256:sha});
  assert.equal(parsePublicImageKey('images/aa/'+sha+'.webp'),null);
  assert.equal(parsePublicImageKey('steam-v1.26.2/images/'+sha+'.webp'),null);
  assert.throws(()=>publicImageUrl('https://example.com','thumbnail',sha),/origin/);
});
test('unpublished client never fetches',async()=>{
  assert.equal(await createItemMediaClient(undefined,()=>{throw Error('network');}).getItemImage(257),null);
});
test('Item ID lookup loads one shard on demand, reuses it for all variants, skips empty shards',async()=>{
  const f=fixture(),c=createItemMediaClient(f.config,f.fetcher);
  const [thumb,original]=await Promise.all([c.getItemImage(257),c.getItemImage(257,'original')]);
  assert.equal(thumb.url,origin+'/images/'+sha+'.webp');
  assert.equal(original.url,origin+'/images/'+sha+'.webp');
  assert.equal(await c.getItemImage(1),null);
  assert.equal(await c.getItemImage(2),null);
  assert.equal(f.calls.length,2);
});
test('candidate manifest cannot activate media',async()=>{
  const f=fixture('candidate_unpublished');
  await assert.rejects(createItemMediaClient(f.config,f.fetcher).getItemImage(257),/published manifest/);
});
