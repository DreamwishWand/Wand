import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  saveItemMediaUrl,fetchVerifiedSaveItemWebp
} from '../src/lib/save/verified-save-item-webp.ts';

const data=new Uint8Array(20);
data.set([82,73,70,70],0);
new DataView(data.buffer).setUint32(4,12,true);
data.set([87,69,66,80,86,80,56,76],8);
const digest=createHash('sha256').update(data).digest('hex');
const path='ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.webp';
const media={path,sha256:digest};
const reply=(bytes=data,mime='image/webp',status=200)=>
  new Response(bytes,{status,headers:{'content-type':mime}});
const fixture=()=>new Uint8Array(data);

test('source-qualified WebP is returned only after checking actual public bytes',async()=>{
  const calls=[];
  const result=await fetchVerifiedSaveItemWebp('/Wand',media,async(url,opts)=>{
    calls.push({url,credentials:opts.credentials});
    return reply();
  });
  assert.equal(Buffer.from(result).toString('hex'),Buffer.from(data).toString('hex'));
  assert.deepEqual(calls,[{url:'/Wand/'+path,credentials:'same-origin'}]);
  assert.equal(saveItemMediaUrl('',media),'/'+path);
});

test('wrong hash, wrong content type, missing bytes or malformed WebP fails closed',async()=>{
  const noHash={...media,sha256:'0'.repeat(64)};
  assert.equal(await fetchVerifiedSaveItemWebp('',noHash,async()=>reply()),null);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>reply(data,'text/html')),null);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>reply(data,'image/webp',404)),null);
  const invalid=fixture();invalid[0]=0;
  const sha=createHash('sha256').update(invalid).digest('hex');
  assert.equal(await fetchVerifiedSaveItemWebp('',{...media,sha256:sha},async()=>reply(invalid)),null);
  const oversized=fixture();
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>new Response(data,{
    headers:{'content-type':'image/webp','content-length':String(4*1024*1024)}
  })),null);
  assert.equal(oversized.length,20);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>{throw Error('offline');}),null);
});

test('media fetch never follows Item ID paths, traversal or external URLs',async()=>{
  for(const invalid of [
    {...media,path:'https://example.com/tracker.webp'},
    {...media,path:'ddv/item-images/../foo.webp'},
    {...media,path:'/ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.webp'},
    {...media,path:'ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.png'},
    {...media,sha256:'invalid'}
  ]){
    assert.equal(saveItemMediaUrl('/Wand',invalid),null);
    let called=false;
    assert.equal(await fetchVerifiedSaveItemWebp('/Wand',invalid,async()=>{
      called=true;throw Error('must not fetch');
    }),null);
    assert.equal(called,false);
  }
  assert.equal(saveItemMediaUrl('//other',media),null);
  assert.equal(saveItemMediaUrl('/Wand/../x',media),null);
});
